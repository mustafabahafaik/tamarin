"""Tamarin ikonlarını üretir: "Toprak" teması — sıcak koyu zemin, mat 4 renkli halka, ortada tamarin.

Kullanım (proje kökünden):  python tools/make_icons.py
Gerekli: Pillow. Önce assets/tamarin-1152.webp olmalı (tools/cut_tamarin.py --photo üretir).

Geometri yüz ekranıyla aynıdır (js/face.js): halka iç/dış yarıçapı 96/137, dilim arası 25,
köşe 8; tamarin kutusu halka merkezli, kenarı 274 (halkanın dış çapı). Hepsi `k` ile ölçeklenir.
Zemin saydamsızdır; iOS köşeleri kendisi yuvarlar.
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
TAMARIN = ROOT / "assets" / "tamarin-1152.webp"

BG = (22, 18, 15)        # --bg (#16120f)
BG_LIGHT = (31, 26, 22)  # --bg-light: ortadaki hafif aydınlık
R_IN, R_OUT, GAP, CORNER = 96, 137, 12.5, 8

# css/style.css'teki kategori tonları: (açık uç, orta, koyu uç); degradenin iki ucu.
SLICES = {
    "bills": dict(rot=270, stops=("#cf7048", "#c4633f", "#b45a38"), a=(-118, -14), b=(-14, -118)),
    "school": dict(rot=0, stops=("#6a88a5", "#5d7b98", "#526f8b"), a=(14, -118), b=(118, -14)),
    "tasks": dict(rot=90, stops=("#8fa16c", "#829461", "#748656"), a=(118, 14), b=(14, 118)),
    "days": dict(rot=180, stops=("#c48591", "#b97683", "#a86a77"), a=(-118, 14), b=(-14, 118)),
}
SUPERSAMPLE = 3


def hex_rgb(value: str) -> tuple:
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


def arc_points(cx, cy, r, a0, a1, steps):
    return [(cx + r * math.cos(a0 + (a1 - a0) * t / steps), cy + r * math.sin(a0 + (a1 - a0) * t / steps))
            for t in range(steps + 1)]


def corner(center, a0, a1):
    """Köşe yuvarlaması: iki teğet nokta arasındaki kısa yay."""
    while a1 - a0 > math.pi:
        a1 -= 2 * math.pi
    while a0 - a1 > math.pi:
        a1 += 2 * math.pi
    return arc_points(*center, CORNER, a0, a1, 8)


def slice_polygon(rot_deg: float) -> list:
    """Sağ üst dilimin (yuvarlatılmış köşeli çeyrek halka) noktaları, `rot_deg` kadar döndürülmüş."""
    k = GAP + CORNER
    fo = (k, -math.sqrt((R_OUT - CORNER) ** 2 - k ** 2))   # üst uç dış köşe merkezi
    fo2 = (math.sqrt((R_OUT - CORNER) ** 2 - k ** 2), -k)  # sağ uç dış köşe
    fi2 = (math.sqrt((R_IN + CORNER) ** 2 - k ** 2), -k)   # sağ uç iç köşe
    fi = (k, -math.sqrt((R_IN + CORNER) ** 2 - k ** 2))    # üst uç iç köşe
    ang = lambda p: math.atan2(p[1], p[0])
    pts = []
    pts += corner(fo, math.pi, ang(fo))                       # üst uç → dış yay
    pts += arc_points(0, 0, R_OUT, ang(fo), ang(fo2), 64)     # dış yay
    pts += corner(fo2, ang(fo2), math.pi / 2)                 # → sağ uç
    pts += corner(fi2, math.pi / 2, ang(fi2) + math.pi)       # sağ uç → iç yay
    pts += arc_points(0, 0, R_IN, ang(fi2), ang(fi), 48)      # iç yay (geri)
    pts += corner(fi, ang(fi) + math.pi, math.pi)             # → üst uç
    a = math.radians(rot_deg)
    return [(x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)) for x, y in pts]


def gradient_fill(size, poly, stops, a, b):
    """Poligonu iki uç arasında 3 duraklı doğrusal degradeyle boyar (RGBA katman)."""
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px, m = layer.load(), mask.load()
    c = [hex_rgb(s) for s in stops]
    ax, ay = a
    dx, dy = b[0] - a[0], b[1] - a[1]
    length2 = dx * dx + dy * dy
    x0, y0, x1, y1 = mask.getbbox()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if not m[x, y]:
                continue
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / length2))
            lo, hi, u = (c[0], c[1], t / 0.45) if t < 0.45 else (c[1], c[2], (t - 0.45) / 0.55)
            px[x, y] = tuple(round(lo[i] + (hi[i] - lo[i]) * u) for i in range(3)) + (m[x, y],)
    return layer


def draw_icon(size: int, ring_radius: float) -> Image.Image:
    """ring_radius: halkanın dış yarıçapı, ikon kenarına oranla (0.5 = kenara değer)."""
    S = size * SUPERSAMPLE
    k = ring_radius * S / R_OUT
    cx = cy = S / 2
    to_px = lambda pts: [(cx + x * k, cy + y * k) for x, y in pts]

    img = Image.new("RGBA", (S, S), BG + (255,))
    # Ortada hafif, sıcak bir aydınlık (parlama ya da renkli leke yok)
    light = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(light).ellipse([0.1 * S, 0.1 * S, 0.9 * S, 0.9 * S], fill=BG_LIGHT + (255,))
    img.alpha_composite(light.filter(ImageFilter.GaussianBlur(0.14 * S)))

    slices = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    for spec in SLICES.values():
        poly = to_px(slice_polygon(spec["rot"]))
        a = (cx + spec["a"][0] * k, cy + spec["a"][1] * k)
        b = (cx + spec["b"][0] * k, cy + spec["b"][1] * k)
        slices.alpha_composite(gradient_fill(S, poly, spec["stops"], a, b))
    img.alpha_composite(slices)

    tamarin = Image.open(TAMARIN).convert("RGBA")
    box = round(274 * k)
    tamarin = tamarin.resize((box, box), Image.LANCZOS)  # küçültme: yüz keskin kalır
    img.alpha_composite(tamarin, (round(cx - box / 2), round(cy - box / 2)))

    return img.convert("RGB").resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    targets = {
        "apple-touch-icon.png": (180, 0.47),
        "icon-192.png": (192, 0.47),
        "icon-512.png": (512, 0.47),
        "maskable-512.png": (512, 0.36),  # maskable: içerik ortadaki %80'lik daireye sığmalı
    }
    for name, (size, ring) in targets.items():
        draw_icon(size, ring).save(OUT / name, optimize=True)
        print(f"icons/{name}  {size}x{size}")


if __name__ == "__main__":
    main()
