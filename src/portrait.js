import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  BufferGeometry,
  BufferAttribute,
  Points,
  ShaderMaterial,
  TextureLoader,
  Vector2,
  Vector3,
  Color,
  SRGBColorSpace,
} from "three";

/**
 * Gurleen's GitHub avatar, rebuilt as a depth-displaced point cloud.
 *
 * The source photo is shot in a stadium — green field, seats, mountains. Two
 * things keep that from wrecking the hero:
 *   1. duotone — every point is remapped onto ink→ember→bone by luminance
 *      alone, so the green never survives as green.
 *   2. a radial mask — points dissolve toward the edges, so the stadium
 *      literally falls away and only she is left.
 *
 * Points sit closer to camera the brighter their pixel, so her face (lit)
 * stands proud of the (darker) background. Cursor shoves them around; they
 * spring back.
 */

const GRID = 400; // 400×400 = 160k points
const SPAN = 6.0; // world units the portrait occupies
const CELL = SPAN / GRID; // one grid cell, in world units
const FOV = 38;

export function createPortrait(canvas, src) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 9.2);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);

  // ── geometry: one vertex per grid cell, carrying its own uv + seed ────
  const count = GRID * GRID;
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const seed = new Float32Array(count);

  let i = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const u = x / (GRID - 1);
      const v = y / (GRID - 1);

      // Jitter each point inside its own cell. A perfectly regular lattice
      // beats against the pixel grid and throws visible crosshatch moiré
      // across her face; breaking the regularity turns that into fine grain.
      const jx = (Math.random() - 0.5) * CELL * 0.5;
      const jy = (Math.random() - 0.5) * CELL * 0.5;

      position[i * 3] = (u - 0.5) * SPAN + jx;
      position[i * 3 + 1] = (v - 0.5) * SPAN + jy;
      position[i * 3 + 2] = 0;

      uv[i * 2] = u;
      uv[i * 2 + 1] = v;
      seed[i] = Math.random();
      i++;
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(position, 3));
  geo.setAttribute("aUv", new BufferAttribute(uv, 2));
  geo.setAttribute("aSeed", new BufferAttribute(seed, 1));

  const tex = new TextureLoader().load(src, () => {
    mat.uniforms.uReady.value = 1;
  });
  tex.colorSpace = SRGBColorSpace;

  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTex: { value: tex },
      uTime: { value: 0 },
      uReady: { value: 0 },
      uIntro: { value: 0 },
      uPointer: { value: new Vector2(-999, -999) },
      uDpr: { value: 1 },
      // framebuffer pixels per grid cell — recomputed on resize so points
      // always track their own cell instead of a hardcoded pixel size
      uCellPx: { value: 2 },
      // lifted off the page background (#14120F) on purpose — her hair is the
      // darkest region, and mapping it to the bg colour would erase her.
      uDark: { value: new Color("#5b3529") },
      uEmber: { value: new Color("#C2703F") },
      uBone: { value: new Color("#E8E3D9") },
    },
    vertexShader: /* glsl */ `
      uniform sampler2D uTex;
      uniform float uTime;
      uniform float uIntro;
      uniform float uDpr;
      uniform float uCellPx;
      uniform vec2  uPointer;

      attribute vec2  aUv;
      attribute float aSeed;

      varying float vLum;
      varying float vMask;
      varying float vSeed;

      // cheap hash -> the scattered start position for the assemble intro
      vec3 hash3(float n) {
        return fract(sin(vec3(n, n + 1.7, n + 3.4)) * 43758.5453) * 2.0 - 1.0;
      }

      void main() {
        vSeed = aSeed;

        vec4 tex = texture2D(uTex, aUv);
        float lum = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
        vLum = lum;

        // The matte is baked (tools/cutout.py — u2net_human_seg + de-spill),
        // so isolation is just the alpha channel. Keying this at runtime was a
        // dead end: the grass in her shadow is chromatically neutral and no
        // hue test can separate it from her coat.
        float mask = tex.a;
        vMask = mask;

        vec3 pos = position;

        // brighter -> nearer the camera. this is what makes it read as relief.
        // kept modest: a big Z range reprojects points sideways under
        // perspective, which visibly warps her features.
        pos.z += (lum - 0.35) * 0.85 * mask;

        // idle breathing
        pos.z += sin(uTime * 0.7 + aUv.x * 5.0 + aUv.y * 3.0) * 0.045;

        // cursor shove, in the portrait's own local space
        float pd = distance(pos.xy, uPointer);
        float push = smoothstep(1.5, 0.0, pd);
        vec2 dir = normalize(pos.xy - uPointer + 0.0001);
        pos.xy += dir * push * 0.5;
        pos.z += push * 0.85;

        // intro: fly in from scatter
        vec3 scatter = hash3(aSeed * 100.0) * vec3(7.0, 7.0, 5.0);
        pos = mix(scatter, pos, uIntro);

        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;

        // Size from the cell, not a fixed pixel count. Overlap barely above
        // 1.0 keeps coverage gapless while staying sharp — the old hardcoded
        // 2.3–3.2px was up to 1.7x the cell spacing, so every point bled into
        // its neighbours and her face washed out.
        float size = uCellPx * mix(1.3, 1.55, lum);
        size += push * 2.0 * uDpr;
        gl_PointSize = size * (9.0 / -mv.z) * uIntro;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3  uDark;
      uniform vec3  uEmber;
      uniform vec3  uBone;
      uniform float uReady;
      uniform float uIntro;

      varying float vLum;
      varying float vMask;
      varying float vSeed;

      void main() {
        // Round dots, near-solid at the centre. This matters more than it
        // looks: these composite over a near-black page, so a point at 60%
        // alpha doesn't read as "soft" — it reads as *darker*. Her face maps
        // to ember (#C2703F) but at 60% coverage it lands on #7C4A2C, a muddy
        // brown. Opaque centres let the true colour through.
        vec2 c = gl_PointCoord - 0.5;
        float dd = dot(c, c);
        if (dd > 0.25) discard;
        float soft = smoothstep(0.25, 0.17, dd);

        // duotone ramp: shadow -> ember -> bone.
        // No contrast curve here on purpose — tools/cutout.py already applies
        // CLAHE, and S-curving on top of it double-processes her face into
        // something harsh and mask-like.
        float l = clamp((vLum - 0.04) / 0.60, 0.0, 1.0);

        vec3 col = mix(uDark, uEmber, smoothstep(0.0, 0.55, l));
        col = mix(col, uBone, smoothstep(0.55, 0.95, l));

        float a = vMask * soft * uReady * uIntro;
        a *= 0.92 + vSeed * 0.08; // a touch of grain; more than this veils her

        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }
    `,
  });

  const pts = new Points(geo, mat);
  scene.add(pts);

  // ── sizing: the canvas is a CSS-sized box, not the window ─────────────
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    mat.uniforms.uDpr.value = dpr;

    // world units visible at the z=0 plane the points sit on
    const visH = 2 * camera.position.z * Math.tan((FOV * Math.PI) / 360);
    mat.uniforms.uCellPx.value = ((r.height * dpr) / visH) * CELL;
  };

  // the hero canvas can be 0×0 on first paint; watch it instead of guessing
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ── pointer ──────────────────────────────────────────────────────────
  const ptr = new Vector2(-999, -999);
  const tgt = new Vector2(-999, -999);

  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
    // unproject onto the z=0 plane the points live on
    const v = new Vector3(nx, ny, 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    const dist = -camera.position.z / dir.z;
    const p = camera.position.clone().add(dir.multiplyScalar(dist));
    tgt.set(p.x, p.y);
  };

  const onLeave = () => tgt.set(-999, -999);

  window.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave);

  // ── loop ─────────────────────────────────────────────────────────────
  let raf = 0;
  let t0 = performance.now();
  let visible = true;

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (!visible) return;

    const t = (now - t0) / 1000;
    mat.uniforms.uTime.value = t;

    // assemble once the texture has decoded
    if (mat.uniforms.uReady.value === 1) {
      const target = 1;
      const k = reduced ? 1 : 0.02;
      mat.uniforms.uIntro.value += (target - mat.uniforms.uIntro.value) * k;
    }

    ptr.lerp(tgt, 0.12);
    mat.uniforms.uPointer.value.copy(ptr);

    if (!reduced) {
      pts.rotation.y = Math.sin(t * 0.25) * 0.08;
      pts.rotation.x = Math.cos(t * 0.2) * 0.04;
    }

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  const onVis = () => {
    visible = document.visibilityState === "visible";
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("visibilitychange", onVis);
    geo.dispose();
    mat.dispose();
    tex.dispose();
    renderer.dispose();
  };
}
