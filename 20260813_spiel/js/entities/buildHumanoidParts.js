/**
 * buildHumanoidParts - SSOT fuer die visuellen Koerperteile
 * aller humanoiden Entities (Spieler, NPCs).
 *
 * Wird von Player und NPC gemeinsam genutzt.
 *
 * @param {object} [palette={}]
 * @param {string} [palette.head]
 * @param {string} [palette.torso]
 * @param {string} [palette.limbs]
 * @param {string} [palette.accent]
 * @param {string} [palette.hair]
 * @param {string} [palette.eyes]
 * @param {string} [palette.pupil]
 * @returns {Array<object>}
 */
export function buildHumanoidParts(palette = {}) {
    const headColor = palette.head ?? '#f2d6c1';
    const torsoColor = palette.torso ?? '#2b6777';
    const limbColor = palette.limbs ?? '#1b3a4b';
    const accentColor = palette.accent ?? '#f2f2f2';
    const hairColor = palette.hair ?? '#2b2118';
    const eyeColor = palette.eyes ?? '#ffffff';
    const pupilColor = palette.pupil ?? '#1b1b1b';

    return [
        { id: 'shadow', type: 'circle', radius: 10, offsetX: 0, offsetY: 12, color: 'rgba(0, 0, 0, 0.15)', damaged: false },
        { id: 'torso', type: 'rect', width: 14, height: 18, offsetX: -7, offsetY: -12, color: torsoColor, damaged: false },
        { id: 'leftArm', type: 'rect', width: 4, height: 16, offsetX: -11, offsetY: -10, color: limbColor, damaged: false },
        { id: 'rightArm', type: 'rect', width: 4, height: 16, offsetX: 7, offsetY: -10, color: limbColor, damaged: false },
        { id: 'leftLeg', type: 'rect', width: 4, height: 18, offsetX: -4, offsetY: 6, color: accentColor, damaged: false },
        { id: 'rightLeg', type: 'rect', width: 4, height: 18, offsetX: 0, offsetY: 6, color: accentColor, damaged: false },
        { id: 'hairBack', type: 'circle', radius: 8, offsetX: 0, offsetY: -24, color: hairColor, damaged: false },
        { id: 'head', type: 'circle', radius: 6, offsetX: 0, offsetY: -20, color: headColor, damaged: false },
        { id: 'hairFringe', type: 'rect', width: 16, height: 3, offsetX: -8, offsetY: -22, color: hairColor, damaged: false },
        { id: 'leftEye', type: 'circle', radius: 1.8, offsetX: -3, offsetY: -17, color: eyeColor, damaged: false },
        { id: 'rightEye', type: 'circle', radius: 1.8, offsetX: 3, offsetY: -17, color: eyeColor, damaged: false },
        { id: 'leftPupil', type: 'circle', radius: 0.9, offsetX: -3, offsetY: -17, color: pupilColor, damaged: false },
        { id: 'rightPupil', type: 'circle', radius: 0.9, offsetX: 3, offsetY: -17, color: pupilColor, damaged: false },
    ];
}
