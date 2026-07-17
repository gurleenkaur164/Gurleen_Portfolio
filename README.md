# gurleenkaur.dev

Personal portfolio. Vanilla + Vite + Three.js, no framework.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

## The hero

The hero is a WebGL point cloud (`src/portrait.js`): 160k points on a 400×400
grid, one per texel of the portrait. Each point is displaced along Z by its
pixel's luminance, so the lit side of her face stands proud of the shadows and
the whole thing reads as relief rather than a flat photo. Colour is a duotone
ramp — shadow → ember → bone. The cursor shoves points aside and they spring
back.

Two things in there are load-bearing and easy to break:

- **Points are sized from `uCellPx`, not a fixed pixel count.** A point must
  stay close to its own cell's width. Hardcoded sizes were 1.7× the cell
  spacing, so every point bled into its neighbours and her face washed out.
- **Point centres are near-opaque.** These composite over a near-black page, so
  a point at 60% alpha doesn't read as "soft", it reads as *darker* — her face
  maps to ember `#C2703F` but at 60% coverage lands on muddy `#7C4A2C`.

Positions are jittered within their cell: a perfectly regular lattice beats
against the pixel grid and throws crosshatch moiré across her face.

## Why the portrait is pre-cut

`public/gurleen-cut.png` is generated, not hand-made. Run:

```bash
pip install rembg onnxruntime pillow numpy
python tools/cutout.py
```

The source avatar (`public/gurleen.jpg`) is shot on a stadium pitch. Keying the
background out in the shader was tried and abandoned:

- **Luminance keying fails.** Her hair is the darkest thing in frame and the
  sunlit grass is the brightest, so a brightness threshold deletes the subject
  and keeps the pitch.
- **Hue keying fails too.** Bright grass separates cleanly (`g - max(r,b)` ≈
  +0.09), but the grass *in her shadow* measures **+0.000** — chromatically
  neutral, and therefore indistinguishable from her cream coat. That residue is
  exactly the halo that hugs the silhouette, which is the worst place for it.

So the matte is cut once, offline, with `u2net_human_seg`, green-despilled at
the hair edge, cropped to her bounding box (fill goes 40% → 65%, so the point
grid spends its resolution on her instead of on transparent padding), and
shipped as PNG alpha. The shader just reads `tex.a` — no keying, no constants.

The script also applies **CLAHE** to luminance, which is not cosmetic. The
photo lights her coat **1.57× brighter than her face**, so any faithful global
tone curve renders the face darker than the jacket — that's the photograph, not
the renderer, and brightening globally only blows the coat to white. Local
equalisation lifts her face against its own neighbourhood (face 0.31 → 0.44,
coat/face ratio 1.57× → 1.12×) and is why the features resolve at all. Chroma
is preserved by scaling RGB by the luminance ratio rather than equalising each
channel, which would wreck her skin tone.

Because CLAHE supplies the contrast, the shader's duotone ramp deliberately has
**no** S-curve. Adding one back double-processes her face into a harsh mask.

If you swap in a new photo, replace `public/gurleen.jpg` and re-run the script.
It aborts if segmentation coverage falls outside 10–85%, which is the usual
signal that it latched onto the wrong thing.

## Layout notes

- Palette lives in `:root` in `src/style.css`. Three values do the work:
  `--paper` (espresso), `--ink` (bone), `--rust` (ember).
- The fixed nav paints an opaque band that fades out below it. Without that,
  body copy scrolls up through the wordmark.
- `prefers-reduced-motion` is honoured: the cloud assembles instantly, counters
  jump to final values, grain is removed.
