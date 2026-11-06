import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { io, type Socket } from 'socket.io-client';
import {
  PomodoroTimer,
  WORLD,
  buildWalkMap,
  distance2D,
  findStandSpot,
  getEnvironment,
  tr,
  type ActionResult,
  type CharacterId,
  type ChatMessage,
  type ClientToServerEvents,
  type EnvironmentDef,
  type EnvironmentId,
  type JoinResult,
  type PlayerPublic,
  type PomodoroEvent,
  type RoomSnapshot,
  type SeatChange,
  type SeatDef,
  type ServerToClientEvents,
  type StudyBoard,
  type StudyMode,
  type Vec3,
  type WalkMap,
} from '@focusroom/shared';
import { Avatar } from '../entities/avatar.js';
import { loadAllCharacterTemplates, type CharacterTemplate } from '../entities/characterTemplate.js';
import { RemotePlayer } from '../entities/remotePlayer.js';
import { buildEnvironment, enclosedHeight, type BuiltEnvironment, type Quality } from '../scenes/common.js';
import { loadSceneModule } from '../scenes/index.js';
import { playChime } from '../systems/audio.js';
import { CameraRig } from '../systems/cameraRig.js';
import { Keyboard } from '../systems/input.js';
import { LocalController } from '../systems/localController.js';
import { BoardPanel } from '../ui/boardPanel.js';
import { ChatPanel } from '../ui/chatPanel.js';
import { el } from '../ui/dom.js';
import { PomodoroPanel } from '../ui/pomodoroPanel.js';
import { showToast } from '../ui/toast.js';
import { TouchJoystick } from '../ui/touchJoystick.js';
import { getSessionId, saveMutes, type Profile, type Settings } from './storage.js';
import type { StatsStore } from './stats.js';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const MODE_HEARTBEAT_MS = 10_000;
const FOCUS_FLUSH_MS = 15_000;
const BUBBLE_MS = 4_000;
const DRAG_THRESHOLD_PX = 6;
const ARRIVE_RADIUS = 0.12;

export interface RoomDeps {
  environmentId: EnvironmentId;
  profile: Profile;
  settings: Settings;
  stats: StatsStore;
  mutes: Set<string>;
  onLeave(): void;
  openSettings(): void;
  openStats(): void;
}

function pixelRatioFor(quality: Quality): number {
  if (quality === 'low') return 1;
  const cap = quality === 'medium' ? 1.5 : 2;
  return Math.min(window.devicePixelRatio || 1, cap);
}

function notify(body: string): void {
  if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(tr.pomodoro.notifyTitle, { body });
    return;
  }
  showToast(body, 'info', 6_000);
}

