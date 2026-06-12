/**
 * GARAGE (P13): rotating podium with the rider, category tabs, real-time
 * equip preview. Locked items show as silhouettes with an unlock hint
 * ("Beat Wout van Art"). Equipment persists via the store (P12 auto-save)
 * and reflects in the world and in races.
 */
import * as THREE from 'three';
import { BikeModel, type BikeAppearance } from '../entities/bike';
import { toonMat } from '../render/toon';
import { ITEMS, type ItemCategory, type ItemDef } from '../race/rewards';
import { RIVALS } from '../entities/rivals';
import { gameStore } from '../state/store';

const Y = new THREE.Vector3(0, 1, 0);

/** Always-owned baseline items (one per category). */
export const DEFAULT_ITEMS: ItemDef[] = [
  { id: 'default-jersey', name: 'Rookie Jersey', category: 'jersey', rarity: 'common', color: 0xffd23f, source: '' },
  { id: 'default-helmet', name: 'Classic White', category: 'helmet', rarity: 'common', color: 0xffffff, source: '' },
  { id: 'default-glasses', name: 'Pro Shades', category: 'glasses', rarity: 'common', color: 0x1c1f2e, source: '' },
  { id: 'default-frame', name: 'Rosso Steel', category: 'frame', rarity: 'common', color: 0xe84545, source: '' },
  { id: 'default-wheels', name: 'Alloy Rims', category: 'wheels', rarity: 'common', color: 0xcccccc, source: '' },
];

const CATALOG: ItemDef[] = [...DEFAULT_ITEMS, ...ITEMS];
const CATEGORIES: { id: ItemCategory; label: string }[] = [
  { id: 'jersey', label: 'JERSEY' },
  { id: 'helmet', label: 'HELMET' },
  { id: 'glasses', label: 'GLASSES' },
  { id: 'frame', label: 'FRAME' },
  { id: 'wheels', label: 'WHEELS' },
];

/** Builds the player's BikeAppearance from equipped item ids. */
export function appearanceFromEquipped(): Partial<BikeAppearance> {
  const equipped = gameStore.getState().equipped;
  const colorOf = (cat: ItemCategory): number | undefined =>
    CATALOG.find((i) => i.id === equipped[cat])?.color;
  return {
    jersey: colorOf('jersey') ?? 0xffd23f,
    helmet: colorOf('helmet') ?? 0xffffff,
    glasses: colorOf('glasses') ?? 0x1c1f2e,
    frame: colorOf('frame') ?? 0xe84545,
    wheels: colorOf('wheels') ?? 0xcccccc,
  };
}

export class Garage {
  isOpen = false;
  /** Fired on close — the game rebuilds the player's bike then. */
  onExit: (() => void) | null = null;

  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();
  private preview: BikeModel | null = null;
  private readonly panel: HTMLElement;
  private activeCategory: ItemCategory = 'jersey';
  readonly podiumCenter = new THREE.Vector3();
  readonly podiumUp = new THREE.Vector3(0, 1, 0);

  constructor(root: HTMLElement, scene: THREE.Scene) {
    this.scene = scene;
    root.insertAdjacentHTML(
      'beforeend',
      `
      <div id="garage" class="hidden">
        <div id="garage-header">
          <h2>GARAGE</h2>
          <button id="garage-close">✕</button>
        </div>
        <div id="garage-sheet">
          <div id="garage-tabs"></div>
          <div id="garage-items"></div>
        </div>
      </div>`,
    );
    this.panel = document.getElementById('garage')!;
    document.getElementById('garage-close')!.addEventListener('click', () => this.exit());

    const tabs = document.getElementById('garage-tabs')!;
    for (const cat of CATEGORIES) {
      const btn = document.createElement('button');
      btn.textContent = cat.label;
      btn.dataset.cat = cat.id;
      btn.addEventListener('click', () => {
        this.activeCategory = cat.id;
        this.renderItems();
      });
      tabs.appendChild(btn);
    }
  }

  enter(position: THREE.Vector3, up: THREE.Vector3): void {
    this.isOpen = true;
    this.podiumCenter.copy(position);
    this.podiumUp.copy(up);

    // Podium: gold disc + accent ring, oriented to the local surface.
    this.group.clear();
    const podium = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.9, 0.35, 18),
      toonMat(0xffd23f, { emissive: 0x664400, emissiveIntensity: 0.25 }),
    );
    base.position.y = 0.175;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.06, 8, 24), toonMat(0xffffff));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.36;
    podium.add(base, ring);
    podium.position.copy(position);
    podium.quaternion.setFromUnitVectors(Y, up);
    this.group.add(podium);
    this.scene.add(this.group);

    this.rebuildPreview();
    this.panel.classList.remove('hidden');
    this.renderItems();
    this.setActiveTab();
  }

  exit(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panel.classList.add('hidden');
    this.scene.remove(this.group);
    this.group.clear();
    this.preview = null;
    if (this.onExit) this.onExit();
  }

  /** Slow podium turn — the marketing-shot angle is always coming around. */
  update(dt: number): void {
    if (!this.preview) return;
    this.preview.group.rotateY(dt * 0.7);
    this.preview.update(dt, 0, 0, false);
  }

  private rebuildPreview(): void {
    if (this.preview) this.group.remove(this.preview.group);
    this.preview = new BikeModel(appearanceFromEquipped());
    this.preview.group.position
      .copy(this.podiumCenter)
      .addScaledVector(this.podiumUp, 0.35);
    this.preview.group.quaternion.setFromUnitVectors(Y, this.podiumUp);
    this.group.add(this.preview.group);
  }

  private setActiveTab(): void {
    for (const btn of document.querySelectorAll<HTMLButtonElement>('#garage-tabs button')) {
      btn.classList.toggle('active', btn.dataset.cat === this.activeCategory);
    }
  }

  private renderItems(): void {
    this.setActiveTab();
    const s = gameStore.getState();
    const grid = document.getElementById('garage-items')!;
    grid.innerHTML = '';

    for (const item of CATALOG.filter((i) => i.category === this.activeCategory)) {
      const owned = item.source === '' || s.owned.includes(item.id);
      const equipped = s.equipped[item.category] === item.id ||
        (s.equipped[item.category] === undefined && item.source === '');
      const chip = document.createElement('button');
      chip.className = `garage-item ${item.rarity}${owned ? '' : ' locked'}${equipped ? ' equipped' : ''}`;
      const hex = `#${item.color.toString(16).padStart(6, '0')}`;
      const rival = RIVALS.find((r) => r.id === item.source);
      chip.innerHTML = `
        <span class="swatch" style="background:${owned ? hex : '#555'}"></span>
        <span class="item-name">${owned ? item.name : '???'}</span>
        <span class="item-sub">${owned ? item.rarity : `Beat ${rival?.name ?? '?'}`}</span>`;
      if (owned) {
        chip.addEventListener('click', () => {
          gameStore.getState().equip(item.category, item.id);
          this.rebuildPreview();
          this.renderItems();
        });
      }
      grid.appendChild(chip);
    }
  }
}
