import {
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Color,
  DynamicDrawUsage,
} from "three";

/**
 * Turns a cutout PNG into a smooth 3D bead-relief sculpture. Each surviving
 * pixel becomes a small sphere pushed out in depth by its brightness, coloured
 * from the source. At 110 columns, facial features are clearly readable and
 * the bead-mosaic look is polished rather than blocky.
 *
 * Built as a single InstancedMesh (one draw call for thousands of beads) so
 * even a 110×150 grid costs almost nothing at render time.
 */
export function buildVoxelCharacter(url, opts = {}) {
  const cols = opts.cols ?? 110;
  const depthScale = opts.depth ?? 0.45;
  const targetHeight = opts.height ?? 1.6;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(build(img));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = url;
  });

  function build(img) {
    const rows = Math.round(cols * (img.height / img.width));

    // downsample through a small canvas with high-quality smoothing
    const cv = document.createElement("canvas");
    cv.width = cols;
    cv.height = rows;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(img, 0, 0, cols, rows);
    const { data } = cx.getImageData(0, 0, cols, rows);

    // count opaque-enough texels
    let count = 0;
    for (let i = 0; i < cols * rows; i++) if (data[i * 4 + 3] > 30) count++;

    const cell = targetHeight / rows;
    // Icosahedron with 2 subdivisions — smooth sphere look, cheap geometry
    const geo = new IcosahedronGeometry(cell * 0.48, 2);
    const material = new MeshStandardMaterial({
      roughness: 0.55,
      metalness: 0.08,
      envMapIntensity: 0.6,
    });
    const mesh = new InstancedMesh(geo, material, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);

    const dummy = new Object3D();
    const col = new Color();
    let idx = 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const a = data[i + 3];
        if (a <= 30) continue;

        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // smoothstep depth curve — brighter pixels pop more naturally
        const t = Math.max(0, Math.min(1, lum));
        const smooth = t * t * (3 - 2 * t);
        const depth = cell + smooth * depthScale * targetHeight * 0.38;

        // edge softening: particles near silhouette edges scale down
        const alphaFactor = a < 180 ? a / 180 : 1;
        const scale = alphaFactor * (0.85 + lum * 0.2);

        dummy.position.set(
          (x - cols / 2) * cell,
          ((rows - 1 - y) - rows / 2) * cell,
          depth / 2
        );
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);

        // slight saturation boost for vibrancy
        col.setRGB(r, g, b);
        const hsl = { h: 0, s: 0, l: 0 };
        col.getHSL(hsl);
        hsl.s = Math.min(1, hsl.s * 1.15);
        col.setHSL(hsl.h, hsl.s, hsl.l);

        if (mesh.setColorAt) mesh.setColorAt(idx, col);
        idx++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // frustum culling can skip the whole mesh when offscreen
    mesh.frustumCulled = true;

    return { mesh, width: cols * cell, height: rows * cell };
  }
}
