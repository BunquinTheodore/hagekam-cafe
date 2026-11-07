"""Builds the site's animated WebP "GIFs": a drink flipbook and three brand stickers.

Usage (from the project root): python scripts/gifs.py
Animated WebP is used instead of GIF because it is 5 to 10 times smaller at the same quality.
"""
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'gif'
FONTS = Path(os.environ.get('HAGEKAM_FONTS', 'C:/Windows/Fonts'))  # needs georgiaz.ttf, arialbd.ttf, bahnschrift.ttf
SS = 3  # supersampling factor for smooth edges

ESPRESSO = (43, 20, 9)
ROAST = (59, 35, 19)
CARAMEL = (201, 138, 58)
PEACH = (255, 206, 147)
CREAM = (254, 252, 240)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def merge_repeats(frames, duration):
    """Folds runs of identical frames into one longer frame, so a held pose costs no extra bytes."""
    merged, durations = [], []
    for frame in frames:
        if merged and frame.tobytes() == merged[-1].tobytes():
            durations[-1] += duration
        else:
            merged.append(frame); durations.append(duration)
    return merged, durations


def report(name):
    print(name, (OUT / name).stat().st_size // 1024, 'KB')


def save(frames, name, duration, quality=58):
    """Saves an animated sticker plus a first-frame still for prefers-reduced-motion."""
    frames, durations = merge_repeats(frames, duration)
    frames[0].save(OUT / name, save_all=True, append_images=frames[1:], duration=durations,
                   loop=0, quality=quality, method=6, lossless=False, minimize_size=True)
    still = name.replace('.webp', '-still.webp')
    frames[0].save(OUT / still, quality=80, method=6)
    report(name); report(still)


def drink_flipbook(name, size, steps, quality):
    """Crossfades between same-ratio (4:5) drink photos, so nothing is cropped."""
    names = ['artisan-coffee', 'matcha-tiramisu', 'mango-biscoff', 'tara-kape', 'frappe-croffle']
    shots = [Image.open(ROOT / 'public' / 'img' / f'{n}-480.webp').convert('RGB').resize(size, Image.LANCZOS) for n in names]
    blend_ms = 300 // steps
    frames, durations = [], []
    for i, shot in enumerate(shots):
        nxt = shots[(i + 1) % len(shots)]
        frames.append(shot); durations.append(1600)
        for step in range(1, steps):
            t = step / steps
            frames.append(Image.blend(shot, nxt, t * t * (3 - 2 * t))); durations.append(blend_ms)
    frames[0].save(OUT / name, save_all=True, append_images=frames[1:], duration=durations,
                   loop=0, quality=quality, method=6)
    report(name)


def steaming_cup(count=16, out=150):
    w = h = 180 * SS
    frames = []
    for f in range(count):
        t = f / count * math.tau
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        # saucer, cup, handle
        d.ellipse([28 * SS, 142 * SS, 152 * SS, 162 * SS], fill=CREAM)
        d.rounded_rectangle([46 * SS, 92 * SS, 126 * SS, 150 * SS], radius=22 * SS, fill=CREAM)
        d.ellipse([112 * SS, 102 * SS, 146 * SS, 134 * SS], outline=CREAM, width=8 * SS)
        d.ellipse([46 * SS, 84 * SS, 126 * SS, 100 * SS], fill=CREAM)
        d.ellipse([52 * SS, 87 * SS, 120 * SS, 97 * SS], fill=ROAST)
        d.ellipse([74 * SS, 89 * SS, 98 * SS, 95 * SS], fill=CARAMEL)
        # three wavy steam wisps that drift upward
        for k, x0 in enumerate((70, 86, 102)):
            pts = []
            for y in range(78, 14, -3):
                phase = t + k * 2.1 + y * 0.09
                pts.append(((x0 + math.sin(phase) * 7) * SS, y * SS))
            alpha = int(150 + 90 * math.sin(t + k))
            d.line(pts, fill=PEACH + (alpha,), width=5 * SS, joint='curve')
        frames.append(im.resize((out, out), Image.LANCZOS))
    save(frames, 'steaming-cup.webp', 105)


def tara_kape(count=12, out=(220, 118)):
    w, h = 280 * SS, 150 * SS
    title = font('georgiaz.ttf', 31 * SS)
    small = font('arialbd.ttf', 12 * SS)
    frames = []
    for f in range(count):
        t = f / count * math.tau
        badge = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(badge)
        d.rounded_rectangle([22 * SS, 30 * SS, 258 * SS, 120 * SS], radius=45 * SS, fill=PEACH, outline=ESPRESSO, width=4 * SS)
        d.text((140 * SS, 68 * SS), 'Tara, Kape!', font=title, fill=ESPRESSO, anchor='mm')
        d.text((140 * SS, 100 * SS), 'LET\'S GET COFFEE', font=small, fill=ROAST, anchor='mm')
        # twinkling sparkles
        for k, (sx, sy) in enumerate(((30, 28), (252, 34), (246, 118))):
            r = (5 + 4 * max(0, math.sin(t * 2 + k * 2))) * SS
            cx, cy = sx * SS, sy * SS
            d.polygon([(cx, cy - r * 1.8), (cx + r * .45, cy), (cx, cy + r * 1.8), (cx - r * .45, cy)], fill=CREAM)
            d.polygon([(cx - r * 1.8, cy), (cx, cy - r * .45), (cx + r * 1.8, cy), (cx, cy + r * .45)], fill=CREAM)
        wobble = math.sin(t) * 5
        bob = math.sin(t * 2) * 4 * SS
        rotated = badge.rotate(wobble, resample=Image.BICUBIC, center=(w / 2, h / 2), translate=(0, bob))
        frames.append(rotated.resize(out, Image.LANCZOS))
    save(frames, 'tara-kape.webp', 105)


def neon_open(count=30, out=(150, 75)):
    w, h = 220 * SS, 110 * SS
    word = font('bahnschrift.ttf', 58 * SS)
    flicker = [1, 1, 1, .3, 1, 1, 1, 1, .15, .9, 1, 1, 1, 1, 1, 1, 1, .4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, .6, 1]
    frames = []
    for f in range(count):
        level = flicker[f % len(flicker)]
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.rounded_rectangle([10 * SS, 10 * SS, 210 * SS, 100 * SS], radius=26 * SS, outline=CARAMEL + (int(230 * level),), width=6 * SS)
        gd.text((110 * SS, 56 * SS), 'OPEN', font=word, fill=PEACH + (int(255 * level),), anchor='mm')
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9 * SS)))
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(3 * SS)))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([10 * SS, 10 * SS, 210 * SS, 100 * SS], radius=26 * SS, outline=PEACH + (int(255 * level),), width=3 * SS)
        d.text((110 * SS, 56 * SS), 'OPEN', font=word, fill=CREAM + (int(255 * max(level, .25)),), anchor='mm')
        frames.append(im.resize(out, Image.LANCZOS))
    save(frames, 'neon-open.webp', 90)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    drink_flipbook('now-brewing.webp', (200, 250), 5, 50)      # desktop card, 134 to 152px wide
    drink_flipbook('now-brewing-small.webp', (120, 150), 3, 45)  # phone card, 56px wide
    steaming_cup()
    tara_kape()
    neon_open()
