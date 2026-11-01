import { ENVIRONMENTS, type EnvironmentDef, type EnvironmentId, type EnvironmentSummary } from '@focusroom/shared';
import { serverConfig } from '../config.js';
import type { StudyRepository } from '../repository/studyRepository.js';
import { Room } from './room.js';

export interface RegistryOptions {
  studyRepo: StudyRepository;
  blocklist: readonly string[];
  maxInstancesPerEnvironment?: number;
}

/** Picks or opens instances of each environment and tracks which room a session belongs to. */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly sessionRoom = new Map<string, string>();
  private readonly instanceCounter = new Map<EnvironmentId, number>();
  private readonly maxInstances: number;

  constructor(private readonly options: RegistryOptions) {
    this.maxInstances = options.maxInstancesPerEnvironment ?? serverConfig.maxInstancesPerEnvironment;
  }

  allRooms(): Room[] {
    return [...this.rooms.values()];
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  roomOfSession(sessionId: string): Room | undefined {
    const roomId = this.sessionRoom.get(sessionId);
    return roomId === undefined ? undefined : this.rooms.get(roomId);
  }

  registerSession(sessionId: string, roomId: string): void {
    this.sessionRoom.set(sessionId, roomId);
  }

  unregisterSession(sessionId: string, roomId: string): void {
    if (this.sessionRoom.get(sessionId) === roomId) this.sessionRoom.delete(sessionId);
  }

  /** Chooses the fullest open instance so people cluster; opens a new instance when all are full. */
  chooseRoom(environmentId: EnvironmentId): Room | null {
    const instances = this.instancesOf(environmentId);
    const open = instances.filter((r) => r.size < r.capacity).sort((a, b) => b.size - a.size);
    if (open[0]) return open[0];
    if (instances.length >= this.maxInstances) return null;
    return this.createRoom(ENVIRONMENTS.find((e) => e.id === environmentId)!);
  }

  remove(roomId: string): void {
    this.rooms.delete(roomId);
  }

  summaries(): EnvironmentSummary[] {
    return ENVIRONMENTS.map((env) => {
      const instances = this.instancesOf(env.id);
      const open = instances.filter((r) => r.size < r.capacity).sort((a, b) => b.size - a.size);
      return {
        id: env.id,
        name: env.name,
        description: env.description,
        capacity: env.capacity,
        openInstancePlayers: open[0]?.size ?? 0,
        totalPlayers: instances.reduce((sum, r) => sum + r.size, 0),
        instances: instances.length,
      };
    });
  }

  private instancesOf(environmentId: EnvironmentId): Room[] {
    return [...this.rooms.values()].filter((r) => r.env.id === environmentId);
  }

  private createRoom(env: EnvironmentDef): Room {
    const next = (this.instanceCounter.get(env.id) ?? 0) + 1;
    this.instanceCounter.set(env.id, next);
    const room = new Room(`${env.id}-${next}`, env, this.options.studyRepo, { blocklist: this.options.blocklist });
    this.rooms.set(room.id, room);
    return room;
  }
}
