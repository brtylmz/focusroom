import {
  LIMITS,
  STUDY,
  WORLD,
  buildWalkMap,
  dateKeyOf,
  degToRad,
  distance2D,
  findStandSpot,
  formatMinutesLabel,
  isWalkable,
  tr,
  type ActivityStatus,
  type CharacterId,
  type ChatMessage,
  type EnvironmentDef,
  type ErrorCode,
  type PlayerMove,
  type PlayerPublic,
  type RoomSnapshot,
  type SeatChange,
  type SeatDef,
  type StudyBoard,
  type StudyMode,
  type StudyRow,
  type Vec3,
  type WalkMap,
} from '@focusroom/shared';
import { serverConfig } from '../config.js';
import type { StudyRepository } from '../repository/studyRepository.js';
import { moderateChat, type PreviousMessage } from './chatRules.js';
import { SeatManager } from './seats.js';
import { SlidingWindowLimiter } from './rateLimiter.js';
import { StudyTracker } from './studyTracker.js';

interface PlayerRecord {
  id: string;
  nickname: string;
  characterId: CharacterId;
  position: Vec3;
  yaw: number;
  moving: boolean;
  seatId: string | null;
  mode: StudyMode;
  modeAt: number;
  connected: boolean;
  socketId: string | null;
  lastMoveAt: number;
  lastChat: PreviousMessage | null;
  chatLimiter: SlidingWindowLimiter;
  tracker: StudyTracker;
  milestoneIndex: number;
}

export interface JoinInput {
  sessionId: string;
  nickname: string;
  characterId: CharacterId;
  socketId: string;
}

export type JoinOutcome =
  | { ok: true; kind: 'joined' | 'reattached' | 'takeover'; player: PlayerPublic; previousSocketId: string | null }
  | { ok: false; error: ErrorCode };

export type SitOutcome = { ok: true; change: SeatChange } | { ok: false; error: ErrorCode };
export type StandOutcome = { ok: true; change: SeatChange } | { ok: false; error: ErrorCode };
export type MoveOutcome =
  | { kind: 'accepted'; move: PlayerMove }
  | { kind: 'corrected'; position: Vec3; yaw: number }
  | { kind: 'rejected'; error: ErrorCode };
export type ChatOutcome = { ok: true; message: ChatMessage } | { ok: false; error: ErrorCode };
export type RemoveOutcome = { nickname: string } | null;

export interface RoomOptions {
  blocklist: readonly string[];
}

const SYSTEM_NAME = 'Sistem';
const MINUTE_MS = 60_000;

/** One Socket.IO room instance of an environment. All game rules live here; the network layer only relays. */
export class Room {
  readonly id: string;
  readonly env: EnvironmentDef;
  private readonly walkMap: WalkMap;
  private readonly seatById: Map<string, SeatDef>;
  private readonly seats: SeatManager;
  private readonly players = new Map<string, PlayerRecord>();
  private readonly history: ChatMessage[] = [];
  private messageSeq = 0;
  private dayKey = '';
  private dayTotals = new Map<string, number>();

  constructor(
    id: string,
    env: EnvironmentDef,
    private readonly studyRepo: StudyRepository,
    private readonly options: RoomOptions,
  ) {
    this.id = id;
    this.env = env;
    this.walkMap = buildWalkMap(env);
    this.seatById = new Map(env.seats.map((s) => [s.id, s]));
    this.seats = new SeatManager(env.seats);
  }

  get size(): number {
    return this.players.size;
  }

  get capacity(): number {
    return this.env.capacity;
  }

  hasSession(sessionId: string): boolean {
    return this.players.has(sessionId);
  }

  isConnected(playerId: string): boolean | null {
    const p = this.players.get(playerId);
    return p ? p.connected : null;
  }

  join(input: JoinInput, now: number): JoinOutcome {
    const existing = this.players.get(input.sessionId);
    if (existing) {
      const kind = existing.connected ? 'takeover' : 'reattached';
      const previousSocketId = existing.connected ? existing.socketId : null;
      existing.connected = true;
      existing.socketId = input.socketId;
      existing.nickname = input.nickname;
      existing.characterId = input.characterId;
      existing.lastMoveAt = now;
      return { ok: true, kind, player: this.toPublic(existing, now), previousSocketId };
    }
    if (this.size >= this.capacity) return { ok: false, error: 'room-full' };

    const tracker = new StudyTracker((ms, at) => this.credit(input.sessionId, ms, at));
    const player: PlayerRecord = {
      id: input.sessionId,
      nickname: input.nickname,
      characterId: input.characterId,
      position: { x: this.env.spawn.x, y: 0, z: this.env.spawn.z },
      yaw: 0,
      moving: false,
      seatId: null,
      mode: 'idle',
      modeAt: now,
      connected: true,
      socketId: input.socketId,
      lastMoveAt: now,
      lastChat: null,
      chatLimiter: new SlidingWindowLimiter(serverConfig.limits.chat.max, serverConfig.limits.chat.windowMs),
      tracker,
      milestoneIndex: 0,
    };
    this.players.set(player.id, player);
    return { ok: true, kind: 'joined', player: this.toPublic(player, now), previousSocketId: null };
  }

