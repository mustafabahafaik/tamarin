"""Tamarini arka plandan ayırıp şeffaf WebP olarak assets/ klasörüne kaydeder.

Kullanım (proje kökünden):
    python tools/cut_tamarin.py                          # referans/tasarim.gif karelerinden
    python tools/cut_tamarin.py --photo referans/tamarin.jpg   # gerçek bir fotoğraftan

Gerekli: rembg ve Pillow  (python -m pip install --user "rembg[cpu]")
İlk çalıştırmada rembg modeli (~170 MB) indirir.

GIF kaynağında kırpma kutusu sabittir (CROP); css/style.css'teki .tamarin konumu
bu kutuya göre ayarlıdır: kutunun sol üstü halka merkezine göre (-120.5, -107),
kenarı 224 GIF pikseli. Fotoğraf kullanılırsa kafa + bıyıklar otomatik kırpılır
ve aynı kare kutuya ortalanır; gerekirse CSS'teki konum elle ince ayarlanır.
"""
import argparse
import colorsys
import math
from pathlib import Path

from PIL import Image, ImageFilter
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
GIF = ROOT / "referans" / "tasarim.gif"

# GIF koordinatlarında tamarin kafası + bıyıklar (kulaklar ve bıyık uçları dahil).
CROP = (98, 88, 322, 312)
FRAMES = {"tamarin.webp": 0, "tamarin-blink.webp": 4}  # 0: gözler açık, 4: kapalı
SCALE = 3  # kaynak küçük; büyütüp öyle kesmek kenarları yumuşatır

# GIF'teki halka: merkez, iç/dış yarıçap ve dilim ikonlarının kutuları (GIF pikseli).
RING_C = (218.5, 195.0)
R_IN, R_OUT = 96, 137
ICON_BOXES = [(117, 105, 147, 132), (284, 105, 321, 131), (113, 252, 145, 281), (294, 251, 322, 281)]
EAR_SECTORS = [(192, 222), (308, 342)]  # derece; 0 = sağ, 90 = aşağı (ekran koordinatı)


def clamp(value: float) -> float:
    return min(1.0, max(0.0, value))


def gif_frame(index: int) -> Image.Image:
    gif = Image.open(GIF)
    gif.seek(index)
    return gif.convert("RGB")


def cut(image: Image.Image, session) -> Image.Image:
    big = image.resize((image.width * SCALE, image.height * SCALE), Image.LANCZOS)
    big = big.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    return remove(
        big,
        session=session,
        alpha_matting=True,  # bıyık ve tüy kenarları için ince alfa
        alpha_matting_foreground_threshold=235,
        alpha_matting_background_threshold=12,
        alpha_matting_erode_size=8,
        post_process_mask=True,
    )


