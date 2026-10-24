// Entry point: finds the page elements and starts the game (src/client/app.ts).
import { APP } from './config/client.ts';
import { startApp } from './client/app.ts';
import { requireElement } from './client/dom.ts';

document.title = APP.title;
try {
  startApp(requireElement<HTMLCanvasElement>('game'), requireElement('ui'));
} catch (err) {
  // Surface the full error for developers and for the smoke test (which fails on console errors).
  console.error(err);
  requireElement('ui').textContent = `${APP.title} konnte nicht starten: ${err instanceof Error ? err.message : String(err)}`;
}
