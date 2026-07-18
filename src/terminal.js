/**
 * A small interactive shell. Every command prints REAL data — the same facts
 * that appear elsewhere on the page, just reachable by typing. It's an
 * enhancement, never the only path to anything (Contact, About, Work all exist
 * as normal DOM), so a keyboard-only or screen-reader user loses nothing by
 * ignoring it.
 */
const PROMPT = "gurleen@portfolio:~$";

const COMMANDS = {
  help: () => [
    { t: "Available commands:", c: "accent" },
    { t: "  whoami      who I am" },
    { t: "  about       the longer version" },
    { t: "  projects    selected work" },
    { t: "  skills      the toolkit" },
    { t: "  awards      recognition" },
    { t: "  education   where I study" },
    { t: "  contact     how to reach me" },
    { t: "  social      links" },
    { t: "  clear       wipe the screen" },
  ],
  whoami: () => [
    { t: "Gurleen Kaur", c: "accent" },
    { t: "Software & Scalable Systems Engineer" },
    { t: "Building agentic AI that does real work." },
  ],
  about: () => [
    { t: "I'm 22, final-year Electronics & Computer Engineering at Thapar" },
    { t: "Institute. Most of what I build sits at the seam between AI systems" },
    { t: "and the infrastructure that has to carry them: the retry logic, the" },
    { t: "schema that stops a pipeline corrupting itself, the index that turns" },
    { t: "a slow query fast. Agents are only interesting once they're reliable." },
  ],
  projects: () => [
    { t: "Selected work:", c: "accent" },
    { t: "  1  Adhikar.AI            agentic copilot · gov welfare schemes" },
    { t: "  2  CampusBazaar          full-stack marketplace · agentic layer" },
    { t: "  3  Career Path Rec.      NLP profiling + LLM personalisation" },
    { t: "  4  Resume Job Analyser   RAG · gap-driven career roadmaps" },
    { t: "  5  AI Website Guardian   real-time multi-agent reasoning" },
    { t: "" },
    { t: "type 'social' for the GitHub link", c: "dim" },
  ],
  skills: () => [
    { t: "Languages", c: "accent" },
    { t: "  Python · C++ · C · JavaScript · TypeScript" },
    { t: "AI / ML", c: "accent" },
    { t: "  Agentic AI · LangChain · MCP · Ollama · RAG · CV · scikit-learn" },
    { t: "Systems", c: "accent" },
    { t: "  FastAPI · Node · PostgreSQL · MongoDB · Vector DBs · AWS" },
    { t: "Frontend", c: "accent" },
    { t: "  React · Next.js · Streamlit · Gradio" },
  ],
  awards: () => [
    { t: "2026  Amazon ML Summer School · 3,000 of 130,000+", c: "accent" },
    { t: "2025  Codeforces Master's Camp · Hall of Fame" },
    { t: "2025  Alta School AI Builders Fellow" },
    { t: "2024  Saturnalia Hackathon · 2nd Runner-Up" },
    { t: "2024  CodeSprint · 2nd Runner-Up" },
    { t: "2021  Toycathon · National Winner, Govt of India" },
  ],
  education: () => [
    { t: "Thapar Institute of Engineering & Technology, Patiala", c: "accent" },
    { t: "B.E. Electronics & Computer Engineering · CGPA 8.74 / 10" },
    { t: "Aug 2023 to present" },
  ],
  contact: () => [
    { t: "email    gk0370435@gmail.com", c: "accent" },
    { t: "phone    +91 76528 02032" },
    { t: "github   github.com/gurleenkaur164" },
  ],
  social: () => [
    { t: "github   github.com/gurleenkaur164", c: "accent" },
    { t: "email    gk0370435@gmail.com" },
  ],
};

// Small, tasteful easter eggs — the kind an engineer smiles at, not a wall of
// ASCII art that undercuts the tone.
const EGGS = {
  sudo: [{ t: "Permission denied: nice try.", c: "dim" }],
  ls: [{ t: "work  about  open-source  recognition  contact", c: "dim" }],
  pwd: [{ t: "/home/gurleen/portfolio", c: "dim" }],
  date: () => [{ t: new Date().toString(), c: "dim" }],
  exit: [{ t: "There's no escape. Try 'contact' instead.", c: "dim" }],
};

export function createTerminal(root) {
  if (!root) return;
  const output = root.querySelector(".term__output");
  const input = root.querySelector(".term__input");
  const form = root.querySelector(".term__form");
  if (!output || !input || !form) return;

  const history = [];
  let hi = -1;

  const print = (lines, { echo } = {}) => {
    const frag = document.createDocumentFragment();
    if (echo !== undefined) {
      const row = document.createElement("div");
      row.className = "term__line term__echo";
      row.innerHTML = `<span class="term__prompt">${PROMPT}</span> ${escapeHtml(echo)}`;
      frag.appendChild(row);
    }
    for (const line of lines) {
      const el = document.createElement("div");
      el.className = "term__line" + (line.c ? ` is-${line.c}` : "");
      el.textContent = line.t;
      frag.appendChild(el);
    }
    output.appendChild(frag);
    output.scrollTop = output.scrollHeight;
  };

  const run = (raw) => {
    const cmd = raw.trim().toLowerCase();
    if (!cmd) {
      print([], { echo: "" });
      return;
    }
    history.unshift(raw);
    hi = -1;

    if (cmd === "clear") {
      output.innerHTML = "";
      return;
    }

    const handler = COMMANDS[cmd] || EGGS[cmd];
    if (handler) {
      const lines = typeof handler === "function" ? handler() : handler;
      print(lines, { echo: raw });
    } else {
      print(
        [
          { t: `command not found: ${cmd}`, c: "err" },
          { t: "type 'help' for the list", c: "dim" },
        ],
        { echo: raw }
      );
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(input.value);
    input.value = "";
  });

  // ↑/↓ walk command history, like a real shell
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hi < history.length - 1) hi++;
      input.value = history[hi] ?? "";
      queueMicrotask(() => input.setSelectionRange(input.value.length, input.value.length));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hi > 0) hi--;
      else hi = -1;
      input.value = hi === -1 ? "" : history[hi];
    }
  });

  // clicking anywhere in the terminal focuses the prompt
  root.addEventListener("click", () => input.focus());

  // greeting — but don't auto-focus (that would yank the page down to the
  // terminal on load); the user opts in by clicking or tabbing to it
  print([
    { t: "Adhikar shell · type a command to explore.", c: "accent" },
    { t: "'help' lists everything. try 'projects' or 'whoami'.", c: "dim" },
  ]);
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
