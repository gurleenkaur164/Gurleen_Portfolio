import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Group,
  Mesh,
  TorusKnotGeometry,
  OctahedronGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  TorusGeometry,
  SphereGeometry,
  RingGeometry,
  ConeGeometry,
  MeshPhysicalMaterial,
  MeshBasicMaterial,
  AdditiveBlending,
  DoubleSide,
  Vector2,
  Color,
  SRGBColorSpace,
} from "three";

/**
 * Full-viewport floating 3D elements — glassmorphic shapes, glowing orbs,
 * and geometric decorations scattered across the page. They parallax with
 * the cursor and shift gently with scroll, adding depth to every section
 * without competing with content (pointer-events: none on the canvas).
 *
 * All materials use MeshPhysicalMaterial with transmission/ior for that
 * frosted-glass look, or additive-blend halos for glowing orbs.
 */

// element definitions: what shapes go where, roughly
const ELEMENTS = [
  // hero zone — upper part of page
  { type: "torusKnot", x: -0.72, y: 0.7, z: -3, scale: 0.12, color: "#c2703f", speed: 0.3 },
  { type: "octahedron", x: 0.78, y: 0.55, z: -4, scale: 0.09, color: "#e08aa0", speed: 0.45 },
  { type: "orb", x: -0.85, y: 0.3, z: -2, scale: 0.04, color: "#e5a15a", speed: 0.6 },
  { type: "orb", x: 0.9, y: 0.85, z: -2.5, scale: 0.03, color: "#c2703f", speed: 0.7 },

  // work zone
  { type: "dodecahedron", x: -0.82, y: -0.1, z: -5, scale: 0.1, color: "#8fa0c4", speed: 0.35 },
  { type: "ring", x: 0.85, y: -0.25, z: -3.5, scale: 0.14, color: "#b8506a", speed: 0.25 },
  { type: "orb", x: 0.7, y: -0.05, z: -1.8, scale: 0.025, color: "#e8e3d9", speed: 0.8 },

  // about zone
  { type: "torusKnot", x: 0.75, y: -0.5, z: -4.5, scale: 0.08, color: "#7fa06a", speed: 0.4 },
  { type: "cone", x: -0.78, y: -0.55, z: -3, scale: 0.07, color: "#c9705a", speed: 0.55 },
  { type: "orb", x: -0.6, y: -0.7, z: -2, scale: 0.035, color: "#e5a15a", speed: 0.5 },

  // contact zone
  { type: "icosahedron", x: 0.82, y: -0.85, z: -4, scale: 0.11, color: "#a8465c", speed: 0.3 },
  { type: "torus", x: -0.7, y: -0.9, z: -3.5, scale: 0.1, color: "#c2703f", speed: 0.42 },
  { type: "orb", x: 0.55, y: -0.95, z: -2, scale: 0.03, color: "#e08aa0", speed: 0.65 },

  // extra scattered elements for density
  { type: "octahedron", x: -0.9, y: 0.0, z: -6, scale: 0.06, color: "#8fa0c4", speed: 0.5 },
  { type: "orb", x: 0.6, y: 0.2, z: -1.5, scale: 0.02, color: "#e8e3d9", speed: 0.9 },
  { type: "ring", x: -0.55, y: -0.4, z: -5, scale: 0.08, color: "#e5a15a", speed: 0.38 },
];

