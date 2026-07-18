/**
 * Intro loader — a counter races to 100, then a curtain lifts to reveal the
 * hero. The premium-portfolio "we thought about the first second" signal.
 *
 * SAFETY: the loader is an opaque overlay ON TOP of the real content, removed
 * by JS. If rAF ever stalls (background tab, a degraded renderer), a hard
 * fallback timeout force-finishes it — the page must NEVER stay hidden behind
 * a loader that didn't tick.
 */
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function createLoader(onDone) {
  const el = document.getElementById("loader");
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el?.classList.add("is-done");
    // let the curtain wipe play, then pull the node and hand off
    setTimeout(() => {
      el?.remove();
      onDone?.();
    }, 720);
  };

  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el?.remove();
    onDone?.();
    return;
  }

  const num = el.querySelector(".loader__num");
  const dur = 1500;
  const t0 = performance.now();

  const step = (now) => {
    const p = Math.min((now - t0) / dur, 1);
    if (num) num.textContent = String(Math.round(easeOut(p) * 100)).padStart(3, "0");
    if (p < 1) requestAnimationFrame(step);
    else finish();
  };
  requestAnimationFrame(step);

  // hard ceiling: whatever happens to rAF, the site is visible within 2.6s
  setTimeout(finish, 2600);
}
