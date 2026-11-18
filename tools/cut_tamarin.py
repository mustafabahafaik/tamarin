"""Tamarini arka plandan ayırıp şeffaf WebP olarak assets/ klasörüne kaydeder.

Kullanım (proje kökünden):
    python tools/cut_tamarin.py --photo referans/tamarin.jpg   # gerçek fotoğraf (asıl yol)
    python tools/cut_tamarin.py                          # eski yol: referans/tasarim.gif karelerinden

Gerekli: rembg, pymatting, numpy ve Pillow  (python -m pip install --user "rembg[cpu]")
İlk çalıştırmada rembg modeli (isnet-general-use, ~170 MB) indirir.

FOTOĞRAF YOLU (referans/tamarin.jpg, 1600x1067):
  1. rembg (isnet) ile yumuşak maske; maskenin kesin iç/dış kısmından trimap, arada pymatting
     closed-form alfa (bıyık ve kulak çevresindeki tek tek kıllar için).
  2. Renk arındırma (decontamination): pymatting estimate_foreground_ml; kenar piksellerinin rengi
     içerideki kürk rengine çekilir, yeşil/kahve arka plan saçağı kalmaz.
  3. Kadraj halka geometrisine göre: kare, halkanın dış çapı kadar (2 x 137u). Halka merkezi gözlerin
     ortasının 12u altında (gözler merkezin hafif üstünde). Ölçek SCALE_U (u / fotoğraf pikseli).
  4. Halka maskesi: deliğin içinde her şey kalır; halka bandında (R_IN..R_OUT) yalnızca bıyık telleri
     (parlak, az doygun) kalır, koyu kürk yumuşakça kaybolur. Üstte kulaklar iç kenara biraz taşar;
     altta omuzlar geniş bir alfa geçişiyle erir.
  5. Renk: doğal; yalnızca çok hafif sıcaklık (+%4). Doygunluk artırma, keskinleştirme, HDR yok.
  6. Göz kırpma YOK: fotoğrafta kapalı göz karesi yok; kürkten sentezlenen kapak yakından yapay
     göründüğü için (gri oval, belli kenar) kaldırıldı.
  7. Çıktı: assets/tamarin-1152.webp ve tamarin-768.webp, WebP kalite 88, alfa kanallı. Fotoğrafın üst
     kenarı kafanın tepesini kestiği için tepe TOP_FADE pikselde yumuşakça erir.
     css/style.css'te .tamarin kutusu halka merkezli, kenarı 274u; <img srcset> ile doğru boy yüklenir.
"""
import argparse
import colorsys
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
GIF = ROOT / "referans" / "tasarim.gif"

R_IN, R_OUT = 96, 137  # halka iç / dış yarıçapı (u = tasarım pikseli; js/face.js ile aynı)

# --- Fotoğraf yolu (referans/tamarin.jpg) ---
EYES = ((650, 297), (824, 288))  # göz merkezleri (fotoğraf pikseli)
SCALE_U = 0.245                  # u / fotoğraf pikseli: yüz + bıyık halkaya bu ölçekte oturur
EYES_ABOVE = 12                  # gözlerin ortası, halka merkezinin bu kadar u üstünde
SIZES = (1152, 768)              # çıktı genişlikleri (kare)
WARMTH = 0.04                    # çok hafif sıcaklık
TOP_FADE = 70                    # fotoğrafın üst kenarından itibaren alfa geçişi (piksel)

# --- Eski GIF yolu ---
CROP = (98, 88, 322, 312)
FRAMES = {"tamarin.webp": 0, "tamarin-blink.webp": 4}
SCALE = 3
RING_C = (218.5, 195.0)
ICON_BOXES = [(117, 105, 147, 132), (284, 105, 321, 131), (113, 252, 145, 281), (294, 251, 322, 281)]
EAR_SECTORS = [(192, 222), (308, 342)]


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ============================== Fotoğraf yolu ==============================

def matte(photo: Image.Image, session) -> tuple:
    """(rgb float 0..1, alfa float 0..1, arındırılmış ön plan rengi) döndürür."""
    from pymatting import estimate_alpha_cf, estimate_foreground_ml
    from rembg import remove

    rgb = np.asarray(photo, dtype=np.float64) / 255.0
    soft = np.asarray(remove(photo, session=session, only_mask=True, post_process_mask=False), dtype=np.float64) / 255.0
    # Trimap: maskenin kesin kısımları sabit, arası (kıllar, bıyık uçları) bilinmeyen.
    sure_fg = np.asarray(Image.fromarray((soft > 0.94).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(7))) > 0
    sure_bg = np.asarray(Image.fromarray((soft < 0.04).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(9))) > 0
    trimap = np.full(soft.shape, 0.5)
    trimap[sure_fg] = 1.0
    trimap[sure_bg] = 0.0
    alpha = estimate_alpha_cf(rgb, trimap, laplacian_kwargs={"epsilon": 1e-6}, cg_kwargs={"maxiter": 2000})
    alpha = np.clip(alpha, 0, 1)
    # Modelin yumuşak maskesi bıyık tellerini iyi tutuyor: ikisinin büyüğü (tel kopmasın).
    alpha = np.maximum(alpha, soft * (soft > 0.25))
    fg = estimate_foreground_ml(rgb, alpha)  # renk arındırma
    return rgb, alpha, np.clip(fg, 0, 1)


