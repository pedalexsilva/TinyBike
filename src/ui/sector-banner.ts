/**
 * Sector banner: a sash that slides in to announce the national sector the
 * rider has just entered (FRANCE / ITALIA / PORTUGAL), tinted with the
 * sector accent and a flag. Auto-hides after a couple of seconds.
 */
export class SectorBanner {
  private readonly el: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly tourEl: HTMLElement;
  private readonly flagEl: HTMLElement;
  private hideTimer = 0;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div id="sector-banner" class="hidden">
         <span id="sector-flag"></span>
         <span id="sector-text">
           <span id="sector-name"></span>
           <span id="sector-tour"></span>
         </span>
       </div>`,
    );
    this.el = document.getElementById('sector-banner')!;
    this.nameEl = document.getElementById('sector-name')!;
    this.tourEl = document.getElementById('sector-tour')!;
    this.flagEl = document.getElementById('sector-flag')!;
  }

  /** Announce a sector. `accent` is a hex int. */
  show(name: string, tour: string, flag: string, accent: number): void {
    this.flagEl.textContent = flag;
    this.nameEl.textContent = name;
    this.tourEl.textContent = tour;
    this.el.style.setProperty('--accent', `#${accent.toString(16).padStart(6, '0')}`);

    // Restart the CSS slide animation.
    this.el.classList.remove('hidden', 'sector-show');
    void this.el.offsetWidth;
    this.el.classList.add('sector-show');

    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.el.classList.add('hidden');
    }, 2600);
  }
}
