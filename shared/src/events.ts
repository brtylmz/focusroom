import type {
  ChatMessage,
  CharacterId,
  EnvironmentId,
  EnvironmentSummary,
  PlayerMove,
  PlayerPublic,
  RemotePlayerMove,
  RoomSnapshot,
  SeatChange,
  StudyBoard,
  StudyMode,
  Vec3,
} from './types.js';

export type ErrorCode =
  | 'invalid-request'
  | 'unknown-environment'
  | 'room-full'
  | 'not-in-room'
  | 'not-seated'
  | 'already-seated'
  | 'seat-not-found'
  | 'seat-taken'
  | 'too-far'
  | 'message-invalid'
  | 'message-duplicate'
  | 'message-spam'
  | 'rate-limited'
  | 'report-limited'
  | 'unknown-message'
  | 'server-error';

export interface JoinRequest {
  environmentId: EnvironmentId;
  sessionId: string;
  nickname: string;
  characterId: CharacterId;
  /** Set on reconnect so the server can reattach the existing player. */
  instanceId?: string;
}

export type JoinResult = { ok: true; instanceId: string } | { ok: false; error: ErrorCode };
export type ActionResult = { ok: true } | { ok: false; error: ErrorCode };

export interface ClientToServerEvents {
  'oda:katıl': (req: JoinRequest, ack: (res: JoinResult) => void) => void;
  'oda:ayrıl': (ack: (res: ActionResult) => void) => void;
  'oyuncu:hareket': (move: PlayerMove) => void;
  'koltuk:oturmayı-dene': (req: { seatId: string }, ack: (res: ActionResult) => void) => void;
  'koltuk:kalk': (ack: (res: ActionResult) => void) => void;
  'oyuncu:çalışma-durumu': (req: { mode: StudyMode }) => void;
  'sohbet:mesaj-gönder': (req: { text: string }, ack: (res: ActionResult) => void) => void;
  'sohbet:şikayet': (req: { messageId: string }, ack: (res: ActionResult) => void) => void;
}

export interface ServerToClientEvents {
  'durum:güncelle': (snapshot: RoomSnapshot) => void;
  'oyuncu:katıldı': (player: PlayerPublic) => void;
  'oyuncu:ayrıldı': (payload: { playerId: string }) => void;
  'oyuncu:bağlantı': (payload: { playerId: string; connected: boolean }) => void;
  'oyuncu:hareket': (move: RemotePlayerMove) => void;
  'oyuncu:konum-düzeltildi': (pos: { position: Vec3; yaw: number }) => void;
  'koltuk:güncellendi': (change: SeatChange) => void;
  'sohbet:mesaj': (message: ChatMessage) => void;
  'istatistik:güncelle': (board: StudyBoard) => void;
  'sistem:bildirim': (notice: { level: 'info' | 'error'; text: string }) => void;
}

export type LobbyResponse = EnvironmentSummary[];
