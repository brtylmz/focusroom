import './ui/styles.css';
import { App } from './app/App.js';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
new App(root).start();

// Keeps the browser from restoring a stale scroll position between screens.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
