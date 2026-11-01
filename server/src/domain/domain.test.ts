import { describe, expect, it } from 'vitest';
import { StudyTracker } from './studyTracker.js';
import { SlidingWindowLimiter } from './rateLimiter.js';
import { SeatManager } from './seats.js';
import { moderateChat } from './chatRules.js';
import { InMemoryStudyRepository } from '../repository/studyRepository.js';
import { RoomRegistry } from './registry.js';
import { Room } from './room.js';
import { ENVIRONMENTS, getEnvironment } from '@focusroom/shared';

const MIN = 60_000;

describe('StudyTracker', () => {
  it('credits only while active and never while inactive', () => {
    const credited: number[] = [];
    const tracker = new StudyTracker((ms) => credited.push(ms));
    tracker.update(true, 0);
    tracker.update(true, 10 * MIN);
    tracker.update(false, 12 * MIN);
    tracker.update(false, 30 * MIN);
    expect(credited.reduce((a, b) => a + b, 0)).toBe(12 * MIN);
  });

  it('splits sessions across breaks and reports live visit time', () => {
    const tracker = new StudyTracker(() => undefined);
    tracker.update(true, 0);
    tracker.update(false, 5 * MIN);
    tracker.update(true, 10 * MIN);
    expect(tracker.liveVisitMs(12 * MIN)).toBe(7 * MIN);
    expect(tracker.isActive()).toBe(true);
  });

  it('does not count time after a deactivation even when the clock keeps moving', () => {
    const tracker = new StudyTracker(() => undefined);
    tracker.update(true, 0);
    tracker.update(false, 3 * MIN);
    expect(tracker.liveVisitMs(60 * MIN)).toBe(3 * MIN);
  });
});

describe('SlidingWindowLimiter', () => {
  it('allows up to max events inside the window and recovers afterwards', () => {
    const limiter = new SlidingWindowLimiter(3, 1_000);
    expect([limiter.allow(0), limiter.allow(100), limiter.allow(200)]).toEqual([true, true, true]);
    expect(limiter.allow(300)).toBe(false);
    expect(limiter.allow(1_001)).toBe(true);
  });
});

describe('SeatManager', () => {
  const seats = getEnvironment('library').seats;
  const firstSeat = seats[0]!.id;

  it('lets the first of two players take a seat and rejects the second', () => {
    const manager = new SeatManager(seats);
    expect(manager.occupy(firstSeat, 'alice')).toBe('ok');
    expect(manager.occupy(firstSeat, 'bob')).toBe('taken');
    expect(manager.occupantOf(firstSeat)).toBe('alice');
  });

  it('prevents one player from holding two seats and frees seats on release', () => {
    const manager = new SeatManager(seats);
    manager.occupy(firstSeat, 'alice');
    expect(manager.occupy(seats[1]!.id, 'alice')).toBe('already-seated');
    expect(manager.release('alice')).toBe(firstSeat);
    expect(manager.occupy(firstSeat, 'bob')).toBe('ok');
  });

  it('rejects unknown seats', () => {
    expect(new SeatManager(seats).occupy('nope', 'alice')).toBe('unknown-seat');
  });
});

describe('moderateChat', () => {
  it('rejects empty, spammy and duplicate messages and masks blocked words', () => {
    expect(moderateChat('   ', null, 0, []).ok).toBe(false);
    expect(moderateChat('aaaaaaaaaaaaaaaa', null, 0, []).ok).toBe(false);
    const first = moderateChat('Merhaba', null, 0, []);
    expect(first.ok).toBe(true);
    expect(moderateChat('merhaba ', { text: 'Merhaba', at: 0 }, 5_000, []).ok).toBe(false);
    expect(moderateChat('merhaba', { text: 'Merhaba', at: 0 }, 60_000, []).ok).toBe(true);
    expect(moderateChat('bu salak', null, 0, ['salak'])).toEqual({ ok: true, text: 'bu *****' });
  });
});

describe('RoomRegistry', () => {
  it('opens a new library instance once the first one is full and stops at the instance cap', () => {
    const registry = new RoomRegistry({ studyRepo: new InMemoryStudyRepository(), blocklist: [], maxInstancesPerEnvironment: 2 });
    const first = registry.chooseRoom('park')!;
    for (let i = 0; i < first.capacity; i++) {
      first.join(
        { sessionId: `session-${i}-aaaa`, nickname: `Kişi${i}`, characterId: 'character-a', socketId: `s${i}` },
        0,
      );
    }
    const second = registry.chooseRoom('park')!;
    expect(second.id).not.toBe(first.id);
    expect(registry.chooseRoom('park')).toBe(second);
    for (let i = 0; i < second.capacity; i++) {
      second.join(
        { sessionId: `other-${i}-bbbb`, nickname: `Diğer${i}`, characterId: 'character-a', socketId: `t${i}` },
        0,
      );
    }
    expect(registry.chooseRoom('park')).toBeNull();
    const summary = registry.summaries().find((s) => s.id === 'park')!;
    expect(summary.totalPlayers).toBe(first.capacity + second.capacity);
    expect(summary.capacity).toBe(16);
  });
});

