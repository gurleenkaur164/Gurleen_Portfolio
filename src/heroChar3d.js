import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  PlaneGeometry,
  Mesh,
  MeshStandardMaterial,
  CanvasTexture,
  TextureLoader,
  AmbientLight,
  DirectionalLight,
  PointLight,
  Color,
  Vector2,
  SRGBColorSpace,
  ACESFilmicToneMapping,
  Group,
} from "three";

/**
 * The hero caricature as real 3D geometry.
 *
 * The source is a 2D render, so the volume has to be *derived* rather than
 * modelled. Two maps are built from the PNG at load:
 *
 *   depth  — a distance transform of the alpha channel. Every pixel is scored
 *            by how far it sits from the nearest transparent pixel, so the
 *            middle of her head scores highest and the silhouette scores zero.
 *            Passed through sqrt, that's a dome: she bulges toward the camera
 *            and falls away at the edges, like a bust. A little blurred
 *            luminance is mixed in for surface relief.
 *   normal — a Sobel of that depth, so lighting actually responds to the
 *            surface. This is not optional: three.js displaces vertices
 *            without recomputing normals, so displacement ALONE moves the
 *            geometry but leaves it shaded perfectly flat.
 *
 * Luminance on its own was tried for depth and is wrong for this artwork —
 * her scarf is the brightest thing in frame and her hair the darkest, so a
 * luminance dome inflates the scarf and hollows out her head.
 *
 * The texture already carries baked lighting, so the rig is mostly ambient
 * with one soft key and a rust rim. Anything stronger double-shades her.
 */

const PLANE_H = 4.0; // world units; width follows the image aspect
const MAP_W = 256; // depth/normal maps are computed at this width
const DISPLACE = 0.62; // world units of relief at the peak of the dome
const FOV = 34;

/** Two-pass chamfer distance transform over the alpha channel. */
function distanceField(alpha, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = alpha[i] > 128 ? INF : 0;

  // forward pass: up/left neighbours
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) v = Math.min(v, d[i - w] + 1);
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + 1.414);
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + 1.414);
      d[i] = v;
    }
  }
  // backward pass: down/right neighbours
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) v = Math.min(v, d[i + w] + 1);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + 1.414);
      if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + 1.414);
      d[i] = v;
    }
  }
  return d;
}

/** Separable box blur, run a few times to approximate a gaussian. */
function blur(src, w, h, radius, passes = 2) {
  let a = Float32Array.from(src);
  let b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k;
          if (xx < 0 || xx >= w) continue;
          s += a[y * w + xx]; n++;
        }
        b[y * w + x] = s / n;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let s = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k;
          if (yy < 0 || yy >= h) continue;
          s += b[yy * w + x]; n++;
        }
        a[y * w + x] = s / n;
      }
    }
  }
  return a;
}

/** Builds the depth + normal canvases from the decoded image. Exported so the
 *  derivation can be inspected without standing up the whole scene. */
export function buildMaps(img) {
  const w = MAP_W;
  const h = Math.round((img.naturalHeight / img.naturalWidth) * w);

  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(img, 0, 0, w, h);
  const px = sctx.getImageData(0, 0, w, h).data;

  const alpha = new Uint8Array(w * h);
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    alpha[i] = px[i * 4 + 3];
    lum[i] = (px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722) / 255;
  }

  const dist = distanceField(alpha, w, h);

  // Normalising the distance field GLOBALLY is wrong for a figure: the widest
  // part of the silhouette wins, so her coat and shoulders inflate while her
  // face — the focal point, and a narrower slice — stays nearly flat. Measured
  // on this artwork the peak landed at y=93%, i.e. her torso.
  //
  // Normalising per row instead lets every horizontal slice dome to its own
  // full height, so head and body both round out. rowMax is smoothed down the
  // image, otherwise a row that clips a stray wisp of hair gets a tiny max and
  // that slice balloons.
  const rowMax = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let m = 0;
    for (let x = 0; x < w; x++) { const v = dist[y * w + x]; if (v > m) m = v; }
    rowMax[y] = m;
  }
  const rowMaxSoft = new Float32Array(h);
  const RS = 12; // rows of smoothing
  for (let y = 0; y < h; y++) {
    let s = 0, n = 0;
    for (let k = -RS; k <= RS; k++) {
      const yy = y + k;
      if (yy < 0 || yy >= h) continue;
      s += rowMax[yy]; n++;
    }
    rowMaxSoft[y] = s / n;
  }

  let globalMax = 0;
  for (let y = 0; y < h; y++) if (rowMaxSoft[y] > globalMax) globalMax = rowMaxSoft[y];
  if (globalMax === 0) globalMax = 1;
  // floor the divisor so near-empty rows can't divide their way to a spike
  const FLOOR = globalMax * 0.28;

  const lumSoft = blur(lum, w, h, 2, 2);

  // dome + a touch of surface relief, then blurred so the chamfer's diagonal
  // banding doesn't show up as facets across her face
  const depth = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const denom = Math.max(rowMaxSoft[y], FLOOR);
    // narrow slices still shouldn't stand as proud as the broadest ones, so
    // scale each row's dome by how substantial that row is overall
    const rowWeight = 0.62 + 0.38 * Math.min(1, rowMaxSoft[y] / globalMax);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alpha[i] <= 128) { depth[i] = 0; continue; }
      const dome = Math.sqrt(Math.min(1, dist[i] / denom)) * rowWeight;
      depth[i] = Math.min(1, dome * 0.88 + (lumSoft[i] - 0.5) * 0.12 + 0.05);
    }
  }
  const depthSoft = blur(depth, w, h, 3, 2);

  const dCanvas = document.createElement("canvas");
  dCanvas.width = w; dCanvas.height = h;
  const dctx = dCanvas.getContext("2d");
  const dImg = dctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(Math.max(0, Math.min(1, depthSoft[i])) * 255);
    dImg.data[i * 4] = dImg.data[i * 4 + 1] = dImg.data[i * 4 + 2] = v;
    dImg.data[i * 4 + 3] = 255;
  }
  dctx.putImageData(dImg, 0, 0);

  // Sobel -> tangent-space normal map
  const nCanvas = document.createElement("canvas");
  nCanvas.width = w; nCanvas.height = h;
  const nctx = nCanvas.getContext("2d");
  const nImg = nctx.createImageData(w, h);
  const at = (x, y) => depthSoft[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  const STRENGTH = 9.0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const gy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = gx * STRENGTH, ny = gy * STRENGTH, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = y * w + x;
      nImg.data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
      nImg.data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nImg.data[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nImg.data[i * 4 + 3] = 255;
    }
  }
  nctx.putImageData(nImg, 0, 0);

  return { depth: dCanvas, normal: nCanvas, aspect: img.naturalWidth / img.naturalHeight };
}

