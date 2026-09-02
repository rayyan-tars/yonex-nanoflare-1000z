# NANOFLARE 1000 Z — Cinematic Product Concept

An independent, cinematic scroll-driven concept site for the **YONEX
NANOFLARE 1000 Z** badminton racket (Lightning Yellow, NF-1000Z). Built with
Next.js App Router, a scroll-scrubbed photo/frame-sequence engine, Lenis
smooth scroll, and Framer Motion for editorial reveals.

This is a fan-made concept project — **not affiliated with or endorsed by
YONEX.** See `ASSETS.md` for exactly which product photos are in use, how
they were prepared, and how to extend the site to a full raster frame
sequence later.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Also useful:

```bash
npm run lint   # ESLint (strict react-hooks rules included)
npm run build  # production build + type check
npm run start  # serve the production build
```

## Project structure

```
src/
  app/                    Next.js App Router entry (layout, page, metadata, icon)
  components/
    cinematic/            Reusable scroll-stage engine, frame-sequence canvas, callouts
    racket/                RacketPhoto (product cutouts + band-mask spotlight) + light-streak atmosphere
    sections/               The 8 page scenes (see below) + Navbar/Footer
    ui/                    Small shared UI (EyebrowBadge, HudFrame, AnimatedSection)
  lib/
    product.ts             Centralized product data — price, specs, technologies, CTA URL
    sequences.ts            Frame-sequence configuration (see ASSETS.md)
    useScrollStage.ts        Shared scroll → normalized-progress engine
    keyframes.ts             Piecewise interpolation / crossfade helpers for scroll pacing
    useReducedMotion.ts       prefers-reduced-motion, hydration-safe (useSyncExternalStore)
```

The page is assembled in `src/app/page.tsx` as eight scenes, matching the
brief's story beats: `ProductHero` (darkness → reveal), `SpeedSequence`
(built for speed), `EngineeringSection` (material breakdown),
`RacketAnatomy` (part-by-part), `Specifications` (editorial spec sheet),
`SpeedBreak` (fast transition), `ProductFinale` (price + CTA).

## Tuning the experience

Everything below is designed to be changed without touching the animation
logic.

### Change scroll speed / feel

Scroll smoothing is Lenis, configured in
`src/components/providers/SmoothScrollProvider.tsx`:

```ts
new Lenis({ lerp: 0.1, duration: 1.2, smoothWheel: true, ... })
```

- Lower `duration` (e.g. `0.9`) → snappier, less "floaty" scroll.
- Higher `lerp` (e.g. `0.14`) → the page catches up to the cursor/wheel
  faster, feels more direct.

### Change how tall each cinematic (pinned) scene is

Heights live in `src/app/globals.css` as `.stage-hero`, `.stage-speed`, and
`.stage-break`, each with desktop/tablet (`max-width: 1024px`)/mobile
(`max-width: 768px`) variants:

```css
.stage-hero { height: 240vh; }
@media (max-width: 1024px) { .stage-hero { height: 205vh; } }
@media (max-width: 768px)  { .stage-hero { height: 180vh; } }
```

Taller = more scroll distance to cover the same 0→1 progress (slower,
more granular). Shorter = faster, punchier. Keep proportions similar across
breakpoints so mobile doesn't feel rushed relative to desktop.

### Change animation timing / pacing within a scene

Each cinematic scene (`ProductHero.tsx`, `SpeedSequence.tsx`,
`SpeedBreak.tsx`) drives its visuals from an `applyProgress(progress)`
callback using `interpolate()` and `bandOpacity()` from `src/lib/keyframes.ts`:

```ts
const scale = interpolate(progress, [
  [0, 0.86],     // at 0% scroll progress, scale = 0.86
  [0.55, 1.32],  // at 55%, scale = 1.32
  [1, 1.0],      // at 100%, scale = 1.0
]);
```

Add, remove, or move `[progress, value]` keyframe pairs to retime any
transform (rotation, scale, translate, opacity). Text bands use
`bandOpacity(progress, show, hide)` — adjust `show`/`hide` to change when a
headline appears/disappears.

### Change the product price / specs

**Everything factual lives in `src/lib/product.ts`.** Nothing is
hard-coded in components. To change the price:

```ts
price: 285,
currency: "USD",
priceDisplay: "$285",
priceLabel: "Yonex USA listed price",
```

Specs (`flex`, `weights`, `stringingAdvice`, `recommendedStrings`,
`technologies`, etc.) follow the same pattern — edit the object, every
section that displays it (`Specifications.tsx`, `EngineeringSection.tsx`,
`RacketAnatomy.tsx`, `ProductFinale.tsx`) updates automatically.

### Change the CTA URL

```ts
// src/lib/product.ts
officialProductUrl: "https://us.yonex.com/products/nanoflare-1000-z",
```

Used by the navbar "View product" link, the finale "View at Yonex" button,
and the footer.

### Change mobile frame/asset quality

See `ASSETS.md` section 2 — if you add a real frame sequence, export a
second, lighter set for mobile and swap the `SequenceConfig` based on
`window.matchMedia("(max-width: 768px)")` where the sequence is selected.

### Swap or upgrade the racket photography

See `ASSETS.md` in full — it covers exactly which files are in
`public/nanoflare/stills/`, how to reprocess a new studio photo into a
transparent cutout, and the exact code change to move a scene from a
static `RacketPhoto` to a full raster `FrameSequenceCanvas` frame sequence.

## Accessibility & performance notes

- `prefers-reduced-motion` is respected end-to-end (`useReducedMotion`,
  hydration-safe via `useSyncExternalStore`): every pinned/scroll-scrubbed
  scene collapses to a single static, fully-legible composition instead of
  scroll-jacking.
- No per-frame React state updates — all scroll-driven animation mutates
  DOM refs directly inside a single rAF-throttled scroll handler per scene.
- The racket cutouts are three small WebP files (well under 100KB total),
  so there is no loading screen in this build; one will only be needed once
  a real raster frame sequence is added (`FrameSequenceCanvas` already
  includes progressive loading for that case).
