import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  BufferGeometry,
  BufferAttribute,
  Points,
  ShaderMaterial,
  AdditiveBlending,
  Color,
  Vector2,
} from "three";

/**
 * Ambient depth field — the thing that stops the page reading as a flat
 * document. A few thousand embers drift in dark 3D space; near ones parallax
 * hard against the cursor and scroll, far ones barely move and fade into fog.
 * That depth separation is the whole trick behind Awwwards-style 3D sites, and
 * it costs almost nothing to render.
 *
 * Deliberately restrained: additive embers on near-black, never bright, never
 * busy. It sits BEHIND the portrait and all content (z-index 0), so it enriches
 * the space without competing with her.
 */

const COUNT = 2600;
const RX = 18; // half-width of the volume
const RY = 12; // half-height
const DEPTH = 34; // z spread, from the camera into the distance

// pulled toward ember, with bronze and a few pale sparks for variety —
// all muted, nothing that reads as neon
const PALETTE = ["#c2703f", "#a85a34", "#b8894a", "#7a4327", "#e8ded0"];

export function createAmbient(canvas) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scene = new Scene();
  const camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 8);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);

  const pos = new Float32Array(COUNT * 3);
  const vel = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const size = new Float32Array(COUNT);

  const c = new Color();
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * RX;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * RY;
    pos[i * 3 + 2] = -Math.random() * DEPTH + 2;

    // slow, mostly-upward drift with a little lateral wander
    vel[i * 3] = (Math.random() * 2 - 1) * 0.006;
    vel[i * 3 + 1] = 0.004 + Math.random() * 0.01;
    vel[i * 3 + 2] = (Math.random() * 2 - 1) * 0.004;

    c.set(PALETTE[(Math.random() * PALETTE.length) | 0]);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;

    seed[i] = Math.random() * Math.PI * 2;
    // most embers tiny, a few larger foreground motes for depth
    size[i] = Math.random() < 0.12 ? 3.5 + Math.random() * 3 : 0.8 + Math.random() * 1.6;
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new BufferAttribute(col, 3));
  geo.setAttribute("aSeed", new BufferAttribute(seed, 1));
  geo.setAttribute("aSize", new BufferAttribute(size, 1));

  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uDpr: { value: Math.min(devicePixelRatio, 2) },
      uNear: { value: 4 }, // full brightness this close
      uFar: { value: DEPTH }, // faded to nothing this far
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSeed;
      attribute float aSize;
      uniform float uTime;
      uniform float uDpr;
      uniform float uNear;
      uniform float uFar;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);

        // twinkle + depth fade. distant embers dissolve into the dark, which
        // is what sells the sense of volume rather than a flat sheet.
        float twinkle = 0.6 + 0.4 * sin(uTime * 1.5 + aSeed);
        float depth = smoothstep(uFar, uNear, -mv.z);
        // capped so additive embers behind body text never lift contrast
        // enough to hurt legibility — this is ambience, not a light show
        vAlpha = twinkle * depth * 0.8;

        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uDpr * (10.0 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        // soft round ember — bright core, feathered edge
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d);
        if (r > 0.25) discard;
        float glow = smoothstep(0.25, 0.0, r);
        gl_FragColor = vec4(vColor, glow * vAlpha);
      }
    `,
  });

  const points = new Points(geo, mat);
  scene.add(points);

  // ── parallax input ────────────────────────────────────────────────────
  const pointer = new Vector2(0, 0);
  const target = new Vector2(0, 0);
  let scrollY = 0;

  const onMove = (e) => {
    target.x = (e.clientX / innerWidth) * 2 - 1;
    target.y = -((e.clientY / innerHeight) * 2 - 1);
  };
  const onScroll = () => {
    scrollY = window.scrollY;
  };
  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    mat.uniforms.uDpr.value = Math.min(devicePixelRatio, 2);
  };

  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onResize);

  // ── loop ──────────────────────────────────────────────────────────────
  let raf = 0;
  let running = true;
  const t0 = performance.now();

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (!running) return;
    const t = (now - t0) / 1000;
    mat.uniforms.uTime.value = t;

    if (!reduced) {
      for (let i = 0; i < COUNT; i++) {
        const ix = i * 3;
        pos[ix] += vel[ix];
        pos[ix + 1] += vel[ix + 1];
        pos[ix + 2] += vel[ix + 2];
        // wrap so the field never empties
        if (pos[ix + 1] > RY) pos[ix + 1] = -RY;
        if (pos[ix] > RX) pos[ix] = -RX;
        else if (pos[ix] < -RX) pos[ix] = RX;
        if (pos[ix + 2] > 2) pos[ix + 2] = -DEPTH;
      }
      geo.attributes.position.needsUpdate = true;
    }

    // near particles shift more than far ones → real parallax depth.
    // scroll gently lifts the camera so scrolling feels like moving through.
    pointer.lerp(target, 0.04);
    camera.position.x = pointer.x * 1.6;
    camera.position.y = pointer.y * 1.1 + scrollY * 0.0009;
    camera.lookAt(0, scrollY * 0.0009, -DEPTH * 0.5);

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  const onVis = () => {
    running = document.visibilityState === "visible";
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("pointermove", onMove);
    removeEventListener("scroll", onScroll);
    removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVis);
    geo.dispose();
    mat.dispose();
    renderer.dispose();
  };
}
