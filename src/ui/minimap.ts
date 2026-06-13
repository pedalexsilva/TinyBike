/**
 * Rival radar + planet minimap (P08.5).
 *
 * A circular 2D canvas, always visible while exploring, that flattens the
 * whole tiny planet into a disc centered on the player (azimuthal: angular
 * distance → radius, great-circle bearing → angle). North is fixed up — the
 * calmer, less nauseating option — and the player's heading is shown by a
 * rotating arrow at the center.
 *
 * On top of the map sits a compass: an arrow on the outer ring that always
 * points to the nearest rival the player hasn't beaten yet, with a coarse
 * NEAR / MID / FAR distance read-out (no exact numbers — keeps the arcade
 * tone). It pulses once the rival is close enough to challenge.
 *
 * Tap the map to expand it; tap a pin to preview that rival (name + bio),
 * without pausing the game. Nothing here uses an extra camera or render
 * target, and the canvas only redraws a few times per second.
 */
import * as THREE from 'three';
import type { Planet } from '../world/planet';
import type { Player } from '../entities/player';
import type { RivalsSystem } from '../entities/rival-npc';
import type { RivalDef } from '../entities/rivals';
import { gameStore } from '../state/store';

const REDRAW_INTERVAL = 0.1; // seconds — ~10fps is plenty for a radar
const NOTICE_RADIUS = 20; // meters; matches the rival "!" balloon range
const ROAD_STEP = 16; // subsample the 1024-sample road for a faint ring

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Module-level scratch — zero allocation in the redraw loop.
const _pUp = new THREE.Vector3();
const _north = new THREE.Vector3();
const _east = new THREE.Vector3();
const _t = new THREE.Vector3();
const _dir = new THREE.Vector3();

interface Pin {
  def: RivalDef;
  x: number; // CSS px within the canvas
  y: number;
  beaten: boolean;
}

export class Minimap {
  private readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tip: HTMLElement;
  private readonly planet: Planet;
  private readonly rivals: RivalsSystem;

  private accum = REDRAW_INTERVAL; // force a draw on the first frame
  private time = 0;
  private expanded = false;
  private visible = true;
  private readonly pins: Pin[] = [];
  /** Faint road outline, precomputed as unit directions (subsampled). */
  private readonly roadDirs: THREE.Vector3[];

  constructor(root: HTMLElement, planet: Planet, rivals: RivalsSystem) {
    this.planet = planet;
    this.rivals = rivals;

    this.roadDirs = [];
    for (let i = 0; i < planet.road.samples.length; i += ROAD_STEP) {
      this.roadDirs.push(planet.road.samples[i].dir);
    }

    root.insertAdjacentHTML(
      'beforeend',
      `<div id="minimap" title="Rival radar — tap to expand">
         <canvas id="minimap-canvas"></canvas>
       </div>
       <div id="minimap-tip" class="hidden"></div>`,
    );
    this.el = document.getElementById('minimap')!;
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.tip = document.getElementById('minimap-tip')!;

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.el.classList.toggle('hidden', !v);
    if (!v) this.hideTip();
  }

  private onPointerDown(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Pin hit-test (generous radius for touch).
    let hit: Pin | null = null;
    let bestSq = 22 * 22;
    for (const pin of this.pins) {
      const dsq = (pin.x - px) ** 2 + (pin.y - py) ** 2;
      if (dsq < bestSq) {
        bestSq = dsq;
        hit = pin;
      }
    }

    if (hit) {
      if (!this.expanded) this.setExpanded(true);
      this.showTip(hit, rect);
    } else {
      this.setExpanded(!this.expanded);
      this.hideTip();
    }
  }

  private setExpanded(v: boolean): void {
    this.expanded = v;
    this.el.classList.toggle('expanded', v);
    this.accum = REDRAW_INTERVAL; // redraw at the new size immediately
  }

  private showTip(pin: Pin, rect: DOMRect): void {
    const hex = `#${pin.def.look.jersey.toString(16).padStart(6, '0')}`;
    const status = pin.beaten
      ? '<span class="minimap-tip-beaten">✓ beaten</span>'
      : `<span class="minimap-tip-type">${pin.def.raceType.toLowerCase()}</span>`;
    this.tip.innerHTML =
      `<h4 style="color:${hex}">${pin.def.name}</h4>` +
      `<p>${pin.def.bio}</p>${status}`;
    this.tip.classList.remove('hidden');
    // Anchor to the left of the map so it never spills off-screen.
    this.tip.style.top = `${rect.top}px`;
    this.tip.style.right = `${window.innerWidth - rect.left + 10}px`;
  }

  private hideTip(): void {
    this.tip.classList.add('hidden');
  }

  update(dt: number, player: Player): void {
    if (!this.visible) return;
    this.time += dt;
    this.accum += dt;
    if (this.accum < REDRAW_INTERVAL) return;
    this.accum = 0;
    this.draw(player);
  }