  markDisconnected(playerId: string, socketId: string, now: number): boolean {
    const p = this.players.get(playerId);
    if (!p || !p.connected || p.socketId !== socketId) return false;
    p.connected = false;
    p.socketId = null;
    p.mode = 'idle';
    p.modeAt = now;
    p.moving = false;
    p.tracker.update(false, now);
    return true;
  }

  remove(playerId: string, now: number): RemoveOutcome {
    const p = this.players.get(playerId);
    if (!p) return null;
    p.tracker.update(false, now);
    this.seats.release(playerId);
    this.players.delete(playerId);
    return { nickname: p.nickname };
  }

  sit(playerId: string, seatId: string, now: number): SitOutcome {
    const p = this.players.get(playerId);
    if (!p || !p.connected) return { ok: false, error: 'not-in-room' };
    if (p.seatId !== null) return { ok: false, error: 'already-seated' };
    const seat = this.seatById.get(seatId);
    if (!seat) return { ok: false, error: 'seat-not-found' };
    if (this.seats.occupantOf(seatId) !== null) return { ok: false, error: 'seat-taken' };
    if (distance2D(p.position, seat.pozisyon) > WORLD.serverSitReach) return { ok: false, error: 'too-far' };

    const result = this.seats.occupy(seatId, playerId);
    if (result !== 'ok') return { ok: false, error: result === 'taken' ? 'seat-taken' : 'already-seated' };

    p.seatId = seatId;
    p.position = { ...seat.pozisyon };
    p.yaw = degToRad(seat.yön);
    p.moving = false;
    p.lastMoveAt = now;
    p.tracker.update(this.isStudying(p, now), now);
    return { ok: true, change: { playerId, seatId, position: { ...p.position }, yaw: p.yaw } };
  }

  stand(playerId: string, now: number): StandOutcome {
    const p = this.players.get(playerId);
    if (!p || !p.connected) return { ok: false, error: 'not-in-room' };
    if (p.seatId === null) return { ok: false, error: 'not-seated' };
    const seat = this.seatById.get(p.seatId);
    if (!seat) return { ok: false, error: 'seat-not-found' };

    this.seats.release(playerId);
    const spot = findStandSpot(this.walkMap, seat.pozisyon, seat.yön) ?? {
      x: seat.pozisyon.x,
      z: seat.pozisyon.z,
    };
    p.seatId = null;
    p.position = { x: spot.x, y: 0, z: spot.z };
    p.yaw = degToRad(seat.yön);
    p.moving = false;
    p.lastMoveAt = now;
    p.tracker.update(false, now);
    return { ok: true, change: { playerId, seatId: null, position: { ...p.position }, yaw: p.yaw } };
  }

  move(playerId: string, input: PlayerMove, now: number): MoveOutcome {
    const p = this.players.get(playerId);
    if (!p || !p.connected) return { kind: 'rejected', error: 'not-in-room' };
    if (p.seatId !== null) return { kind: 'rejected', error: 'already-seated' };

    const elapsedSec = Math.min(Math.max(now - p.lastMoveAt, 0), 1_000) / 1_000;
    const allowed = WORLD.maxSpeed * elapsedSec + WORLD.speedTolerance;
    const travelled = Math.hypot(input.x - p.position.x, input.z - p.position.z);
    const valid = isWalkable(this.walkMap, input.x, input.z) && travelled <= allowed;
    if (!valid) return { kind: 'corrected', position: { ...p.position }, yaw: p.yaw };

    p.position = { x: input.x, y: 0, z: input.z };
    p.yaw = input.yaw;
    p.moving = input.moving;
    p.lastMoveAt = now;
    return { kind: 'accepted', move: { x: input.x, y: 0, z: input.z, yaw: input.yaw, moving: input.moving } };
  }

  setMode(playerId: string, mode: StudyMode, now: number): boolean {
    const p = this.players.get(playerId);
    if (!p || !p.connected) return false;
    p.mode = mode;
    p.modeAt = now;
    p.tracker.update(this.isStudying(p, now), now);
    return true;
  }

