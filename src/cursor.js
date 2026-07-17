/**
 * Custom cursor: a dot that tracks instantly, a ring that trails behind it.
 * Grows and swallows a label when hovering `[data-cursor-label]`.
 *
 * Never created on touch or reduced-motion — a synthetic cursor is a pure
 * enhancement, and getting it wrong (ghost cursor on a touch device, motion
 * for someone who asked not to have it) is worse than not having one.
 */
export function createCursor() {
  const fine = window.matchMedia("(pointer: fine)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduced) return () => {};

  document.body.classList.add("has-custom-cursor");

  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  const ring = document.createElement("div");
  ring.className = "cursor-ring";
  const label = document.createElement("span");
  label.className = "cursor-ring__label";
  ring.appendChild(label);

  document.body.append(dot, ring);

  const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  const ringPos = { ...pointer };
  let hovering = null;
  let raf = 0;

  const onMove = (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    dot.style.transform = `translate(${pointer.x}px, ${pointer.y}px) translate(-50%, -50%)`;

    // re-check what's under the cursor: hovering an element that appears
    // mid-move (e.g. a reveal fading in) shouldn't need a second mousemove
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest("a, button, [data-magnetic], [data-cursor-label]");
    if (target !== hovering) {
      hovering = target;
      const hasLabel = target?.dataset.cursorLabel;
      ring.classList.toggle("is-hover", !!target);
      dot.classList.toggle("is-hidden", !!target);
      label.textContent = hasLabel || "";
    }
  };

  const tick = () => {
    raf = requestAnimationFrame(tick);
    // ring lags the dot — the lag itself is what reads as "custom cursor"
    // rather than "cursor with extra steps"
    ringPos.x += (pointer.x - ringPos.x) * 0.18;
    ringPos.y += (pointer.y - ringPos.y) * 0.18;
    ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px) translate(-50%, -50%)`;
  };

  const onLeave = () => {
    dot.style.opacity = "0";
    ring.style.opacity = "0";
  };
  const onEnter = () => {
    dot.style.opacity = "";
    ring.style.opacity = "";
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("mouseleave", onLeave);
  document.addEventListener("mouseenter", onEnter);
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("mouseleave", onLeave);
    document.removeEventListener("mouseenter", onEnter);
    dot.remove();
    ring.remove();
    document.body.classList.remove("has-custom-cursor");
  };
}

/**
 * Magnetic pull: elements marked [data-magnetic] nudge toward the cursor
 * within their own bounds, and spring back on leave. Classic micro-interaction
 * for buttons/links — cheap, generic, applies to anything with the attribute.
 */
export function createMagnetic() {
  const fine = window.matchMedia("(pointer: fine)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduced) return;

  const STRENGTH = 0.35;
  const MAX = 10; // px — keeps text-sized targets from swimming too far

  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const x = Math.max(-MAX, Math.min(MAX, dx * STRENGTH));
      const y = Math.max(-MAX, Math.min(MAX, dy * STRENGTH));
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    const onLeave = () => {
      el.style.transform = "";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
  });
}