  private draw(player: Player): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = this.canvas.clientWidth || 104;
    if (this.canvas.width !== Math.round(size * dpr)) {
      this.canvas.width = this.canvas.height = Math.round(size * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    // Inner disc radius; the outer margin holds the compass ring arrow.
    const R = size / 2 - size * 0.14;

    // --- Disc backdrop ---
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 24, 48, 0.55)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();

    // --- Player-centered azimuthal basis (North up, East right) ---
    _pUp.copy(player.position).normalize();
    _north.copy(Y_AXIS).addScaledVector(_pUp, -Y_AXIS.dot(_pUp));
    if (_north.lengthSq() < 1e-6) {
      // At a pole, "north" is undefined — fall back to the heading.
      _north.copy(player.heading);
    }
    _north.normalize();
    _east.crossVectors(_pUp, _north).normalize();

    // Projects a unit direction onto the disc. Returns false if it maps to
    // the exact center (degenerate). Writes CSS-px coords into out.
    const project = (d: THREE.Vector3, out: { x: number; y: number; ang: number }): boolean => {
      const ang = Math.acos(THREE.MathUtils.clamp(d.dot(_pUp), -1, 1));
      _t.copy(d).addScaledVector(_pUp, -d.dot(_pUp));
      if (_t.lengthSq() < 1e-9) {
        out.x = cx;
        out.y = cy;
        out.ang = ang;
        return false;
      }
      _t.normalize();
      const rr = Math.min(ang / Math.PI, 1) * R;
      out.x = cx + _t.dot(_east) * rr;
      out.y = cy - _t.dot(_north) * rr;
      out.ang = ang;
      return true;
    };

    // --- North tick (a tiny "N" at the top) ---
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `${Math.round(size * 0.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, cy - R + size * 0.085);

    // --- Faint road outline ---
    ctx.beginPath();
    let started = false;
    const p = { x: 0, y: 0, ang: 0 };
    for (const rd of this.roadDirs) {
      _dir.copy(rd);
      project(_dir, p);
      // Skip segments that wrap across the far rim to avoid ugly chords.
      if (!started || p.ang > Math.PI * 0.96) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.lineWidth = Math.max(1.5, size * 0.018);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.stroke();

    // --- Rival pins + nearest-unbeaten compass target ---
    const wins = gameStore.getState().wins;
    this.pins.length = 0;
    let nearest: { ex: number; ny: number; ang: number } | null = null;
    const pinR = Math.max(4, size * 0.05);

    for (const npc of this.rivals.npcs) {
      _dir.copy(npc.position).normalize();
      project(_dir, p);
      const beaten = (wins[npc.def.id] ?? 0) > 0;
      this.pins.push({ def: npc.def, x: p.x, y: p.y, beaten });

      // Compass tracks the closest rival still to beat.
      if (!beaten) {
        if (!nearest || p.ang < nearest.ang) {
          _t.copy(_dir).addScaledVector(_pUp, -_dir.dot(_pUp));
          if (_t.lengthSq() > 1e-9) {
            _t.normalize();
            nearest = { ex: _t.dot(_east), ny: _t.dot(_north), ang: p.ang };
          }
        }
      }

      // Pin: jersey-colored disc; beaten rivals are greyed with a check.
      ctx.beginPath();
      ctx.arc(p.x, p.y, pinR, 0, Math.PI * 2);
      ctx.fillStyle = beaten
        ? 'rgba(150,150,160,0.85)'
        : `#${npc.def.look.jersey.toString(16).padStart(6, '0')}`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(28,31,46,0.9)';
      ctx.stroke();
      if (beaten) {
        ctx.strokeStyle = '#1c1f2e';
        ctx.lineWidth = Math.max(1.5, pinR * 0.35);
        ctx.beginPath();
        ctx.moveTo(p.x - pinR * 0.45, p.y);
        ctx.lineTo(p.x - pinR * 0.1, p.y + pinR * 0.4);
        ctx.lineTo(p.x + pinR * 0.5, p.y - pinR * 0.45);
        ctx.stroke();
      }
    }

    // --- Player heading arrow at the center ---
    const hx = player.heading.dot(_east);
    const hy = player.heading.dot(_north);
    const hlen = Math.hypot(hx, hy) || 1;
    this.drawArrow(ctx, cx, cy, hx / hlen, -hy / hlen, size * 0.11, '#ffd23f', '#1c1f2e');

    // --- Compass: ring arrow toward the nearest unbeaten rival ---
    if (nearest) {
      const len = Math.hypot(nearest.ex, nearest.ny) || 1;
      const dx = nearest.ex / len;
      const dy = -nearest.ny / len;
      const meters = nearest.ang * this.planet.radius;
      const close = meters < NOTICE_RADIUS;
      // Pulse when the rival is within challenge range.
      const pulse = close ? 0.6 + 0.4 * Math.sin(this.time * 7) : 1;
      const ringR = R + size * 0.075;
      const ax = cx + dx * ringR;
      const ay = cy + dy * ringR;
      ctx.globalAlpha = pulse;
      this.drawArrow(ctx, ax, ay, dx, dy, size * 0.06, close ? '#7CFC00' : '#ff5252', '#1c1f2e');
      ctx.globalAlpha = 1;

      const label = meters < NOTICE_RADIUS ? 'NEAR' : meters < 80 ? 'MID' : 'FAR';
      ctx.fillStyle = close ? '#7CFC00' : 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${Math.round(size * 0.085)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(label, cx, cy + R - size * 0.04);
    }
  }

  /** Filled triangle centered at (x,y) pointing along (dx,dy). */
  private drawArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dx: number,
    dy: number,
    len: number,
    fill: string,
    stroke: string,
  ): void {
    const px = -dy;
    const py = dx;
    const w = len * 0.55;
    ctx.beginPath();
    ctx.moveTo(x + dx * len, y + dy * len);
    ctx.lineTo(x - dx * len * 0.5 + px * w, y - dy * len * 0.5 + py * w);
    ctx.lineTo(x - dx * len * 0.5 - px * w, y - dy * len * 0.5 - py * w);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
