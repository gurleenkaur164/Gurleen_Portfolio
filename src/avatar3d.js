import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Group,
  HemisphereLight,
  DirectionalLight,
  IcosahedronGeometry,
  MeshStandardMaterial,
  Mesh,
  Box3,
  Vector3,
  Vector2,
  Color,
  SRGBColorSpace,
  ACESFilmicToneMapping,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * The 3D hero. Loads a Ready Player Me avatar (.glb) and frames it as a bust —
 * head and shoulders — so the T-pose arms of an un-animated RPM export stay
 * out of shot. The whole model turns gently toward the cursor and idles with a
 * slow sway + bob, so it feels alive without needing skeletal animation.
 *
 * Until the file exists (public/avatar.glb), a soft rotating form stands in and
 * a hint tells you what to drop where — the hero is never empty or broken.
 *
 * Tuning lives in FRAME below: if the avatar sits too high/low or too close,
 * those three numbers are the knobs.
 */
const FRAME = {
  headFromTop: 0.14, // look at a point this far below the model's top (0..1 of height)
  distance: 0.62, // camera distance as a fraction of model height — smaller = closer
  fov: 30,
};

export function createAvatar(canvas, url) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hint = document.querySelector("[data-avatar-hint]");

  const scene = new Scene();
  const camera = new PerspectiveCamera(FRAME.fov, 1, 0.1, 100);
  camera.position.set(0, 1.5, 1.5);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // soft studio light — hemisphere fill so nothing goes muddy, one warm key
  const hemi = new HemisphereLight(0xffffff, 0xd8ccbb, 1.0);
  scene.add(hemi);
  const key = new DirectionalLight(0xfff3e8, 1.35);
  key.position.set(1.4, 2.2, 1.8);
  scene.add(key);
  const rim = new DirectionalLight(0xe7ecff, 0.5);
  rim.position.set(-1.8, 1.2, -1.5);
  scene.add(rim);

  // pivot the model lives on, so cursor-turn is just its rotation
  const pivot = new Group();
  scene.add(pivot);

  let model = null;
  let placeholder = null;

  const frameModel = (obj) => {
    const box = new Box3().setFromObject(obj);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);
    const h = size.y || 1.6;

    // recentre the model on the pivot horizontally + in depth
    obj.position.x -= center.x;
    obj.position.z -= center.z;

    const targetY = box.max.y - h * FRAME.headFromTop;
    camera.position.set(0, targetY, h * FRAME.distance + size.z);
    camera.lookAt(0, targetY, 0);
    camera.updateProjectionMatrix();
  };

  const showPlaceholder = () => {
    const geo = new IcosahedronGeometry(0.5, 3);
    const mat = new MeshStandardMaterial({
      color: new Color("#b0623a"),
      roughness: 0.55,
      metalness: 0.05,
      flatShading: false,
    });
    placeholder = new Mesh(geo, mat);
    pivot.add(placeholder);
    camera.position.set(0, 0, 1.9);
    camera.lookAt(0, 0, 0);
    if (hint) hint.textContent = "drop your avatar.glb in /public";
  };

  // ── load ────────────────────────────────────────────────────────────
  const loader = new GLTFLoader();
  try {
    loader.setMeshoptDecoder(MeshoptDecoder);
  } catch {
    /* meshopt optional; plain GLBs load without it */
  }

  loader.load(
    url,
    (gltf) => {
      model = gltf.scene;
      pivot.add(model);
      frameModel(model);
      if (hint) hint.textContent = "move your cursor";
    },
    undefined,
    () => {
      // no file yet, or it failed to parse — stand in gracefully
      showPlaceholder();
    }
  );

  // ── sizing ──────────────────────────────────────────────────────────
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ── cursor turn ─────────────────────────────────────────────────────
  const target = new Vector2(0, 0);
  const cur = new Vector2(0, 0);
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    target.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  // ── loop ────────────────────────────────────────────────────────────
  let raf = 0;
  let running = true;
  const t0 = performance.now();

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (!running) return;
    const t = (now - t0) / 1000;

    cur.lerp(target, 0.06);
    if (!reduced) {
      // turn toward the cursor, plus a slow idle sway so it's never static
      pivot.rotation.y = cur.x * 0.5 + Math.sin(t * 0.5) * 0.08;
      pivot.rotation.x = -cur.y * 0.12;
      pivot.position.y = Math.sin(t * 0.9) * 0.02;
      if (placeholder) placeholder.rotation.y = t * 0.4;
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  const onVis = () => {
    running = document.visibilityState === "visible";
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("visibilitychange", onVis);
    renderer.dispose();
  };
}
