// NEW — HUD & Buy-Menü des MCF-Shooters. Baut das DOM-Overlay einmal auf und
// aktualisiert es pro Frame. Enthält keine Spielregeln — liest den Zustand und
// meldet Klicks (Kaufen, Zurück, Rematch) über Callbacks zurück.

import {
  WEAPONS, WEAPON_CLASS_ORDER, GRENADE_PRICE, GRENADE_MAX_CARRY, MATCH_WINS,
} from '../config/shooter.js';
import { activeWeapon, activeAmmo, isPlayerReloading } from './engine.js';

let root;
let els = {};       // gecachte DOM-Verweise fürs Pro-Frame-Update
let buyButtons = []; // { weaponId, btn, priceEl }
let callbacks = {};

/**
 * Baut das HUD einmalig in den gegebenen Container.
 * @param {HTMLElement} container  #shooter-ui
 * @param {{onBack:Function,onBuy:Function,onBuyGrenade:Function,onRematch:Function}} cb
 */
export function initShooterHud(container, cb) {
  callbacks = cb;
  container.innerHTML = '';
  root = container;

  // --- Top-HUD ---
  const hud = document.createElement('div');
  hud.className = 'sh-hud';
  hud.innerHTML = `
    <button class="btn-back" data-role="back">← Menü</button>
    <div class="sh-hp"><span class="sh-hp-bar"><i data-role="hpfill"></i></span><b data-role="hp">100</b></div>
    <div class="sh-money" data-role="money">$800</div>
    <div class="sh-round"><span data-role="round">Runde 1</span><span class="sh-score" data-role="score">0 : 0</span></div>
    <div class="sh-weapon"><span data-role="weapon">—</span><span class="sh-ammo" data-role="ammo">0 / 0</span></div>
    <div class="sh-nade" data-role="nade">🧨 0</div>
  `;
  root.appendChild(hud);

  // --- Killfeed (oben rechts) ---
  const feed = document.createElement('div');
  feed.className = 'sh-killfeed';
  feed.dataset.role = 'killfeed';
  root.appendChild(feed);

  // --- Zentrale Banner (Kaufphase-Timer, Rundenende) ---
  const banner = document.createElement('div');
  banner.className = 'sh-banner';
  banner.dataset.role = 'banner';
  root.appendChild(banner);

  // --- Buy-Menü ---
  buildBuyMenu();

  // --- Match-Ende-Overlay ---
  const over = document.createElement('div');
  over.className = 'sh-over';
  over.dataset.role = 'over';
  over.innerHTML = `
    <div class="sh-over-panel">
      <h2 data-role="over-title">—</h2>
      <p data-role="over-score" class="dim"></p>
      <div class="sh-over-actions">
        <button class="war-act" data-role="rematch">Nochmal</button>
        <button class="btn-back" data-role="over-back">Menü</button>
      </div>
    </div>
  `;
  root.appendChild(over);

  // Referenzen cachen.
  els = {
    hp: q('hp'), hpfill: q('hpfill'), money: q('money'), round: q('round'),
    score: q('score'), weapon: q('weapon'), ammo: q('ammo'), nade: q('nade'),
    killfeed: q('killfeed'), banner: q('banner'), buy: q('buy'),
    buyMoney: q('buy-money'), over: q('over'),
    overTitle: q('over-title'), overScore: q('over-score'),
  };

  // Events.
  hud.querySelector('[data-role=back]').addEventListener('click', () => cb.onBack());
  q('rematch').addEventListener('click', () => cb.onRematch());
  q('over-back').addEventListener('click', () => cb.onBack());
}

function q(role) { return root.querySelector(`[data-role="${role}"]`); }

