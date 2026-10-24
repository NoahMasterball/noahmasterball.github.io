import type { NavGraphDef, NavLinkDef, NavNodeDef, NavTag, Vec3Tuple } from '../schema.ts';
import { alongDirection, directionYawDeg, stairsRun, type RampDef, type StairsDef } from './geometry.ts';
import type { SALTWORKS_LAYOUT } from './saltworks.ts';

// NEW — the Saltworks bot waypoint graph (SPEC §12, ADR-0011 §5), hand-authored: nodes stand on
// walkable surfaces (feet position), links are straight walkable segments. The ends of the three
// staircases, the east ramp, the landing and the catwalk drop derive from SALTWORKS_LAYOUT;
// everything else is placed by hand against the geometry in saltworks.ts (see its plan sketch).
// src/data/content.ts validates the graph, tests/unit/nav.test.ts checks it against the real
// colliders (ground under every node, every link clear) and walks it with the bot steering.
// Built by a function of the layout so saltworks.ts can import it without an import cycle.
//
// Naming: y_* = courtyard grid (w/wc/cw/ce/ec/e = lane from west to east, m/n = row from the
// spawn shields towards the building), wg_/el_ = attacker spawns, svc_ = service corridor
// (defender spawn), siteA_/siteB_ = inside the site areas (membership itself is derived from
// LevelDef.sites, never from names or tags).

/** Stair and ramp nodes sit this far before the first step / the foot and past the top edge:
 *  close enough that the straight link clears every step at knee height (AI.nav.kneeHeightM). */
const FLIGHT_NODE = { before: 0.5, past: 0.4 } as const;
/** The catwalk drop: its upper node stands this far inside the catwalk edge (clear of the
 *  railing ends), its landing node this far out from the edge on the hall floor. */
const DROP_NODE = { inset: 1.2, reach: 2.5 } as const;

/** Watch directions (degrees, yaw 0 looks down −Z = north, like SpawnPointDef.yawDeg). */
const WATCH_NORTH = directionYawDeg('-z');
const WATCH_SOUTH = directionYawDeg('+z');
const WATCH_WEST = directionYawDeg('-x');

type Layout = typeof SALTWORKS_LAYOUT;