def ring_frame(fg: np.ndarray, alpha: np.ndarray) -> tuple:
    """Halka merkezli kare kadraj (kenar 2*R_OUT u). (ön plan, alfa, kenar_px, merkez) döndürür."""
    mid = ((EYES[0][0] + EYES[1][0]) / 2, (EYES[0][1] + EYES[1][1]) / 2)
    cx, cy = mid[0], mid[1] + EYES_ABOVE / SCALE_U
    side = round(2 * R_OUT / SCALE_U)
    x0, y0 = round(cx - side / 2), round(cy - side / 2)
    h, w = alpha.shape
    out_fg = np.zeros((side, side, 3))
    out_a = np.zeros((side, side))
    sx0, sy0, sx1, sy1 = max(0, x0), max(0, y0), min(w, x0 + side), min(h, y0 + side)
    out_fg[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = fg[sy0:sy1, sx0:sx1]
    out_a[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = alpha[sy0:sy1, sx0:sx1]
    return out_fg, out_a, side, (cx - x0, cy - y0)


def ring_mask(fg: np.ndarray, side: int, center: tuple) -> np.ndarray:
    """Halka bandında yalnızca bıyık kalsın; koyu kürk deliğin kenarında erisin (üstte kulak payı, altta geniş geçiş)."""
    yy, xx = np.mgrid[0:side, 0:side].astype(np.float64)
    dx, dy = (xx - center[0]) * SCALE_U, (yy - center[1]) * SCALE_U  # u cinsinden
    r = np.hypot(dx, dy)
    up = np.clip(-dy / np.maximum(r, 1e-6), -1, 1)  # 1 = tam yukarı, -1 = tam aşağı
    # Koyu kürk için bitiş yarıçapı: üstte R_IN+10 (kulaklar iç kenara taşar), altta R_IN-4 ve geniş geçiş.
    t = (up + 1) / 2
    end = (R_IN - 4) + t * 14
    width = 34 - t * 26  # altta 34u, üstte 8u geçiş
    fur = 1 - smoothstep(end - width, end, r)
    # Bıyık telleri: parlak ve az doygun.
    mx, mn = fg.max(2), fg.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    lum = fg @ np.array([0.299, 0.587, 0.114])
    whisker = smoothstep(0.42, 0.66, lum) * (1 - smoothstep(0.16, 0.32, sat))
    whisker *= 1 - smoothstep(R_OUT - 8, R_OUT + 1, r)
    return np.maximum(fur, whisker)


def warm(fg: np.ndarray) -> np.ndarray:
    out = fg.copy()
    out[..., 0] *= 1 + WARMTH * 0.75
    out[..., 2] *= 1 - WARMTH * 0.75
    return np.clip(out, 0, 1)


def save_rgba(fg: np.ndarray, alpha: np.ndarray, stem: str) -> None:
    OUT.mkdir(exist_ok=True)
    rgba = np.dstack([fg, alpha])
    img = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA")
    for size in SIZES:
        out = img.resize((size, size), Image.LANCZOS)
        name = f"{stem}-{size}.webp"
        out.save(OUT / name, "WEBP", quality=88, method=6, exact=False)
        print(f"assets/{name}  {size}x{size}  {(OUT / name).stat().st_size // 1024} KB")


def photo_main(path: Path, model: str) -> None:
    from rembg import new_session

    photo = Image.open(path).convert("RGB")
    _, alpha, fg = matte(photo, new_session(model))
    # Fotoğrafın üst kenarı kafanın tepesini keser: düz bir çizgi kalmasın, tepe kürkü yumuşakça erisin.
    rows = np.arange(alpha.shape[0], dtype=np.float64)[:, None]
    alpha = alpha * smoothstep(0, TOP_FADE, rows)
    cfg, ca, side, center = ring_frame(fg, alpha)
    ca = ca * ring_mask(cfg, side, center)
    save_rgba(warm(cfg), ca, "tamarin")
    print(f"kare {side}px (fotoğraf pikseli), merkez {tuple(round(v) for v in center)}, ölçek {SCALE_U} u/px")


# ============================== Eski GIF yolu ==============================

def clamp(value: float) -> float:
    return min(1.0, max(0.0, value))


def gif_main(session) -> None:
    from rembg import remove

    def cut(image):
        big = image.resize((image.width * SCALE, image.height * SCALE), Image.LANCZOS)
        return remove(big, session=session, alpha_matting=True, alpha_matting_foreground_threshold=235,
                      alpha_matting_background_threshold=12, alpha_matting_erode_size=8, post_process_mask=True)

    for name, index in FRAMES.items():
        gif = Image.open(GIF)
        gif.seek(index)
        crop = gif.convert("RGB").crop(CROP)
        rgba = cut(crop)
        px = rgba.load()
        for y in range(rgba.height):
            for x in range(rgba.width):
                r, g, b, a = px[x, y]
                if a:
                    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                    s *= 0.35 if v < 0.55 or 90 <= h * 360 <= 300 else 1
                    r, g, b = colorsys.hsv_to_rgb(h, s, v)
                    px[x, y] = (min(255, round(r * 255 * 1.03 + 2)), round(g * 255), round(b * 255 * 0.94), a)
        OUT.mkdir(exist_ok=True)
        rgba.save(OUT / name, "WEBP", quality=88, method=6)
        print(f"assets/{name}  (eski GIF yolu; css'teki .tamarin kutusu buna göre değil)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--photo", type=Path, help="gerçek fotoğraf (asıl yol)")
    parser.add_argument("--model", default="isnet-general-use", help="rembg modeli")
    args = parser.parse_args()
    if args.photo:
        photo_main(args.photo, args.model)
        return
    from rembg import new_session
    gif_main(new_session(args.model))


if __name__ == "__main__":
    main()
