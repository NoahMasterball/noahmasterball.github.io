import { HOTBAR, STATS } from '../config/constants.js';

// HUD liest nur — schreibt nie in Player/Clock/Inventory.
// Aufbau: Stat-Bars (DOM), Clock-Panel (DOM), Hotbar (DOM, slots werden hier erzeugt),
// Pickup-Progress-Ring ums Crosshair, Pickup-Label, Hotbar-Warn-Flash bei Heavy-Reject.

export class HUD {
  constructor() {
    this.bars = {
      health: document.querySelector('[data-bar="health"]'),
      hunger: document.querySelector('[data-bar="hunger"]'),
      thirst: document.querySelector('[data-bar="thirst"]'),
    };
    this.clockTime = document.getElementById('clock-time');
    this.clockPhase = document.getElementById('clock-phase');
    this.nightCounter = document.getElementById('night-counter');
    this.startScreen = document.getElementById('start-screen');
    this.startGameBtn = document.getElementById('btn-start-game');
    this.optionsBtn = document.getElementById('btn-options');
    this.loadingScreen = document.getElementById('loading-screen');
    this.loadingBarFill = this.loadingScreen?.querySelector('.loading-bar-fill') ?? null;

    this.hotbarRoot = document.getElementById('hotbar');
    this.slotEls = [];
    this._buildHotbar();

    this.pickupRing = document.getElementById('pickup-ring');
    this.pickupLabel = document.getElementById('pickup-label');
    // [Batch 4] Zweiter Progress-Ring (Consume) — separater DOM-Knoten mit eigener
    // Farbvariable (--consume-ring), nutzt dieselbe .progress-ring Basis-Klasse.
    this.consumeRing = document.getElementById('consume-ring');
    this.consumeLabel = document.getElementById('consume-label');
    // [Batch 5] Dritter Progress-Ring (Reload) + Ammo-Counter. Reload-Ring nutzt
    // die selbe Basis-Klasse .progress-ring mit eigener Farbvariable (--reload-ring).
    this.reloadRing = document.getElementById('reload-ring');
    this.reloadLabel = document.getElementById('reload-label');
    this.ammoCounter = document.getElementById('ammo-counter');
    this.ammoMagEl = document.getElementById('ammo-mag');
    this.ammoReserveEl = document.getElementById('ammo-reserve');
    this._wasHeavyWarn = false;
  }

  _buildHotbar() {
    this.hotbarRoot.replaceChildren();
    for (let i = 0; i < HOTBAR.SLOT_COUNT; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.dataset.index = String(i);
      slot.innerHTML = `
        <div class="slot-index">${i + 1}</div>
        <div class="slot-icon"></div>
        <div class="slot-name"></div>
        <div class="slot-count"></div>
      `;
      this.hotbarRoot.appendChild(slot);
      this.slotEls.push(slot);
    }
  }

  update(player, clock, inventory = null, pickupState = null, consumeState = null, weaponState = null) {
    this._updateStats(player);
    this._updateClock(clock);
    this._updateHotbar(inventory);
    this._updatePickup(pickupState);
    this._updateConsume(consumeState);
    this._updateWeapon(weaponState);
  }

  _updateStats(player) {
    const s = player.stats;
    this._setBar(this.bars.health, s.health / s.maxHealth);
    this._setBar(this.bars.hunger, s.hunger / s.maxHunger);
    this._setBar(this.bars.thirst, s.thirst / s.maxThirst);
  }

  _setBar(el, pct) {
    if (!el) return;
    const clamped = Math.max(0, Math.min(1, pct));
    el.style.width = `${clamped * 100}%`;
    el.classList.toggle('warn', clamped < STATS.LOW_STAT_WARN_PCT);
  }

  _updateClock(clock) {
    if (this.clockTime) this.clockTime.textContent = clock.getTimeString();
    if (this.clockPhase) this.clockPhase.textContent = clock.getPhaseLabel();
    if (this.nightCounter) this.nightCounter.textContent = `Nacht ${clock.nightCount}`;
  }

  _updateHotbar(inventory) {
    const activeIndex = inventory?.activeIndex ?? -1;
    const heavyWarn = !!inventory?.heavyWarnActive;

    // Rising-Edge: Klasse einmal entfernen + neu setzen, damit die Animation neu startet.
    if (heavyWarn && !this._wasHeavyWarn) {
      this.hotbarRoot.classList.remove('warn');
      // Force reflow, damit die Keyframe-Animation wirklich neu startet.
      void this.hotbarRoot.offsetWidth;
      this.hotbarRoot.classList.add('warn');
    } else if (!heavyWarn && this._wasHeavyWarn) {
      this.hotbarRoot.classList.remove('warn');
    }
    this._wasHeavyWarn = heavyWarn;

    for (let i = 0; i < this.slotEls.length; i++) {
      const slotEl = this.slotEls[i];
      slotEl.classList.toggle('active', i === activeIndex);
      const item = inventory?.slots?.[i];
      const iconEl  = slotEl.querySelector('.slot-icon');
      const countEl = slotEl.querySelector('.slot-count');
      const nameEl  = slotEl.querySelector('.slot-name');
      if (item) {
        iconEl.style.background = `#${item.color.toString(16).padStart(6, '0')}`;
        iconEl.style.opacity = '1';
        countEl.textContent = item.count > 1 ? `×${item.count}` : '';
        nameEl.textContent = item.name;
        slotEl.classList.toggle('heavy', !!item.heavy);
      } else {
        iconEl.style.background = 'transparent';
        iconEl.style.opacity = '0';
        countEl.textContent = '';
        nameEl.textContent = '';
        slotEl.classList.remove('heavy');
      }
    }
  }

