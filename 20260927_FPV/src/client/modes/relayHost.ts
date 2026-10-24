import { bindingLabel, HUD } from '../../config/client.ts';
import { operatorPickLimit, PLAYABLE_OPERATORS, RELAY, type AiTier } from '../../config/sim.ts';
import { getAbility, siteAt } from '../../data/content.ts';
import type { SiteDef } from '../../data/schema.ts';
import { distance, fromTuple, type Vec3 } from '../../sim/math.ts';
import { matchAbilityAllowed } from '../../sim/modes/index.ts';
import { canDisrupt, plantSiteFor, relayOf, uplinkProgress } from '../../sim/modes/relay.ts';
import type { Sim } from '../../sim/sim.ts';
import { operatorOf } from '../../sim/stats.ts';
import type { CharacterEntity, RelayMatch, SimEvent } from '../../sim/types.ts';
import { pointerHeld, releasePointer } from '../input/pointerLock.ts';
import { ObjectiveHud, type ObjectiveHudState, type ObjectiveMarker } from '../ui/objectiveHud.ts';
import { OperatorSelect, type OperatorSelectState } from '../ui/operatorSelect.ts';
import { countdownText, formatClock, SIDE_LABEL, type RoundBanner, type RoundHudState } from '../ui/roundHud.ts';
import type { HostSpawn, HostUi, ModeHost } from './host.ts';
import { createSideHost, roundTitle, SIDE_NOUN, type PhaseView, type SidePhaseContext } from './sideHost.ts';

// NEW — hosting Relay (SPEC §4.1, ADR-0013 §8): the shared side host (sideHost.ts: roster,
// score, sides, result banners) plus Relay's own screens. The round HUD gets the phase captions
// and clocks (operator select, setup, engagement, uplink) and the setup / uplink banners. Relay's
// screens (HostUi): the operator select screen (ui/operatorSelect.ts) in the select phase — the
// pointer is freed when a select phase starts, a pick or "ready" captures it again, and with a
// locked pointer a compact strip names the keys — and the objective HUD (ui/objectiveHud.ts) in
// setup, engagement and uplink: side and task (the setup gate's recon hint), the planted uplink
// with its bar, the plant/disrupt prompt and the player's own channel, site and uplink markers.

type Context = SidePhaseContext<RelayMatch>;

const TEXT = HUD.relay.text;
/** Setup and uplink banners show this long into their phase. */
const BANNER_SECONDS = HUD.relay.bannerSeconds;

/** A site's display name ("A · Tank Hall"). */
const siteLabel = (site: SiteDef): string => `${site.id} · ${site.name}`;

function siteName(sim: Sim, siteId: string): string {
  const site = (sim.level.sites ?? []).find((s) => s.id === siteId);
  return site ? siteLabel(site) : siteId;
}

/** The round-start text: the round-start banner and the select screen's header. */
function roundStart(c: Context): { title: string; detail: string; note: string } {
  const { m, sim } = c;
  const zone = (sim.level.spawnZones ?? []).find((z) => z.id === m.attackZoneId)?.name ?? m.attackZoneId;
  const task = TEXT.task[c.ownSide];
  return { title: roundTitle(m), detail: c.sidesSwapped ? `${TEXT.sidesSwapped} ${task}` : task, note: TEXT.attackersEnter(zone) };
}

/** A banner shown only during the first BANNER_SECONDS of a phase of `phaseSeconds`. */
const early = (left: number, phaseSeconds: number, banner: RoundBanner): RoundBanner | null => (phaseSeconds - left <= BANNER_SECONDS ? banner : null);

/** The round HUD's clock and banner of a running phase. */
function running(c: Context): PhaseView {
  const { m, ownSide, left } = c;
  const attacking = ownSide === 'attack';
  switch (m.phase) {
    case 'preRound':
      return {
        clock: { caption: TEXT.caption.preRound, text: countdownText(left), urgent: false },
        banner: { tone: 'neutral', ...roundStart(c), final: false },
      };
    case 'setup':
      return {
        clock: { caption: TEXT.caption.setup, text: countdownText(left), urgent: false },
        banner: early(left, RELAY.setupSeconds, { tone: 'neutral', title: 'SETUP', detail: TEXT.setup[ownSide], note: '', final: false }),
      };
    case 'uplink': {
      const site = m.uplink ? siteName(c.sim, m.uplink.siteId) : '';
      return {
        clock: { caption: TEXT.uplink(site), text: formatClock(left), urgent: true },
        banner: early(left, RELAY.uplinkSeconds, {
          tone: attacking ? 'win' : 'loss',
          title: 'UPLINK PLANTED',
          detail: attacking ? `Hold ${site} until the uplink completes` : `Disrupt the uplink at ${site} (${SIDE_NOUN.defend.many} win)`,
          note: '',
          final: false,
        }),
      };
    }
    default:
      return { clock: { caption: TEXT.caption.live, text: formatClock(left), urgent: left <= HUD.roundHud.urgentSeconds }, banner: null };
  }
}

