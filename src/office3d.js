import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Group,
  HemisphereLight,
  DirectionalLight,
  PointLight,
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  TorusGeometry,
  IcosahedronGeometry,
  ConeGeometry,
  TorusKnotGeometry,
  OctahedronGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  MeshBasicMaterial,
  Mesh,
  CanvasTexture,
  Vector2,
  Color,
  SRGBColorSpace,
  ACESFilmicToneMapping,
  PMREMGenerator,
} from "three";
import { buildVoxelCharacter } from "./voxelChar.js";

/**
 * A little 3D office diorama — the "game" hero. A low-poly desk with a glowing
 * laptop, mug, plant and a couple of slowly bobbing shapes, all lit soft and
 * rosy. Gurleen's caricature (background removed) stands behind the desk as a
 * flat cutout — a 2D character in a 3D set, the way paper-cutout game scenes
 * work. The camera parallaxes with the cursor so the whole thing has depth.
 *
 * Everything is built from primitives and positioned by hand, so the constants
 * up top are the tuning knobs.
 */
const DESK_Y = 0.9; // desk surface height
// character cutout tuning — the knobs most likely to need a nudge once it's
// visible: how tall the bust is, and where it sits behind the desk
const CHAR = { height: 1.35, y: DESK_Y + 0.5, z: -0.3, x: -0.05 };

