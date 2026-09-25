// Battery saver: render at most `fps` frames a second, whatever the screen's
// refresh rate. Pure so it can be tested; the canvas calls it once per
// display frame.

/** Frames arrive on vsync with jitter; this much slack keeps the pace steady. */
const SLACK_MS = 4;

/** Should the frame arriving at `now` be drawn, if the last drawn one was at `last`? */
export function frameDue(now: number, last: number, fps: number): boolean {
  return now - last >= 1000 / fps - SLACK_MS;
}

/** The frame rate the battery saver holds. */
export const SAVER_FPS = 30;
