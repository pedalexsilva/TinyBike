/**
 * Race HUD (P09): position (1st/2nd), timer, route progress bar with
 * player/rival markers, countdown overlay and the results screen.
 */
import gsap from 'gsap';
import type { RivalDef } from '../entities/rivals';
import type { RaceResult } from '../race/race';
import type { ItemDef } from '../race/rewards';

export class RaceHud {
  private readonly el: HTMLElement;
  private readonly posEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly mePin: HTMLElement;
  private readonly rivalPin: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly resultsEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private toastTimer: number | undefined;

  onContinue: (() => void) | null = null;
  onRetry: (() => void) | null = null;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="race-hud" class="hidden">
        <div id="race-top">
          <div id="race-pos">1st</div>
          <div id="race-time">0.0</div>
        </div>
        <div id="race-progress"><div id="race-pin-rival">▼</div><div id="race-pin-me">▲</div></div>
      </div>
      <div id="race-countdown" class="hidden"></div>
      <div id="race-toast" class="hidden"></div>
      <div id="race-results" class="hidden">
        <div id="results-card">
          <h2 id="results-title"></h2>
          <p id="results-line"></p>
          <p id="results-time"></p>
          <div id="results-reward" class="hidden">
            <div id="reward-chip"><span id="reward-rarity"></span><span id="reward-name"></span></div>
          </div>
          <div id="results-buttons">
            <button id="btn-retry" class="hidden">RETRY</button>
            <button id="btn-continue">CONTINUE</button>
          </div>
        </div>
      </div>`,
    );
    this.el = document.getElementById('race-hud')!;
    this.posEl = document.getElementById('race-pos')!;
    this.timeEl = document.getElementById('race-time')!;
    this.mePin = document.getElementById('race-pin-me')!;
    this.rivalPin = document.getElementById('race-pin-rival')!;
    this.countEl = document.getElementById('race-countdown')!;
    this.resultsEl = document.getElementById('race-results')!;
    this.toastEl = document.getElementById('race-toast')!;

    document.getElementById('btn-continue')!.addEventListener('click', () => {
      this.hideResults();
      if (this.onContinue) this.onContinue();
    });
    document.getElementById('btn-retry')!.addEventListener('click', () => {
      this.hideResults();
      if (this.onRetry) this.onRetry();
    });
  }

  show(): void {
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.countEl.classList.add('hidden');
  }

  update(progress01: number, rivalProgress01: number, time: number, isFirst: boolean): void {
    this.posEl.textContent = isFirst ? '1st' : '2nd';
    this.posEl.classList.toggle('second', !isFirst);
    this.timeEl.textContent = time.toFixed(1);
    this.mePin.style.left = `${(progress01 * 100).toFixed(1)}%`;
    this.rivalPin.style.left = `${(rivalProgress01 * 100).toFixed(1)}%`;
  }

  /** n = 3,2,1 then 0 → "GO!". */
  countdown(n: number): void {
    this.countEl.classList.remove('hidden');
    this.countEl.textContent = n > 0 ? String(n) : 'GO!';
    this.countEl.classList.remove('pulse');
    void this.countEl.offsetWidth; // restart animation
    this.countEl.classList.add('pulse');
    if (n === 0) {
      window.setTimeout(() => this.countEl.classList.add('hidden'), 700);
    }
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), 1600);
  }

  showResults(
    result: RaceResult,
    time: number,
    def: RivalDef,
    best: number | null,
    reward: ItemDef | null = null,
  ): void {
    const title = document.getElementById('results-title')!;
    const line = document.getElementById('results-line')!;
    const timeEl = document.getElementById('results-time')!;
    title.textContent = result === 'win' ? 'YOU WIN!' : '2nd PLACE';
    title.classList.toggle('lose', result === 'lose');
    line.textContent =
      result === 'win' ? `“${def.defeatLine}”` : `“${def.taunt}” — try again!`;
    const bestNote = best !== null && time < best ? '  ★ personal best!' : '';
    timeEl.textContent = `Time: ${time.toFixed(1)}s${bestNote}`;
    document.getElementById('btn-retry')!.classList.toggle('hidden', result === 'win');

    // Reward unlock chip (GSAP pop, per the plan).
    const rewardBox = document.getElementById('results-reward')!;
    if (reward && result === 'win') {
      document.getElementById('reward-rarity')!.textContent = reward.rarity.toUpperCase();
      document.getElementById('reward-rarity')!.className = reward.rarity;
      document.getElementById('reward-name')!.textContent = `NEW: ${reward.name}`;
      rewardBox.classList.remove('hidden');
      gsap.fromTo(
        '#reward-chip',
        { scale: 0, rotate: -8 },
        { scale: 1, rotate: 0, duration: 0.6, ease: 'back.out(2.5)', delay: 0.25 },
      );
      // TODO(P17): unlock jingle.
    } else {
      rewardBox.classList.add('hidden');
    }
    this.resultsEl.classList.remove('hidden');
  }

  hideResults(): void {
    this.resultsEl.classList.add('hidden');
  }
}
