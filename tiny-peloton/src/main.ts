import './style.css';
import { initSaveSystem } from './state/save';
import { Game } from './core/game';

initSaveSystem();

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app root element');

const game = new Game(root);
game.start();

