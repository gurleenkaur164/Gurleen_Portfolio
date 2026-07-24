# gurleenkaur.dev

Personal portfolio. Vanilla + Vite + Three.js, no framework.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

## The hero

One viewport, and deliberately nothing else: the name on the left, the rolling
role on the right, the 3D caricature (`public/caricature-cut.png`) standing
bottom-anchored between them, and a scroll arrow that fades in at 2.1s and
takes you to `#intro`. `.hero` uses `height: 100svh` rather than `min-height`
precisely so nothing below can peek into the first screen.

The caricature is **real geometry**, not a tilted image (`src/heroChar3d.js`).
The source is a 2D render, so volume is derived rather than modelled: a
distance transform of the alpha matte scores every pixel by how far it sits
from the silhouette, which through `sqrt` gives a dome that bulges toward the
camera and falls off at the edges. That drives a `displacementMap` on a
300×316 plane, and a Sobel of the same field drives a `normalMap`.

Both maps are load-bearing:

- **Luminance is the wrong depth cue for this artwork.** Her scarf is the
  brightest thing in frame and her hair the darkest, so a luminance dome
  inflates the scarf and hollows out her head.
- **The distance field is normalised per row, not globally.** Globally, the
  widest slice of the silhouette wins — measured on this image the peak landed
  at y=93%, her torso, leaving her face nearly flat. Per-row normalisation
  brought the face/body depth ratio from 0.80 to 0.89. `rowMax` is smoothed
  over 12 rows and floored at 28% of the global max, or a row clipping a stray
  wisp of hair divides its way to a spike.
- **The normal map is not decorative.** three.js displaces vertices without
  recomputing normals, so displacement alone moves the geometry and leaves it
  shaded perfectly flat. Without the Sobel there is no visible relief.
- The texture is pre-lit artwork, so the rig is mostly ambient (2.05) with one
  soft key and a rust rim. Anything stronger double-shades her.

The `<img>` stays in the DOM as the fallback; `.is-3d` is only added once the
maps are built, because swapping earlier shows a hole while the distance
transform runs.

Other things worth knowing before editing it:

- **The float is on `.hero__figure`, the parallax is on `.hero__char`.** Both
  are transforms and one element only gets one, so they are split across parent
  and child to compose. Putting them on the same element means whichever loses
  is silently dropped.
- **The mobile breakpoint assigns `grid-row` explicitly.** The figure sits
  second in the DOM because that's where it belongs on desktop, so single-column
  auto-placement would hand the flexible `1fr` row to the role text and let the
  caricature overflow the viewport.
- **The arrow must not carry `data-magnetic`.** `createMagnetic` writes
  `style.transform`, which clobbers the `translateX(-50%)` that centres it — it
  jumps half its own width sideways on hover.
- `src/heroFigure.js` only writes `--px`/`--py` (both -1..1) and lets CSS decide
  the travel distance. Its rAF loop parks itself once the eased value arrives,
  rather than spinning for the whole visit to move nothing.
- **Hero type is sized in `cqw`, never `vw`.** The name and role live in
  columns roughly a quarter of the screen wide, so viewport units overran them
  by ~200px and the reveal mask silently truncated "GURLEEN" to "GURLE". The
  side columns carry `container-type: inline-size` so `cqw` resolves against
  the column. `11.5cqw` is derived: "GURLEEN" measures 8.09 em-widths in Syne
  800 at -0.04em tracking, so it fits width W at W/8.09. **The mobile media
  query must use `cqw` too** — it originally re-introduced the bug with `vw`.
- **The roller is sized for its longest word.** One long entry shrinks all of
  them, which is why "Problem Solver" was dropped.
- `.hero` is `height: 100dvh` (with `100svh` as fallback). `svh` is the height
  with mobile browser chrome showing, so it leaves a strip of the next section
  visible once the URL bar collapses.

### The two previous heroes

Both are still in the repo, unwired, and either can be restored from
`src/main.js`:

- `src/portrait.js` — the portrait as a 160k-point WebGL cloud on a 400×400
  grid, one point per texel, displaced along Z by luminance so it reads as
  relief rather than a flat photo. Duotone ramp, cursor scatter, a left-to-right
  wave assemble, and cursor head-tracking. Needs `--portrait-shadow/mid/hi` in
  `style.css` (still there) and a `<canvas id="avatar">` in the hero. Notes on
  what is load-bearing in it are below.
- `src/office3d.js` — a low-poly desk diorama with the caricature as a flat
  cutout. `createOffice(canvas, "/caricature-cut.png")`.