export function createOffice(canvas, charUrl) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hint = document.querySelector("[data-avatar-hint]");
  const c = (hex) => new Color(hex);

  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0.2, 1.55, 3.7);
  camera.lookAt(0, 1.05, 0);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  // rosy studio light — warmer and more cinematic
  scene.add(new HemisphereLight(0xffe9ee, 0xe8cdc0, 1.15));
  const key = new DirectionalLight(0xfff0f2, 1.6);
  key.position.set(2, 3.2, 2.4);
  scene.add(key);
  const fill = new DirectionalLight(0xffd8e2, 0.5);
  fill.position.set(-2.4, 1.4, 1.2);
  scene.add(fill);
  // warm rim light from behind for character edge glow
  const rim = new DirectionalLight(0xffe0c0, 0.35);
  rim.position.set(0, 2, -2);
  scene.add(rim);
  // subtle point light near the laptop for warm glow spill
  const glow2 = new PointLight(0xffd9e6, 0.4, 3);
  glow2.position.set(0.5, DESK_Y + 0.4, 0.3);
  scene.add(glow2);

  // generate a simple gradient env map for subtle reflections on glass/beads
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  const envScene = new Scene();
  envScene.add(new Mesh(
    new SphereGeometry(10, 16, 16),
    new MeshBasicMaterial({ color: new Color("#2a1a12"), side: 1 })
  ));
  const envMap = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  scene.environment = envMap;
  pmrem.dispose();

  const diorama = new Group();
  scene.add(diorama);

  const mat = (hex, rough = 0.75, metal = 0.05) =>
    new MeshStandardMaterial({ color: c(hex), roughness: rough, metalness: metal });

  // ── soft blob shadow texture (fake contact shadow, no shadow-map fuss) ──
  const blob = document.createElement("canvas");
  blob.width = blob.height = 128;
  const bx = blob.getContext("2d");
  const g = bx.createRadialGradient(64, 64, 4, 64, 64, 60);
  g.addColorStop(0, "rgba(80,40,50,0.35)");
  g.addColorStop(1, "rgba(80,40,50,0)");
  bx.fillStyle = g;
  bx.fillRect(0, 0, 128, 128);
  const blobTex = new CanvasTexture(blob);
  const addShadow = (x, z, s) => {
    const sh = new Mesh(
      new PlaneGeometry(s, s),
      new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(x, 0.01, z);
    diorama.add(sh);
  };
  addShadow(0, 0.1, 3.4);

  // ── desk ────────────────────────────────────────────────────────────
  const desk = new Group();
  const top = new Mesh(new BoxGeometry(2.6, 0.09, 1.1), mat("#c98a5f"));
  top.position.y = DESK_Y;
  desk.add(top);
  const legGeo = new BoxGeometry(0.1, DESK_Y, 0.1);
  const legMat = mat("#a46a4a");
  for (const [x, z] of [[-1.2, 0.45], [1.2, 0.45], [-1.2, -0.45], [1.2, -0.45]]) {
    const leg = new Mesh(legGeo, legMat);
    leg.position.set(x, DESK_Y / 2, z);
    desk.add(leg);
  }
  diorama.add(desk);

  // ── laptop ──────────────────────────────────────────────────────────
  const laptop = new Group();
  laptop.position.set(0.5, DESK_Y + 0.045, 0.12);
  const base = new Mesh(new BoxGeometry(0.62, 0.03, 0.44), mat("#6b6f78", 0.4, 0.4));
  laptop.add(base);
  const screen = new Group();
  screen.position.set(0, 0.0, -0.22);
  const shell = new Mesh(new BoxGeometry(0.62, 0.42, 0.03), mat("#6b6f78", 0.4, 0.4));
  shell.position.y = 0.2;
  screen.add(shell);
  const glow = new Mesh(
    new PlaneGeometry(0.54, 0.34),
    new MeshBasicMaterial({ color: c("#ffd9e6") })
  );
  glow.position.set(0, 0.2, 0.017);
  screen.add(glow);
  screen.rotation.x = -0.42;
  laptop.add(screen);
  diorama.add(laptop);

  // ── mug ─────────────────────────────────────────────────────────────
  const mug = new Mesh(new CylinderGeometry(0.09, 0.08, 0.17, 20), mat("#b8506a"));
  mug.position.set(-0.72, DESK_Y + 0.085, 0.22);
  diorama.add(mug);
  const handle = new Mesh(new TorusGeometry(0.055, 0.018, 10, 20), mat("#b8506a"));
  handle.position.set(-0.62, DESK_Y + 0.085, 0.22);
  handle.rotation.y = Math.PI / 2;
  diorama.add(handle);

  // ── plant ───────────────────────────────────────────────────────────
  const pot = new Mesh(new CylinderGeometry(0.1, 0.08, 0.16, 16), mat("#c9705a"));
  pot.position.set(-1.0, DESK_Y + 0.08, -0.2);
  diorama.add(pot);
  const leaf = new Mesh(new ConeGeometry(0.16, 0.34, 10), mat("#7fa06a"));
  leaf.position.set(-1.0, DESK_Y + 0.32, -0.2);
  diorama.add(leaf);

  // ── floating props (the "game" sparkle) — glassmorphic crystal look ────
  const floaters = [];

  // glass/crystal material factory
  const glassMat = (hex) =>
    new MeshPhysicalMaterial({
      color: c(hex),
      roughness: 0.12,
      metalness: 0.0,
      transmission: 0.82,
      thickness: 0.4,
      ior: 1.5,
      transparent: true,
      opacity: 0.7,
      envMapIntensity: 0.8,
    });

  const mkFloat = (geo, hex, x, y, z) => {
    const m = new Mesh(geo, glassMat(hex));
    m.position.set(x, y, z);
    diorama.add(m);
    floaters.push({ m, y, seed: Math.random() * 6 });
  };
  mkFloat(new TorusGeometry(0.16, 0.06, 16, 32), "#e08aa0", 1.45, 1.9, -0.2);
  mkFloat(new IcosahedronGeometry(0.16, 1), "#e5a15a", -1.5, 2.15, 0.1);
  mkFloat(new BoxGeometry(0.18, 0.18, 0.18), "#8fa0c4", 1.2, 2.4, 0.3);
  // new shapes for more visual richness
  mkFloat(new TorusKnotGeometry(0.1, 0.035, 48, 10, 2, 3), "#c9705a", -1.3, 1.7, 0.4);
  mkFloat(new OctahedronGeometry(0.12, 0), "#b8506a", 1.55, 2.55, -0.4);
  mkFloat(new SphereGeometry(0.08, 12, 12), "#e8ded0", -0.9, 2.45, 0.5);
  mkFloat(new OctahedronGeometry(0.09, 0), "#7fa06a", 0.0, 2.6, -0.6);

  // ── character: a REAL 3D voxel relief built from the cutout PNG ────────
  // Not a flat plane — every surviving pixel becomes a small box pushed out
  // in depth by its own brightness, so the caricature reads as a chunky 3D
  // sculpture that catches light and turns, not a cardboard cutout.
  let character = null;

  const placeholderVoxel = () => {
    // a soft rose blob stands in until the voxel build finishes/if it fails
    character = new Mesh(
      new BoxGeometry(0.9, CHAR.height, 0.5),
      new MeshStandardMaterial({ color: c("#d98aa0"), roughness: 0.6 })
    );
    character.position.set(CHAR.x, CHAR.y, CHAR.z);
    diorama.add(character);
  };
  placeholderVoxel();

  buildVoxelCharacter(charUrl, { cols: 90, height: CHAR.height, depth: 0.45 })
    .then(({ mesh, height }) => {
      diorama.remove(character);
      character = mesh;
      // stand behind the desk so head + shoulders rise above the top
      character.position.set(CHAR.x, CHAR.y, CHAR.z);
      diorama.add(character);
      if (hint) hint.textContent = "that's you, in beads · drag to spin";
    })
    .catch(() => {
      if (hint) hint.textContent = "save caricature-cut.png in /public";
    });

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

  // ── cursor parallax (camera) ────────────────────────────────────────
  const target = new Vector2(0, 0);
  const curp = new Vector2(0, 0);
  const onMove = (e) => {
    target.x = (e.clientX / innerWidth) * 2 - 1;
    target.y = -((e.clientY / innerHeight) * 2 - 1);
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  // ── drag-to-spin the voxel character ─────────────────────────────────
  // separate from the ambient camera parallax above: this is a deliberate
  // grab-and-turn gesture directly on the sculpture, the way you'd spin a
  // real object on a desk.
  let dragging = false;
  let lastX = 0;
  let spin = 0; // accumulated extra yaw from dragging
  let spinVel = 0; // residual velocity so a flick keeps turning briefly

  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.style.cursor = "grabbing";
  };
  const onDrag = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    spinVel = dx * 0.006;
    spin += spinVel;
  };
  const onUp = () => {
    dragging = false;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onDrag, { passive: true });
  window.addEventListener("pointerup", onUp);

  // ── loop ────────────────────────────────────────────────────────────
  let raf = 0;
  let running = true;
  const t0 = performance.now();
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (!running) return;
    const t = (now - t0) / 1000;

    curp.lerp(target, 0.05);
    // orbit the camera a little around the desk for depth
    camera.position.x = 0.2 + curp.x * 0.7;
    camera.position.y = 1.55 + curp.y * 0.4;
    camera.lookAt(0, 1.05, 0);

    if (!reduced) {
      for (const f of floaters) {
        f.m.position.y = f.y + Math.sin(t * 1.1 + f.seed) * 0.08;
        f.m.rotation.x = t * 0.4 + f.seed;
        f.m.rotation.y = t * 0.5;
      }
      // laptop screen gently pulses
      glow.material.color.setRGB(1, 0.85 + Math.sin(t * 2) * 0.03, 0.9);

      // residual spin velocity decays each frame — a flick keeps turning and
      // settles, rather than stopping dead the instant you release
      if (!dragging) {
        spinVel *= 0.94;
        spin += spinVel;
      }
      if (character) character.rotation.y = curp.x * 0.06 + spin;
    }

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  const onVis = () => (running = document.visibilityState === "visible");
  document.addEventListener("visibilitychange", onVis);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointermove", onDrag);
    window.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointerdown", onDown);
    document.removeEventListener("visibilitychange", onVis);
    renderer.dispose();
  };
}
