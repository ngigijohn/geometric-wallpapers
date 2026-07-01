# QA Checklist — Geometric Wallpaper Studio

Manual/scripted QA pass performed with Playwright browser automation (desktop Chromium
viewport + emulated mobile viewport with synthetic touch/pointer events). This is **not**
a substitute for testing on real iOS/Android hardware — see "Not covered" below.

## Verified via Chromium (desktop viewport, 1400x900)

- [x] All 7 pattern engines (Low Poly, Voronoi, Sacred Geometry, Bauhaus, Isometric,
      Flow Waves, Blobs) select and render with zero console errors.
- [x] Mouse-based vertex sculpting (mousedown → mousemove → mouseup) on the canvas
      completes without throwing.
- [x] Morph animation pause/resume toggle works both ways.
- [x] PNG export (`downloadPngBtn`) — busy-state label ("Rendering...") shows during the
      export, button re-enables afterward, and a real 4K PNG file downloads successfully.
- [x] SVG export (`downloadSvgBtn`) — same busy-state behavior; a real SVG file downloads
      successfully.
- [x] Aspect ratio switch to 16:9 correctly resizes the canvas drawing buffer to 3840x2160.
- [x] Keyboard shortcuts: `1`-`7` switch patterns, `Space` toggles pause, `?` opens the
      shortcuts legend, `Escape` closes it — all confirmed via the standalone test suite
      and manual dispatch.
- [x] Accessibility: `.pattern-card`, `.ratio-card`, `.palette-item` are focusable
      (`tabindex="0"`), expose `role="button"`, and activate via Enter — confirmed both
      manually and in the standalone test suite (`tests.html`).
- [x] Share-link round trip (build → apply) reproduces pattern, palette, aspect, and
      per-pattern settings exactly — confirmed in the standalone test suite.
- [x] Custom palette color editor updates `state.colors` live and marks the palette as
      `"custom"`.

## Verified via emulated mobile viewport (390x844, synthetic touch/pointer events)

- [x] Canvas touch handlers (`touchstart`/`touchmove`) call `preventDefault()`, confirmed
      via `event.defaultPrevented` — stops the page from scrolling/pinch-zooming while
      sculpting vertices on a touch device.
- [x] **Mobile bottom-sheet handle — found and fixed a real bug during this pass**: the
      handle's `touch-action: manipulation` still let the browser treat the vertical
      drag as a page pan, which could hijack the gesture mid-touch and fire
      `pointercancel` instead of `pointerup` — silently dropping both tap-to-toggle and
      drag-to-resize. Fixed by:
      1. Changing `.sheet-handle` to `touch-action: none` (styles.css) so the browser
         never takes over the gesture.
      2. Making `pointercancel` run the same snap/settle/tap-toggle logic as `pointerup`
         (`finishRelease` in app.js), as a safety net for any cancel that still occurs.
      Re-verified after the fix: tap-to-toggle (collapse ⇄ expand) and drag-to-resize
      (including snap-to-collapsed when dragged below the height threshold) both work
      correctly with simulated `pointerType: 'touch'` sequences, including a sequence
      that ends in `pointercancel` instead of `pointerup`.

## Not covered by this pass (needs real hardware)

- [ ] Real iOS Safari and Android Chrome touch behavior — Playwright's touch/pointer
      event simulation is a reasonable proxy but does not fully reproduce mobile browser
      gesture heuristics (e.g. native scroll-vs-drag disambiguation timing, momentum
      scrolling, iOS's rubber-band overscroll).
- [ ] Real-device performance of the Batch 1 rendering optimizations (frame-rate
      gating, cached grain tile, cached isometric color path) on lower-end mobile GPUs.
- [ ] VoiceOver / TalkBack screen reader behavior for the newly keyboard-operable cards
      (ARIA attributes and focus styles were verified programmatically and visually, not
      with an actual screen reader).
- [ ] Safari-specific canvas export quirks (`toDataURL`, clipboard write for the share
      link) — only Chromium was exercised here.
