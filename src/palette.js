/**
 * ⌘K command palette. Fuzzy-ish filter (subsequence match, not full fuzzy
 * scoring — the command list is ~10 items, ranking sophistication buys
 * nothing here), full keyboard control, focus restored on close.
 */
import { scrollTo } from "./motion.js";

const COMMANDS = [
  { label: "Go to top", hint: "section", action: () => scrollToId("top") },
  { label: "Go to Work", hint: "section", action: () => scrollToId("work") },
  { label: "Go to About", hint: "section", action: () => scrollToId("about") },
  { label: "Go to Tech Stack", hint: "section", action: () => scrollToId("stack") },
  {
    label: "Go to Open for Opportunities",
    hint: "hiring · freelance",
    action: () => scrollToId("opportunities"),
  },
  { label: "Go to Contact", hint: "section", action: () => scrollToId("contact") },
  {
    label: "Copy email address",
    hint: "gk0370435@gmail.com",
    action: () => copyText("gk0370435@gmail.com"),
  },
  {
    label: "Open GitHub",
    hint: "↗ external",
    action: () => window.open("https://github.com/gurleenkaur164", "_blank", "noreferrer"),
  },
  {
    label: "Send an email",
    hint: "mailto",
    action: () => (window.location.href = "mailto:gk0370435@gmail.com"),
  },
  {
    label: "Call",
    hint: "+91 76528 02032",
    action: () => (window.location.href = "tel:+917652802032"),
  },
];

function scrollToId(id) {
  // route through Lenis so palette jumps glide like every other scroll
  if (document.getElementById(id)) scrollTo(`#${id}`);
}

function copyText(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

// subsequence match: every typed char must appear in order, not necessarily
// adjacent — lets "gh" find "GitHub" without a real fuzzy-scoring library
function matches(query, label) {
  if (!query) return true;
  let qi = 0;
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  for (let i = 0; i < l.length && qi < q.length; i++) {
    if (l[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function createPalette() {
  const root = document.getElementById("palette");
  const input = document.getElementById("palette-input");
  const list = document.getElementById("palette-list");
  const trigger = document.getElementById("palette-trigger");
  if (!root || !input || !list || !trigger) return;

  let filtered = COMMANDS;
  let selected = 0;
  let lastFocused = null;

  function render() {
    list.innerHTML = "";
    if (filtered.length === 0) {
      const empty = document.createElement("li");
      empty.className = "palette__empty";
      empty.textContent = "No matches.";
      list.appendChild(empty);
      return;
    }
    filtered.forEach((cmd, i) => {
      const li = document.createElement("li");
      li.className = "palette__item" + (i === selected ? " is-selected" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === selected));
      li.innerHTML = `<span class="palette__item-label">${cmd.label}</span><span class="palette__item-hint">${cmd.hint}</span>`;
      li.addEventListener("mouseenter", () => {
        selected = i;
        render();
      });
      li.addEventListener("click", () => run(cmd));
      list.appendChild(li);
    });
  }

  function run(cmd) {
    close();
    cmd.action();
  }

  function open() {
    lastFocused = document.activeElement;
    root.hidden = false;
    input.value = "";
    filtered = COMMANDS;
    selected = 0;
    render();
    // a macrotask, not rAF — rAF callbacks can stall indefinitely in a
    // backgrounded tab, and focusing the input isn't paint-timed anyway
    setTimeout(() => input.focus(), 0);
    document.addEventListener("keydown", onKeydown);
  }

  function close() {
    root.hidden = true;
    document.removeEventListener("keydown", onKeydown);
    // restore focus to whatever opened the palette — trapping focus without
    // giving it back is the most common a11y bug in custom dialogs
    lastFocused?.focus?.();
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selected = Math.min(selected + 1, filtered.length - 1);
      render();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
      render();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selected]) run(filtered[selected]);
    }
  }

  input.addEventListener("input", () => {
    filtered = COMMANDS.filter((c) => matches(input.value, c.label));
    selected = 0;
    render();
  });

  root.querySelectorAll("[data-palette-close]").forEach((el) => el.addEventListener("click", close));
  trigger.addEventListener("click", open);

  // global ⌘K / Ctrl+K — the whole point of a command palette is not having
  // to reach for the trigger button
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      root.hidden ? open() : close();
    }
  });
}
