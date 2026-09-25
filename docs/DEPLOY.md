# Playable build on GitHub Pages

**Play:** https://wrexist.github.io/aetherfall-play/

This repo is private, and GitHub's free plan only hosts Pages for public repos. So the compiled game lives in a separate **public** repo, [Wrexist/aetherfall-play](https://github.com/Wrexist/aetherfall-play), and GitHub Pages serves it from that repo's `main` branch. The source stays private.

The build is single-player and offline: no sign-in and no network calls, and saves stay in the browser. Lovable still builds and hosts its own copy from `main` as before.

## How it updates

`.github/workflows/pages.yml` runs on every push to `main` (and by hand from the Actions tab):

1. It builds with `PAGES_BASE=/aetherfall-play/`. `vite.config.ts` then makes a static single-page build served from that sub-path, with no server. Without `PAGES_BASE` (Lovable, CI, local dev) the build is unchanged.
2. It copies the page shell (`_shell.html`) to `index.html` and `404.html`, adds `.nojekyll` and the play repo's `README.md` (from `scripts/pages/`).
3. It commits the result to the play repo over SSH, using the `PLAY_DEPLOY_KEY` secret. Its public half is a write deploy key on the play repo, and it can push only there. Pages republishes about a minute later.

Pull requests that change the workflow, `vite.config.ts` or `scripts/pages/` build it without publishing.

## Rules for code

Files from `public/` must load through `assetUrl()` (`src/game/core/assets.ts`), which adds the sub-path. Game data keeps naming them from the root (`/models/kaykit/knight.glb`) because those names double as ids. `tests/assets.test.ts` fails if code loads one directly from `/`. The service worker and the manifest use paths relative to where they're served.

## Build it locally

```sh
PAGES_BASE=/aetherfall-play/ npx vite build   # output: dist/client
```

In Git Bash on Windows, prefix `MSYS_NO_PATHCONV=1`, or the shell turns `/aetherfall-play/` into a Windows path (the config stops with an error if that happens). Serve `dist/client` under `/aetherfall-play/` with `_shell.html` copied to `index.html`.

## Online play on Pages (later)

After Lovable Cloud is on, the build could sign players in: pass `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (both public values) to the build step, and add `https://wrexist.github.io/aetherfall-play/` to the allowed redirect URLs for sign-in emails.

## Removing it

Delete `.github/workflows/pages.yml`, `scripts/pages/`, the `PAGES_BASE` block in `vite.config.ts`, the `PLAY_DEPLOY_KEY` secret (Settings → Secrets → Actions), and the `aetherfall-play` repo. `assetUrl()` can stay: at `/` it changes nothing.