### If you rewire the point cloud

Two things in there are load-bearing and easy to break:

- **Points are sized from `uCellPx`, not a fixed pixel count.** A point must
  stay close to its own cell's width. Hardcoded sizes were 1.7× the cell
  spacing, so every point bled into its neighbours and her face washed out.
- **Point centres are near-opaque.** These composite over a near-black page, so
  a point at 60% alpha doesn't read as "soft", it reads as *darker* — her face
  maps to ember `#C2703F` but at 60% coverage lands on muddy `#7C4A2C`.

Positions are jittered within their cell: a perfectly regular lattice beats
against the pixel grid and throws crosshatch moiré across her face.

The camera dollies in behind the assemble, so point sizing must measure against
`CAM_Z` (the resting distance) rather than the live `camera.position.z` — a
resize mid-intro would otherwise size every point for the dollied-out framing.

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

## Selected Work: the tilt cards

Cards, not rows — a tilt on a full-width row reads as the whole page skewing.
`main.js` writes the transform; the CSS supplies the rest.

- **`perspective` lives on `.projects`, not on the card.** Per-card
  perspective gives each one its own vanishing point, so a row of them looks
  like they're bulging independently instead of sharing a scene. For the same
  reason the JS transform has no `perspective()` in it.
- **`.project__link` must not have `overflow: hidden`.** It would clip the
  glare tidily, but it also forces `transform-style: preserve-3d` to flatten,
  and every `translateZ` layer silently stops working. The glare is clipped by
  its own `border-radius: inherit` instead.
- The depth layers (`translateZ` 22–52px) are what make it *parallax* tilt
  rather than a skew. Past ~60px the text visibly swims against the border.
- The glare angle is perpendicular to the tilt axis and its opacity scales
  with distance from centre, so the sheen is brightest at the steepest tilt.
- Both the lift and the glare are switched off under `prefers-reduced-motion`
  and on coarse pointers — with no tilt to justify it, a `translateZ` layer
  just blurs text.

`src/projectCarousel3d.js` (a spinning 3D ring of project cards) was the
previous presentation of this section and is kept but unwired. The two are
mutually exclusive: the carousel hid the card list via `.has-3d-carousel`.

## Tech stack section

`#stack` is the long-form list; the About sidebar is only the at-a-glance
panel. Three places list technologies and drift apart easily — the section,
the hero ticker, and the terminal's `skills` command.

The ticker's two halves must stay **identical**: `setupMarquee` wraps at half
the track's `scrollWidth`, so any asymmetry shows up as a visible jump.

## Colour

Five hues (`--c1`..`--c5`) rather than one accent. Sections, tech-stack cards,
opportunity cards and project cards each claim one, so the page changes
temperature as you scroll instead of being one rust note throughout. Light
values are darkened to hold contrast on paper; dark uses the bright end. All
ten clear WCAG AA for body text (light 4.66–6.74, dark 6.99–11.80).

Two traps, both of which bit on the first attempt:

- **`--accent` and `--rust` must be set together, every time.** An alias like
  `--rust: var(--accent)` at `:root` does *not* work: custom properties are
  substituted at computed-value time on the element they're declared on, so
  `--rust` resolves to :root's accent once and inherits that finished colour.
  Overriding `--accent` further down changes nothing. (`--rust` is the legacy
  token the rest of the stylesheet already used; it's kept so those rules
  didn't all have to be rewritten.)
- **Sections are keyed by id, not `:nth-of-type`.** `main` holds a mix of
  children, and `:nth-of-type` counts every `<section>` regardless of class —
  `.section:nth-of-type(1)` asks for an element that is both `.section` and the
  first section, which is `.hero`, so it matches nothing. `#recognition` and
  `#ask` exist only to be addressable this way.

## Background 3D

`ambient.js` (drifting ember depth-field) and `floatingElements.js`
(glass/glow shapes) are fixed full-viewport canvases behind the content, both
additive-blended, so they read as light added to the page. They're decoration:
`main.js` wraps both in try/catch and removes the canvas on failure, because a
background must never take the page down with it. Hidden under
`prefers-reduced-motion`.

## Layout notes

- Palette lives in `:root` in `src/style.css`. Three values do the work:
  `--paper` (espresso), `--ink` (bone), `--rust` (ember).
- The fixed nav paints an opaque band that fades out below it. Without that,
  body copy scrolls up through the wordmark.
- `prefers-reduced-motion` is honoured: hero animations and the caricature
  parallax are skipped, counters jump to final values, grain is removed.
