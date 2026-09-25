import * as THREE from "three";

const cache = new Map<string, THREE.Color>();

/**
 * Shared, parsed THREE.Color for a CSS colour string. Use with `.copy()` in
 * per-frame code: `Color.set("#hex")` re-parses the string every call.
 * The returned instance is shared — never mutate it.
 */
export function col(css: string): THREE.Color {
  let c = cache.get(css);
  if (!c) {
    c = new THREE.Color(css);
    cache.set(css, c);
  }
  return c;
}
