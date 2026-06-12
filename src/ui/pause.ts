/**
 * Pause menu (P17): ESC / tap gear icon.
 * Resume, Settings (quality, volumes, reduce shake), Reset progress,
 * and Garage access. All settings auto-save through the Zustand store.
 */
import { gameStore } from '../state/store';
import { resetProgress } from '../state/save';
import type { QualityTier } from '../core/quality';

export class PauseMenu {
  private readonly el: HTMLElement;
  private confirmReset = false;

  /** Fired when the player clicks Resume. */
  onResume: (() => void) | null = null;
  /** Fired when the player opens the garage. */
  onGarage: (() => void) | null = null;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="pause-menu" class="hidden">
        <div id="pause-card">
          <h2>PAUSED</h2>

          <div class="pause-section">
            <label>Music <input type="range" id="vol-music" min="0" max="100" step="1"></label>
            <label>SFX <input type="range" id="vol-sfx" min="0" max="100" step="1"></label>
            <label><input type="checkbox" id="opt-muted"> Mute all</label>
          </div>

          <div class="pause-section">
            <label>Quality
              <select id="opt-quality">
                <option value="auto">Auto</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label><input type="checkbox" id="opt-shake"> Reduce screen shake</label>
          </div>

          <div id="pause-buttons">
            <button id="btn-resume">RESUME</button>
            <button id="btn-garage">GARAGE</button>
            <button id="btn-reset">RESET PROGRESS</button>
          </div>
        </div>
      </div>`,
    );
    this.el = document.getElementById('pause-menu')!;

    // --- Wire controls ---
    const volMusic = document.getElementById('vol-music') as HTMLInputElement;
    const volSfx = document.getElementById('vol-sfx') as HTMLInputElement;
    const muted = document.getElementById('opt-muted') as HTMLInputElement;
    const quality = document.getElementById('opt-quality') as HTMLSelectElement;
    const shake = document.getElementById('opt-shake') as HTMLInputElement;
    const resetBtn = document.getElementById('btn-reset') as HTMLButtonElement;

    volMusic.addEventListener('input', () => {
      gameStore.getState().setMusicVolume(Number(volMusic.value) / 100);
    });
    volSfx.addEventListener('input', () => {
      gameStore.getState().setSfxVolume(Number(volSfx.value) / 100);
    });
    muted.addEventListener('change', () => {
      gameStore.getState().setMuted(muted.checked);
    });
    quality.addEventListener('change', () => {
      gameStore.getState().setQuality(quality.value as QualityTier | 'auto');
    });
    shake.addEventListener('change', () => {
      gameStore.getState().setReduceShake(shake.checked);
    });

    document.getElementById('btn-resume')!.addEventListener('click', () => {
      this.close();
      if (this.onResume) this.onResume();
    });
    document.getElementById('btn-garage')!.addEventListener('click', () => {
      this.close();
      if (this.onGarage) this.onGarage();
    });

    // Double-confirm reset.
    resetBtn.addEventListener('click', () => {
      if (!this.confirmReset) {
        this.confirmReset = true;
        resetBtn.textContent = 'ARE YOU SURE?';
        resetBtn.classList.add('danger');
      } else {
        resetProgress();
        resetBtn.textContent = 'DONE ✓';
        resetBtn.disabled = true;
        setTimeout(() => {
          resetBtn.textContent = 'RESET PROGRESS';
          resetBtn.disabled = false;
          resetBtn.classList.remove('danger');
          this.confirmReset = false;
        }, 1500);
      }
    });
  }

  isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    // Sync UI to current store state.
    const s = gameStore.getState();
    (document.getElementById('vol-music') as HTMLInputElement).value =
      String(Math.round(s.musicVolume * 100));
    (document.getElementById('vol-sfx') as HTMLInputElement).value =
      String(Math.round(s.sfxVolume * 100));
    (document.getElementById('opt-muted') as HTMLInputElement).checked = s.muted;
    (document.getElementById('opt-quality') as HTMLSelectElement).value = s.quality;
    (document.getElementById('opt-shake') as HTMLInputElement).checked = s.reduceShake;

    this.confirmReset = false;
    const resetBtn = document.getElementById('btn-reset') as HTMLButtonElement;
    resetBtn.textContent = 'RESET PROGRESS';
    resetBtn.disabled = false;
    resetBtn.classList.remove('danger');

    this.el.classList.remove('hidden');
  }

  close(): void {
    this.el.classList.add('hidden');
  }
}