export function saltworksNav(layout: Layout): NavGraphDef {
  const { floors, vertical, catwalkEdgeX, galleryDoorZ, landingDoorZ } = layout;
  const nodes: NavNodeDef[] = [];
  const links: NavLinkDef[] = [];

  const ground = (x: number, z: number): Vec3Tuple => [x, floors.ground, z];
  const upper = (x: number, z: number): Vec3Tuple => [x, floors.upper, z];
  const node = (id: string, pos: Vec3Tuple, tags?: readonly NavTag[], watchYawDeg?: number): void => {
    nodes.push({ id, pos, ...(tags ? { tags } : {}), ...(watchYawDeg === undefined ? {} : { watchYawDeg }) });
  };
  /** Two-way walk links between consecutive nodes. */
  const chain = (...ids: string[]): void => {
    for (let i = 1; i < ids.length; i++) links.push({ from: ids[i - 1] ?? '', to: ids[i] ?? '' });
  };
  /** Nodes at both ends of a flight of stairs, linked straight up the steps. */
  const flight = (bottom: string, top: string, s: StairsDef): void => {
    node(bottom, alongDirection(s.start, s.direction, -FLIGHT_NODE.before));
    const [x, , z] = alongDirection(s.start, s.direction, stairsRun(s) + FLIGHT_NODE.past);
    node(top, [x, s.start[1] + s.steps * s.rise, z]);
    chain(bottom, top);
  };
  const ramp = (bottom: string, top: string, r: RampDef): void => {
    node(bottom, alongDirection(r.bottom, r.direction, -FLIGHT_NODE.before));
    const [x, , z] = alongDirection(r.bottom, r.direction, r.run + FLIGHT_NODE.past);
    node(top, [x, r.bottom[1] + r.rise, z]);
    chain(bottom, top);
  };

  // ── Attacker spawns and the gaps around the spawn shields ─────────────────
  node('wg_1', ground(-20.5, 36.2));
  node('wg_2', ground(-17.5, 36.2));
  node('el_1', ground(17.5, 36.2));
  node('el_2', ground(20.5, 36.2));
  node('wg_w', ground(-28, 30));
  node('wg_e', ground(-7, 31));
  node('el_w', ground(7, 31));
  node('el_e', ground(28, 30));
  chain('wg_w', 'wg_1', 'wg_2', 'wg_e');
  chain('el_w', 'el_1', 'el_2', 'el_e');

  // ── Courtyard: containers, pump house, low walls, crates in front of the facade ──
  node('y_w_m', ground(-27.5, 18.5));
  node('cont_w', ground(-19, 18.3), ['cover']);
  node('y_wc_m', ground(-16.5, 17.5));
  node('y_cw_m', ground(-6, 21));
  node('pump_s', ground(0, 16.2), ['cover']);
  node('y_ce_m', ground(10, 21));
  node('y_ec_m', ground(16.5, 17));
  node('cont_e', ground(19, 20.2), ['cover']);
  node('y_e_m', ground(28, 18.5));
  node('y_w_n', ground(-26.2, 6.8), ['cover']);
  node('y_wc_n', ground(-16, 7), ['patrol']);
  node('lowwall_c', ground(-8, 4.2), ['cover', 'hold'], WATCH_NORTH);
  node('pump_w', ground(-6, 12));
  node('y_cw_n', ground(-4.8, 6));
  node('pump_e', ground(6, 12));
  node('y_ce_n', ground(6, 7));
  node('cont_e_s', ground(12, 6.3), ['cover']);
  node('y_ec_n', ground(16.5, 7), ['patrol', 'hold'], 13); // the control-room window
  node('y_e_n', ground(28, 7));
  node('alley_w_s', ground(-26.5, -1));
  node('crate_sw', ground(-19, 0), ['cover']);
  node('office_out', ground(-14, 0.5));
  node('crate_cw', ground(-5, -0.7), ['cover']);
  node('main_out', ground(0, 1), ['patrol']);
  node('crate_ce', ground(5, -0.5), ['cover']);
  node('crate_se', ground(16, -0.1), ['cover']);
  node('alley_e_s', ground(28, 2));
  chain('wg_w', 'y_w_m', 'cont_w', 'y_wc_m', 'pump_w', 'y_cw_m', 'wg_e');
  chain('y_cw_m', 'pump_s', 'y_ce_m', 'el_w');
  chain('y_ce_m', 'cont_e', 'y_e_m', 'el_e');
  chain('y_ce_m', 'pump_e', 'y_ce_n');
  chain('y_ce_m', 'y_ec_m', 'y_ec_n');
  chain('y_w_m', 'y_w_n', 'alley_w_s', 'crate_sw', 'office_out', 'crate_cw', 'main_out', 'crate_ce', 'crate_se');
  chain('y_wc_m', 'y_wc_n', 'lowwall_c', 'y_cw_n', 'y_ce_n', 'cont_e_s', 'y_ec_n', 'y_e_n', 'y_e_m');
  chain('y_wc_n', 'office_out');
  chain('lowwall_c', 'pump_w', 'y_cw_n', 'crate_cw');
  chain('y_cw_n', 'main_out', 'y_ce_n', 'crate_ce');
  chain('y_ec_n', 'crate_se');

  // ── East ramp → landing (attackers' vertical entry to site B) and the east alley ──
  ramp('ramp_bottom', 'ramp_top', vertical.eastRamp);
  node('landing', upper(vertical.eastRamp.bottom[0], landingDoorZ), ['patrol']);
  chain('ramp_top', 'landing');
  chain('y_ec_n', 'ramp_bottom', 'crate_se');
  chain('ramp_bottom', 'alley_e_s', 'y_e_n');
  node('alley_e_mid', ground(28, -9), ['patrol']);
  node('alley_e_n', ground(26, -16));
  node('alley_e_door', ground(25, -23));
  chain('alley_e_s', 'alley_e_mid', 'alley_e_n', 'alley_e_door');

  // ── West alley ────────────────────────────────────────────────────────────
  node('alley_w_crate', ground(-26.5, -10.2), ['cover', 'hold'], -23); // up the alley to the hall door
  node('alley_w_mid', ground(-24.5, -12), ['patrol']);
  node('alley_w_door', ground(-24.5, -21));
  chain('alley_w_s', 'alley_w_crate', 'alley_w_mid', 'alley_w_door');
  chain('alley_w_s', 'alley_w_mid');

  // ── Office (ground) ───────────────────────────────────────────────────────
  node('office_door_s', ground(-14, -4));
  node('office_hold', ground(-19.5, -9.5), ['hold'], -135); // the south door
  node('office_door_n', ground(-16, -12));
  chain('office_out', 'office_door_s', 'office_door_n', 'office_hold', 'office_door_s');

  // ── Tank hall: site A, the hall stairs, the catwalk and its drop ──────────
  const dropEdge = alongDirection([catwalkEdgeX, floors.upper, galleryDoorZ], '+x', DROP_NODE.inset);
  const dropLanding = alongDirection([catwalkEdgeX, floors.ground, galleryDoorZ], '-x', DROP_NODE.reach);
  node('hall_door_w', ground(-22, -21));
  node('hall_s', ground(-16.5, -17), ['patrol']);
  node('hall_e', ground(-8.5, -18));
  node('hall_door_lobby', ground(-6, -17));
  node('siteA_w', ground(-17.5, -21.5));
  node('siteA_pillar', ground(-13.5, -21.6), ['cover']);
  node('siteA_c', dropLanding, ['patrol']);
  node('siteA_tank', ground(-15.9, -26.5), ['cover', 'hold'], 132); // the west door
  node('hall_crate', ground(-8, -22.5), ['cover', 'hold'], -160); // the lobby door
  node('hall_low', ground(-13, -29.4), ['cover', 'hold'], WATCH_SOUTH);
  node('hall_nw', ground(-18.5, -29.6), ['cover']);
  node('hall_door_back', ground(-6, -32));
  flight('hall_stairs_bottom', 'catwalk_top', vertical.hallStairs);
  node('catwalk_n', upper(-7.8, -30));
  node('catwalk_drop', dropEdge);
  node('catwalk_door', upper(-6, galleryDoorZ));
  node('catwalk_s', upper(-8, -16.5), ['hold'], 39); // over site A
  chain('alley_w_door', 'hall_door_w', 'siteA_w', 'siteA_pillar', 'siteA_c', 'siteA_tank');
  chain('office_door_n', 'hall_s', 'siteA_w');
  chain('hall_s', 'hall_e', 'hall_door_lobby');
  chain('hall_e', 'siteA_c', 'hall_crate');
  chain('siteA_c', 'hall_door_back', 'hall_low', 'hall_nw', 'hall_stairs_bottom');
  chain('catwalk_top', 'catwalk_n', 'catwalk_drop', 'catwalk_door');
  chain('catwalk_drop', 'catwalk_s');
  links.push({ from: 'catwalk_drop', to: 'siteA_c', oneWay: true });

  // ── Lobby, atrium and the lobby stairs up to the gallery ──────────────────
  node('main_door', ground(0, -4));
  node('lobby_s', ground(3, -6.5));
  node('lobby_desk', ground(-1.5, -11.3), ['cover', 'hold'], -168); // the main door
  node('lobby_c', ground(1.5, -17.5), ['patrol']);
  node('lobby_n', ground(-2, -21.5));
  node('lobby_crate', ground(-1, -25.3), ['cover', 'hold'], WATCH_SOUTH);
  node('lobby_door_n', ground(-3.6, -28));
  node('lobby_door_e', ground(6, -7));
  flight('lobby_stairs_bottom', 'gallery_stairs_top', vertical.lobbyStairs);
  chain('main_out', 'main_door', 'lobby_s', 'lobby_c', 'lobby_desk', 'lobby_stairs_bottom', 'lobby_s', 'lobby_door_e');
  chain('lobby_c', 'lobby_n', 'lobby_door_n', 'lobby_crate');
  chain('lobby_c', 'hall_door_lobby', 'lobby_n');

  // ── Storage (ground, under site B) ────────────────────────────────────────
  node('storage_s', ground(9, -10), ['patrol']);
  node('storage_c', ground(12.5, -15), ['hold'], 141); // the lobby door
  node('storage_n', ground(12, -24), ['hold'], -96); // the east door
  node('storage_door_n', ground(10.2, -28));
  node('storage_door_e', ground(22, -23));
  chain('lobby_door_e', 'storage_s', 'storage_c', 'storage_n', 'storage_door_n');
  chain('storage_n', 'storage_door_e', 'alley_e_door');

  // ── Service corridor (defender spawn) and the service stairs ──────────────
  node('svc_1', ground(1.5, -32.5));
  node('svc_2', ground(4.5, -32.5));
  node('svc_w', ground(-3.6, -31.5), ['patrol']);
  node('svc_e', ground(10.2, -31), ['patrol']);
  flight('svc_stairs_bottom', 'svc_stairs_top', vertical.serviceStairs);
  chain('hall_door_back', 'svc_w', 'svc_1', 'svc_2', 'svc_e', 'svc_stairs_bottom');
  chain('lobby_door_n', 'svc_w');
  chain('storage_door_n', 'svc_e');

  // ── Upper floor: corridor, gallery ────────────────────────────────────────
  node('up_corr_e', upper(20.4, -30.8));
  node('up_corr_c', upper(13, -31), ['patrol', 'hold'], WATCH_WEST);
  node('up_corr_w', upper(3, -31));
  node('gallery_c', upper(3, galleryDoorZ), ['patrol']);
  node('gallery_hold', upper(-2.5, -21), ['hold'], WATCH_SOUTH);
  chain('svc_stairs_top', 'up_corr_e', 'up_corr_c', 'up_corr_w', 'gallery_c', 'gallery_stairs_top');
  chain('catwalk_door', 'gallery_c', 'gallery_hold');

  // ── Site B (control room, upper floor) ────────────────────────────────────
  node('siteB_door_w', upper(6, galleryDoorZ));
  node('siteB_door_n', upper(17, -28));
  node('siteB_c', upper(11.5, -16), ['cover', 'hold'], 35); // the west door
  node('siteB_n', upper(14, -23.5), ['patrol']);
  node('siteB_e', upper(16.5, -15.5), ['cover', 'hold'], -129); // the east door
  node('siteB_desk', upper(18, -19.6), ['cover', 'hold'], 7); // the north door
  node('siteB_desk_s', upper(10, -12.4), ['cover']);
  node('siteB_window', upper(14, -5.5), ['hold'], WATCH_SOUTH);
  node('siteB_se', upper(20, landingDoorZ));
  chain('gallery_c', 'siteB_door_w');
  chain('siteB_door_w', 'siteB_c', 'siteB_n', 'siteB_door_n', 'up_corr_e');
  chain('up_corr_c', 'siteB_door_n');
  chain('siteB_c', 'siteB_desk_s');
  chain('siteB_c', 'siteB_window', 'siteB_se', 'siteB_e', 'siteB_n');
  chain('siteB_e', 'siteB_desk');
  chain('siteB_se', 'landing');

  return { nodes, links };
}
