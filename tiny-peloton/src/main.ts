import './style.css';
import { Game } from './core/game';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app root element');

const game = new Game(root);
game.start();
