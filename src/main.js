import { createHeroFigure } from "./heroFigure.js";
import { createHeroChar3d } from "./heroChar3d.js";
import { createCursor, createMagnetic } from "./cursor.js";
import { createPalette } from "./palette.js";
import { createTheme } from "./theme.js";
import { createTerminal } from "./terminal.js";
import { createMotion } from "./motion.js";
import { createLoader } from "./loader.js";
import { createPreview } from "./preview.js";

// The hero is the caricature, flanked by type. It renders as real geometry in
// three.js — a dome derived from the alpha matte, displaced and normal-mapped
// so lighting responds to it — with the flat <img> as the fallback.
// portrait.js (point cloud) and office3d.js (desk diorama) are the two earlier
// heroes, still in the repo but unwired; see the README.
const heroFigure = document.querySelector(".hero__figure");
createHeroChar3d(document.getElementById("hero-char"), "/caricature-cut.png", {
  onReady: () => heroFigure?.classList.add("is-3d"),
});

// the cursor parallax still drives the wrapper, so it applies to whichever of
// the two (canvas or img) is currently visible
createHeroFigure(document.querySelector(".hero"));

createCursor();
createMagnetic();
createPalette();
const { lenis } = createMotion();
createPreview();
createTheme();

// Selected Work is the tilting card grid now. projectCarousel3d.js is the
// previous presentation — a spinning 3D ring of cards — kept in the repo but
// unwired; it and the card grid were mutually exclusive (the carousel hid the
// list via .has-3d-carousel).

createTerminal(document.getElementById("terminal"));

// the hero waits for the loader curtain to lift, then animates in
function revealHero() {
  document.querySelectorAll(".hero .reveal").forEach((el, i) => {
    el.style.transitionDelay = `${i * 90}ms`;
    el.classList.add("is-in");
  });
}
createLoader(revealHero);

/* ── reveal on scroll ─────────────────────────────────────────────────── */
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    }
  },
  { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
);

document.querySelectorAll(".reveal").forEach((el, i) => {
  // stagger siblings so rows cascade instead of snapping in as a block
  el.style.transitionDelay = `${Math.min(i % 6, 5) * 70}ms`;
  io.observe(el);
});


/* project card colour now comes from --accent, assigned per card by nth-child
   in style.css, so there is no per-project tint to wire up here */

/* ── counters ─────────────────────────────────────────────────────────── */
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

const countUp = (el) => {
  const end = parseFloat(el.dataset.count);
  const dec = parseInt(el.dataset.dec ?? "0", 10);
  const prefix = el.dataset.prefix ?? "";
  const suffix = el.dataset.suffix ?? "";
  const dur = 1400;
  const t0 = performance.now();

  const step = (now) => {
    const p = Math.min((now - t0) / dur, 1);
    const v = end * easeOut(p);
    el.textContent = prefix + v.toFixed(dec) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
};

const statIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      countUp(e.target);
      statIO.unobserve(e.target);
    }
  },
  { threshold: 0.6 }
);

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const dec = parseInt(el.dataset.dec ?? "0", 10);
    el.textContent =
      (el.dataset.prefix ?? "") +
      parseFloat(el.dataset.count).toFixed(dec) +
      (el.dataset.suffix ?? "");
  });
} else {
  document.querySelectorAll("[data-count]").forEach((el) => statIO.observe(el));
}

/* scroll progress bar is driven by motion.js from Lenis */

/* ── scrollspy: highlight the nav link for whatever section is in view ── */
const navLinks = [...document.querySelectorAll(".nav__links a[href^='#']")];
const spySections = navLinks
  .map((a) => document.getElementById(a.getAttribute("href").slice(1)))
  .filter(Boolean);

if (spySections.length) {
  const spyIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = e.target.id;
        navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`));
      }
    },
    // trigger when a section occupies the vertical middle of the viewport,
    // not merely "any pixel visible" — that's what makes the active link
    // change feel like it matches what you're actually reading
    { rootMargin: "-45% 0px -45% 0px" }
  );
  spySections.forEach((s) => spyIO.observe(s));
}

/* ── project card tilt + cursor-tracked spotlight ─────────────────────── */
const TILT_MAX = 13; // degrees
const TILT_SCALE = 1.04; // the lift that sells the card as picked up
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

// [data-tilt] gets the spotlight *and* the 3D tilt; [data-spotlight] gets the
// spotlight only. The opportunity cards are flush against each other in a
// 1px-gap grid, so rotating them would break the shared seam — they track the
// cursor with light instead of geometry.
if (!reducedMotion && !coarsePointer) {
  document.querySelectorAll("[data-tilt], [data-spotlight]").forEach((el) => {
    const tilts = el.hasAttribute("data-tilt");

    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width; // 0..1
      const py = (e.clientY - r.top) / r.height;

      // spotlight position, as a CSS percentage
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);

      if (!tilts) return;

      // tilt: rotateX responds to vertical position, rotateY to horizontal,
      // both centred on 0 so the card is flat at its own centre
      const rx = (0.5 - py) * TILT_MAX;
      const ry = (px - 0.5) * TILT_MAX;
      // no perspective() here — the list supplies it, so all the cards share
      // one vanishing point instead of each bulging around its own centre
      el.style.transform =
        `rotateX(${rx}deg) rotateY(${ry}deg) scale3d(${TILT_SCALE}, ${TILT_SCALE}, 1)`;

      // Glare runs perpendicular to the tilt axis and brightens as the cursor
      // moves off-centre, so the sheen is strongest at the steepest tilt —
      // which is where a real specular highlight would be.
      const dx = px - 0.5;
      const dy = py - 0.5;
      el.style.setProperty("--glare-angle", `${(Math.atan2(dy, dx) * 180) / Math.PI + 90}deg`);
      el.style.setProperty("--glare-op", Math.min(0.42, Math.hypot(dx, dy) * 0.95).toFixed(3));
    };
    const onLeave = () => {
      if (!tilts) return;
      // real-time tracking must stay untransitioned or it visibly lags the
      // cursor; the snap-back on leave is the one moment a transition helps
      el.style.transition = "transform 0.5s var(--ease)";
      el.style.transform = "";
      setTimeout(() => {
        el.style.transition = "";
      }, 500);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
  });
}

/* ── copy email to clipboard ──────────────────────────────────────────── */
document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = btn.dataset.copy;
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      // clipboard API can be unavailable (insecure context, old browser) —
      // fail visibly rather than pretend it worked
      btn.textContent = "Select & copy";
    }
    btn.classList.add("is-copied");
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("is-copied");
    }, 1800);
  });
});
