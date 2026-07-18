"""Remove the stadium background from the caricature, leaving the character on
transparency for use as a cutout in the 3D office scene.

Out: public/caricature-cut.png (tightly cropped to the subject, square-padded)
"""
import numpy as np
from PIL import Image, ImageFilter
from rembg import remove, new_session

SRC = "caricature.jpg"
OUT = "public/caricature-cut.png"

src = Image.open(SRC).convert("RGB")
cut = remove(src, session=new_session("u2net_human_seg")).convert("RGBA")

a = np.asarray(cut)
alpha = a[..., 3]
cov = (alpha > 8).mean()
print(f"subject coverage: {cov:.1%}")
if not 0.10 < cov < 0.95:
    raise SystemExit(f"segmentation looks off (coverage {cov:.1%}) — aborting")

# de-spill: the hair edge carries a green rim from the grass; clamp green to
# the r/b average wherever it exceeds it, so no green halo survives
rgb = a[..., :3].astype(np.float32)
r, gg, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
limit = (r + b) * 0.5
spill = np.maximum(gg - limit, 0)
rgb[..., 1] = np.minimum(gg, limit)
rgb[..., 0] = np.clip(r + spill * 0.4, 0, 255)
rgb[..., 2] = np.clip(b + spill * 0.4, 0, 255)
a = np.dstack([rgb.astype(np.uint8), alpha])
cut = Image.fromarray(a, "RGBA")

# feather the matte edge a hair so the cutout doesn't have a hard sticker edge
soft = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1.2))
cut = Image.merge("RGBA", (*cut.split()[:3], soft))

# crop to the subject's bounding box, then pad to a square so the plane's
# aspect in three.js is predictable
ys, xs = np.where(np.asarray(cut)[..., 3] > 8)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
pad = int(max(x1 - x0, y1 - y0) * 0.04)
x0, y0 = max(x0 - pad, 0), max(y0 - pad, 0)
x1, y1 = min(x1 + pad, cut.width), min(y1 + pad, cut.height)
cut = cut.crop((x0, y0, x1, y1))

cut.save(OUT)
print(f"wrote {OUT}  ({cut.width}x{cut.height})")
