// NEW — pointer lock with raw input where supported (SPEC §11): `unadjustedMovement` bypasses
// OS mouse acceleration; browsers without it reject the request, and we fall back.

export async function lockPointer(target: HTMLElement, raw: boolean): Promise<void> {
  if (raw) {
    try {
      await target.requestPointerLock({ unadjustedMovement: true });
      return;
    } catch (err) {
      console.warn('Raw mouse input is not supported here; using standard pointer lock.', err);
    }
  }
  await target.requestPointerLock();
}

export const isPointerLocked = (target: HTMLElement): boolean => document.pointerLockElement === target;

// NEW — ADR-0013 §8: Relay's operator select frees the mouse when a select phase starts (the host
// has no canvas to ask isPointerLocked about).
/** Whether this page holds the pointer lock. */
export const pointerHeld = (): boolean => document.pointerLockElement !== null;

/** Releases the pointer lock if this page holds it (re-locking needs a click: lockPointer). */
export function releasePointer(): void {
  if (pointerHeld()) document.exitPointerLock();
}
