import { bindingLabel, HUD } from '../../config/client.ts';
import type { HitZone } from '../../data/schema.ts';
import type { PlacementFailure } from '../../sim/abilities/placement.ts';
import { lerp, type Vec3 } from '../../sim/math.ts';
import type { AbilityFailReason, EntityId } from '../../sim/types.ts';
import { el, hexColor, setText } from '../dom.ts';
import { DamageIndicator } from './damageIndicator.ts';

// NEW — heads-up display (SPEC §14): dynamic crosshair, hit markers, damage-direction arcs,
// operator/health panel (with shields), ammo panel with the holstered weapon, ability slots and
// their feedback (ADR-0012 §9: channel bar and placing hint under the crosshair, refusals,
// "REVEALED"). Plain DOM (ADR-0007); writes only on change.

/** A carried weapon that is not in hand. */
export interface HudHolstered {
  key: string;
  name: string;
  ammo: number;
  reserve: number;
}

/** What an ability slot is doing: its resource (ready, recharging, empty = no uses left this
 *  round), a running channel or switched-on toggle (active), a placement, or a passive. */
export type HudAbilityState = 'ready' | 'recharging' | 'empty' | 'active' | 'placing' | 'passive';

export interface HudAbility {
  key: string;
  name: string;
  state: HudAbilityState;
  /** Resource readiness 0…1, 1 = ready (the slot's sweep). */
  readiness: number;
  /** 0…1 through a channel or a timed toggle; null otherwise (an untimed toggle is simply on). */
  progress: number | null;
  detail: string;
  /** The simulation runs it (isAbilitySupported). */
  supported: boolean;
  /** It cannot be used now whatever its resource says: the mode's ability gate is closed or every
   *  gadget it may have is placed. Greyed like an unsupported slot. */
  blocked: boolean;
}

/** The placement in progress: why the ghost's pose is invalid (placementPose), null = valid. */
export interface HudPlacement {
  failure: PlacementFailure | null;
}

export interface HudState {
  operatorName: string;
  color: number;
  health: number;
  maxHealth: number;
  /** Temporary HP from shields (shieldAmount), shown on the health bar. */
  shield: number;
  armour: number;
  modifiers: string;
  weaponName: string;
  fireMode: string;
  ammo: number;
  reserve: number;
  /** Reload progress 0…1, or null when not reloading. */
  reload: number | null;
  /** Weapon swap progress 0…1, or null when not swapping. */
  swap: number | null;
  holstered: HudHolstered[];
  /** Crosshair gap in pixels (from the current spread cone). */
  spreadPx: number;
  ads: number;
  /** Sprint pose blend 0…1 (the crosshair fades with it). */
  sprint: number;
  /** The weapon cannot fire now (canFire in src/sim/stats.ts); the crosshair fades. */
  fireBlocked: boolean;
  /** Eye position and view yaw (radians) the damage-direction arcs are aimed from. */
  eye: Vec3;
  viewYaw: number;
  abilities: HudAbility[];
  /** Channel progress 0…1 of the running hold ability (the bar under the crosshair), or null. */
  channel: number | null;
  placing: HudPlacement | null;
  /** The local player is revealed to the enemy team (isRevealedTo). */
  revealed: boolean;
}

/** A refusal (abilityFailed) shown on its slot while the situation it answered lasts. */
interface SlotFailure {
  text: string;
  /** The slot's situation when the refusal was first shown (set by the next update). */
  situation: string | null;
}

/** What a refusal answers: the ability, its state, whether it is blocked and, while placing, why
 *  the pose is invalid. When any of them changes (it became ready, the aim found a valid spot, the
 *  placement ended, a gadget was destroyed, the gate opened) the refusal no longer applies. */
const situationOf = (a: HudAbility, placing: HudPlacement | null): string =>
  `${a.name}|${a.state}|${a.blocked}|${a.state === 'placing' ? (placing?.failure ?? 'valid') : ''}`;

const TEXT = HUD.abilities.text;

export class Hud {
  private readonly root: HTMLElement;
  private readonly crosshairLines: HTMLElement[];
  private readonly dot: HTMLElement;
  private readonly hitmarker: HTMLElement;
  private readonly damage: DamageIndicator;
  private readonly channel: HTMLElement;
  private readonly channelFill: HTMLElement;
  private readonly placingHint: HTMLElement;
  private readonly placingFailure: HTMLElement;
  private readonly revealed: HTMLElement;
  private readonly opName: HTMLElement;
  private readonly health: HTMLElement;
  private readonly shield: HTMLElement;
  private readonly heal: HTMLElement;
  private readonly healthBar: HTMLElement;
  private readonly shieldBar: HTMLElement;
  private readonly opDetail: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly weaponLine: HTMLElement;
  private readonly reloadBar: HTMLElement;
  private readonly holstered: HTMLElement;
  private readonly abilityRow: HTMLElement;
  private abilityEls: HTMLElement[] = [];
  private readonly failures = new Map<number, SlotFailure>();
  private hitTimer = 0;
  /** Health healed recently and how long "+N" still shows (a floating combat number, so it
   *  lives as long as a damage number). */
  private healAmount = 0;
  private healTimer = 0;

