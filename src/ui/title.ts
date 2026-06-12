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
        <div id="title-content">
          <h1 id="title-logo">TINY<br>PELOTON</h1>
          <p id="title-sub">Three tiny planets. Ten legendary rivals. One bike.</p>
          <button id="title-begin">BEGIN</button>
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