  postMessage(playerId: string, raw: unknown, now: number): ChatOutcome {
    const p = this.players.get(playerId);
    if (!p || !p.connected) return { ok: false, error: 'not-in-room' };
    if (!p.chatLimiter.allow(now)) return { ok: false, error: 'rate-limited' };
    const moderated = moderateChat(raw, p.lastChat, now, this.options.blocklist);
    if (!moderated.ok) return moderated;
    p.lastChat = { text: moderated.text, at: now };
    const message = this.pushMessage(
      { kind: 'user', authorId: p.id, authorName: p.nickname, characterId: p.characterId, text: moderated.text, tone: 'info' },
      now,
    );
    return { ok: true, message };
  }

  findMessage(messageId: string): ChatMessage | undefined {
    return this.history.find((m) => m.id === messageId);
  }

  addSystem(text: string, tone: ChatMessage['tone'], now: number): ChatMessage {
    return this.pushMessage(
      { kind: 'system', authorId: null, authorName: SYSTEM_NAME, characterId: null, text, tone },
      now,
    );
  }

  /** Advances every player's study tracker and returns milestone announcements. */
  tick(now: number): ChatMessage[] {
    const announcements: ChatMessage[] = [];
    for (const p of this.players.values()) {
      p.tracker.update(this.isStudying(p, now), now);
      while (p.milestoneIndex < STUDY.milestonesMinutes.length) {
        const minutes = STUDY.milestonesMinutes[p.milestoneIndex]!;
        if (p.tracker.liveVisitMs(now) < minutes * MINUTE_MS) break;
        p.milestoneIndex += 1;
        const text = tr.system.milestone(p.nickname, formatMinutesLabel(minutes));
        announcements.push(this.addSystem(text, 'milestone', now));
      }
    }
    return announcements;
  }

  board(now: number): StudyBoard {
    const todayKey = dateKeyOf(now);
    const roomTotal = todayKey === this.dayKey ? sum(this.dayTotals.values()) : 0;
    const rows: StudyRow[] = [...this.players.values()]
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        characterId: p.characterId,
        status: this.statusOf(p, now),
        connected: p.connected,
        visitMinutes: Math.floor(p.tracker.liveVisitMs(now) / MINUTE_MS),
        todayMinutes: Math.floor(this.studyRepo.getFocusMs(p.id, todayKey) / MINUTE_MS),
      }))
      .sort((a, b) => b.todayMinutes - a.todayMinutes || a.nickname.localeCompare(b.nickname, 'tr'));
    return { roomTodayMinutes: Math.floor(roomTotal / MINUTE_MS), rows, generatedAt: now };
  }

  snapshot(playerId: string, now: number): RoomSnapshot {
    return {
      environmentId: this.env.id,
      instanceId: this.id,
      you: playerId,
      players: [...this.players.values()].map((p) => this.toPublic(p, now)),
      seats: this.seats.snapshot(),
      messages: [...this.history],
      board: this.board(now),
      serverTime: now,
    };
  }

  toPublic(p: PlayerRecord, now: number): PlayerPublic {
    return {
      id: p.id,
      nickname: p.nickname,
      characterId: p.characterId,
      position: { ...p.position },
      yaw: p.yaw,
      moving: p.moving,
      seatId: p.seatId,
      mode: this.effectiveMode(p, now),
      connected: p.connected,
    };
  }

  private isStudying(p: PlayerRecord, now: number): boolean {
    return p.connected && p.seatId !== null && this.effectiveMode(p, now) === 'focus';
  }

  private effectiveMode(p: PlayerRecord, now: number): StudyMode {
    if (!p.connected) return 'idle';
    return now - p.modeAt <= STUDY.modeTtlMs ? p.mode : 'idle';
  }

  private statusOf(p: PlayerRecord, now: number): ActivityStatus {
    if (p.seatId === null) return 'standing';
    return this.effectiveMode(p, now);
  }

  private credit(playerId: string, ms: number, at: number): void {
    this.studyRepo.addFocusMs(playerId, dateKeyOf(at), ms);
    const key = dateKeyOf(at);
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.dayTotals = new Map();
    }
    this.dayTotals.set(playerId, (this.dayTotals.get(playerId) ?? 0) + ms);
  }

  private pushMessage(
    partial: Omit<ChatMessage, 'id' | 'sentAt'>,
    now: number,
  ): ChatMessage {
    this.messageSeq += 1;
    const message: ChatMessage = { ...partial, id: `${this.id}-${this.messageSeq}`, sentAt: now };
    this.history.push(message);
    if (this.history.length > LIMITS.chatHistory) {
      this.history.splice(0, this.history.length - LIMITS.chatHistory);
    }
    return message;
  }
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