// ── Objective HUD ───────────────────────────────────────────────────────────

/** Names of the player's abilities the mode's gate lets through now (setup: recon only). */
function usableAbilities(c: Context): string[] {
  return c.player.abilities
    .map((slot) => getAbility(slot.abilityId))
    .filter((a) => a.activation.kind !== 'passive' && matchAbilityAllowed(c.m, c.player, a))
    .map((a) => a.name);
}

/** The objective line: the side's task, or a teammate's running channel. */
function taskLine(c: Context): string {
  const { m, sim, player, ownSide } = c;
  const channeller = m.channel ? sim.getCharacter(m.channel.entityId) : undefined;
  if (m.channel && channeller && channeller.team === player.team && channeller.id !== player.id) {
    return TEXT.teamChannel[m.channel.action](operatorOf(channeller).name, siteName(sim, m.channel.siteId));
  }
  if (m.phase === 'setup') return ownSide === 'attack' ? `${TEXT.setup.attack} · ${TEXT.reconUsable(usableAbilities(c))}` : TEXT.setup.defend;
  if (m.phase === 'uplink') return TEXT.objective.uplink[ownSide];
  return TEXT.objective.live[ownSide]((sim.level.sites ?? []).map((s) => s.id));
}

/** The prompt under the crosshair: the player's own channel and its progress, else what holding
 *  interact would do (the sim's own rules: plantSiteFor, canDisrupt), else nothing. */
function prompt(c: Context): ObjectiveHudState['prompt'] {
  const { m, sim, player } = c;
  if (!player.alive) return null;
  const progress = uplinkProgress(m, sim.state.tick);
  if (m.channel?.entityId === player.id && progress !== null) {
    return { key: null, text: `${TEXT.channel[m.channel.action]} · ${siteName(sim, m.channel.siteId)}`, progress };
  }
  const key = bindingLabel('interact');
  const site = plantSiteFor(sim.level, m, player);
  if (site) return { key, text: `${TEXT.prompt.plant} · ${siteLabel(site)}`, progress: null };
  if (canDisrupt(m, player)) return { key, text: TEXT.prompt.disrupt, progress: null };
  return null;
}

/** Site markers (hidden while the player stands in the site; the planted one gives way to the
 *  uplink marker, the others fade) and the uplink marker. */
function markers(c: Context, ui: HostUi): ObjectiveMarker[] {
  const { m, sim, player, ownSide } = c;
  const here = siteAt(sim.level, [player.pos.x, player.pos.y, player.pos.z]);
  const out = (sim.level.sites ?? []).map((site): ObjectiveMarker => {
    const at: Vec3 = fromTuple(site.center);
    const planted = m.uplink?.siteId === site.id;
    return {
      key: site.id,
      kind: 'site',
      label: site.id,
      detail: TEXT.marker(site.name, distance(player.pos, at)),
      relation: 'neutral',
      dim: m.uplink !== null && !planted,
      at: planted || here?.id === site.id ? null : ui.project(at),
    };
  });
  if (m.uplink) {
    const p = m.uplink.pos;
    out.push({
      key: 'uplink',
      kind: 'uplink',
      label: m.uplink.siteId,
      detail: TEXT.marker(TEXT.uplinkMarker, distance(player.pos, p)),
      relation: ownSide === 'attack' ? 'own' : 'enemy',
      dim: false,
      at: ui.project({ x: p.x, y: p.y + HUD.relay.markers.uplinkLiftM, z: p.z }),
    });
  }
  return out;
}

/** The objective HUD in setup, engagement and uplink; null in the other phases. */
function objectiveState(c: Context, ui: HostUi): ObjectiveHudState | null {
  const { m, ownSide, left } = c;
  if (m.phase !== 'setup' && m.phase !== 'live' && m.phase !== 'uplink') return null;
  const uplink =
    m.phase === 'uplink' && m.uplink
      ? {
          title: siteName(c.sim, m.uplink.siteId),
          relation: ownSide === 'attack' ? ('own' as const) : ('enemy' as const),
          progress: 1 - left / RELAY.uplinkSeconds,
          left: formatClock(left),
        }
      : null;
  return { side: SIDE_LABEL[ownSide], task: taskLine(c), uplink, prompt: prompt(c), markers: markers(c, ui) };
}

// ── Operator select ─────────────────────────────────────────────────────────

/** The select screen (or strip) state: every playable operator with the team's picks and whether
 *  the simulation would accept the player's pick now (Sim.accepts — the one pick rule). */
