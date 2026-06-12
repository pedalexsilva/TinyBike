/**
 * HTML overlay: boost bar, speed readout, FPS meter, and touch controls
 * (floating joystick on the left half + big boost button on the right).
 * Touch elements are hidden on desktop via CSS (body.touch).
 */
import type { Input } from '../core/input';

export class Hud {
  private boostFill: HTMLElement;
  private boostBar: HTMLElement;
  private speedEl: HTMLElement;
  private fpsEl: HTMLElement;
  private stick: HTMLElement;
  private fpsAccum = 0;
  private fpsFrames = 0;

  constructor(root: HTMLElement, input: Input) {
    if (input.isTouch) document.body.classList.add('touch');

    root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="hud">
        <div id="vignette"></div>
        <div id="topbar">
          <div id="speed">0<span> km/h</span></div>
          <div id="fps"></div>
        </div>
        <div id="boost-bar"><div id="boost-fill"></div><span id="boost-label">BOOST</span></div>
        <div id="touch-steer" class="touch-only"><div id="joy-base"><div id="joy-stick"></div></div></div>
        <button id="boost-btn" class="touch-only">BOOST</button>
        <div id="hint" class="desktop-only">WASD / arrows to ride &nbsp;·&nbsp; SPACE to boost</div>
      </div>`,
    );

    this.boostFill = document.getElementById('boost-fill')!;
    this.boostBar = document.getElementById('boost-bar')!;
    this.speedEl = document.getElementById('speed')!;
    this.fpsEl = document.getElementById('fps')!;
    this.stick = document.getElementById('joy-stick')!;

    this.bindTouch(input);
  }

  private bindTouch(input: Input): void {
    const zone = document.getElementById('touch-steer')!;
    const base = document.getElementById('joy-base')!;
    let pointerId = -1;
    let originX = 0;

    zone.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      originX = e.clientX;
      base.style.left = `${e.clientX}px`;
      base.style.top = `${e.clientY}px`;
      base.classList.add('active');
      zone.setPointerCapture(e.pointerId);
      input.setTouchSteer(0, true);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - originX;
      const v = Math.max(-1, Math.min(1, dx / 52));
      this.stick.style.transform = `translate(${v * 34}px, 0)`;
      input.setTouchSteer(v, true);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      pointerId = -1;
      base.classList.remove('active');
      this.stick.style.transform = 'translate(0,0)';
      input.setTouchSteer(0, false);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const boostBtn = document.getElementById('boost-btn')!;
    boostBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input.queueBoost();
    });
  }

  update(dt: number, speed: number, boostCharge: number, boosting: boolean): void {
    // Displayed speed: scaled so the numbers read like pro cycling (~70 km/h sprints).
    this.speedEl.firstChild!.textContent = String(Math.round(speed * 5));

    this.boostFill.style.width = `${Math.round(boostCharge * 100)}%`;
    this.boostBar.classList.toggle('ready', boostCharge >= 1 && !boosting);
    this.boostBar.classList.toggle('boosting', boosting);

    // FPS (updated twice per second).
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.fpsFrames / this.fpsAccum)} fps`;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }
}
