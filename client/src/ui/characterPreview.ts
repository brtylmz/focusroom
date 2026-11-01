import * as THREE from 'three';
import type { CharacterId } from '@focusroom/shared';
import { Avatar } from '../entities/avatar.js';
import { loadCharacterTemplate } from '../entities/characterTemplate.js';

/** Small live render of one character with its idle animation, shown on the login screen. */
export class CharacterPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  private readonly clock = new THREE.Clock();
  private readonly observer: ResizeObserver;
  private avatar: Avatar | null = null;
  private loadToken = 0;
  private frame = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1.5, 2.5, 2);
    this.scene.add(key);
    this.camera.position.set(0, 0.75, 3.1);
    this.camera.lookAt(0, 0.45, 0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.tick();
  }

  async show(id: CharacterId): Promise<void> {
    const token = ++this.loadToken;
    const template = await loadCharacterTemplate(id);
    if (this.disposed || token !== this.loadToken) return;
    this.avatar?.dispose();
    const avatar = new Avatar(template, '');
    avatar.setLabelOpacity(0);
    avatar.placeStanding(0, 0, 0.35);
    avatar.setState('idle');
    this.scene.add(avatar.anchor);
    this.avatar = avatar;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.avatar?.dispose();
    this.avatar = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private readonly tick = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    this.avatar?.update(this.clock.getDelta());
    this.renderer.render(this.scene, this.camera);
  };
}
