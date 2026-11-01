import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  tr,
  isCharacterId,
  isEnvironmentId,
  isFiniteNumber,
  isSessionId,
  isStudyMode,
  sanitizeNickname,
  type ActionResult,
  type ClientToServerEvents,
  type JoinRequest,
  type JoinResult,
  type ServerToClientEvents,
} from '@focusroom/shared';
import { serverConfig } from '../config.js';
import { SlidingWindowLimiter } from '../domain/rateLimiter.js';
import type { Room } from '../domain/room.js';
import type { RoomRegistry } from '../domain/registry.js';

interface SocketData {
  playerId: string | null;
  roomId: string | null;
}

type Io = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface GameServerOptions {
  httpServer: HttpServer;
  registry: RoomRegistry;
  clientOrigin: string;
  graceMs: number;
}

export interface GameServerHandle {
  io: Io;
  stop(): void;
}

const BOARD_DEBOUNCE_MS = 400;
const TICK_MS = 1_000;

export function createGameServer(options: GameServerOptions): GameServerHandle {
  const { registry, graceMs } = options;
  const io: Io = new Server(options.httpServer, {
    cors: { origin: options.clientOrigin },
    maxHttpBufferSize: 100_000,
  });

  const graceTimers = new Map<string, NodeJS.Timeout>();
  const boardTimers = new Map<string, NodeJS.Timeout>();

  const graceKey = (roomId: string, playerId: string) => `${roomId}|${playerId}`;

  function scheduleBoard(room: Room): void {
    if (boardTimers.has(room.id)) return;
    const timer = setTimeout(() => {
      boardTimers.delete(room.id);
      const current = registry.getRoom(room.id);
      if (current) io.to(current.id).emit('istatistik:güncelle', current.board(Date.now()));
    }, BOARD_DEBOUNCE_MS);
    boardTimers.set(room.id, timer);
  }

  function cancelGrace(roomId: string, playerId: string): void {
    const key = graceKey(roomId, playerId);
    const timer = graceTimers.get(key);
    if (timer) clearTimeout(timer);
    graceTimers.delete(key);
  }

  function leaveRoom(room: Room, playerId: string, now: number): void {
    cancelGrace(room.id, playerId);
    const removed = room.remove(playerId, now);
    registry.unregisterSession(playerId, room.id);
    if (!removed) return;
    io.to(room.id).emit('oyuncu:ayrıldı', { playerId });
    io.to(room.id).emit('sohbet:mesaj', room.addSystem(tr.system.left(removed.nickname), 'info', now));
    if (room.size === 0) {
      registry.remove(room.id);
      const timer = boardTimers.get(room.id);
      if (timer) clearTimeout(timer);
      boardTimers.delete(room.id);
    } else {
      scheduleBoard(room);
    }
  }

  function currentRoom(socket: Sock): { room: Room; playerId: string } | null {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return null;
    const room = registry.getRoom(roomId);
    return room && room.hasSession(playerId) ? { room, playerId } : null;
  }

  function limiterFor(config: { max: number; windowMs: number }) {
    return new SlidingWindowLimiter(config.max, config.windowMs);
  }

  io.on('connection', (socket) => {
    socket.data = { playerId: null, roomId: null };
    const limits = {
      join: limiterFor(serverConfig.limits.join),
      seat: limiterFor(serverConfig.limits.seat),
      move: limiterFor(serverConfig.limits.move),
      mode: limiterFor(serverConfig.limits.mode),
      report: limiterFor(serverConfig.limits.report),
    };

    socket.on('oda:katıl', (req, ack) => {
      const reply = (res: JoinResult) => ack?.(res);
      const now = Date.now();
      if (!limits.join.allow(now)) return reply({ ok: false, error: 'rate-limited' });
      const parsed = parseJoin(req);
      if (!parsed) return reply({ ok: false, error: 'invalid-request' });

      const previous = currentRoom(socket);
      if (previous) leaveRoom(previous.room, previous.playerId, now);
      socket.data = { playerId: null, roomId: null };

      const existing = registry.roomOfSession(parsed.sessionId);
      if (existing && existing.env.id !== parsed.environmentId) {
        leaveRoom(existing, parsed.sessionId, now);
      }
      const target = registry.roomOfSession(parsed.sessionId) ?? registry.chooseRoom(parsed.environmentId);
      if (!target) return reply({ ok: false, error: 'room-full' });

      const outcome = target.join(
        { sessionId: parsed.sessionId, nickname: parsed.nickname, characterId: parsed.characterId, socketId: socket.id },
        now,
      );
      if (!outcome.ok) return reply({ ok: false, error: outcome.error });

      cancelGrace(target.id, parsed.sessionId);
      registry.registerSession(parsed.sessionId, target.id);
      if (outcome.kind === 'takeover' && outcome.previousSocketId) {
        const previousSocket = io.sockets.sockets.get(outcome.previousSocketId);
        if (previousSocket) {
          previousSocket.emit('sistem:bildirim', { level: 'error', text: tr.system.takeover });
          previousSocket.leave(target.id);
          previousSocket.data = { playerId: null, roomId: null };
        }
      }

      socket.data = { playerId: parsed.sessionId, roomId: target.id };
      socket.join(target.id);
      reply({ ok: true, instanceId: target.id });
      socket.emit('durum:güncelle', target.snapshot(parsed.sessionId, now));

      if (outcome.kind === 'joined') {
        socket.to(target.id).emit('oyuncu:katıldı', outcome.player);
        io.to(target.id).emit('sohbet:mesaj', target.addSystem(tr.system.joined(parsed.nickname), 'info', now));
      } else if (outcome.kind === 'reattached') {
        socket.to(target.id).emit('oyuncu:bağlantı', { playerId: parsed.sessionId, connected: true });
      }
      scheduleBoard(target);
    });

    socket.on('oda:ayrıl', (ack) => {
      const current = currentRoom(socket);
      if (current) {
        socket.leave(current.room.id);
        leaveRoom(current.room, current.playerId, Date.now());
      }
      socket.data = { playerId: null, roomId: null };
      ack?.({ ok: true });
    });

    socket.on('oyuncu:hareket', (move) => {
      const current = currentRoom(socket);
      if (!current || !limits.move.allow(Date.now())) return;
      if (!isMove(move)) return;
      const outcome = current.room.move(current.playerId, move, Date.now());
      if (outcome.kind === 'accepted') {
        socket.to(current.room.id).volatile.emit('oyuncu:hareket', { playerId: current.playerId, ...outcome.move });
      } else if (outcome.kind === 'corrected') {
        socket.emit('oyuncu:konum-düzeltildi', { position: outcome.position, yaw: outcome.yaw });
      }
    });

    socket.on('koltuk:oturmayı-dene', (req, ack) => {
      const reply = (res: ActionResult) => ack?.(res);
      const current = currentRoom(socket);
      if (!current) return reply({ ok: false, error: 'not-in-room' });
      if (!limits.seat.allow(Date.now())) return reply({ ok: false, error: 'rate-limited' });
      if (typeof req?.seatId !== 'string' || req.seatId.length > 64) {
        return reply({ ok: false, error: 'invalid-request' });
      }
      const outcome = current.room.sit(current.playerId, req.seatId, Date.now());
      if (!outcome.ok) return reply({ ok: false, error: outcome.error });
      io.to(current.room.id).emit('koltuk:güncellendi', outcome.change);
      scheduleBoard(current.room);
      reply({ ok: true });
    });

    socket.on('koltuk:kalk', (ack) => {
      const reply = (res: ActionResult) => ack?.(res);
      const current = currentRoom(socket);
      if (!current) return reply({ ok: false, error: 'not-in-room' });
      if (!limits.seat.allow(Date.now())) return reply({ ok: false, error: 'rate-limited' });
      const outcome = current.room.stand(current.playerId, Date.now());
      if (!outcome.ok) return reply({ ok: false, error: outcome.error });
      io.to(current.room.id).emit('koltuk:güncellendi', outcome.change);
      scheduleBoard(current.room);
      reply({ ok: true });
    });

    socket.on('oyuncu:çalışma-durumu', (req) => {
      const current = currentRoom(socket);
      if (!current || !limits.mode.allow(Date.now())) return;
      if (!req || !isStudyMode(req.mode)) return;
      if (current.room.setMode(current.playerId, req.mode, Date.now())) scheduleBoard(current.room);
    });

    socket.on('sohbet:mesaj-gönder', (req, ack) => {
      const reply = (res: ActionResult) => ack?.(res);
      const current = currentRoom(socket);
      if (!current) return reply({ ok: false, error: 'not-in-room' });
      const outcome = current.room.postMessage(current.playerId, req?.text, Date.now());
      if (!outcome.ok) return reply({ ok: false, error: outcome.error });
      io.to(current.room.id).emit('sohbet:mesaj', outcome.message);
      reply({ ok: true });
    });

    socket.on('sohbet:şikayet', (req, ack) => {
      const reply = (res: ActionResult) => ack?.(res);
      const current = currentRoom(socket);
      if (!current) return reply({ ok: false, error: 'not-in-room' });
      if (!limits.report.allow(Date.now())) return reply({ ok: false, error: 'report-limited' });
      const message = typeof req?.messageId === 'string' ? current.room.findMessage(req.messageId) : undefined;
      if (!message) return reply({ ok: false, error: 'unknown-message' });
      console.warn(
        `[report] room=${current.room.id} reporter=${current.playerId} message=${message.id} author=${message.authorId ?? '-'} text=${JSON.stringify(message.text)}`,
      );
      reply({ ok: true });
    });

    socket.on('disconnect', () => {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) return;
      const room = registry.getRoom(roomId);
      if (!room) return;
      const now = Date.now();
      if (!room.markDisconnected(playerId, socket.id, now)) return;
      io.to(room.id).emit('oyuncu:bağlantı', { playerId, connected: false });
      scheduleBoard(room);
      const key = graceKey(room.id, playerId);
      cancelGrace(room.id, playerId);
      graceTimers.set(
        key,
        setTimeout(() => {
          graceTimers.delete(key);
          const current = registry.getRoom(room.id);
          if (current && current.isConnected(playerId) === false) leaveRoom(current, playerId, Date.now());
        }, graceMs),
      );
    });
  });

  const tickTimer = setInterval(() => {
    const now = Date.now();
    for (const room of registry.allRooms()) {
      for (const message of room.tick(now)) io.to(room.id).emit('sohbet:mesaj', message);
    }
  }, TICK_MS);

  let minuteTimer: NodeJS.Timeout | null = null;
  let minuteInterval: NodeJS.Timeout | null = null;
  const broadcastBoards = () => {
    const now = Date.now();
    for (const room of registry.allRooms()) io.to(room.id).emit('istatistik:güncelle', room.board(now));
  };
  minuteTimer = setTimeout(
    () => {
      broadcastBoards();
      minuteInterval = setInterval(broadcastBoards, 60_000);
    },
    60_000 - (Date.now() % 60_000),
  );

  return {
    io,
    stop() {
      clearInterval(tickTimer);
      if (minuteTimer) clearTimeout(minuteTimer);
      if (minuteInterval) clearInterval(minuteInterval);
      for (const timer of [...graceTimers.values(), ...boardTimers.values()]) clearTimeout(timer);
      io.close();
    },
  };
}

function parseJoin(req: unknown): (JoinRequest & { nickname: string }) | null {
  if (typeof req !== 'object' || req === null) return null;
  const r = req as Record<string, unknown>;
  if (!isEnvironmentId(r.environmentId) || !isSessionId(r.sessionId) || !isCharacterId(r.characterId)) return null;
  const nickname = sanitizeNickname(r.nickname);
  if (!nickname.ok) return null;
  if (r.instanceId !== undefined && typeof r.instanceId !== 'string') return null;
  return {
    environmentId: r.environmentId,
    sessionId: r.sessionId,
    nickname: nickname.value,
    characterId: r.characterId,
    instanceId: r.instanceId as string | undefined,
  };
}

function isMove(value: unknown): value is { x: number; y: number; z: number; yaw: number; moving: boolean } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isFiniteNumber(v.x) &&
    isFiniteNumber(v.z) &&
    isFiniteNumber(v.yaw) &&
    typeof v.moving === 'boolean' &&
    Math.abs(v.x) < 1_000 &&
    Math.abs(v.z) < 1_000
  );
}
