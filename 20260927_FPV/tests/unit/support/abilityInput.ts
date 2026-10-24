import { ballisticPitch, projectileGravity } from '../../../src/sim/abilities/projectiles.ts';
import { BUTTON } from '../../../src/sim/command.ts';
import { anglesTo, type Vec3 } from '../../../src/sim/math.ts';
import type { AbilityOf } from '../../../src/sim/systems/abilities.ts';
import { aimOf } from '../../../src/sim/systems/weapons.ts';
import type { CharacterEntity } from '../../../src/sim/types.ts';
import type { Input } from './world.ts';

// NEW — ADR-0012 batch R: the inputs a player gives to aim, throw and place, shared by the roster
// test (one ability at a time) and the replay test (a scripted match); both only differ in how they
// step the Sim.

export type Look = { yaw: number; pitch: number };

/** The command look that puts `e`'s crosshair (look + recoil offset, aimOf) on `point`. */
export function lookAt(e: Readonly<CharacterEntity>, point: Vec3): Look {
  const aim = anglesTo(aimOf(e).origin, point);
  return { yaw: aim.yaw - e.weapon.recoilYaw, pitch: aim.pitch - e.weapon.recoilPitch };
}

/** The command look that throws `ability` from `e`'s eye along the low arc landing on `point`
 *  (ballisticPitch; the throw leaves along the crosshair, so the recoil offset is compensated). */
export function throwLook(e: Readonly<CharacterEntity>, ability: AbilityOf<'thrown'>, point: Vec3): Look {
  const eye = aimOf(e).origin;
  const pitch = ballisticPitch(ability.activation.speed, projectileGravity(ability), Math.hypot(point.x - eye.x, point.z - eye.z), point.y - eye.y);
  if (pitch === null) throw new Error(`${ability.id} cannot reach (${point.x}, ${point.y}, ${point.z}) from ${e.operatorId}'s eye`);
  return { yaw: anglesTo(eye, point).yaw - e.weapon.recoilYaw, pitch: pitch - e.weapon.recoilPitch };
}

/** One input per tick that places the gadget of the ability slot with `key` along `look`: adopt the
 *  look, open the placement, confirm it with fire, release. */
export const placementInputs = (look: Look, key: number): Input[] => [
  look,
  { ...look, buttons: key },
  { ...look, buttons: BUTTON.fire },
  look,
];
