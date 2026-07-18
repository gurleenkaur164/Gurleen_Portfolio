/**
 * Live GitHub stats, pulled client-side from the PUBLIC REST API — no token,
 * so no secret to leak in a static build.
 *
 * What the public API gives without auth: repo list, stars, languages, sizes,
 * timestamps. What it does NOT give cheaply: contribution streak, total commit
 * count, PR count — those need an authenticated GraphQL call. Rather than embed
 * a token or lean on a third-party image that can rot, this shows only what it
 * can prove, and degrades to a static message if the request fails (the
 * unauthenticated limit is 60 requests/hour/IP, so a rate-limit is possible).
 */
const USER = "gurleenkaur164";

export async function createGithub(root) {
  if (!root) return;
  const statsEl = root.querySelector("[data-gh-stats]");
  const reposEl = root.querySelector("[data-gh-repos]");
  const langsEl = root.querySelector("[data-gh-langs]");
  if (!statsEl) return;

  try {
    const [user, repos] = await Promise.all([
      fetchJson(`https://api.github.com/users/${USER}`),
      fetchJson(`https://api.github.com/users/${USER}/repos?per_page=100&sort=updated`),
    ]);

    // distinct languages across public repos — a more flattering signal than
    // stars/forks (both low for a student account, and "0 Forks" reads badly)
    const langCount = new Set(repos.filter((r) => r.language).map((r) => r.language)).size;

    renderStats(statsEl, [
      { n: user.public_repos, label: "Repositories" },
      { n: user.followers, label: "Followers" },
      { n: langCount, label: "Languages" },
    ]);

    // top languages by how many repos use each — the honest, cheap signal
    if (langsEl) renderLangs(langsEl, repos);

    // most recently pushed non-fork repos
    if (reposEl) {
      const recent = repos
        .filter((r) => !r.fork)
        .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
        .slice(0, 4);
      renderRepos(reposEl, recent);
    }

    root.classList.add("is-loaded");
  } catch {
    // most likely the 60/hr unauthenticated rate limit; say so plainly rather
    // than leave four spinning skeletons forever
    root.classList.add("is-error");
    statsEl.innerHTML = "";
    const msg = document.createElement("p");
    msg.className = "gh__error";
    msg.innerHTML =
      `Live data is rate-limited right now. See it directly on ` +
      `<a href="https://github.com/${USER}" target="_blank" rel="noreferrer noopener">github.com/${USER}</a>.`;
    statsEl.appendChild(msg);
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function renderStats(el, items) {
  el.innerHTML = "";
  for (const it of items) {
    const cell = document.createElement("div");
    cell.className = "gh__stat";
    const num = document.createElement("span");
    num.className = "gh__num";
    num.textContent = "0";
    const label = document.createElement("span");
    label.className = "gh__label";
    label.textContent = it.label;
    cell.append(num, label);
    el.appendChild(cell);
    countTo(num, it.n);
  }
}

function countTo(node, end) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || end === 0) {
    node.textContent = String(end);
    return;
  }
  const dur = 1100;
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min((now - t0) / dur, 1);
    node.textContent = String(Math.round(end * easeOut(p)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // guarantee the final value even if rAF never fires (background tab, or a
  // renderer that has stalled its frame loop) — the animation is enhancement,
  // the number is the point
  setTimeout(() => {
    node.textContent = String(end);
  }, dur + 120);
}

function renderLangs(el, repos) {
  const counts = {};
  for (const r of repos) {
    if (r.language) counts[r.language] = (counts[r.language] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return;

  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  el.innerHTML = "";
  for (const [lang, n] of top) {
    const row = document.createElement("div");
    row.className = "gh__lang";
    row.innerHTML =
      `<span class="gh__lang-name">${escapeHtml(lang)}</span>` +
      `<span class="gh__lang-bar"><span style="width:${Math.round((n / total) * 100)}%"></span></span>`;
    el.appendChild(row);
  }
}

function renderRepos(el, repos) {
  el.innerHTML = "";
  for (const r of repos) {
    const a = document.createElement("a");
    a.className = "gh__repo";
    a.href = r.html_url;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    a.setAttribute("data-cursor-label", "Open");
    a.innerHTML =
      `<span class="gh__repo-name">${escapeHtml(r.name)}</span>` +
      `<span class="gh__repo-desc">${escapeHtml(r.description || "...")}</span>` +
      `<span class="gh__repo-meta">${r.language ? escapeHtml(r.language) : ""}${
        r.stargazers_count ? ` · ★ ${r.stargazers_count}` : ""
      }</span>`;
    el.appendChild(a);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
