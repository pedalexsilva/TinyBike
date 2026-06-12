/**
 * Challenge panel (P08): stylized HTML overlay shown when the player rolls
 * up to a rival. Portrait (canvas-drawn caricature chip), name, bio,
 * record, RACE / LATER. Touch-friendly; Enter = race, Esc = later.
 */
import type { RivalDef } from '../entities/rivals';

export class ChallengePanel {
  private readonly el: HTMLElement;
  private readonly portrait: HTMLCanvasElement;
  private current: RivalDef | null = null;

  /** Set by the game. RACE pressed → start a race (P09). */
  onRace: ((def: RivalDef) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="challenge" class="hidden">
        <div id="challenge-card">
          <canvas id="challenge-portrait" width="96" height="96"></canvas>
          <div id="challenge-info">
            <h2 id="challenge-name"></h2>
            <p id="challenge-bio"></p>
            <p id="challenge-taunt"></p>
            <p id="challenge-record">Your best: <span>—</span></p>
          </div>
          <div id="challenge-buttons">
            <button id="btn-race">RACE</button>
            <button id="btn-later">LATER</button>
          </div>
        </div>
      </div>`,
    );
    this.el = document.getElementById('challenge')!;
    this.portrait = document.getElementById('challenge-portrait') as HTMLCanvasElement;

    document.getElementById('btn-race')!.addEventListener('click', () => {
      if (this.current && this.onRace) this.onRace(this.current);
    });
    document.getElementById('btn-later')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (this.isOpen()) {
        if (e.code === 'Enter' && this.current && this.onRace) this.onRace(this.current);
        if (e.code === 'Escape') this.close();
      }
    });
  }

  isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(def: RivalDef, bestTime: number | null, wins = 0, locked = false): void {
    this.current = def;
    this.drawPortrait(def);
    document.getElementById('challenge-name')!.textContent = def.name;
    document.getElementById('challenge-bio')!.textContent = def.bio;
    document.getElementById('challenge-taunt')!.textContent = `“${def.taunt}”`;
    this.el.querySelector('#challenge-record span')!.textContent =
      bestTime !== null ? `${bestTime.toFixed(1)}s` : '—';
    const raceLabel = locked
      ? 'LOCKED'
      : wins > 0
        ? `REMATCH (harder ×${wins})`
        : def.raceType === 'BOSS'
          ? 'RACE THE BOSS'
          : `RACE (${def.raceType.toLowerCase()})`;
    const btn = document.getElementById('btn-race') as HTMLButtonElement;
    btn.textContent = raceLabel;
    btn.disabled = locked;
    btn.classList.toggle('locked', locked);
    if (locked) {
      document.getElementById('challenge-taunt')!.textContent =
        'Beat the other three riders of this planet first!';
    }
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.el.classList.add('hidden');
    this.current = null;
    if (this.onClose) this.onClose();
  }

  /** Cartoon portrait chip drawn from the rival's palette. */
  private drawPortrait(def: RivalDef): void {
    const ctx = this.portrait.getContext('2d')!;
    const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
    ctx.clearRect(0, 0, 96, 96);
    // Jersey backdrop
    ctx.fillStyle = hex(def.look.jersey);
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 64, 96, 32);
    // Head
    const headR = 26 * def.look.headScale;
    ctx.fillStyle = hex(def.look.skin);
    ctx.beginPath();
    ctx.arc(48, 52, headR, 0, Math.PI * 2);
    ctx.fill();
    // Helmet
    ctx.fillStyle = hex(def.look.helmet);
    ctx.beginPath();
    ctx.arc(48, 48, headR + 3, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    // Glasses
    ctx.fillStyle = '#1c1f2e';
    ctx.fillRect(48 - headR * 0.8, 48, headR * 1.6, 9);
    // Mouth
    ctx.strokeStyle = '#1c1f2e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (def.look.smile) {
      ctx.arc(48, 60, headR * 0.55, 0.15 * Math.PI, 0.85 * Math.PI);
    } else {
      ctx.moveTo(40, 52 + headR * 0.5);
      ctx.lineTo(56, 52 + headR * 0.5);
    }
    ctx.stroke();
  }
}
