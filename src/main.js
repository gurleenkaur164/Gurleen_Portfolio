import { createPortrait } from "./portrait.js";
import { createCursor, createMagnetic } from "./cursor.js";
import { createPalette } from "./palette.js";

createPortrait(document.getElementById("portrait"), "/gurleen-cut.png");
createCursor();
createMagnetic();
createPalette();

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

// the hero can't wait for a scroll — it's already in view
requestAnimationFrame(() => {
  document.querySelectorAll(".hero .reveal").forEach((el, i) => {
    el.style.transitionDelay = `${i * 90}ms`;
    el.classList.add("is-in");
  });
});

/* ── per-project hover tint ───────────────────────────────────────────── */
document.querySelectorAll(".project[data-tint]").forEach((el) => {
  el.style.setProperty("--tint", el.dataset.tint);
});

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

/* ── scroll progress bar ──────────────────────────────────────────────── */
const progressBar = document.querySelector(".progress__bar");
if (progressBar) {
  let ticking = false;
  const updateProgress = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const pct = max > 0 ? (doc.scrollTop / max) * 100 : 0;
    progressBar.style.width = `${pct}%`;
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateProgress);
    },
    { passive: true }
  );
  updateProgress();
}

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
const TILT_MAX = 6; // degrees — kept subtle; this is a resume site, not a toy
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

if (!reducedMotion && !coarsePointer) {
  document.querySelectorAll("[data-tilt]").forEach((el) => {
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width; // 0..1
      const py = (e.clientY - r.top) / r.height;

      // spotlight position, as a CSS percentage
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);

      // tilt: rotateX responds to vertical position, rotateY to horizontal,
      // both centred on 0 so the card is flat at its own centre
      const rx = (0.5 - py) * TILT_MAX;
      const ry = (px - 0.5) * TILT_MAX;
      el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    };
    const onLeave = () => {
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