def clean_ring(rgba: Image.Image, source: Image.Image) -> Image.Image:
    """GIF kaynağında rembg'nin yakaladığı halka parçalarını siler.

    Halka (merkez RING_C, yarıçap R_IN..R_OUT) dışındaki her şey arka plandır. Halka bandının
    içinde yalnızca dilim renginde (doygun) pikseller ve ikon kutuları silinir; beyaz bıyıklar ve
    koyu tüyler halkanın üstüne taşmaya devam eder (tasarımdaki gibi).
    """
    s = SCALE
    cx, cy = (RING_C[0] - CROP[0]) * s, (RING_C[1] - CROP[1]) * s
    alpha = rgba.getchannel("A")
    a, src = alpha.load(), source.load()
    icons = [tuple(v * s for v in ((x0 - CROP[0] - 3), (y0 - CROP[1] - 3), (x1 - CROP[0] + 3), (y1 - CROP[1] + 3)))
             for x0, y0, x1, y1 in ICON_BOXES]
    for y in range(rgba.height):
        for x in range(rgba.width):
            if not a[x, y]:
                continue
            r = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / s
            if r > R_OUT:
                a[x, y] = 0
                continue
            if any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in icons):
                a[x, y] = 0
                continue
            red, green, blue = src[x, y]
            top = max(red, green, blue)
            sat = (top - min(red, green, blue)) / top if top else 0
            angle = math.degrees(math.atan2(y - cy, x - cx)) % 360
            in_ear = any(lo <= angle <= hi for lo, hi in EAR_SECTORS)
            keep = 1.0
            if r >= R_IN - 26:
                # Deliğin kenarı: dilimlerin içe vuran renkli ışığı (doygun, orta parlaklık) gider.
                # Kulak açılarında tüyler turuncu/mavi yansıma taşır; orada yalnızca saf dilim rengi gider.
                limit = 0.75 if in_ear else 0.4
                if top > 45 and sat > limit:
                    keep = clamp((limit + 0.2 - sat) / 0.2)
            if r >= R_IN - 6:
                # Bıyık: parlak ve az doygun. Kenarları yumuşak geçsin diye rampalı.
                whisker = clamp((top - 100) / 70) * clamp((0.5 - sat) / 0.2)
                # Kulaklar halkanın iç kenarına biraz taşar; yalnızca o açılarda koyu tüy kalır.
                ear = 1.0 if in_ear and r < R_IN + 16 and sat < 0.75 else 0.0
                band = max(whisker, ear)
                w = clamp((r - (R_IN - 6)) / 8)  # bant sınırında sert daire olmasın
                keep = min(keep, (1 - w) + w * band)
            a[x, y] = round(a[x, y] * keep)

    # Kulak bölgesindeki tek tük lekeleri ve delikleri medyan filtresiyle kapat
    # (bıyıklar bu açıların dışında, ince telleri bozulmaz).
    smooth = alpha.filter(ImageFilter.MedianFilter(7)).load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / s
            if not R_IN - 24 <= r <= R_IN + 18:
                continue
            angle = math.degrees(math.atan2(y - cy, x - cx)) % 360
            if any(lo - 4 <= angle <= hi + 4 for lo, hi in EAR_SECTORS):
                a[x, y] = smooth[x, y]
    rgba.putalpha(alpha)
    return rgba


def warm_grade(rgba: Image.Image) -> Image.Image:
    """"Toprak" temasına uyan renk düzeltmesi.

    GIF'teki tamarin neon ışıkla aydınlatılmıştı: koyu tüylerde ve bıyıklarda mavi/mor/yeşil
    yansımalar var. Koyu tonların ve soğuk renklerin doygunluğu düşürülür, sonra hafifçe ısıtılır.
    Pembe burun ve dudak (kırmızı-turuncu-pembe tonlar, parlak) korunur.
    """
    px = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            deg = hue * 360
            if val < 0.55:
                sat *= 0.35          # koyu tüy: renk yansımasını sil
            elif 90 <= deg <= 300:
                sat *= 0.35          # bıyıktaki yeşil/mavi/mor yansıma
            r, g, b = colorsys.hsv_to_rgb(hue, sat, val)
            px[x, y] = (min(255, round(r * 255 * 1.03 + 2)), round(g * 255), round(b * 255 * 0.94), a)
    return rgba


def square_on_subject(rgba: Image.Image, margin: float = 0.06) -> Image.Image:
    """Fotoğraf kaynağı için: alfa sınırına göre kare kırp (kafa + bıyık)."""
    box = rgba.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    left, top, right, bottom = box
    side = max(right - left, bottom - top) * (1 + 2 * margin)
    cx, cy = (left + right) / 2, (top + bottom) / 2
    square = Image.new("RGBA", (round(side), round(side)), (0, 0, 0, 0))
    square.paste(rgba, (round(side / 2 - cx), round(side / 2 - cy)))
    return square


def save(rgba: Image.Image, name: str) -> None:
    OUT.mkdir(exist_ok=True)
    rgba.save(OUT / name, "WEBP", quality=88, method=6, exact=False)
    print(f"assets/{name}  {rgba.width}x{rgba.height}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--photo", type=Path, help="GIF yerine gerçek fotoğraf")
    parser.add_argument("--model", default="isnet-general-use", help="rembg modeli")
    args = parser.parse_args()

    session = new_session(args.model)
    if args.photo:
        rgba = square_on_subject(cut(Image.open(args.photo).convert("RGB"), session))
        save(warm_grade(rgba.resize((672, 672), Image.LANCZOS)), "tamarin.webp")
        print("Fotoğrafta göz kırpma karesi yok; assets/tamarin-blink.webp eski haliyle kalır.")
        return

    for name, index in FRAMES.items():
        crop = gif_frame(index).crop(CROP)
        big = crop.resize((crop.width * SCALE, crop.height * SCALE), Image.LANCZOS)
        save(warm_grade(clean_ring(cut(crop, session), big)), name)


if __name__ == "__main__":
    main()
