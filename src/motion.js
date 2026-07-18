import Lenis from "lenis";

/**
 * The motion backbone. One rAF loop drives:
 *   - Lenis smooth momentum scroll (the single biggest "feel" upgrade — the
 *     page glides with inertia instead of stepping)
 *   - velocity-reactive marquees that speed up and skew as you scroll
 *   - lightweight parallax on [data-parallax] elements
 *   - the scroll-progress bar, read straight from Lenis
 *
 * A module-level singleton so anchor links and the command palette can call
 * scrollTo() and get the same smooth glide instead of a native jump.
 */
let lenis = null;

export function scrollTo(target) {
  if (lenis) lenis.scrollTo(target, { offset: -20 });
  else document.querySelector?.(target)?.scrollIntoView({ behavior: "smooth" });
}

export function createMotion() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  lenis = new Lenis({
    lerp: reduced ? 1 : 0.085, // higher = snappier; low gives the long glide
    wheelMultiplier: 1,
    smoothWheel: !reduced,
  });

  const bar = document.querySelector(".progress__bar");
  const parallax = [...document.querySelectorAll("[data-parallax]")];
  const marquees = [...document.querySelectorAll("[data-marquee]")].map(setupMarquee);

  let velocity = 0;
  let scroll = 0;

  lenis.on("scroll", (e) => {
    velocity = e.velocity;
    scroll = e.scroll;
    if (bar) bar.style.width = `${(e.progress || 0) * 100}%`;
  });

  // smooth anchor navigation — intercept in-page hash links
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (id.length > 1 && document.querySelector(id)) {
      e.preventDefault();
      scrollTo(id);
    }
  });

  let last = performance.now();
  const raf = (now) => {
    const dt = Math.min((now - last) / 16.67, 3); // frames elapsed, capped
    last = now;

    lenis.raf(now);

    if (!reduced) {
      for (const m of marquees) m.update(velocity, dt);
      for (const p of parallax) {
        const speed = parseFloat(p.dataset.parallax) || 0.1;
        // translate against scroll — nearer layers (bigger speed) move more
        p.style.transform = `translate3d(0, ${(-scroll + p.offsetTop) * speed * 0.05}px, 0)`;
      }
    }

    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  return { lenis };
}

/**
 * A marquee whose content is duplicated once for a seamless loop. Base speed
 * scrolls it always; scroll velocity adds a burst and a slight skew, so the
 * band feels physically dragged by the page — the signature kinetic-marquee
 * move. `data-marquee` value is the base speed (px/frame); negative reverses.
 */
function setupMarquee(el) {
  const track = el.querySelector(".marquee__track") || el.firstElementChild;
  const base = parseFloat(el.dataset.marquee) || 0.6;
  let offset = 0;
  let half = track ? track.scrollWidth / 2 : 0;

  // recompute the wrap point when fonts/layout settle
  const ro = new ResizeObserver(() => (half = track.scrollWidth / 2));
  if (track) ro.observe(track);

  return {
    update(velocity, dt) {
      if (!track || !half) return;
      const boost = Math.min(Math.abs(velocity) * 0.35, 14);
      offset -= (base + boost) * dt;
      if (offset <= -half) offset += half;
      const skew = Math.max(-8, Math.min(8, velocity * 0.35));
      track.style.transform = `translate3d(${offset}px,0,0) skewX(${skew}deg)`;
    },
  };
}
