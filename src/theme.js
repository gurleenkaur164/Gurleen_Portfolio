/**
 * Light / dark theme.
 *
 * Dark is the default — it was a deliberate choice (the portrait glows against
 * espresso), so a first-time visitor sees it as designed. Light revives the
 * original paper/ink palette. Preference persists; the very first visit also
 * respects the OS `prefers-color-scheme` if the user has never chosen here.
 *
 * `onChange` fires after every switch so the WebGL portrait can re-tone — its
 * duotone colours live in CSS variables, so it just re-reads them.
 */
const KEY = "gk-theme";

export function createTheme(onChange) {
  const root = document.documentElement;
  // declared BEFORE apply() runs — apply references btn, and calling apply
  // first would hit the temporal dead zone (ReferenceError) and halt the
  // whole init chain
  const btn = document.getElementById("theme-toggle");

  const stored = localStorage.getItem(KEY);
  // Light is the deliberate default now — warm paper is the intended look; the
  // espresso dark theme is opt-in via the toggle, and the choice sticks once a
  // visitor picks one.
  const initial = stored || "light";
  apply(initial, false);

  btn?.addEventListener("click", () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    apply(next, true);
    localStorage.setItem(KEY, next);
  });

  function apply(theme, animate) {
    // a brief class lets CSS cross-fade every themed colour at once; without
    // it the switch is an instant hard cut
    if (animate) {
      root.classList.add("theme-anim");
      setTimeout(() => root.classList.remove("theme-anim"), 450);
    }
    root.dataset.theme = theme;
    btn?.setAttribute("aria-pressed", String(theme === "light"));
    // let the DOM commit the new CSS-variable values before the portrait
    // reads them back
    requestAnimationFrame(() => onChange?.(theme));
  }
}
