// Szenen-Wechsel — SSOT dafür, welche Szene gerade aktiv ist.
// Eine Szene ist ein DOM-Element mit Klasse .scene; nur eine trägt .active.

const SCENE_ACTIVE_CLASS = 'active';

/**
 * Zeigt die Szene mit der gegebenen ID, blendet alle anderen aus.
 * @param {string} sceneId  z. B. 'menu' -> Element #scene-menu
 */
export function showScene(sceneId) {
  const scenes = document.querySelectorAll('.scene');
  scenes.forEach((el) => {
    el.classList.toggle(SCENE_ACTIVE_CLASS, el.id === `scene-${sceneId}`);
  });
}