  _updatePickup(state) {
    if (!this.pickupRing) return;
    const p = state?.progress01 ?? 0;
    const target = state?.target ?? null;
    this.pickupRing.style.setProperty('--progress-angle', `${p * 360}deg`);
    this.pickupRing.classList.toggle('active', p > 0);
    this.pickupRing.classList.toggle('visible', !!target);
    if (this.pickupLabel) {
      if (target) {
        const name = target.prototype.name;
        const count = target.count > 1 ? ` ×${target.count}` : '';
        this.pickupLabel.textContent = `E halten · ${name}${count}`;
        this.pickupLabel.classList.add('visible');
      } else {
        this.pickupLabel.classList.remove('visible');
      }
    }
  }

  // [Batch 5] Rendert Ammo-Counter (unten rechts) + Reload-Ring. Nur sichtbar,
  // wenn aktives Item eine Schusswaffe ist. Melee-Waffen haben keine Magazine
  // und werden daher ebenfalls ausgeblendet (ammoType === null → versteckt).
  _updateWeapon(state) {
    const active = state?.active ?? null;
    const hasMag = !!active && !!state.ammoType;
    if (this.ammoCounter) {
      this.ammoCounter.classList.toggle('visible', hasMag);
      this.ammoCounter.classList.toggle('reloading', !!state?.reloading);
      const magEmpty = hasMag && state.magAmmo === 0 && !state.reloading;
      this.ammoCounter.classList.toggle('low', magEmpty);
      if (hasMag) {
        if (this.ammoMagEl)     this.ammoMagEl.textContent = String(state.magAmmo);
        if (this.ammoReserveEl) this.ammoReserveEl.textContent = String(state.reserve);
      }
    }
    if (this.reloadRing) {
      const p = state?.reloadProgress01 ?? 0;
      const reloading = !!state?.reloading;
      this.reloadRing.style.setProperty('--progress-angle', `${p * 360}deg`);
      this.reloadRing.classList.toggle('active', reloading && p > 0);
      this.reloadRing.classList.toggle('visible', reloading);
    }
    if (this.reloadLabel) {
      if (state?.reloading) {
        this.reloadLabel.textContent = 'Nachladen…';
        this.reloadLabel.classList.add('visible');
      } else {
        this.reloadLabel.classList.remove('visible');
      }
    }
  }

  _updateConsume(state) {
    if (!this.consumeRing) return;
    const p = state?.progress01 ?? 0;
    const target = state?.target ?? null;
    this.consumeRing.style.setProperty('--progress-angle', `${p * 360}deg`);
    this.consumeRing.classList.toggle('active', p > 0);
    // Nur sichtbar wenn tatsächlich gehalten wird — sonst wäre der Ring dauernd
    // auf jedem Food-Slot offen, was visuell mit dem Pickup-Ring konkurriert.
    this.consumeRing.classList.toggle('visible', p > 0);
    if (this.consumeLabel) {
      if (target && p > 0) {
        this.consumeLabel.textContent = `Verbrauchen · ${target.name}`;
        this.consumeLabel.classList.add('visible');
      } else {
        this.consumeLabel.classList.remove('visible');
      }
    }
  }

  setStartScreenVisible(visible) {
    if (!this.startScreen) return;
    this.startScreen.classList.toggle('hidden', !visible);
  }

  setLoadingVisible(visible) {
    if (!this.loadingScreen) return;
    this.loadingScreen.classList.toggle('hidden', !visible);
    // Balken-Fill-Animation beim Einblenden neu starten, sonst bleibt der
    // Balken nach dem ersten Durchlauf auf 100% stehen.
    if (visible && this.loadingBarFill) {
      this.loadingBarFill.style.animation = 'none';
      void this.loadingBarFill.offsetWidth;
      this.loadingBarFill.style.animation = '';
    }
  }

  setLoadingDurationSec(sec) {
    if (!this.loadingScreen) return;
    this.loadingScreen.style.setProperty('--loading-duration', `${sec}s`);
  }

  onStartGame(cb) {
    this._bindMenuButton(this.startGameBtn, cb);
  }

  onOptions(cb) {
    this._bindMenuButton(this.optionsBtn, cb);
  }

  // Menü-Button-Klick. Entfernt direkt den Fokus vom Button — sonst triggert
  // der Browser beim nächsten Space-Druck (Jump-Key) einen erneuten Klick,
  // weil ein fokussiertes <button> auf Space/Enter aktiviert wird.
  _bindMenuButton(btn, cb) {
    if (!btn) return;
    btn.addEventListener('click', (ev) => {
      ev.currentTarget.blur();
      cb(ev);
    });
  }
}