  /** `hint`: key help shown at the top, or null. */
  constructor(parent: HTMLElement, hint: string | null) {
    this.root = el('div', 'layer', parent);
    const crosshair = el('div', 'crosshair', this.root);
    this.crosshairLines = [0, 1, 2, 3].map(() => el('i', '', crosshair));
    this.dot = el('i', 'dot', crosshair);
    this.hitmarker = el('div', 'hitmarker', this.root);
    this.damage = new DamageIndicator(this.root);

    const { widthPx, heightPx } = HUD.abilities.channelBar;
    this.channel = el('div', 'channel-bar', this.root);
    Object.assign(this.channel.style, { width: `${widthPx}px`, height: `${heightPx}px`, marginLeft: `${-widthPx / 2}px` });
    this.channelFill = el('div', '', this.channel);
    this.placingHint = el('div', 'placing-hint', this.root);
    setText(el('div', '', this.placingHint), `${bindingLabel('fire')} ${TEXT.place} · ${bindingLabel('ads')} ${TEXT.cancel}`);
    this.placingFailure = el('div', 'fail', this.placingHint);
    this.revealed = el('div', 'revealed-warning', this.root);
    setText(this.revealed, TEXT.revealed);

    const left = el('div', 'panel', this.root);
    Object.assign(left.style, { left: '24px', bottom: '24px', minWidth: '220px' });
    this.opName = el('div', '', left);
    this.opName.style.fontWeight = '700';
    const healthLine = el('div', 'big', left);
    this.health = el('span', '', healthLine);
    this.shield = el('span', 'shield-amount', healthLine);
    this.heal = el('span', 'heal-amount', healthLine);
    const bar = el('div', 'bar health', left);
    this.healthBar = el('div', '', bar);
    this.shieldBar = el('div', 'shield', bar);
    this.opDetail = el('div', 'dim', left);

    const right = el('div', 'panel', this.root);
    Object.assign(right.style, { right: '24px', bottom: '24px', minWidth: '180px', textAlign: 'right' });
    this.ammo = el('div', 'big', right);
    this.weaponLine = el('div', 'dim', right);
    const reload = el('div', 'bar', right);
    this.reloadBar = el('div', '', reload);
    this.reloadBar.style.background = 'var(--accent)';
    this.holstered = el('div', 'dim', right);
    this.holstered.style.marginTop = '4px';

    this.abilityRow = el('div', 'abilities', this.root);
    if (hint !== null) setText(el('div', 'hint', this.root), hint);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  /** A hit of the local player's: `zone` null = a gadget (plain marker; `killed` = destroyed);
   *  `shielded` = a shield took part of it. */
  onHit(zone: HitZone | null, killed: boolean, shielded = false): void {
    this.hitmarker.className = `hitmarker${zone === 'head' ? ' head' : ''}${shielded ? ' shield' : ''}${killed ? ' kill' : ''}`;
    this.hitTimer = killed ? HUD.killMarkerSeconds : HUD.hitMarkerSeconds;
  }

  /** The local player took damage from `attackerId` standing at `source`. */
  onDamage(attackerId: EntityId, source: Vec3): void {
    this.damage.add(attackerId, source);
  }

  /** The local player was healed by `amount` (the "+N" next to the health). */
  onHealed(amount: number): void {
    this.healAmount = this.healTimer > 0 ? this.healAmount + amount : amount;
    this.healTimer = HUD.damageNumberSeconds;
  }

  /** The simulation refused the local player's ability in slot `slot`. */
  onAbilityFailed(slot: number, reason: AbilityFailReason): void {
    this.failures.set(slot, { text: TEXT.failure[reason], situation: null });
  }

  /** Hides transient feedback at once (respawn; screenshot shots start from a clean HUD). */
  clearTransients(): void {
    this.hitTimer = 0;
    this.healTimer = 0;
    this.damage.clear();
    this.failures.clear();
  }

  update(dt: number, s: HudState): void {
    // Opacity before decay: a fresh marker is visible for at least one frame at any frame rate.
    this.hitmarker.style.opacity = String(Math.min(1, this.hitTimer / HUD.hitMarkerSeconds));
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.damage.update(dt, s.eye, s.viewYaw);

    // Crosshair: four lines at the spread gap; replaced by a dot when aimed; faded while the
    // weapon cannot fire (and with the sprint pose, which blends in smoothly).
    const aimed = s.ads > 0.9;
    const ready = lerp(1, HUD.crosshairBlockedOpacity, Math.max(s.sprint, s.fireBlocked ? 1 : 0));
    const gap = Math.max(HUD.crosshairMinGap, s.spreadPx);
    const len = HUD.crosshairLength;
    const place: [number, number, number, number][] = [
      [-gap - len, -1, len, 2],
      [gap, -1, len, 2],
      [-1, -gap - len, 2, len],
      [-1, gap, 2, len],
    ];
    this.crosshairLines.forEach((line, i) => {
      const [x, y, w, h] = place[i] ?? [0, 0, 0, 0];
      Object.assign(line.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, opacity: aimed ? '0' : ready.toFixed(3) });
    });
    this.dot.style.opacity = aimed ? '1' : (0.5 * ready).toFixed(3);

    this.channel.classList.toggle('hidden', s.channel === null);
    this.channelFill.style.width = `${(s.channel ?? 0) * 100}%`;
    this.placingHint.classList.toggle('hidden', s.placing === null);
    setText(this.placingFailure, s.placing?.failure ? TEXT.placement[s.placing.failure] : '');
    this.revealed.classList.toggle('hidden', !s.revealed);

    setText(this.opName, s.operatorName.toUpperCase());
    this.opName.style.color = hexColor(s.color);
    setText(this.health, `${Math.ceil(s.health)}`);
    setText(this.shield, s.shield > 0 ? ` +${Math.ceil(s.shield)}` : '');
    const healing = this.healTimer > 0;
    setText(this.heal, healing ? ` +${Math.round(this.healAmount)}` : '');
    this.heal.style.opacity = Math.min(1, this.healTimer / HUD.damageNumberSeconds).toFixed(3);
    this.healTimer = Math.max(0, this.healTimer - dt);
    // Shields extend the bar; above full health the bar is rescaled to health + shields.
    const barTotal = Math.max(s.maxHealth, s.health + s.shield);
    this.healthBar.style.width = `${(100 * s.health) / barTotal}%`;
    this.shieldBar.style.width = `${(100 * s.shield) / barTotal}%`;
    setText(this.opDetail, `Armour ${Math.round(s.armour * 100)} %${s.modifiers ? ` · ${s.modifiers}` : ''}`);

    setText(this.ammo, `${s.ammo} / ${s.reserve}`);
    const status = s.swap !== null ? ' · switching' : s.reload !== null ? ' · reloading' : '';
    setText(this.weaponLine, `${s.weaponName} · ${s.fireMode}${status}`);
    this.reloadBar.style.width = `${(s.swap ?? s.reload ?? 0) * 100}%`;
    setText(this.holstered, s.holstered.map((h) => `${h.key} · ${h.name} ${h.ammo} / ${h.reserve}`).join('   '));

    this.updateAbilities(s.abilities, s.placing);
  }

