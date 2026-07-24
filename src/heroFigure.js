/**
 * The hero caricature's cursor parallax.
 *
 * She's a flat PNG, not a rigged model, so the illusion of depth has to come
 * from motion: she drifts a few pixels against the cursor while the type stays
 * put, which is enough for the eye to read her as nearer the viewer than the
 * page. CSS owns the actual movement — this only writes --px/--py (both -1..1)
 * and lets `.hero__char`'s transform decide how far that translates.
 *
 * The values are eased toward their target rather than set directly. Writing
 * raw pointer values makes her twitch with every mouse sample; the lerp turns
 * the same input into a drift.
 */
const EASE = 0.08; // per-frame approach rate — lower is heavier

export function createHeroFigure(hero) {
  if (!hero) return null;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  // On touch there is no hovering cursor to parallax against, and reduced
  // motion means she should simply stand still. Both keep the CSS defaults.
  if (reduced || coarse) return null;

  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let raf = 0;
  let running = false;

  const onMove = (e) => {
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = (e.clientY / window.innerHeight) * 2 - 1;
    if (!running) start();
  };

  const tick = () => {
    x += (tx - x) * EASE;
    y += (ty - y) * EASE;

    hero.style.setProperty("--px", x.toFixed(4));
    hero.style.setProperty("--py", y.toFixed(4));

    // Park the loop once she has effectively arrived. The hero is one screen
    // of a long page — leaving a rAF running for the whole visit to move
    // nothing is the kind of thing that quietly costs battery.
    if (Math.abs(tx - x) < 0.0005 && Math.abs(ty - y) < 0.0005) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const start = () => {
    running = true;
    raf = requestAnimationFrame(tick);
  };

  window.addEventListener("pointermove", onMove, { passive: true });

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    },
  };
}
