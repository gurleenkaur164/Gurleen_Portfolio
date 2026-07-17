import { createPortrait } from "./portrait.js";

createPortrait(document.getElementById("portrait"), "/gurleen-cut.png");

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
