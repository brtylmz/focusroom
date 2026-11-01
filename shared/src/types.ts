export type CharacterId =
  | 'character-a'
  | 'character-b'
  | 'character-c'
  | 'character-d'
  | 'character-e'
  | 'character-f'
  | 'character-g'
  | 'character-h'
  | 'character-i'
  | 'character-j'
  | 'character-k'
  | 'character-l'
  | 'character-m'
  | 'character-n'
  | 'character-o'
  | 'character-p'
  | 'character-q'
  | 'character-r';
export type EnvironmentId = 'library' | 'cafe' | 'park' | 'office';
export type StudyMode = 'focus' | 'break' | 'idle';
export type ActivityStatus = 'focus' | 'break' | 'idle' | 'standing';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SeatDef {
  id: string;
  pozisyon: Vec3;
  /** Degrees. 0 faces +Z, 90 faces +X. */
  yön: number;
  tür: string;
  model?: string;
}

export interface DecorDef {
  model: string;
  x: number;
  z: number;
  /** Degrees. */
  yaw: number;
  /** Unrotated footprint; becomes a collision box when present. */
  box?: { w: number; d: number };
}

export interface BoxDef {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface BoundsDef {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ThemeDef {
  sky: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  ambient: string;
  ambientIntensity: number;
  sun: string;
  sunIntensity: number;
  ground: string;
  wall: string;
  accent: string;
}

export interface EnvironmentDef {
  id: EnvironmentId;
  name: string;
  description: string;
  capacity: number;
  bounds: BoundsDef;
  spawn: { x: number; z: number };
  theme: ThemeDef;
  seats: SeatDef[];
  decor: DecorDef[];
  obstacles: BoxDef[];
}

export interface PlayerPublic {
  id: string;
  nickname: string;
  characterId: CharacterId;
  position: Vec3;
  /** Radians. */
  yaw: number;
  moving: boolean;
  seatId: string | null;
  mode: StudyMode;
  connected: boolean;
}

export interface ChatMessage {
  id: string;
  kind: 'user' | 'system';
  authorId: string | null;
  authorName: string;
  characterId: CharacterId | null;
  text: string;
  sentAt: number;
  tone: 'info' | 'milestone' | 'warning';
}

export interface StudyRow {
  playerId: string;
  nickname: string;
  characterId: CharacterId;
  status: ActivityStatus;
  connected: boolean;
  visitMinutes: number;
  todayMinutes: number;
}

export interface StudyBoard {
  roomTodayMinutes: number;
  rows: StudyRow[];
  generatedAt: number;
}

export interface RoomSnapshot {
  environmentId: EnvironmentId;
  instanceId: string;
  you: string;
  players: PlayerPublic[];
  seats: Record<string, string | null>;
  messages: ChatMessage[];
  board: StudyBoard;
  serverTime: number;
}

export interface EnvironmentSummary {
  id: EnvironmentId;
  name: string;
  description: string;
  capacity: number;
  /** Players in the instance a new visitor would join. */
  openInstancePlayers: number;
  totalPlayers: number;
  instances: number;
}

export interface PlayerMove {
  x: number;
  y: number;
  z: number;
  /** Radians. */
  yaw: number;
  moving: boolean;
}

export interface RemotePlayerMove extends PlayerMove {
  playerId: string;
}

export interface SeatChange {
  playerId: string;
  seatId: string | null;
  position: Vec3;
  /** Radians. */
  yaw: number;
}