function buildBuyMenu() {
  const buy = document.createElement('div');
  buy.className = 'sh-buy';
  buy.dataset.role = 'buy';

  const head = document.createElement('div');
  head.className = 'sh-buy-head';
  head.innerHTML = `<h3>Einkauf</h3><span class="sh-buy-money" data-role="buy-money">$0</span>`;
  buy.appendChild(head);

  const cols = document.createElement('div');
  cols.className = 'sh-buy-cols';
  buyButtons = [];
  for (const cls of WEAPON_CLASS_ORDER) {
    const col = document.createElement('div');
    col.className = 'sh-buy-col';
    col.innerHTML = `<h4>${cls.label}</h4>`;
    for (const w of WEAPONS.filter((x) => x.class === cls.id)) {
      const btn = document.createElement('button');
      btn.className = 'sh-buy-item';
      btn.innerHTML = `<span class="sh-buy-name">${w.name}</span>
        <span class="sh-buy-stat">DMG ${w.damage} · ${w.fire}</span>
        <span class="sh-buy-price">$${w.price}</span>`;
      btn.addEventListener('click', () => callbacks.onBuy(w.id));
      col.appendChild(btn);
      buyButtons.push({ weaponId: w.id, weapon: w, btn });
    }
    cols.appendChild(col);
  }
  // Granaten-Spalte.
  const gcol = document.createElement('div');
  gcol.className = 'sh-buy-col';
  gcol.innerHTML = `<h4>Ausrüstung</h4>`;
  const gbtn = document.createElement('button');
  gbtn.className = 'sh-buy-item';
  gbtn.innerHTML = `<span class="sh-buy-name">Granate</span>
    <span class="sh-buy-stat">Flächenschaden</span>
    <span class="sh-buy-price">$${GRENADE_PRICE}</span>`;
  gbtn.addEventListener('click', () => callbacks.onBuyGrenade());
  gcol.appendChild(gbtn);
  buyButtons.push({ weaponId: '__grenade', btn: gbtn, isGrenade: true });
  cols.appendChild(gcol);

  buy.appendChild(cols);
  const hint = document.createElement('p');
  hint.className = 'sh-buy-hint';
  hint.textContent = 'B = Kaufmenü · WASD laufen · Maus zielen · Klick schießen · R nachladen · G Granate · 1/2 Waffe wechseln';
  buy.appendChild(hint);
  root.appendChild(buy);
}

/** Aktualisiert das HUD anhand des Zustands (pro Frame aufgerufen). */
export function renderShooterHud(state) {
  const p = state.player;
  const w = activeWeapon(p);
  const am = activeAmmo(p);

  els.hp.textContent = Math.ceil(p.hp);
  els.hpfill.style.width = `${Math.max(0, p.hp)}%`;
  els.hpfill.style.background = p.hp > 40 ? 'var(--sh-hp-good)' : 'var(--sh-hp-low)';
  els.money.textContent = `$${p.money}`;
  els.round.textContent = `Runde ${state.round}`;
  els.score.textContent = state.config.isTeam
    ? `${state.scoreA} : ${state.scoreB}`
    : `Siege: ${p.roundWins}/${MATCH_WINS}`;
  els.weapon.textContent = w ? w.name : '—';
  els.ammo.textContent = isPlayerReloading(state) ? 'lädt…' : `${am.mag} / ${am.reserve}`;
  els.nade.textContent = `🧨 ${p.grenades}`;

  // Killfeed.
  els.killfeed.innerHTML = state.killfeed.map((k) =>
    `<div class="sh-kill${k.crit ? ' crit' : ''}">${esc(k.killer)} <i>→</i> ${esc(k.victim)}${k.crit ? ' ⚡' : ''}</div>`
  ).join('');

  // Banner (Kaufphase-Countdown / Rundenende / tot).
  let banner = '';
  if (state.phase === 'buy') {
    banner = `Kaufphase — ${Math.ceil(state.phaseTimer / 1000)}s${state.round === 1 ? ' · Pistolenrunde' : ''}`;
  } else if (state.phase === 'roundover') {
    banner = state.lastRoundText;
  } else if (!p.alive && state.phase === 'live') {
    banner = 'Ausgeschaltet — warte auf die nächste Runde';
  }
  els.banner.textContent = banner;
  els.banner.style.display = banner ? 'block' : 'none';

  // Buy-Menü nur in der Kaufphase.
  const showBuy = state.phase === 'buy';
  els.buy.style.display = showBuy ? 'flex' : 'none';
  if (showBuy) {
    els.buyMoney.textContent = `$${p.money}`;
    for (const b of buyButtons) {
      let ok;
      if (b.isGrenade) {
        ok = p.money >= GRENADE_PRICE && p.grenades < GRENADE_MAX_CARRY;
      } else {
        const pistolRound = state.round === 1 && b.weapon.class !== 'pistol';
        ok = p.money >= b.weapon.price && !pistolRound;
      }
      b.btn.disabled = !ok;
    }
  }

  // Match-Ende.
  const over = state.phase === 'matchover';
  els.over.style.display = over ? 'flex' : 'none';
  if (over) {
    els.overTitle.textContent = state.winnerText;
    els.overScore.textContent = state.config.isTeam
      ? `Endstand ${state.scoreA} : ${state.scoreB}`
      : `Deine Siege: ${p.roundWins} · Kills: ${p.kills}`;
  }
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
