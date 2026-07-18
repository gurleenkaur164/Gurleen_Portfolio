/**
 * Cursor-following project preview. Hovering a project row floats a large panel
 * that tracks the cursor — the tint colour as a gradient wash, the name, and an
 * index. It's the agency-portfolio move where a text list suddenly feels
 * image-rich, and it works without real screenshots because each project
 * already carries a signature --tint.
 *
 * Desktop / fine-pointer only. On touch the rows are just links.
 */
export function createPreview() {
  const fine = window.matchMedia("(pointer: fine)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const links = [...document.querySelectorAll(".project__link[data-tilt]")];
  if (!fine || !links.length) return;

  const panel = document.createElement("div");
  panel.className = "proj-preview";
  panel.innerHTML =
    '<span class="proj-preview__idx"></span><span class="proj-preview__name"></span>';
  document.body.appendChild(panel);

  const idx = panel.querySelector(".proj-preview__idx");
  const name = panel.querySelector(".proj-preview__name");

  let x = 0, y = 0, tx = 0, ty = 0;
  let active = false;

  links.forEach((link) => {
    const li = link.closest(".project");
    const tint = li?.dataset.tint || "#c2703f";
    const n = link.querySelector(".project__no")?.textContent || "";
    const title = link.querySelector(".project__name")?.textContent || "";

    link.addEventListener("pointerenter", () => {
      active = true;
      panel.style.setProperty("--tint", tint);
      idx.textContent = n;
      name.textContent = title;
      panel.classList.add("is-visible");
    });
    link.addEventListener("pointerleave", () => {
      active = false;
      panel.classList.remove("is-visible");
    });
  });

  // track the cursor; lerp toward it for a trailing, weighty feel
  window.addEventListener(
    "pointermove",
    (e) => {
      // offset down-right of the cursor so the panel sits beside the pointer
      // instead of under it (the custom cursor ring stays visible at the row)
      tx = e.clientX + 28;
      ty = e.clientY + 24;
      if (reduced) panel.style.transform = `translate(${tx}px, ${ty}px)`;
    },
    { passive: true }
  );

  if (!reduced) {
    const follow = () => {
      requestAnimationFrame(follow);
      if (!active) return;
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      panel.style.transform = `translate(${x}px, ${y}px)`;
    };
    requestAnimationFrame(follow);
  }
}