describe('Room', () => {
  const env = ENVIRONMENTS.find((e) => e.id === 'cafe')!;
  // Within reach of the cafe spawn point, so tests need no walking.
  const NEAR_SPAWN_SEAT = 't3-s';
  const newRoom = () => new Room('cafe-test', env, new InMemoryStudyRepository(), { blocklist: [] });
  const join = (room: Room, id: string, now = 0) =>
    room.join({ sessionId: id, nickname: id, characterId: 'character-a', socketId: `sock-${id}` }, now);

  it('rejects a join when the room is at capacity', () => {
    const room = newRoom();
    for (let i = 0; i < env.capacity; i++) join(room, `player-${i}-xxxx`);
    expect(join(room, 'late-player-xxxx')).toEqual({ ok: false, error: 'room-full' });
  });

  it('gives a seat to the first sitter only and frees it when they stand', () => {
    const room = newRoom();
    join(room, 'alice-aaaa');
    join(room, 'bobby-bbbb');
    const seatId = NEAR_SPAWN_SEAT;
    expect(room.sit('alice-aaaa', seatId, 10).ok).toBe(true);
    expect(room.sit('bobby-bbbb', seatId, 11)).toEqual({ ok: false, error: 'seat-taken' });
    expect(room.stand('alice-aaaa', 20).ok).toBe(true);
    expect(room.stand('alice-aaaa', 21)).toEqual({ ok: false, error: 'not-seated' });
  });

  it('refuses to seat a player who is too far from the seat', () => {
    const room = newRoom();
    join(room, 'far-player-xx');
    expect(room.sit('far-player-xx', 'bar-1', 0)).toEqual({ ok: false, error: 'too-far' });
  });

  it('corrects teleporting movement and accepts normal walking', () => {
    const room = newRoom();
    join(room, 'walker-xxxx', 0);
    const walk = room.move('walker-xxxx', { x: 0.1, y: 0, z: 4.0, yaw: 0, moving: true }, 100);
    expect(walk.kind).toBe('accepted');
    const teleport = room.move('walker-xxxx', { x: -6, y: 0, z: -4, yaw: 0, moving: true }, 200);
    expect(teleport.kind).toBe('corrected');
  });

  it('credits focus time only for seated players in focus mode', () => {
    const repo = new InMemoryStudyRepository();
    const room = new Room('cafe-study', env, repo, { blocklist: [] });
    const now = Date.UTC(2026, 5, 10, 12, 0, 0);
    join(room, 'studier-xxxx', now);
    room.sit('studier-xxxx', NEAR_SPAWN_SEAT, now);
    room.setMode('studier-xxxx', 'focus', now);
    room.tick(now + 5 * MIN);
    room.setMode('studier-xxxx', 'focus', now + 5 * MIN);
    room.tick(now + 10 * MIN);
    room.stand('studier-xxxx', now + 10 * MIN);
    room.tick(now + 20 * MIN);
    const board = room.board(now + 20 * MIN);
    expect(board.rows[0]!.todayMinutes).toBeGreaterThanOrEqual(9);
    expect(board.rows[0]!.todayMinutes).toBeLessThanOrEqual(10);
    expect(board.rows[0]!.status).toBe('standing');
  });

  it('stops studying when the focus report goes stale', () => {
    const repo = new InMemoryStudyRepository();
    const room = new Room('cafe-stale', env, repo, { blocklist: [] });
    const now = Date.UTC(2026, 5, 10, 12, 0, 0);
    join(room, 'stale-player', now);
    room.sit('stale-player', NEAR_SPAWN_SEAT, now);
    room.setMode('stale-player', 'focus', now);
    for (let s = 1; s <= 120; s++) room.tick(now + s * 1_000);
    expect(room.board(now + 120_000).rows[0]!.status).toBe('idle');
    expect(room.board(now + 120_000).rows[0]!.visitMinutes).toBe(0);
  });

  it('announces a milestone once when a visit reaches one hour of focus', () => {
    const room = new Room('cafe-milestone', env, new InMemoryStudyRepository(), { blocklist: [] });
    const now = Date.UTC(2026, 5, 10, 9, 0, 0);
    join(room, 'milestone-p', now);
    room.sit('milestone-p', NEAR_SPAWN_SEAT, now);
    let announcements = 0;
    for (let t = 0; t <= 61; t++) {
      room.setMode('milestone-p', 'focus', now + t * MIN);
      announcements += room.tick(now + t * MIN).length;
    }
    expect(announcements).toBe(1);
  });

  it('keeps only the most recent chat messages', () => {
    const room = newRoom();
    join(room, 'chatter-xxxx', 0);
    for (let i = 0; i < 60; i++) {
      room.addSystem(`msg ${i}`, 'info', i);
    }
    expect(room.snapshot('chatter-xxxx', 100).messages).toHaveLength(50);
  });

  it('holds a disconnected seat and removes it on remove()', () => {
    const room = newRoom();
    join(room, 'holder-xxxx', 0);
    room.sit('holder-xxxx', NEAR_SPAWN_SEAT, 0);
    expect(room.markDisconnected('holder-xxxx', 'sock-holder-xxxx', 1_000)).toBe(true);
    expect(room.snapshot('holder-xxxx', 1_000).seats[NEAR_SPAWN_SEAT]).toBe('holder-xxxx');
    room.remove('holder-xxxx', 2_000);
    expect(room.snapshot('holder-xxxx', 2_000).seats[NEAR_SPAWN_SEAT]).toBeNull();
  });
});
