// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// GitHub Pages (docs/DEPLOY.md): PAGES_BASE="/aetherfall-play/" makes a static,
// single-page build served from that sub-path, with no server. Unset (Lovable,
// local dev, CI), the build is exactly as before.
const pagesBase = process.env["PAGES_BASE"];
if (pagesBase && !/^\/[\w.-]+\/$/.test(pagesBase)) {
  // (Git Bash on Windows turns "/x/" into a Windows path unless MSYS_NO_PATHCONV=1.)
  throw new Error(`PAGES_BASE must look like "/repo-name/", not ${JSON.stringify(pagesBase)}`);
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(pagesBase ? { spa: { enabled: true } } : {}),
  },
  ...(pagesBase ? { vite: { base: pagesBase }, nitro: false as const } : {}),
});
