import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Mesh,
  Object3D,
  Skeleton,
  SkinnedMesh,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLAYER } from '../config';

/**
 * Merge modular Quaternius universal-rig parts (outfits, hair) onto the base
 * character's skeleton so one mixer drives everything. All parts must share
 * the base rig's bone names and bind pose.
 */
export function compositeCharacter(base: GLTF, parts: GLTF[]): void {
  let baseSkeleton: Skeleton | null = null;
  base.scene.traverse((o) => {
    const sm = o as SkinnedMesh;
    if (sm.isSkinnedMesh && !baseSkeleton) baseSkeleton = sm.skeleton;
  });
  if (!baseSkeleton) throw new Error('composite base has no skinned mesh');
  for (const part of parts) {
    const toAttach: SkinnedMesh[] = [];
    part.scene.traverse((o) => {
      const sm = o as SkinnedMesh;
      if (sm.isSkinnedMesh) toAttach.push(sm);
    });
    for (const sm of toAttach) {
      sm.removeFromParent();
      sm.bind(baseSkeleton, sm.bindMatrix);
      base.scene.add(sm);
    }
  }
}

export type Locomotion = 'idle' | 'walk' | 'run';

/**
 * Clip-name patterns per locomotion state, checked in order (first match wins).
 * Covers Quaternius UAL (Idle_Loop/Walk_Loop/Jog_Fwd_Loop) and KayKit
 * (Idle/Walking_A/Running_A) naming.
 */
const CLIP_PATTERNS: Record<Locomotion, RegExp[]> = {
  idle: [/^idle_loop$/i, /^idle$/i, /^idle_?a$/i, /^(?!.*(crouch|pistol|sword|sit|swim|torch|talk)).*idle/i],
  walk: [/^walk_loop$/i, /^walk$/i, /^walking_?a$/i, /^(?!.*formal).*walk/i],
  run: [/^jog_fwd_loop$/i, /^run$/i, /^running_?a$/i, /^gallop$/i, /run|jog|sprint|gallop/i],
};

/**
 * Wraps a rigged glTF character: shadow flags, animation mixer, and
 * crossfaded locomotion states resolved from clip names.
 */
export class Character {
  readonly root: Object3D;
  readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly clips: AnimationClip[];
  private current: string | null = null;

  /**
   * @param gltf a loaded GLTF, or `{ scene, animations }` for SkeletonUtils
   * clones sharing one source (e.g. the deer herd).
   * @param extraClips clips from a separate animation library GLB (e.g. the
   * Quaternius UAL) — they drive the character's bones by track name, so the
   * rigs must share the same skeleton.
   */
  constructor(gltf: Pick<GLTF, 'scene' | 'animations'>, extraClips: AnimationClip[] = []) {
    this.root = gltf.scene;
    this.root.traverse((obj) => {
      const m = obj as Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false; // skinned bounds lag the rig; avoid pop-out
      }
    });

    this.clips = [...gltf.animations, ...extraClips];
    this.mixer = new AnimationMixer(this.root);
    for (const state of Object.keys(CLIP_PATTERNS) as Locomotion[]) {
      for (const pattern of CLIP_PATTERNS[state]) {
        const clip = this.clips.find((c) => pattern.test(c.name));
        if (clip) {
          this.actions.set(state, this.mixer.clipAction(clip));
          break;
        }
      }
    }
  }

  get clipNames(): string[] {
    return [...this.actions.keys()];
  }

  play(state: Locomotion): void {
    this.transitionTo(state);
  }

  /** Crossfade to an exact-named clip (graze variants, poses, attacks). */
  playClip(name: string): void {
    const key = `clip:${name}`;
    if (!this.actions.has(key)) {
      const clip = this.clips.find((c) => c.name === name);
      if (!clip) return;
      this.actions.set(key, this.mixer.clipAction(clip));
    }
    this.transitionTo(key);
  }

  private transitionTo(key: string): void {
    if (this.current === key) return;
    const next = this.actions.get(key);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    next.reset().play();
    if (prev) {
      next.crossFadeFrom(prev, PLAYER.animationFade, true);
    }
    this.current = key;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
