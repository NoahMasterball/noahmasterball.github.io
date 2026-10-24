import { APP } from './config/client.ts';
import { requireElement } from './client/dom.ts';

// Entry point: shows the loading screen immediately, then loads the game (Three.js + Rapier)
// as a separate chunk so the first paint is fast.

const loading = requireElement('loading');
const loadingBar = requireElement('loading-bar');
const bootError = requireElement('boot-error');

function showBootError(message: string): void {
  loadingBar.parentElement?.classList.add('hidden');
  bootError.textContent = message;
}

async function boot(): Promise<void> {
  document.title = APP.title;
  requireElement('loading-title').textContent = APP.title.toUpperCase();
  if (location.protocol === 'file:') {
    showBootError('Opening index.html from disk does not work. Run "npm run dev" and open the URL it prints.');
    return;
  }
  const watchdog = window.setTimeout(() => {
    showBootError('Loading takes unusually long. Reload the page (Ctrl+F5); details are in the browser console (F12).');
  }, APP.bootTimeoutMs);

  try {
    const { startApp } = await import('./client/app.ts');
    await startApp((fraction) => {
      loadingBar.style.width = `${Math.round(fraction * 100)}%`;
    });
    window.clearTimeout(watchdog);
    loading.style.opacity = '0';
    window.setTimeout(() => loading.classList.add('hidden'), 450);
  } catch (err) {
    window.clearTimeout(watchdog);
    showBootError(`The game failed to start: ${err instanceof Error ? err.message : String(err)}`);
    // Surface the full error for developers and for the smoke test (which fails on console errors).
    console.error(err);
  }
}

void boot();
