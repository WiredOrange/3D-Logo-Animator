# 3D Logo Animator · Logo Flight

Turn a 2D logo into an extruded 3D animation: fly in from the viewer, turn to face the camera, hold, then turn and fly back toward the viewer.

This repository contains a reusable **JavaScript/TypeScript SDK**, an optional **React component**, and the full **Logo Flight editor**. The core has no dependency on React, Next.js, a hosting platform, a backend, or global CSS. Logo processing and rendering run in the browser.

## Run the editor and examples

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

| Path | Example |
| --- | --- |
| `/` | Full studio: uploads, 3D styling, timeline, presets, inspection, exports |
| `/examples/vanilla/` | Framework-independent controller and live entry/exit triggers |
| `/examples/react/` | React component with lifecycle cleanup, including Strict Mode |

## Install into another application

The package is not published to npm. Build a tarball from this checkout:

```sh
npm ci
npm pack
# From your application's directory:
npm install /absolute/path/to/wiredorange-3d-logo-animator-0.1.0.tgz
```

Use an ESM-capable browser bundler such as Vite, Next.js, or Webpack. React is optional; install it in the host app only when using the `/react` entrypoint. The package tarball contains compiled JavaScript, TypeScript declarations, source maps, and documentation. Example/editor dependencies are development dependencies and are not needed by the host app.

## JavaScript / TypeScript

```ts
import { createLogoAnimator } from '@wiredorange/3d-logo-animator';

const container = document.querySelector<HTMLElement>('#logo-stage')!;
const canvas = document.querySelector<HTMLCanvasElement>('#logo-canvas')!;
const animator = createLogoAnimator(canvas, {
  settings: { preset: 'broadcast', depth: 0.22, hold: 2.6 },
});
animator.observeResize(container);

// Accepts a File, Blob, canvas, same-origin URL, or CORS-enabled image URL.
await animator.setLogo('/assets/logo.png');
animator.play({ from: 0 });

// For a live graphic: enter, hold indefinitely, then trigger exit later.
// animator.enter();
// animator.exit();

// On application unmount / route teardown:
// animator.dispose();
```

Give the canvas a container with a real width and style it with `display: block; width: 100%; aspect-ratio: 16 / 9;`. The renderer clears to transparency, so the host application controls the background.

## React

```tsx
'use client';
import { useRef, useState } from 'react';
import { LogoAnimatorCanvas } from '@wiredorange/3d-logo-animator/react';
import type { LogoAnimator } from '@wiredorange/3d-logo-animator';

export function BrandedOverlay() {
  const animator = useRef<LogoAnimator | null>(null);
  const [ready, setReady] = useState(false);
  return <>
    <LogoAnimatorCanvas
      source="/assets/logo.png"
      settings={{ preset: 'broadcast', depth: 0.25 }}
      onReady={instance => { animator.current = instance; }}
      onStateChange={state => setReady(state.loaded && !state.loading && !state.exporting)}
      onError={error => console.error(error)}
    />
    <button disabled={!ready} onClick={() => animator.current?.enter()}>Show</button>
    <button disabled={!ready} onClick={() => animator.current?.exit()}>Hide</button>
  </>;
}
```

The component creates the controller after mounting and disposes it on unmount. Imports are safe during server rendering; creating a controller requires the browser. Use a client component in Next.js. `onReady` means the controller exists; await `setLogo()`, use `onLoaded`, or inspect `state.loaded && !state.loading` before playback.

## Transparent exports

```ts
const abort = new AbortController();
const movie = await animator.export({
  resolution: '4k', // '720p' | '1080p' | '2k' | '4k'
  fps: 30,         // 30 | 60
  format: 'mov',   // 'mov' | 'png' (PNG-sequence ZIP)
  scope: 'full',   // 'full' | 'entry' | 'exit'
  signal: abort.signal,
  onProgress: fraction => console.log(Math.round(fraction * 100)),
});

// The host owns saving/uploading the returned Blob.
const frame = await animator.captureFrame({ resolution: '2k', time: 1.5 });
// abort.abort(); or animator.cancelExport(); cancels an active capture.
```

| Resolution | Output size |
| --- | --- |
| `720p` | 1280 × 720 |
| `1080p` | 1920 × 1080 |
| `2k` | 2560 × 1440 (QHD, the editor's 2K option) |
| `4k` | 3840 × 2160 (UHD) |

MOV uses lossless **PNG video with RGBA**, not ProRes or H.264. Use an editor that supports QuickTime PNG video; choose the PNG sequence for workflows that do not. Exports are 16:9. The preview size and device pixel ratio do not change exported dimensions.

## Features and limits

- Extrudes the alpha silhouette, including holes, with adjustable depth and beveled edges. Optional raised details use a brightness threshold; the source image is not converted into a semantic 3D model.
- PNG, SVG, JPEG, and WebP input; up to 20 MB and 64 megapixels. Transparent PNG gives the cleanest edges. Optional background removal flood-fills matching pixels connected to image boundaries.
- Source textures are capped at 1800 pixels on their longest side; geometry is traced at up to 600 pixels. 4K controls output dimensions, and cannot recover detail missing in the source.
- Uses WebGL2 when available, with a slower Canvas 2D fallback. Complex logos, long clips, and 4K/60 fps can be expensive. Export stops above 450 MB of encoded frames; packaging requires additional working memory.
- No logo upload, analytics, backend, persistence, or external fonts are built in. Passing a URL explicitly fetches that image; cross-origin hosts must permit CORS.
- A new logo load cancels the previous one. Exports pause playback and temporarily lock logo/settings/playback changes. Resizes are queued; disposing during export cancels it and releases rendering resources after cleanup.

## Repository layout

```text
src/animator.ts       Framework-independent controller and lifecycle
src/core/            Three.js geometry, renderer, motion, and export codecs
src/react/           Optional React canvas component
examples/studio/     Complete Logo Flight editor
examples/vanilla/    Controller integration example
examples/react/      React integration example
docs/API.md          API and settings reference
tests/               Lifecycle, export, motion, and packaging contracts
```

```sh
npm run check         # Type checking, regression tests, example production build
npm run build         # SDK JavaScript + declarations → dist/
npm run build:examples # Standalone static examples → demo-dist/
npm pack              # Installable SDK tarball
```

See [API reference](docs/API.md) and [integration notes](docs/INTEGRATION.md). This project has no open-source license grant selected (`UNLICENSED`). Third-party components retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