function selectState(c: Context, view: OperatorSelectState['view']): OperatorSelectState {
  const { sim, player } = c;
  const team = sim.state.entities.filter((e) => e.team === player.team);
  return {
    view,
    ...roundStart(c),
    countdown: countdownText(c.left),
    current: player.operatorId,
    limit: operatorPickLimit(),
    choices: PLAYABLE_OPERATORS.map((operatorId) => ({
      operatorId,
      taken: team.filter((e) => e.operatorId === operatorId).length,
      allowed: sim.accepts({ type: 'selectOperator', entityId: player.id, operatorId }),
    })),
    team: team.map((e) => ({ operatorId: e.operatorId, you: e.id === player.id })),
  };
}

class RelayHost implements ModeHost {
  readonly usesTier: boolean;
  readonly waitsForPlayer: boolean;
  private readonly side: ModeHost;
  private ui: HostUi | null = null;
  private select: OperatorSelect | null = null;
  private objective: ObjectiveHud | null = null;
  private sim: Sim | null = null;
  private player: CharacterEntity | null = null;
  /** This frame's context of a running phase: roundHud() → the side host → running(), which the
   *  App calls right before frame() (ModeHost contract); consumed by frame(). */
  private context: Context | null = null;
  /** A select phase began: free the pointer once, so the select screen takes the mouse. */
  private releasePending = false;
  /** The player opened the menu from the select screen (until the pointer is locked again). */
  private menuOpen = false;
  private menuSuppressed = false;
  /** The select screen was shown last frame: its header carries the round-start banner's text,
   *  so the banner (which would show through the panel) is left out meanwhile. */
  private screenShown = false;

  constructor() {
    this.side = createSideHost<RelayMatch>({
      matchOf: (m) => (m.mode === 'relay' ? m : null),
      running: (c) => {
        this.context = c;
        const view = running(c);
        if (c.m.phase === 'preRound' && this.screenShown) view.banner = null;
        return view;
      },
    });
    this.usesTier = this.side.usesTier;
    this.waitsForPlayer = this.side.waitsForPlayer;
  }

  spawn(sim: Sim, tier: AiTier): HostSpawn {
    const spawned = this.side.spawn(sim, tier);
    this.sim = sim;
    this.player = spawned.player;
    return spawned;
  }

  attach(ui: HostUi): void {
    this.side.attach(ui);
    this.ui = ui;
    this.objective = new ObjectiveHud(ui.root);
    this.select = new OperatorSelect(ui.root, PLAYABLE_OPERATORS, {
      onPick: (operatorId) => this.pick(operatorId),
      onReady: () => ui.capturePointer(),
      onMenu: () => {
        this.menuOpen = true;
        ui.openMenu();
      },
    });
  }

  hint(): string | null {
    return this.side.hint();
  }

  labelled(e: CharacterEntity): boolean {
    return this.side.labelled(e);
  }

  onEvents(events: readonly SimEvent[], sim: Sim, player: CharacterEntity): void {
    this.side.onEvents(events, sim, player);
    if (events.some((ev) => ev.type === 'phase' && ev.phase === 'preRound')) this.releasePending = true;
  }

  roundHud(sim: Sim, player: CharacterEntity): RoundHudState | null {
    this.context = null;
    return this.side.roundHud(sim, player);
  }

  frame(sim: Sim, player: CharacterEntity, visible: boolean): void {
    this.side.frame(sim, player, visible);
    const c = this.context;
    this.context = null;
    const selecting = relayOf(sim.state.match)?.phase === 'preRound';
    // The menu gives way to the select screen while the phase lasts; suppress it before the
    // pointer is freed, so the unlock shows the select screen.
    if (selecting !== this.menuSuppressed) {
      this.menuSuppressed = selecting;
      this.ui?.setMenuSuppressed(selecting);
    }
    if (selecting && this.releasePending) releasePointer();
    this.releasePending = false;
    const locked = pointerHeld();
    if (locked) this.menuOpen = false;

    const view = !visible || !selecting || this.menuOpen ? null : locked ? 'strip' : 'screen';
    this.screenShown = view === 'screen';
    this.select?.update(view && c ? selectState(c, view) : null);
    this.objective?.update(visible && c && this.ui ? objectiveState(c, this.ui) : null);
  }

  /** A card was chosen: the pick (a ControlMessage; the current operator needs none), then back
   *  to the game (a click may capture the pointer). */
  private pick(operatorId: string): void {
    if (this.sim && this.player && operatorId !== this.player.operatorId) {
      this.sim.control({ type: 'selectOperator', entityId: this.player.id, operatorId });
    }
    this.ui?.capturePointer();
  }
}

export const createRelayHost = (): ModeHost => new RelayHost();
