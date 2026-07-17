"""One-time offline background removal.

The source avatar is shot on a stadium pitch. Keying it in the shader failed:
the grass in her shadow is chromatically neutral (g - max(r,b) == 0.000),
which is indistinguishable from her cream coat by hue alone. So we segment it
properly here, once, and ship a PNG with a real alpha channel. The runtime
shader then just reads alpha — no keying, no magic constants.

Run:  python tools/cutout.py
Out:  public/gurleen-cut.png
"""
import numpy as np
from PIL import Image, ImageFilter
from skimage import exposure
from rembg import remove, new_session

SRC = "public/gurleen.jpg"
OUT = "public/gurleen-cut.png"
SIZE = 512
SRC_KERNEL = 64  # CLAHE neighbourhood, in source px — roughly face-sized

src = Image.open(SRC).convert("RGB")
cut = remove(src, session=new_session("u2net_human_seg"))
cut = cut.convert("RGBA")

a = np.asarray(cut).astype(np.float32)
alpha = a[..., 3]
cov = (alpha > 8).mean()
print(f"subject coverage: {cov:.1%}")
if not 0.10 < cov < 0.85:
    raise SystemExit(f"segmentation looks wrong (coverage {cov:.1%}) — aborting")

# De-spill. She was shot against a sunlit pitch, so the hair edge carries a
# green rim; the duotone ramp would render that rim as a bright halo. Clamp
# green to the r/b average wherever it exceeds it.
rgb = a[..., :3]
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
limit = (r + b) * 0.5
spill = np.maximum(g - limit, 0)
rgb[..., 1] = np.minimum(g, limit)
# put the removed energy back as luminance so the hair doesn't go magenta
rgb[..., 0] = np.clip(r + spill * 0.5, 0, 255)
rgb[..., 2] = np.clip(b + spill * 0.5, 0, 255)
a[..., :3] = rgb

# Local contrast (CLAHE) on luminance only.
#
# The photo lights her coat 1.57x brighter than her face, so ANY faithful
# global tone curve renders the face darker than the jacket — that's the
# photograph, not the shader, and brightening globally just blows the coat to
# white. CLAHE equalises within local neighbourhoods, so her face is lifted
# against its own surroundings and the features actually resolve.
#
# Chroma is preserved by scaling RGB by the luminance ratio rather than
# equalising each channel (which would wreck her skin tone).
rgb = a[..., :3] / 255
lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
subject = alpha > 128

eq = exposure.equalize_adapthist(
    np.clip(lum, 0, 1), kernel_size=SRC_KERNEL, clip_limit=0.010
)
# blend, and only inside the matte — equalising the transparent surround
# would drag its noise up into view
strength = np.where(subject, 0.65, 0.0).astype(np.float32)
target = lum * (1 - strength) + eq * strength

ratio = np.where(lum > 1e-3, target / np.maximum(lum, 1e-3), 1.0)
ratio = np.clip(ratio, 0.0, 2.6)[..., None]
a[..., :3] = np.clip(rgb * ratio, 0, 1) * 255

cut = Image.fromarray(a.astype(np.uint8), "RGBA")

# Feather the matte a touch. Hard alpha edges turn into a visible cut-out
# rectangle of points; a soft edge lets the cloud dissolve at the silhouette.
soft = Image.fromarray(alpha.astype(np.uint8)).filter(
    ImageFilter.GaussianBlur(1.6)
)

cut = Image.merge("RGBA", (*cut.split()[:3], soft))

# Crop to her bounding box. Without this ~60% of the texture is transparent
# padding, and the point grid burns most of its resolution on empty space —
# which is exactly why the face read as an unresolved blob.
ys, xs = np.where(np.asarray(cut)[..., 3] > 8)
x0, x1 = xs.min(), xs.max()
y0, y1 = ys.min(), ys.max()
pad = int(max(x1 - x0, y1 - y0) * 0.04)
x0, y0 = max(x0 - pad, 0), max(y0 - pad, 0)
x1, y1 = min(x1 + pad, cut.width), min(y1 + pad, cut.height)
cut = cut.crop((x0, y0, x1, y1))

# Square-pad so the point grid maps 1:1 without stretching her face.
w, h = cut.size
side = max(w, h)
canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
canvas.paste(cut, ((side - w) // 2, (side - h) // 2))
canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)
canvas.save(OUT)

fill = (np.asarray(canvas)[..., 3] > 8).mean()
print(f"wrote {OUT} ({SIZE}x{SIZE}) — subject now fills {fill:.1%} of texture")
