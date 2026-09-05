import { Clock } from 'three';
import { APP_VERSION, ATMOSPHERE, SHOTS, WORLD, type ShotDef } from './config';
import { Assets } from './engine/assets';
import { Stage } from './engine/stage';

declare global {
  interface Window {
    __gameReady?: boolean;
    __shotNames?: string[];
    __setShot?: (name: string) => boolean;
    /** QA hook: live renderer statistics. */
    __stats?: () => { fps: number; calls: number; triangles: number; geometries: number; textures: number };
  }
}

/** Scene registry — bake-off vignettes and the real world share one entry point. */
const SCENE_BUILDERS: Record<string, () => Promise<SceneModule>> = {
  test: () => import('./scenes/test'),
  kittest: () => import('./scenes/kittest'),
  vignette_medieval: () => import('./scenes/vignette_medieval'),
  // vignette_realistic (bake-off loser) retired — its packs were pruned from
  // public/assets after the decision; see docs/VISUAL_SPEC.md + asset_staging.
  world: () => import('./scenes/world'),
};

interface SceneModule {
  build(stage: Stage, assets: Assets): Promise<SceneHandle | void>;
  /** Optional per-scene shot list (e.g. vignettes); defaults to global SHOTS. */
  shots?: Record<string, ShotDef>;
}

export interface SceneHandle {
  update?(dt: number, elapsed: number): void;
  /** Called when the screenshot tool takes over the camera (disables player rig). */
  onShot?(name: string): void;
}

const app = document.getElementById('app') as HTMLDivElement;
const loading = document.getElementById('loading') as HTMLDivElement;
const loadingBar = document.getElementById('loading-bar') as HTMLDivElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const controlsHint = document.getElementById('controls-hint') as HTMLDivElement;
const bootError = document.getElementById('boot-error') as HTMLDivElement;
const versionTag = document.getElementById('version-tag') as HTMLDivElement;

function showBootError(html: string): void {
  loadingBar.parentElement!.style.display = 'none';
  bootError.innerHTML = html;
  bootError.style.display = 'block';
}

async function boot(): Promise<void> {
  versionTag.textContent = `Emberwick Vale ${APP_VERSION}`;
  if (location.protocol === 'file:') {
    showBootError(
      'Das Spiel kann nicht per Doppelklick auf die HTML-Datei gestartet werden.<br />' +
        'Bitte im Projektordner <b>npm run dev</b> ausführen und ' +
        '<b>http://127.0.0.1:5173</b> im Browser öffnen.',
    );
    return;
  }
  // Watchdog: if loading silently stalls, say so instead of showing an
  // endless progress bar.
  window.setTimeout(() => {
    if (!window.__gameReady && bootError.style.display !== 'block') {
      showBootError(
        'Das Laden dauert ungewöhnlich lange. Bitte Seite neu laden (Strg+F5). ' +
          'Details stehen ggf. in der Browser-Konsole (F12).',
      );
    }
  }, 60_000);

  const stage = new Stage(app);
  const assets = new Assets(stage.renderer, (r) => {
    loadingBar.style.width = `${Math.round(r * 100)}%`;
  });

  // HDRI environment lighting (IBL only — the visible sky is the stylized dome).
  try {
    const env = await assets.hdri(ATMOSPHERE.hdri);
    stage.scene.environment = env;
    stage.scene.environmentIntensity = ATMOSPHERE.envIntensity;
  } catch (err) {
    console.error('HDRI failed to load — continuing with dome-only lighting', err);
  }

  const sceneName = new URLSearchParams(location.search).get('scene') ?? 'world';
  const loader = SCENE_BUILDERS[sceneName] ?? SCENE_BUILDERS['world']!;
  const module = await loader();
  const handle = (await module.build(stage, assets)) ?? {};
  const shots = module.shots ?? SHOTS;

  stage.fitShadowsTo(WORLD.playableDiameter / 2 + 10);
  stage.camera.position.copy(shots['opening']!.position);
  stage.camera.lookAt(shots['opening']!.target);

  window.__shotNames = Object.keys(shots);
  window.__setShot = (name: string): boolean => {
    const shot = shots[name];
    if (!shot) return false;
    loading.style.display = 'none'; // skip the title screen (and its fade) in captures
    handle.onShot?.(name);
    stage.camera.position.copy(shot.position);
    stage.camera.lookAt(shot.target);
    stage.render(0);
    return true;
  };

  startBtn.addEventListener('click', () => {
    loading.classList.add('hidden');
    void stage.renderer.domElement.requestPointerLock();
  });

  await stage.renderer.compileAsync(stage.scene, stage.camera);

  const clock = new Clock();
  let frames = 0;
  let fpsEma = 60;
  let lastFrame = { calls: 0, triangles: 0 };
  // The composer issues many internal render() calls per frame; accumulate info
  // across the whole frame instead of letting each pass reset it.
  stage.renderer.info.autoReset = false;
  window.__stats = () => ({
    fps: Math.round(fpsEma * 10) / 10,
    calls: lastFrame.calls,
    triangles: lastFrame.triangles,
    geometries: stage.renderer.info.memory.geometries,
    textures: stage.renderer.info.memory.textures,
  });
  stage.renderer.setAnimationLoop(() => {
    // Clamp: a stalled frame (first paint, tab switch, GC) must not integrate
    // seconds of physics in one step.
    const dt = Math.min(clock.getDelta(), 0.1);
    if (dt > 0) fpsEma += (1 / dt - fpsEma) * 0.05;
    stage.renderer.info.reset();
    handle.update?.(dt, clock.elapsedTime);
    stage.render(dt);
    lastFrame = {
      calls: stage.renderer.info.render.calls,
      triangles: stage.renderer.info.render.triangles,
    };
    frames++;
    if (frames === 5) {
      // Scene is rendering behind the title screen — reveal the start button.
      loadingBar.parentElement!.style.display = 'none';
      startBtn.style.display = 'block';
      controlsHint.style.display = 'block';
      loading.classList.add('ready');
      window.__gameReady = true;
    }
  });
}

boot().catch((err: unknown) => {
  console.error(err);
  showBootError(
    `Das Spiel konnte nicht geladen werden:<br /><b>${String(err)}</b><br />` +
      'Bitte Seite neu laden (Strg+F5); Details in der Browser-Konsole (F12).',
  );
});
