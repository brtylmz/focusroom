import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { StudyMode } from '@focusroom/shared';
import { el } from '../ui/dom.js';
import { AVATAR_HEIGHT, type AvatarState, type CharacterTemplate } from './characterTemplate.js';

export type PresenceStatus = StudyMode | 'standing';

const STATUS_CLASS: Record<PresenceStatus, string> = {
  focus: 'focus',
  break: 'break',
  idle: 'idle',
  standing: '',
};

/** Animated character with a name plate and speech bubble. Geometry and materials are shared across clones. */
export class Avatar {
  readonly anchor = new THREE.Group();
  private readonly body: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<AvatarState, THREE.AnimationAction>;
  private readonly sitHeight: number;
  private readonly dot: HTMLSpanElement;
  private readonly nameplate: CSS2DObject;
  private readonly bubble: CSS2DObject;
  private readonly bubbleEl: HTMLDivElement;
  private state: AvatarState | null = null;
  private bubbleLeft = 0;
  private presence: PresenceStatus = 'standing';
  private away = false;
  private labelOpacity = 1;

  constructor(template: CharacterTemplate, nickname: string) {
    this.body = template.model.clone(true);
    this.anchor.add(this.body);
    this.sitHeight = template.sitHeight;

    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = {
      idle: this.mixer.clipAction(template.clips.idle),
      walk: this.mixer.clipAction(template.clips.walk),
      sit: this.mixer.clipAction(template.clips.sit),
    };
    this.actions.sit.setLoop(THREE.LoopOnce, 1);
    this.actions.sit.clampWhenFinished = true;

    this.dot = el('span', { class: 'dot' });
    const nameEl = el('div', { class: 'nameplate' }, [this.dot, nickname]);
    this.nameplate = new CSS2DObject(nameEl);
    this.nameplate.position.set(0, AVATAR_HEIGHT + 0.2, 0);
    this.anchor.add(this.nameplate);

    this.bubbleEl = el('div', { class: 'bubble' });
    this.bubbleEl.style.display = 'none';
    this.bubble = new CSS2DObject(this.bubbleEl);
    this.bubble.position.set(0, AVATAR_HEIGHT + 0.5, 0);
    this.anchor.add(this.bubble);

    this.setState('idle');
  }

  get position(): THREE.Vector3 {
    return this.anchor.position;
  }

  placeStanding(x: number, z: number, yaw: number): void {
    this.anchor.position.set(x, 0, z);
    this.anchor.rotation.y = yaw;
  }

  /** `seatY` is the seat surface height; the hips land on it when the sit pose plays. */
  placeSeated(x: number, seatY: number, z: number, yaw: number): void {
    this.anchor.position.set(x, seatY - this.sitHeight, z);
    this.anchor.rotation.y = yaw;
  }

  setState(next: AvatarState): void {
    if (next === this.state) return;
    const from = this.state ? this.actions[this.state] : null;
    const to = this.actions[next];
    to.reset().play();
    if (from) from.crossFadeTo(to, 0.25, false);
    this.state = next;
  }

  setPresence(status: PresenceStatus): void {
    if (status === this.presence) return;
    if (this.presence !== 'standing') this.dot.classList.remove(STATUS_CLASS[this.presence]);
    if (STATUS_CLASS[status]) this.dot.classList.add(STATUS_CLASS[status]);
    this.presence = status;
  }

  setAway(away: boolean): void {
    this.away = away;
    this.applyLabelOpacity();
  }

  setLabelOpacity(opacity: number): void {
    this.labelOpacity = opacity;
    this.applyLabelOpacity();
  }

  private applyLabelOpacity(): void {
    const value = String(this.labelOpacity * (this.away ? 0.5 : 1));
    this.nameplate.element.style.opacity = value;
    this.bubbleEl.style.opacity = value;
  }

  showBubble(text: string, durationMs: number): void {
    this.bubbleEl.textContent = text;
    this.bubbleEl.style.display = '';
    this.bubbleLeft = durationMs;
  }

  setShadows(cast: boolean): void {
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = cast;
    });
  }

  update(dt: number): void {
    this.mixer.update(dt);
    if (this.bubbleLeft > 0) {
      this.bubbleLeft -= dt * 1000;
      if (this.bubbleLeft <= 0) this.bubbleEl.style.display = 'none';
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.anchor.removeFromParent();
    this.nameplate.element.remove();
    this.bubble.element.remove();
  }
}
