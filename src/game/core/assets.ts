/**
 * Where a file from public/ is served. Game data names files from the site
 * root ("/models/kaykit/knight.glb"), and those names double as ids (rig
 * lookups, preloads). A build served from a sub-path, such as GitHub Pages
 * ("/aetherfall-play/"), needs that prefix when loading; at "/" nothing changes.
 */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL ?? "/"): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path; // relative or another host
  return base.replace(/\/+$/, "") + path;
}
