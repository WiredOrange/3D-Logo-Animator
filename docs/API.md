# API reference

## Package entrypoints

| Import | Exports |
| --- | --- |
| `@wiredorange/3d-logo-animator` | `LogoAnimator`, `createLogoAnimator`, `DEFAULTS`, `PRESETS`, `RESOLUTIONS`, `resolveSettings`, `duration`, `phaseAt`, `poseAt`, TypeScript types |
| `@wiredorange/3d-logo-animator/react` | `LogoAnimatorCanvas`, `LogoAnimatorCanvasProps` |
| `@wiredorange/3d-logo-animator/engine` | Advanced rendering/encoding primitives used by the complete studio |

## Controller

`createLogoAnimator(canvas, options?)` / `new LogoAnimator(canvas, options?)`

Options: `settings?: Partial<Settings>`, `width?: number` (960), `height?: number` (540), `pixelRatio?: number` (device pixel ratio capped at 2), `loop?: boolean` (false). The supplied canvas belongs to this instance; do not render into it from another system. Software rendering caps pixel ratio at 1.

| Member | Behavior |
| --- | --- |
| `await setLogo(source)` | Loads a File, Blob, HTML canvas, URL, or URL string; builds geometry and shows the centered logo. Latest request wins; superseded requests reject with `AbortError`. |
| `updateSettings(patch)` | Validates and merges settings; retraces only for geometry/material/background changes. Selecting `preset` applies that preset before explicit overrides. |
| `play({ from?, loop? }?)` | Resumes full entry–hold–exit playback; starts at zero if already finished. `from` is in seconds. |
| `enter()` | Starts the entry from zero and stops on the centered front-facing frame. Waits indefinitely for another command. |
| `exit()` | Starts the exit from the centered pose. Calling during entry jumps to center; trigger after the entry `ended` event for continuity. |
| `pause()` | Stops the clock and preserves the current pose. |
| `stop()` | Pauses and seeks to the clear first frame. |
| `seek(seconds)` | Pauses; clamps to `[0, duration]`. |
| `inspect(yaw?, pitch?)` | Pauses on a centered, rotated 3D model. Angles are radians; defaults `-0.42`, `0.12`. `seek`/`play` resume animation mode. |
| `resize(width, height?)` | Sets logical preview size. Height defaults to `width × 9/16`. Queues while exporting. |
| `observeResize(element, aspectRatio?)` | Observes container width; returns a disconnect function. Aspect defaults to 16:9. Observers also disconnect on disposal. |
| `await export(options?)` | Returns MOV or PNG-sequence ZIP Blob. Pauses playback, restores preview, remains paused. |
| `await captureFrame(options?)` | Returns a transparent PNG of the current pose or a supplied time. Pauses playback and restores preview. |
| `cancelExport()` | Cancels the current export/capture. Cancellation rejects the pending promise with `AbortError`. |
| `dispose()` | Cancels work and releases resources. Safe to call repeatedly. Other mutating methods reject afterward. |
| `settings` | Frozen copy of current settings. |
| `state` | Frozen snapshot of time, duration, phase, playing, loaded, loading, exporting, inspecting, disposed, and softwareRenderer. |

Await `setLogo` before playback/export. Synchronous validation errors throw; asynchronous load/export errors reject. A loaded logo remains available after a failed replacement. Dispose the instance before replacing its canvas.

### Events

`animator.on(event, listener)` returns an unsubscribe function. Subscriptions do not immediately emit an initial state; read `animator.state` when subscribing.

| Event | Payload |
| --- | --- |
| `change` | `AnimatorState`; emitted during playback and state changes |
| `loaded` | `{ name, width, height }`; dimensions of the decoded source (after the 1800px texture cap) |
| `ended` | State at completion of full, entry-only, or exit-only playback; looping full playback does not emit this event |
| `error` | `Error` for a lost WebGL context; remount a new canvas/controller to recover |

Errors from `setLogo`, `export`, and `captureFrame` are handled through their promises. Listener exceptions are rethrown asynchronously and do not prevent resource cleanup.

### Export options

`resolution`: `720p`, `1080p` (default), `2k`, or `4k`. `fps`: 30 (default) or 60. `format`: `mov` (default) or `png` (ZIP). `scope`: `full` (default), `entry`, or `exit`. `signal`: optional AbortSignal. `onProgress`: optional callback receiving a fraction from zero to one.

`captureFrame` takes `resolution`, optional `time` in seconds, and optional `signal`. Without `time`, inspection rotation is preserved. With `time`, it captures the animation pose.

Export timing is quantized to a whole frame count: `max(2, round(seconds × fps))`. The final frame uses the exact section endpoint, producing a stable last frame for entry clips and a transparent last frame for exit/full clips. At least two frames are generated. Frame files are `frames/logo_00000.png` onward, with settings and export metadata in `animation.json`.

## Settings

All numbers must be finite. Durations use seconds, motion angles degrees, and depth/bevel/relief use model-space units. Colors must be six-digit `#RRGGBB` values.

| Field | Default | Allowed values |
| --- | --- | --- |
| `depth` | 0.22 | 0.01–1 |
| `bevel` | 0.015 | 0–0.08 |
| `relief` | 0.1 | 0–0.5 |
| `threshold` | 0.65 | 0.01–1 |
| `edgeColor` | `#80848c` | Six-digit hex |
| `finish` | `satin` | `satin`, `gloss`, `matte` |
| `size` | 88 | 10–200 (percent) |
| `entry` | 1.2 | 0.1–30 |
| `hold` | 2.6 | 0–120 |
| `exit` | 1 | 0.1–30 |
| `turn` | 62 | 0–1080 |
| `tilt` | 18 | −180–180 |
| `direction` | `left` | `left`, `right` |
| `preset` | `broadcast` | `broadcast`, `clean`, `spin` |
| `removeBackground` | false | Boolean |
| `tolerance` | 38 | 0–100 |
| `backgroundColor` | `#ffffff` | Six-digit hex |

## React props

`source` is required. Optional props: `settings`, `autoPlay` (false), `loop` (false), `onReady(controller)`, `onLoaded(controller)`, `onStateChange(state)`, `onError(error)`, and normal canvas attributes/styles. A forwarded ref receives the HTML canvas. No CSS file is required.

Changing `source` loads a new logo. Changing settings updates the existing controller. A new settings object with identical serialized content does not rebuild it. Props that change during export report the same busy error as imperative mutations; apply those changes after exporting. `onReady` runs once per mount (twice in React's development Strict Mode lifecycle); always replace saved controller references with the latest instance.

## Advanced engine

`LogoEngine`, `prepareLogo`, `decodeLogo`, `makeDemo`, `makeShapes`, `exportAnimation`, `canvasPng`, and `createMov` are exposed for custom editors. These are lower-level primitives: the caller owns settings validation, race prevention, resizing, playback clocks, context-loss handling, and disposal. Most host applications should use `LogoAnimator`.