function createShape(def) {
  const c = new Color(def.color);

  if (def.type === "orb") {
    // glowing orb: solid core + additive-blend halo
    const group = new Group();
    const core = new Mesh(
      new SphereGeometry(1, 16, 16),
      new MeshBasicMaterial({ color: c })
    );
    group.add(core);

    const halo = new Mesh(
      new SphereGeometry(2.2, 16, 16),
      new MeshBasicMaterial({
        color: c,
        transparent: true,
        opacity: 0.12,
        blending: AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(halo);
    return group;
  }

  // glassmorphic physical material for everything else
  const mat = new MeshPhysicalMaterial({
    color: c,
    roughness: 0.15,
    metalness: 0.0,
    transmission: 0.85,
    thickness: 0.5,
    ior: 1.45,
    transparent: true,
    opacity: 0.6,
    side: DoubleSide,
    envMapIntensity: 0.3,
  });

  let geo;
  switch (def.type) {
    case "torusKnot":
      geo = new TorusKnotGeometry(1, 0.32, 64, 12, 2, 3);
      break;
    case "octahedron":
      geo = new OctahedronGeometry(1, 0);
      break;
    case "dodecahedron":
      geo = new DodecahedronGeometry(1, 0);
      break;
    case "icosahedron":
      geo = new IcosahedronGeometry(1, 0);
      break;
    case "torus":
      geo = new TorusGeometry(1, 0.35, 16, 32);
      break;
    case "ring":
      geo = new RingGeometry(0.7, 1, 32);
      break;
    case "cone":
      geo = new ConeGeometry(0.7, 1.6, 16);
      break;
    default:
      geo = new OctahedronGeometry(1, 0);
  }

  return new Mesh(geo, mat);
}

export function createFloatingElements(canvas) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return () => {};

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 5);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // cap lower for perf
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;

  // build all elements
  const items = ELEMENTS.map((def) => {
    const obj = createShape(def);
    obj.scale.setScalar(def.scale);

    // place in world space — x/y are fractions of view, convert to world units
    const vFov = (camera.fov * Math.PI) / 180;
    const hWorld = 2 * Math.tan(vFov / 2) * Math.abs(def.z + 5);
    const wWorld = hWorld * camera.aspect;
    obj.position.set(def.x * wWorld * 0.5, def.y * hWorld * 0.5, def.z);

    scene.add(obj);
    return {
      obj,
      def,
      baseY: obj.position.y,
      baseX: obj.position.x,
      seed: Math.random() * Math.PI * 2,
    };
  });

  // pointer + scroll tracking
  const pointer = new Vector2(0, 0);
  const target = new Vector2(0, 0);
  let scrollProgress = 0; // 0..1 through the page

  const onMove = (e) => {
    target.x = (e.clientX / innerWidth) * 2 - 1;
    target.y = -((e.clientY / innerHeight) * 2 - 1);
  };

  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);

    // reposition elements on resize
    const vFov = (camera.fov * Math.PI) / 180;
    for (const item of items) {
      const hWorld = 2 * Math.tan(vFov / 2) * Math.abs(item.def.z + 5);
      const wWorld = hWorld * camera.aspect;
      item.baseX = item.def.x * wWorld * 0.5;
      item.baseY = item.def.y * hWorld * 0.5;
    }
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("resize", onResize);

  // external scroll sync (called from main.js via Lenis)
  const setScroll = (progress) => {
    scrollProgress = progress;
  };

  // render loop
  let raf = 0;
  let running = true;
  const t0 = performance.now();

  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (!running) return;

    const t = (now - t0) / 1000;
    pointer.lerp(target, 0.03);

    for (const item of items) {
      const { obj, def, baseY, baseX, seed } = item;

      // bobbing animation
      obj.position.y = baseY + Math.sin(t * def.speed + seed) * 0.15;
      obj.position.x = baseX + Math.sin(t * def.speed * 0.7 + seed + 1) * 0.06;

      // scroll shift: elements drift upward as you scroll down
      obj.position.y += scrollProgress * 2.5;

      // cursor parallax: closer objects (larger z) move more
      const parallaxStrength = (def.z + 6) / 6 * 0.3;
      obj.position.x += pointer.x * parallaxStrength;
      obj.position.y += pointer.y * parallaxStrength * 0.5;

      // gentle multi-axis rotation
      obj.rotation.x = t * def.speed * 0.4 + seed;
      obj.rotation.y = t * def.speed * 0.6 + seed * 0.5;
      obj.rotation.z = Math.sin(t * def.speed * 0.3 + seed) * 0.3;
    }

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  const onVis = () => {
    running = document.visibilityState === "visible";
  };
  document.addEventListener("visibilitychange", onVis);

  const destroy = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVis);
    renderer.dispose();
  };

  return { setScroll, destroy };
}
