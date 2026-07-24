/**
 * Light / dark theme.
 *
 * Light is the default — warm paper is the intended look; the espresso dark
 * theme is opt-in. Preference persists once a visitor picks one.
 *
 * `onChange` fires after every switch, for anything that has to re-read a
 * themed CSS variable rather than inheriting it. Nothing needs it while the
 * hero is a plain <img>; the WebGL portrait did (its duotone stops live in
 * --portrait-*), so the hook stays for when that gets wired back in.
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
