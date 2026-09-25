// Loading screen helpers, kept free of React so they can be tested.

/** With no progress for this long, offer a retry (slow or dropped connection). */
export const STALL_MS = 15_000;

/** Is the first load stuck? `lastChange` is when progress last moved. */
export function loadStalled(progress: number, lastChange: number, now: number): boolean {
  return progress < 1 && now - lastChange >= STALL_MS;
}

/** Shown one at a time while the world downloads. */
export const LOADING_TIPS = [
  "Tap Attack; hold it to keep swinging.",
  "A red zone on the ground means a blow is coming: dodge out of it, or through it.",
  "Good loot glows. Follow the light beams.",
  "Shrines are waypoints: fast travel between the ones you've found, from the Map.",
  "Drink a draught (Heal) before a fight turns, not after.",
  "Menu → Controls has a battery saver, a left-handed layout and joystick size.",
  "Bosses get angrier at half health. Watch for the change.",
  "Sell or salvage spare gear at the forge in Emberhollow.",
];
