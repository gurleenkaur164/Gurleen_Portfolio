import * as THREE from "three";

/**
 * 3D elliptical carousel for the Selected Work section.
 * Project cards orbit in perspective, driven by auto-rotation + scroll velocity.
 * Falls back to the original flat list on touch/reduced-motion.
 */
export function createProjectCarousel(canvas, scrollProvider) {
  const projects = extractProjectData();
  if (!projects.length) return null;

  const fine = window.matchMedia("(pointer: fine)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduced) return null;

  const parent = canvas.parentElement;
  let W = parent.clientWidth;
  let H = parent.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
  camera.position.set(0, 0.5, 9.0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(3, 4, 5);
  scene.add(dirLight);

  const CARD_W = 3.0;
  const CARD_H = 3.8;
  const RX = 4.8;
  const RZ = 3.0;
  const CARD_COUNT = projects.length;

  const cards = projects.map((proj, i) => {
    const tex = makeCardTexture(proj, CARD_W, CARD_H);
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      side: THREE.DoubleSide,
      roughness: 0.55,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { index: i, project: proj };
    scene.add(mesh);
    return mesh;
  });

  let angle = 0;
  let scrollVel = 0;
  let hoveredIdx = -1;
  let targetHoverScale = 1;
  const hoverScales = cards.map(() => 1);

  function positionCards() {
    cards.forEach((mesh, i) => {
      const theta = angle + (i / CARD_COUNT) * Math.PI * 2;
      const x = Math.sin(theta) * RX;
      const z = Math.cos(theta) * RZ - 1;
      const y = 0;

      mesh.position.set(x, y, z);
      mesh.rotation.y = theta + Math.PI;

      const depth = (z + RZ + 1) / (2 * RZ + 1);
      mesh.material.opacity = 0.45 + depth * 0.55;
      mesh.material.transparent = true;

      const s = hoverScales[i];
      mesh.scale.set(s, s, s);
    });
  }

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(9999, 9999);

  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });

  canvas.addEventListener("pointerleave", () => {
    mouse.set(9999, 9999);
    hoveredIdx = -1;
  });

  canvas.addEventListener("click", () => {
    if (hoveredIdx >= 0 && Math.abs(dragVel) < 0.005) {
      const url = projects[hoveredIdx].url;
      if (url) window.open(url, "_blank", "noopener");
    }
  });

  let dragging = false;
  let dragStart = 0;
  let dragVel = 0;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    dragStart = e.clientX;
    dragVel = 0;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart;
    dragVel = dx * 0.003;
    dragStart = e.clientX;
  });

  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("pointercancel", () => { dragging = false; });

  function checkHover() {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(cards);
    if (hits.length) {
      const idx = hits[0].object.userData.index;
      if (hoveredIdx !== idx) {
        hoveredIdx = idx;
        canvas.style.cursor = "pointer";
      }
    } else {
      hoveredIdx = -1;
      canvas.style.cursor = "default";
    }
  }

  function onResize() {
    W = parent.clientWidth;
    H = parent.clientHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }

  const ro = new ResizeObserver(onResize);
  ro.observe(parent);

  let running = true;

  function animate() {
    if (!running) return;
    requestAnimationFrame(animate);

    const vel = scrollProvider?.() ?? 0;
    scrollVel += (vel * 0.002 - scrollVel) * 0.08;
    dragVel *= 0.94;
    const autoSpeed = hoveredIdx >= 0 ? 0.001 : 0.004;
    angle += autoSpeed + scrollVel + dragVel;

    checkHover();

    for (let i = 0; i < cards.length; i++) {
      const target = i === hoveredIdx ? 1.12 : 1;
      hoverScales[i] += (target - hoverScales[i]) * 0.1;
    }

    positionCards();
    renderer.render(scene, camera);
  }

  animate();

  return {
    dispose() {
      running = false;
      ro.disconnect();
      cards.forEach((m) => {
        m.geometry.dispose();
        m.material.map?.dispose();
        m.material.dispose();
      });
      renderer.dispose();
    },
  };
}

function extractProjectData() {
  const items = document.querySelectorAll(".project");
  return [...items].map((li) => {
    const link = li.querySelector(".project__link");
    return {
      no: li.querySelector(".project__no")?.textContent?.trim() || "",
      name: li.querySelector(".project__name")?.textContent?.trim() || "",
      desc: li.querySelector(".project__desc")?.textContent?.trim() || "",
      tags: [...li.querySelectorAll(".project__tags li")].map((t) => t.textContent.trim()),
      tint: li.dataset.tint || "#c2703f",
      url: link?.getAttribute("href") || "",
    };
  });
}

function makeCardTexture(proj, cardW, cardH) {
  const scale = 2;
  const w = Math.round(cardW * 200 * scale);
  const h = Math.round(cardH * 200 * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");

  const tint = proj.tint;
  const grad = ctx.createLinearGradient(0, 0, w * 0.4, h);
  grad.addColorStop(0, lighten(tint, 20));
  grad.addColorStop(1, darken(tint, 30));
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, w, h, 24 * scale);

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  roundRect(ctx, 16 * scale, 16 * scale, w - 32 * scale, h - 32 * scale, 14 * scale);

  const pad = 36 * scale;

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 ${18 * scale}px "JetBrains Mono", monospace`;
  ctx.fillText(proj.no, pad, pad + 20 * scale);

  ctx.fillStyle = "#fff";
  ctx.font = `700 ${36 * scale}px "Syne", sans-serif`;
  const lines = wrapText(ctx, proj.name, w - pad * 2);
  lines.forEach((line, i) => {
    ctx.fillText(line, pad, pad + 64 * scale + i * 40 * scale);
  });

  const descY = pad + 64 * scale + lines.length * 40 * scale + 20 * scale;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `400 ${16 * scale}px "Space Grotesk", sans-serif`;
  const descLines = wrapText(ctx, proj.desc, w - pad * 2).slice(0, 4);
  descLines.forEach((line, i) => {
    ctx.fillText(line, pad, descY + i * 22 * scale);
  });

  const tagY = h - pad - 14 * scale;
  ctx.font = `500 ${12 * scale}px "JetBrains Mono", monospace`;
  let tagX = pad;
  proj.tags.slice(0, 4).forEach((tag) => {
    const tw = ctx.measureText(tag.toUpperCase()).width + 20 * scale;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5 * scale;
    const tx = tagX, ty2 = tagY - 16 * scale, tW = tw, tH = 28 * scale, tR = 14 * scale;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(tx, ty2, tW, tH, tR);
    } else {
      ctx.moveTo(tx + tR, ty2);
      ctx.arcTo(tx + tW, ty2, tx + tW, ty2 + tH, tR);
      ctx.arcTo(tx + tW, ty2 + tH, tx, ty2 + tH, tR);
      ctx.arcTo(tx, ty2 + tH, tx, ty2, tR);
      ctx.arcTo(tx, ty2, tx + tW, ty2, tR);
      ctx.closePath();
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText(tag.toUpperCase(), tagX + 10 * scale, tagY + 2 * scale);
    tagX += tw + 8 * scale;
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function wrapText(ctx, text, maxW) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  ctx.fill();
}

function hexToHSL(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function lighten(hex, amt) {
  const [h, s, l] = hexToHSL(hex);
  return `hsl(${h}, ${s}%, ${Math.min(100, l + amt)}%)`;
}

function darken(hex, amt) {
  const [h, s, l] = hexToHSL(hex);
  return `hsl(${h}, ${s}%, ${Math.max(0, l - amt)}%)`;
}
