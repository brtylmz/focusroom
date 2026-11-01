import type { SeatDef } from '@focusroom/shared';

export type OccupyResult = 'ok' | 'taken' | 'already-seated' | 'unknown-seat';

/** Server-side seat ownership. Single-threaded event loop makes the first request win. */
export class SeatManager {
  private readonly bySeat = new Map<string, string>();
  private readonly byPlayer = new Map<string, string>();
  private readonly seatIds: readonly string[];

  constructor(seats: readonly SeatDef[]) {
    this.seatIds = seats.map((s) => s.id);
  }

  occupy(seatId: string, playerId: string): OccupyResult {
    if (!this.seatIds.includes(seatId)) return 'unknown-seat';
    if (this.bySeat.has(seatId)) return 'taken';
    if (this.byPlayer.has(playerId)) return 'already-seated';
    this.bySeat.set(seatId, playerId);
    this.byPlayer.set(playerId, seatId);
    return 'ok';
  }

  release(playerId: string): string | null {
    const seatId = this.byPlayer.get(playerId);
    if (seatId === undefined) return null;
    this.byPlayer.delete(playerId);
    this.bySeat.delete(seatId);
    return seatId;
  }

  seatOf(playerId: string): string | null {
    return this.byPlayer.get(playerId) ?? null;
  }

  occupantOf(seatId: string): string | null {
    return this.bySeat.get(seatId) ?? null;
  }

  snapshot(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const id of this.seatIds) out[id] = this.bySeat.get(id) ?? null;
    return out;
  }
}
