/**
 * Post-processing stack (P-polish): an EffectComposer that adds a subtle
 * UnrealBloom on bright/emissive pixels (sun, finish arch, musettes),
 * SMAA edge anti-aliasing (the renderer's MSAA is bypassed once we render
 * through a composer) and an OutputPass for ACES tone mapping + sRGB.
 *
 * Heavy passes are gated by quality tier — `low` never constructs a PostFX
 * at all (see game.ts), `medium` runs a lighter bloom, `high` the full look.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { QualitySettings } from '../core/quality';

export class PostFX {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: QualitySettings,
  ) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(scene, camera));

    // Soft, high-threshold bloom: only genuinely bright/emissive pixels glow,
    // so the cel-shaded flats stay clean.
    const lighter = quality.tier === 'medium';
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      lighter ? 0.22 : 0.38, // strength
      0.5, // radius
      0.82, // threshold
    );
    this.composer.addPass(this.bloom);

    // SMAA restores edge AA (composer bypasses the renderer's MSAA).
    this.composer.addPass(new SMAAPass());

    // OutputPass applies the renderer's tone mapping (ACES) + colour space.
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  render(): void {
    this.composer.render();
  }
}
