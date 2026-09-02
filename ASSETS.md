# Assets guide — NANOFLARE 1000 Z concept site

## What's in the site right now

The racket visuals across the site are **real YONEX NANOFLARE 1000 Z
product photography**, supplied directly and processed into three
background-removed cutouts:

```
public/nanoflare/stills/
  racket-full.webp    161×519  — full racket, used in the hero, speed-break,
                                  finale, and the engineering/anatomy panels
  racket-macro.webp   287×446  — head/string-bed macro close-up, used in
                                  the "Built for Speed" sequence
  racket-tile.webp    447×447  — a branded yellow reference tile (kept with
                                  its original background), used as a small
                                  color-swatch accent in the finale
```

These were background-removed with a corner-sampled chroma-key pass
(`RacketPhoto`/`RacketBandMask` in
`src/components/racket/RacketPhoto.tsx` consume them directly — no manual
alpha-editing was done beyond that automated pass) and re-encoded to WebP.
Total footprint for all three: well under 100KB combined.

Because these are static photos rather than a true multi-angle frame
sequence, motion is created with CSS transforms (scale/rotate/translate/
blur) driven by scroll progress — see `src/lib/keyframes.ts` and each
scene's `applyProgress` callback — rather than swapping frames. The
engineering/anatomy "spotlight" effect (`RacketBandMask`) dims everything
outside a vertical band of the same photo instead of using separate
per-part artwork.

## Where a real frame sequence still plugs in

The frame-sequence engine built for this project is untouched and ready
for a true multi-frame capture (a 360° turntable render, or a tracked
product-photography pass) if you get one later:

- `src/lib/sequences.ts` defines `HERO_SEQUENCE` and `SPEED_SEQUENCE`,
  currently `frameCount: 0`.
- `src/components/cinematic/FrameSequenceCanvas.tsx` is a full raster
  frame-sequence engine (progressive preloading, DPR-aware canvas,
  cover-fit drawing, graceful fallback to the nearest loaded frame). It
  renders nothing while `frameCount` is `0`.

To activate it: drop `frame_0001.webp … frame_NNNN.webp` (4-digit,
1-indexed) into `public/nanoflare/hero/` or `public/nanoflare/technology/`,
set the matching `frameCount` in `sequences.ts`, and in the relevant scene
swap the `<RacketPhoto />` for a `<FrameSequenceCanvas ref={...} sequence={HERO_SEQUENCE} />`,
calling `frameHandleRef.current?.drawAt(progress)` from the same
`applyProgress` callback that's already there. Recommended: 120–180 frames
for the hero, 1920×1080 source, WebP quality 78–85.

## Replacing or adding photos

- **Swap a still**: replace the file at the same path in
  `public/nanoflare/stills/` (keep the filename, or update the `src` prop
  in the relevant section component). Keep a transparent background —
  every scene composites the racket over a near-black page background.
- **Reprocess a new studio photo** (flat-color background) into a
  transparent cutout the same way these were made:

  ```bash
  pip install pillow numpy
  python3 - <<'EOF'
  import numpy as np
  from PIL import Image, ImageFilter

  im = Image.open("input.png").convert("RGB")
  arr = np.asarray(im).astype(np.float32)
  h, w, _ = arr.shape
  corner = 12
  samples = np.concatenate([
      arr[0:corner, 0:corner].reshape(-1, 3), arr[0:corner, w-corner:w].reshape(-1, 3),
      arr[h-corner:h, 0:corner].reshape(-1, 3), arr[h-corner:h, w-corner:w].reshape(-1, 3),
  ])
  bg = np.median(samples, axis=0)
  dist = np.sqrt(((arr - bg) ** 2).sum(axis=2))
  alpha = np.clip((dist - 18) / (55 - 18), 0, 1) * 255
  alpha_img = Image.fromarray(alpha.astype("uint8"), "L").filter(ImageFilter.GaussianBlur(1))
  out = Image.merge("RGBA", (*im.split(), alpha_img))
  bbox = alpha_img.point(lambda p: 255 if p > 10 else 0).getbbox()
  if bbox:
      out = out.crop(bbox)
  out.save("output.webp", quality=92, method=6)
  EOF
  ```

  Works best on a photo with a flat, evenly lit background and decent
  contrast against the racket. Adjust the two threshold numbers (18/55) if
  edges look too hard or too soft.

- **Band-mask coordinates**: `EngineeringSection.tsx` and
  `RacketAnatomy.tsx` each define a `from`/`to` percentage range (top to
  bottom of the image) per part/technology. If you swap in a differently
  cropped `racket-full.webp`, re-eyeball these against the new image.

## Legal note

Only use imagery you have the rights to publish (your own product photos,
licensed renders, or explicit permission from YONEX). This project is an
independent concept site — see the disclaimer in the footer — and does not
carry any license to redistribute official YONEX marketing photography
beyond what was supplied for this build.