export function createHeroChar3d(canvas, src, opts = {}) {
  if (!canvas) return null;
  const onReady = opts.onReady;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return null; // no WebGL — caller keeps the <img> fallback visible
  }
  if (!renderer.getContext()) return null;

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, PLANE_H * 0.5 / Math.tan((FOV * Math.PI) / 360) * 1.08);

  // The mesh lives in a group so the intro/idle can move the group while the
  // cursor rotates the mesh — two owners, no transform collisions.
  const rig = new Group();
  scene.add(rig);

  // Texture is pre-lit artwork, so ambient carries most of it and the
  // directional/rim only add shape.
  scene.add(new AmbientLight(0xffffff, 2.05));

  const key = new DirectionalLight(0xfff2e8, 1.15);
  key.position.set(-1.6, 2.0, 3.2);
  scene.add(key);

  const rim = new PointLight(new Color("#c2703f"), 22, 18, 2);
  rim.position.set(2.6, 1.2, 1.6);
  scene.add(rim);

  const fill = new DirectionalLight(0xbcd4ff, 0.35);
  fill.position.set(2.4, -1.0, 1.5);
  scene.add(fill);

  let mesh = null;
  let ready = false;

  new TextureLoader().load(
    src,
    (tex) => {
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const img = tex.image;
      const { depth, normal, aspect } = buildMaps(img);

      const dTex = new CanvasTexture(depth);
      const nTex = new CanvasTexture(normal);

      // Segment count sets how much of the dome actually survives as geometry.
      // Too few and the silhouette facets; this is ~90k verts, which is
      // nothing for a single mesh.
      const geo = new PlaneGeometry(PLANE_H * aspect, PLANE_H, 300, 316);

      const mat = new MeshStandardMaterial({
        map: tex,
        normalMap: nTex,
        normalScale: new Vector2(1.15, 1.15),
        displacementMap: dTex,
        displacementScale: DISPLACE,
        displacementBias: -DISPLACE * 0.35,
        transparent: true,
        alphaTest: 0.5, // hard cutout edge; the PNG matte is already clean
        roughness: 0.82,
        metalness: 0.0,
      });

      mesh = new Mesh(geo, mat);
      rig.add(mesh);
      ready = true;
      onReady?.();
    },
    undefined,
    () => {
      /* leave the <img> fallback in place */
    }
  );

  // ── sizing ───────────────────────────────────────────────────────────
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ── pointer ──────────────────────────────────────────────────────────
  const tgt = new Vector2(0, 0);
  const cur = new Vector2(0, 0);

  const onMove = (e) => {
    tgt.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -((e.clientY / window.innerHeight) * 2 - 1)
    );
  };
  const onLeave = () => tgt.set(0, 0);
  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave);

  // ── loop ─────────────────────────────────────────────────────────────
  const INTRO = 1.5;
  let raf = 0;
  let t0 = performance.now();
  let introStart = -1;
  let visible = true;
  let onScreen = true;

  const io = new IntersectionObserver(
    ([e]) => { onScreen = e.isIntersecting; },
    { threshold: 0 }
  );
  io.observe(canvas);

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    // the hero is one screen of a long page — no reason to keep shading it
    // while it is scrolled away or the tab is in the background
    if (!visible || !onScreen || !ready) return;

    const t = (now - t0) / 1000;
    if (introStart < 0) introStart = t;
    const p = reduced ? 1 : Math.min((t - introStart) / INTRO, 1);
    const e = easeOut(p);

    cur.lerp(tgt, reduced ? 1 : 0.055);

    // cursor rotation, damped — real geometry turning, so the rim light
    // sweeps across her as she goes
    mesh.rotation.y = cur.x * 0.42 * e;
    mesh.rotation.x = -cur.y * 0.24 * e;

    if (!reduced) {
      // idle: a slow breath and a drift, so she is never dead still
      rig.position.y = Math.sin(t * 0.85) * 0.045;
      rig.rotation.z = Math.sin(t * 0.4) * 0.012;
      const breathe = 1 + Math.sin(t * 0.85) * 0.006;
      rig.scale.setScalar(breathe * (0.9 + 0.1 * e));
    } else {
      rig.scale.setScalar(1);
    }

    // intro: rise and settle
    rig.position.y += (1 - e) * -0.55;
    mesh.material.opacity = e;

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  const onVis = () => { visible = document.visibilityState === "visible"; };
  document.addEventListener("visibilitychange", onVis);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      mesh?.geometry.dispose();
      mesh?.material.dispose();
      renderer.dispose();
    },
  };
}
