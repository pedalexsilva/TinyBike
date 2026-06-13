/**
 * Title screen (P17): "TINY PELOTON" with the planet rotating behind,
 * a big BEGIN button. After dismissal, 3 non-modal contextual hints
 * fade in and out to teach the player.
 */

export class TitleScreen {
  private readonly el: HTMLElement;
  private resolved = false;

  /** Resolves when the player taps BEGIN. */
  readonly ready: Promise<void>;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="title-screen">
        <div id="title-poster">
          <div id="title-content">
            <div id="title-eyebrow">★ GRAND TOUR ★</div>
            <h1 id="title-logo">TINY<br>PELOTON</h1>
            <div id="title-flags"><span>🇫🇷</span><span>🇮🇹</span><span>🇵🇹</span></div>
            <p id="title-sub">One planet. Three Grand Tours.<br>France · Italia · Portugal.</p>
            <button id="title-begin">BEGIN</button>
          </div>
        </div>
      </div>`,
    );
    this.el = document.getElementById('title-screen')!;

    this.ready = new Promise<void>((resolve) => {
      document.getElementById('title-begin')!.addEventListener('click', () => {
        if (this.resolved) return;
        this.resolved = true;
        this.el.classList.add('fade-out');
        setTimeout(() => {
          this.el.classList.add('hidden');
          resolve();
        }, 600);
      });
    });
  }
}

export class Hints {
  private readonly el: HTMLElement;
  private queue: string[] = [];

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div id="hints" class="hidden"></div>`,
    );
    this.el = document.getElementById('hints')!;
  }

  /** Show the initial hints with delays. */
  showOnboarding(isTouch: boolean): void {
    if (isTouch) {
      this.queue = [
        'Drag left side to steer',
        'Tap BOOST when the bar is full',
        'Find a rival and race!',
      ];
    } else {
      this.queue = [
        'WASD / Arrows to ride',
        'SPACE or SHIFT to boost',
        'Find a rival and race!',
      ];
    }
    this.showNext(1200);
  }

  private showNext(delay: number): void {
    if (this.queue.length === 0) return;
    setTimeout(() => {
      const text = this.queue.shift()!;
      this.el.textContent = text;
      this.el.classList.remove('hidden');
      this.el.classList.remove('hint-fade');
      void this.el.offsetWidth;
      this.el.classList.add('hint-fade');
      // Auto-hide after 3s, then show next.
      setTimeout(() => {
        this.el.classList.add('hidden');
        this.showNext(800);
      }, 3000);
    }, delay);
  }
}