/** One room session: socket, 3D scene, HUD, and the frame loop. Disposed when the player leaves. */
export class RoomScreen {
  readonly element: HTMLElement;
  private readonly env: EnvironmentDef;
  private readonly walkMap: WalkMap;
  private readonly selfId: string;
  private readonly touchDevice: boolean;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cssRenderer: CSS2DRenderer;
  private readonly rig = new CameraRig(1);
  private readonly keyboard: Keyboard;
  private readonly timer: PomodoroTimer;
  private readonly pomodoroPanel: PomodoroPanel;
  private readonly chat: ChatPanel;
  private readonly board: BoardPanel;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly overlay: HTMLElement;
  private readonly overlayText: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly peopleLabel: HTMLElement;
  private built: BuiltEnvironment | null = null;
  private controller: LocalController | null = null;
  private localAvatar: Avatar | null = null;
  private templates = new Map<CharacterId, CharacterTemplate>();
  private readonly remotes = new Map<string, RemotePlayer>();
  private readonly seatOf = new Map<string, string>();
  private socket: GameSocket | null = null;
  private instanceId: string | null = null;
  private joinedOnce = false;
  private disposed = false;
  private raf = 0;
  private lastFrame = 0;
  private wasMoving = false;
  private lastMoveSentAt = 0;
  private modeSent: StudyMode | null = null;
  private modeSentAt = 0;
  private focusAccumMs = 0;
  private lastFocusFlushAt = 0;
  private promptText = '';
  private firstPerson = false;
  private readonly viewButton: HTMLElement;
  private detachKeys: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly deps: RoomDeps) {
    this.env = getEnvironment(deps.environmentId);
    this.walkMap = buildWalkMap(this.env);
    this.selfId = getSessionId();
    this.touchDevice = window.matchMedia('(pointer: coarse)').matches;
    const quality = deps.settings.quality;

    this.canvas = el('canvas', { class: 'scene-canvas', attrs: { 'aria-label': this.env.name } });
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = quality !== 'low';

    this.cssRenderer = new CSS2DRenderer();
    this.cssRenderer.domElement.classList.add('css-layer');

    this.peopleLabel = el('span', { text: tr.room.peopleCount(0, this.env.capacity) });
    this.overlayText = el('p', { text: tr.app.loading });
    this.overlay = el('div', { class: 'overlay', attrs: { role: 'status' } }, [
      el('div', { class: 'box' }, [el('div', { class: 'spinner' }), this.overlayText]),
    ]);
    this.banner = el('div', { class: 'connection-banner', text: tr.room.reconnecting, attrs: { role: 'status' } });
    this.banner.hidden = true;
    this.prompt = el('div', { class: 'prompt', attrs: { role: 'note' } });

    const dockRight = el('div', { class: 'panel-dock dock-right' });
    this.chat = new ChatPanel(dockRight, this.selfId, deps.mutes, {
      send: (text) => this.sendChat(text),
      report: (messageId) => this.reportMessage(messageId),
      mutesChanged: () => saveMutes(deps.mutes),
      onError: (text) => showToast(text, 'error'),
    });

    this.timer = new PomodoroTimer({ ...deps.settings.pomodoro });
    this.pomodoroPanel = new PomodoroPanel(this.timer, {
      onChange: () => this.reportMode(),
      onEvent: (event) => this.onPomodoroEvent(event),
    });
    this.pomodoroPanel.setCycles(deps.settings.pomodoro.cyclesBeforeLongBreak);

    this.board = new BoardPanel(this.selfId, () => undefined);
    this.keyboard = new Keyboard(() => this.chat.isTyping());

    const hudButton = (text: string, onClick: () => void): HTMLElement =>
      el('button', { class: 'ghost small', text, on: { click: onClick } });

    this.viewButton = hudButton(tr.room.firstPerson, () => this.toggleView());
    const topLeft = el('div', { class: 'hud hud-top-left' }, [
      el('div', { class: 'panel room-title' }, [el('strong', { text: this.env.name }), this.peopleLabel]),
      el('div', { class: 'row-buttons' }, [
        this.viewButton,
        hudButton(tr.room.settings, () => deps.openSettings()),
        hudButton(tr.room.stats, () => deps.openStats()),
        hudButton(tr.room.leave, () => deps.onLeave()),
      ]),
    ]);
    const dockBoard = el('div', { class: 'panel-dock dock-board' }, [this.board.element]);
    dockRight.append(this.pomodoroPanel.element);
    const bottom = el('div', { class: 'hud hud-bottom-center' }, [this.prompt]);

    this.element = el('div', { class: 'room' }, [
      this.canvas,
      this.cssRenderer.domElement,
      topLeft,
      dockBoard,
      dockRight,
      bottom,
      this.banner,
      this.overlay,
    ]);

    new TouchJoystick(this.element, (axis) => this.keyboard.setTouchAxis(axis));
  }

  async start(): Promise<void> {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.element);
    this.detachKeys = this.keyboard.attach();
    this.bindPointer();
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.applySettings();

    try {
      const sceneModule = await loadSceneModule(this.env.id);
      const [built, templates] = await Promise.all([
        buildEnvironment(this.env, this.deps.settings.quality, sceneModule),
        loadAllCharacterTemplates(),
      ]);
      if (this.disposed) {
        built.dispose();
        return;
      }
      this.built = built;
      this.rig.setEnclosure(this.env.bounds, enclosedHeight(this.env.id));
      this.templates = new Map(templates.map((t): [CharacterId, CharacterTemplate] => [t.id, t]));

      const template = this.templates.get(this.deps.profile.characterId);
      if (!template) throw new Error(`missing character template: ${this.deps.profile.characterId}`);

      this.controller = new LocalController(this.walkMap, this.env.spawn);
      const avatar = new Avatar(template, this.deps.profile.nickname);
      built.scene.add(avatar.anchor);
      avatar.placeStanding(this.controller.x, this.controller.z, this.controller.yaw);
      avatar.setState('idle');
      this.localAvatar = avatar;

      this.connect();
    } catch (error) {
      if (this.disposed) return;
      console.error(error);
      showToast(tr.room.joinFailed, 'error');
      this.deps.onLeave();
    }
  }

  /** Re-applies settings that can change while the room is open. */
  applySettings(): void {
    const { settings } = this.deps;
    this.timer.updateSettings({ ...settings.pomodoro });
    this.pomodoroPanel.setCycles(settings.pomodoro.cyclesBeforeLongBreak);
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    this.resize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.detachKeys?.();
    if (this.isPointerLocked()) document.exitPointerLock();
    this.flushFocus();
    if (this.socket) {
      this.socket.emit('oda:ayrıl', () => undefined);
      this.socket.disconnect();
      this.socket = null;
    }
    for (const remote of this.remotes.values()) remote.avatar.dispose();
    this.remotes.clear();
    this.seatOf.clear();
    this.localAvatar?.dispose();
    this.localAvatar = null;
    this.built?.dispose();
    this.built = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.cssRenderer.domElement.remove();
  }

  private connect(): void {
    const socket = io({ transports: ['websocket', 'polling'], reconnectionAttempts: 8 }) as GameSocket;
    this.socket = socket;
    this.setOverlay(tr.room.connecting);

    socket.on('connect', () => this.join());
    socket.on('disconnect', (reason) => {
      if (this.disposed) return;
      this.banner.hidden = false;
      if (reason === 'io server disconnect') socket.connect();
    });
    socket.io.on('reconnect_failed', () => {
      if (this.disposed) return;
      showToast(tr.room.reconnectFailed, 'error');
      this.deps.onLeave();
    });

    socket.on('durum:güncelle', (snapshot) => this.onSnapshot(snapshot));
    socket.on('oyuncu:katıldı', (player) => {
      if (player.id !== this.selfId) this.upsertRemote(player, performance.now());
    });
    socket.on('oyuncu:ayrıldı', ({ playerId }) => this.removeRemote(playerId));
    socket.on('oyuncu:bağlantı', ({ playerId, connected }) => {
      this.remotes.get(playerId)?.avatar.setAway(!connected);
    });
    socket.on('oyuncu:hareket', (move) => {
      this.remotes.get(move.playerId)?.pushMove(move, performance.now());
    });
    socket.on('oyuncu:konum-düzeltildi', (pos) => this.applySelfPosition(pos.position, pos.yaw));
    socket.on('koltuk:güncellendi', (change) => this.onSeatChange(change));
    socket.on('sohbet:mesaj', (message) => this.onChatMessage(message));
    socket.on('istatistik:güncelle', (board) => this.onBoard(board));
    socket.on('sistem:bildirim', (notice) => this.onNotice(notice));
  }

  private join(): void {
    const socket = this.socket;
    if (!socket) return;
    const { profile } = this.deps;
    socket.emit(
      'oda:katıl',
      {
        environmentId: this.env.id,
        sessionId: this.selfId,
        nickname: profile.nickname,
        characterId: profile.characterId,
        ...(this.instanceId ? { instanceId: this.instanceId } : {}),
      },
      (res: JoinResult) => {
        if (this.disposed) return;
        if (!res.ok) {
          showToast(this.joinedOnce ? tr.room.reconnectFailed : tr.errors[res.error], 'error');
          this.deps.onLeave();
          return;
        }
        this.instanceId = res.instanceId;
        this.joinedOnce = true;
        this.banner.hidden = true;
      },
    );
  }

  private onSnapshot(snapshot: RoomSnapshot): void {
    const built = this.built;
    if (!built || !this.controller || this.disposed) return;
    this.instanceId = snapshot.instanceId;
    this.setOverlay(null);

    const now = performance.now();
    const present = new Set(snapshot.players.map((p) => p.id));
    for (const id of [...this.remotes.keys()]) {
      if (!present.has(id)) this.removeRemote(id);
    }
    for (const player of snapshot.players) {
      if (player.id === snapshot.you) this.syncSelf(player);
      else this.upsertRemote(player, now);
    }
    for (const [seatId, owner] of Object.entries(snapshot.seats)) {
      built.seats.setOccupied(seatId, owner !== null);
    }
    this.chat.setHistory(snapshot.messages);
    this.board.update(snapshot.board);
    this.peopleLabel.textContent = tr.room.peopleCount(snapshot.players.length, this.env.capacity);
  }

  private upsertRemote(player: PlayerPublic, now: number): void {
    if (!this.built) return;
    let remote = this.remotes.get(player.id);
    if (!remote) {
      const template = this.templates.get(player.characterId);
      if (!template) return;
      const avatar = new Avatar(template, player.nickname);
      this.built.scene.add(avatar.anchor);
      remote = new RemotePlayer(player.id, avatar);
      this.remotes.set(player.id, remote);
    }
    remote.applyPlayer(player, now);
    remote.avatar.setPresence(player.seatId ? player.mode : 'standing');
    this.setSeatOf(player.id, player.seatId);
  }

  private removeRemote(playerId: string): void {
    const remote = this.remotes.get(playerId);
    if (remote) {
      remote.avatar.dispose();
      this.remotes.delete(playerId);
    }
    this.setSeatOf(playerId, null);
  }

  private syncSelf(player: PlayerPublic): void {
    this.setSeatOf(player.id, player.seatId);
    this.applySelfSeat(player.seatId, player.position, player.yaw);
  }

  private onSeatChange(change: SeatChange): void {
    if (!this.built) return;
    this.setSeatOf(change.playerId, change.seatId);
    if (change.playerId === this.selfId) {
      this.applySelfSeat(change.seatId, change.position, change.yaw);
      return;
    }
    const remote = this.remotes.get(change.playerId);
    if (!remote) return;
    if (change.seatId) {
      remote.setSeated(change.position, change.yaw);
      remote.avatar.setPresence('idle');
    } else {
      remote.setStanding(change.position, change.yaw, performance.now());
      remote.avatar.setPresence('standing');
    }
  }

  private applySelfSeat(seatId: string | null, position: Vec3, yaw: number): void {
    const controller = this.controller;
    const avatar = this.localAvatar;
    if (!controller || !avatar) return;

    const wasSeated = controller.seatId !== null;
    controller.seatId = seatId;
    controller.place(position.x, position.z, yaw);
    controller.cancelTarget();
    if (seatId) {
      avatar.placeSeated(position.x, position.y, position.z, yaw);
      avatar.setState('sit');
    } else {
      avatar.placeStanding(position.x, position.z, yaw);
      avatar.setState('idle');
      if (wasSeated && this.deps.settings.autoPauseOnStand) this.pomodoroPanel.pauseIfRunning();
    }
    this.pomodoroPanel.setSeated(seatId !== null);
    this.refreshPresence();
    this.reportMode();
  }

  private applySelfPosition(position: Vec3, yaw: number): void {
    const controller = this.controller;
    if (!controller || controller.seatId !== null) return;
    controller.place(position.x, position.z, yaw);
    controller.cancelTarget();
    this.localAvatar?.placeStanding(position.x, position.z, yaw);
  }

  private onChatMessage(message: ChatMessage): void {
    this.chat.append(message);
    if (message.kind !== 'user' || !message.authorId) return;
    if (this.deps.mutes.has(message.authorId)) return;
    if (this.deps.settings.quietWhileFocusing && this.timer.isFocusRunning) return;
    if (message.authorId !== this.selfId && this.deps.settings.chatSound) playChime('message');
    if (this.deps.settings.bubbles) {
      const avatar = message.authorId === this.selfId ? this.localAvatar : this.remotes.get(message.authorId)?.avatar;
      avatar?.showBubble(message.text, BUBBLE_MS);
    }
  }

  private onBoard(board: StudyBoard): void {
    this.board.update(board);
    for (const row of board.rows) {
      const remote = this.remotes.get(row.playerId);
      if (!remote) continue;
      remote.avatar.setAway(!row.connected);
      remote.avatar.setPresence(row.connected ? row.status : 'standing');
    }
  }

  private onNotice(notice: { level: 'info' | 'error'; text: string }): void {
    if (notice.text === tr.system.takeover) {
      showToast(tr.room.sessionReplaced, 'error');
      this.deps.onLeave();
      return;
    }
    showToast(notice.text, notice.level === 'error' ? 'error' : 'info');
  }

  private onPomodoroEvent(event: PomodoroEvent): void {
    if (event.type === 'focus-completed') {
      this.flushFocus();
      this.deps.stats.addPomodoro();
      notify(tr.pomodoro.focusDone);
    } else {
      notify(tr.pomodoro.breakDone);
    }
    playChime('alert');
  }

  private sendChat(text: string): Promise<string | null> {
    const socket = this.socket;
    if (!socket?.connected) return Promise.resolve(tr.chat.sendFailed);
    return new Promise<string | null>((resolve) => {
      socket.emit('sohbet:mesaj-gönder', { text }, (res: ActionResult) => {
        resolve(res.ok ? null : tr.errors[res.error]);
      });
    });
  }

  private reportMessage(messageId: string): void {
    this.socket?.emit('sohbet:şikayet', { messageId }, (res: ActionResult) => {
      if (res.ok) showToast(tr.chat.reported, 'info');
      else showToast(tr.errors[res.error], 'error');
    });
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (this.built) {
      this.update(dt, now);
      this.renderer.render(this.built.scene, this.rig.camera);
      this.cssRenderer.render(this.built.scene, this.rig.camera);
    }
    this.keyboard.endFrame();
  };

  private update(dt: number, now: number): void {
    const controller = this.controller;
    const avatar = this.localAvatar;
    if (!controller || !avatar) return;

    if (this.keyboard.wasPressed('KeyE')) this.toggleSeat();
    if (this.keyboard.wasPressed('KeyV')) this.toggleView();
    if (this.keyboard.wasPressed('Enter')) this.chat.focusInput();

    controller.update(dt, this.keyboard.axis(), this.rig.yaw);
    if (controller.seatId === null) {
      avatar.placeStanding(controller.x, controller.z, controller.yaw);
      avatar.setState(controller.moving ? 'walk' : 'idle');
    }
    if (controller.moving) this.sendMove(now, false);
    else if (this.wasMoving) this.sendMove(now, true);
    this.wasMoving = controller.moving;

    for (const remote of this.remotes.values()) {
      remote.update(dt, now);
      const pos = remote.avatar.position;
      const distance = Math.hypot(pos.x - controller.x, pos.z - controller.z);
      remote.avatar.setLabelOpacity(Math.min(1, Math.max(0.35, 1.2 - distance / 8)));
    }

    avatar.update(dt);
    this.rig.update(dt, avatar.position, !this.deps.settings.reducedMotion);
    this.pomodoroPanel.tick();
    this.accumulateFocus(dt, now);
    this.reportMode();
    this.updatePrompt(controller);
  }

  private bindPointer(): void {
    let press: { id: number; x: number; y: number; moved: boolean } | null = null;

    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.isPointerLocked()) {
        if (event.button === 2) document.exitPointerLock();
        return;
      }
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      this.canvas.setPointerCapture(event.pointerId);
      if (!this.touchDevice) this.canvas.requestPointerLock()?.catch(() => undefined);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (this.isPointerLocked()) {
        this.rig.orbit(event.movementX, event.movementY);
        return;
      }
      if (!press || press.id !== event.pointerId) return;
      if (!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_THRESHOLD_PX) {
        press.moved = true;
      }
      if (press.moved && this.touchDevice) this.rig.orbit(event.movementX, event.movementY);
    });
    const release = (event: PointerEvent): void => {
      if (!press || press.id !== event.pointerId) return;
      const isClick = !press.moved && event.type === 'pointerup';
      press = null;
      if (isClick) this.handleClick(event);
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.rig.zoom(event.deltaY);
      },
      { passive: false },
    );
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  private handleClick(event: PointerEvent): void {
    const controller = this.controller;
    const built = this.built;
    if (!controller || !built || controller.seatId !== null) return;

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);

    const [seatHit] = this.raycaster.intersectObjects(built.seats.hitTargets, false);
    if (seatHit) {
      const seatId = built.seats.seatIdOf(seatHit.object);
      const seat = this.env.seats.find((s) => s.id === seatId);
      if (seat) {
        if (this.isSeatFree(seat.id)) this.requestSit(seat);
        else showToast(tr.room.seatTaken, 'error');
        return;
      }
    }

    const target = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, target)) {
      controller.setTarget({ x: target.x, z: target.z, arriveRadius: ARRIVE_RADIUS });
    }
  }

  private toggleSeat(): void {
    if (this.controller?.seatId) {
      this.requestStand();
      return;
    }
    const seat = this.nearestFreeSeat(WORLD.sitReach);
    if (seat) this.requestSit(seat);
  }

  private toggleView(): void {
    this.firstPerson = !this.firstPerson;
    this.rig.setFirstPerson(this.firstPerson);
    if (this.localAvatar) this.localAvatar.anchor.visible = !this.firstPerson;
    this.viewButton.textContent = this.firstPerson ? tr.room.thirdPerson : tr.room.firstPerson;
  }

  private nearestFreeSeat(radius: number): SeatDef | null {
    const controller = this.controller;
    if (!controller) return null;
    let best: SeatDef | null = null;
    let bestDistance = radius;
    for (const seat of this.env.seats) {
      if (!this.isSeatFree(seat.id)) continue;
      const d = distance2D(controller, seat.pozisyon);
      if (d <= bestDistance) {
        best = seat;
        bestDistance = d;
      }
    }
    return best;
  }

  private requestSit(seat: SeatDef): void {
    const controller = this.controller;
    if (!controller) return;
    if (distance2D(controller, seat.pozisyon) <= WORLD.sitReach) {
      this.emitSit(seat.id);
      return;
    }
    const spot = findStandSpot(this.walkMap, seat.pozisyon, seat.yön);
    if (!spot) {
      showToast(tr.room.seatFailed, 'error');
      return;
    }
    controller.setTarget({
      x: spot.x,
      z: spot.z,
      arriveRadius: ARRIVE_RADIUS,
      onArrive: () => this.emitSit(seat.id),
    });
  }

  private emitSit(seatId: string): void {
    this.socket?.emit('koltuk:oturmayı-dene', { seatId }, (res: ActionResult) => {
      if (res.ok) return;
      showToast(res.error === 'seat-taken' ? tr.room.seatTaken : tr.errors[res.error], 'error');
    });
  }

  private requestStand(): void {
    this.socket?.emit('koltuk:kalk', (res: ActionResult) => {
      if (!res.ok) showToast(tr.room.standFailed, 'error');
    });
  }

  private sendMove(now: number, force: boolean): void {
    const controller = this.controller;
    if (!controller || !this.socket) return;
    if (!force && now - this.lastMoveSentAt < 1000 / WORLD.moveSendHz) return;
    this.lastMoveSentAt = now;
    this.socket.volatile.emit('oyuncu:hareket', {
      x: controller.x,
      y: 0,
      z: controller.z,
      yaw: controller.yaw,
      moving: controller.moving,
    });
  }

  private setSeatOf(playerId: string, seatId: string | null): void {
    const previous = this.seatOf.get(playerId);
    if (previous === seatId) return;
    if (previous) this.built?.seats.setOccupied(previous, false);
    if (seatId) {
      this.seatOf.set(playerId, seatId);
      this.built?.seats.setOccupied(seatId, true);
    } else {
      this.seatOf.delete(playerId);
    }
  }

  private isSeatFree(seatId: string): boolean {
    for (const owned of this.seatOf.values()) {
      if (owned === seatId) return false;
    }
    return true;
  }

  private currentMode(): StudyMode {
    if (!this.controller?.seatId || this.timer.status !== 'running') return 'idle';
    return this.timer.phase === 'focus' ? 'focus' : 'break';
  }

  private refreshPresence(): void {
    const seated = Boolean(this.controller?.seatId);
    this.localAvatar?.setPresence(seated ? this.currentMode() : 'standing');
  }

  private reportMode(): void {
    const mode = this.currentMode();
    const now = performance.now();
    if (mode !== this.modeSent) this.refreshPresence();
    if (mode === this.modeSent && now - this.modeSentAt < MODE_HEARTBEAT_MS) return;
    this.modeSent = mode;
    this.modeSentAt = now;
    this.socket?.volatile.emit('oyuncu:çalışma-durumu', { mode });
  }

  private accumulateFocus(dt: number, now: number): void {
    if (this.controller?.seatId && this.timer.isFocusRunning) this.focusAccumMs += dt * 1000;
    if (now - this.lastFocusFlushAt > FOCUS_FLUSH_MS) this.flushFocus(now);
  }

  private flushFocus(now: number = performance.now()): void {
    this.lastFocusFlushAt = now;
    if (this.focusAccumMs <= 0) return;
    this.deps.stats.addFocus(this.focusAccumMs);
    this.focusAccumMs = 0;
  }

  private updatePrompt(controller: LocalController): void {
    let text: string;
    if (controller.seatId) text = tr.room.stand;
    else if (this.nearestFreeSeat(WORLD.sitReach)) text = tr.room.sit;
    else text = this.touchDevice ? tr.room.touchHint : tr.room.walkHint;
    if (text === this.promptText) return;
    this.promptText = text;
    this.prompt.textContent = text;
  }

  private setOverlay(text: string | null): void {
    this.overlay.style.display = text === null ? 'none' : '';
    if (text !== null) this.overlayText.textContent = text;
  }

  private resize(): void {
    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setPixelRatio(pixelRatioFor(this.deps.settings.quality));
    this.renderer.setSize(width, height, false);
    this.cssRenderer.setSize(width, height);
    this.rig.setAspect(width / height);
  }
}
