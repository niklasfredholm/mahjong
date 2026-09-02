"""Generate the app icons: a mahjong tile on green felt.

Drawn at 4x and downsampled, which is cheaper than pulling in an SVG
rasteriser and keeps the icon consistent with the in-game tile art.
"""
from PIL import Image, ImageDraw

FELT_TOP, FELT_BOTTOM = (33, 96, 72), (16, 54, 42)
IVORY, IVORY_SIDE, EDGE = (253, 248, 236), (169, 154, 120), (205, 191, 157)
BLUE, RED = (28, 79, 134), (179, 37, 31)
SS = 4  # supersample factor


def felt(size):
    """Vertical gradient background."""
    img = Image.new("RGB", (1, size))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(FELT_TOP, FELT_BOTTOM))
    return img.resize((size, size), Image.NEAREST)


def draw_tile(d, cx, cy, w, h):
    """An ivory tile with a visible right/bottom side, and four pips."""
    depth = w * 0.11
    x0, y0 = cx - w / 2, cy - h / 2
    r = w * 0.16
    # side/edge slab, offset down-right
    d.rounded_rectangle([x0 + depth, y0 + depth, x0 + w, y0 + h], r, fill=IVORY_SIDE)
    # face
    d.rounded_rectangle([x0, y0, x0 + w - depth, y0 + h - depth], r, fill=IVORY, outline=EDGE,
                        width=max(1, int(w * 0.012)))
    fw, fh = w - depth, h - depth
    pr = fw * 0.135                       # pip radius
    ring = max(1, int(pr * 0.34))
    for ox in (-0.21, 0.21):
        for oy in (-0.20, 0.20):
            px_, py_ = x0 + fw / 2 + fw * ox, y0 + fh / 2 + fh * oy
            d.ellipse([px_ - pr, py_ - pr, px_ + pr, py_ + pr],
                      fill=(251, 251, 251), outline=BLUE, width=ring)
            ir = pr * 0.36
            d.ellipse([px_ - ir, py_ - ir, px_ + ir, py_ + ir], fill=RED)


def make(size, maskable=False):
    S = size * SS
    img = felt(S).convert("RGBA")
    if not maskable:                       # rounded app-icon silhouette
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], S * 0.22, fill=255)
        img.putalpha(mask)
    d = ImageDraw.Draw(img)
    # Maskable icons get cropped to a circle, so keep the tile inside the safe zone.
    scale = 0.50 if maskable else 0.62
    tw = S * scale
    draw_tile(d, S / 2, S / 2, tw, tw * 1.34)
    return img.resize((size, size), Image.LANCZOS)


for n in (192, 512):
    make(n).save(f"icons/icon-{n}.png")
for n in (192, 512):
    make(n, maskable=True).save(f"icons/icon-maskable-{n}.png")
print("icons written")