  private updateAbilities(abilities: readonly HudAbility[], placing: HudPlacement | null): void {
    if (this.abilityEls.length !== abilities.length) {
      this.abilityRow.replaceChildren();
      this.abilityEls = abilities.map(() => el('div', 'ability', this.abilityRow));
    }
    abilities.forEach((a, i) => {
      const node = this.abilityEls[i];
      if (!node) return;
      const failure = this.currentFailure(i, situationOf(a, placing), a.supported);
      const classes = ['ability', a.state];
      if (!a.supported || a.blocked) classes.push('unavailable');
      if (failure) classes.push('failed');
      const className = classes.join(' ');
      if (node.className !== className) node.className = className;
      node.style.setProperty('--ready', a.readiness.toFixed(3));
      node.style.setProperty('--progress', (a.progress ?? 1).toFixed(3));
      const html = `<b>${a.key}</b> ${a.name}<br><span class="dim">${a.detail}</span>${failure ? `<br><span class="fail">${failure}</span>` : ''}`;
      if (node.innerHTML !== html) node.innerHTML = html;
    });
  }

  /** The refusal text still shown on slot `i` in `situation` (situationOf), or null; a refusal
   *  expires with its situation. An unsupported slot already says why in its detail. */
  private currentFailure(i: number, situation: string, supported: boolean): string | null {
    const f = this.failures.get(i);
    if (!f) return null;
    f.situation ??= situation;
    if (f.situation !== situation) {
      this.failures.delete(i);
      return null;
    }
    return supported ? f.text : null;
  }
}
