#!/usr/bin/env python3

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ICONSET_DIR = ROOT / "Markdown" / "Assets.xcassets" / "AppIcon.appiconset"
PREVIEW_PATH = ROOT / "docs" / "assets" / "app-icon-preview-1024.png"

SLOTS = [
    ("appicon-16.png", 16),
    ("appicon-16@2x.png", 32),
    ("appicon-32.png", 32),
    ("appicon-32@2x.png", 64),
    ("appicon-128.png", 128),
    ("appicon-128@2x.png", 256),
    ("appicon-256.png", 256),
    ("appicon-256@2x.png", 512),
    ("appicon-512.png", 512),
    ("appicon-512@2x.png", 1024),
]


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def blend_rgb(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(lerp(x, y, t) for x, y in zip(a, b))


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Supplemental/Menlo.ttc",
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def make_background(size: int) -> Image.Image:
    top = (53, 61, 74)
    bottom = (24, 28, 35)
    left_glow = (103, 116, 136)
    img = Image.new("RGBA", (size, size))
    px = img.load()

    for y in range(size):
        vertical = y / (size - 1)
        base = blend_rgb(top, bottom, vertical)
        for x in range(size):
            dx = x / size
            dy = y / size
            radial = max(0.0, 1.0 - (((dx - 0.28) ** 2) / 0.12 + ((dy - 0.18) ** 2) / 0.08))
            lift = radial * 0.18
            color = blend_rgb(base, left_glow, lift)
            px[x, y] = (*color, 255)
    return img


def add_shadow(base: Image.Image, box: tuple[int, int, int, int], radius: int, alpha: int, blur: int) -> None:
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.rounded_rectangle(box, radius=radius, fill=(10, 13, 18, alpha))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(shadow)


def draw_icon(size: int = 1024) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Leave a little more breathing room so the icon doesn't feel oversized in Dock/Finder.
    inset = round(size * 0.12)
    inner_size = size - inset * 2
    bg = make_background(inner_size)

    radius = round(size * 0.225)
    bg_mask = rounded_mask(inner_size, radius)
    bg_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    bg_layer.paste(bg, (inset, inset), bg_mask)

    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_shape = Image.new("RGBA", (size - inset * 2, size - inset * 2), (0, 0, 0, 0))
    shadow_shape.paste((0, 0, 0, 118), (0, 0), bg_mask)
    shadow_shape = shadow_shape.filter(ImageFilter.GaussianBlur(round(size * 0.02)))
    shadow.alpha_composite(shadow_shape, (inset, inset + round(size * 0.005)))
    image.alpha_composite(shadow)
    image.alpha_composite(bg_layer)

    paper_box = (
        round(size * 0.315),
        round(size * 0.235),
        round(size * 0.685),
        round(size * 0.765),
    )
    paper_radius = round(size * 0.075)
    add_shadow(
        image,
        (paper_box[0], paper_box[1] + round(size * 0.006), paper_box[2], paper_box[3]),
        paper_radius,
        42,
        round(size * 0.014),
    )

    paper = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(paper)
    paper_fill = (245, 242, 235, 255)
    paper_stroke = (255, 255, 255, 48)
    draw.rounded_rectangle(paper_box, radius=paper_radius, fill=paper_fill, outline=paper_stroke, width=max(2, size // 256))

    fold = round(size * 0.105)
    fold_right = paper_box[2]
    fold_top = paper_box[1]
    fold_points = [
        (fold_right - fold, fold_top),
        (fold_right, fold_top),
        (fold_right, fold_top + fold),
    ]
    draw.polygon(fold_points, fill=(233, 228, 218, 255))
    draw.line(
        [(fold_right - fold, fold_top), (fold_right, fold_top + fold)],
        fill=(206, 198, 186, 255),
        width=max(2, size // 320),
    )
    image.alpha_composite(paper)

    content = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(content)

    hash_font = load_font(round(size * 0.19))
    quote_font = load_font(round(size * 0.17))

    ink = (45, 54, 66, 255)
    accent = (105, 118, 92, 255)
    line_fill = (61, 71, 83, 34)
    accent_line_fill = (105, 118, 92, 42)
    soft_line = (89, 96, 103, 48)

    draw.text((round(size * 0.345), round(size * 0.315)), "#", font=hash_font, fill=ink)
    draw.rounded_rectangle(
        (
            round(size * 0.45),
            round(size * 0.382),
            round(size * 0.605),
            round(size * 0.405),
        ),
        radius=round(size * 0.014),
        fill=line_fill,
    )

    draw.text((round(size * 0.345), round(size * 0.49)), ">", font=quote_font, fill=accent)
    draw.rounded_rectangle(
        (
            round(size * 0.46),
            round(size * 0.565),
            round(size * 0.645),
            round(size * 0.588),
        ),
        radius=round(size * 0.013),
        fill=accent_line_fill,
    )
    draw.rounded_rectangle(
        (
            round(size * 0.46),
            round(size * 0.612),
            round(size * 0.595),
            round(size * 0.635),
        ),
        radius=round(size * 0.012),
        fill=accent_line_fill,
    )

    draw.rounded_rectangle(
        (
            round(size * 0.345),
            round(size * 0.69),
            round(size * 0.64),
            round(size * 0.713),
        ),
        radius=round(size * 0.012),
        fill=soft_line,
    )
    draw.rounded_rectangle(
        (
            round(size * 0.345),
            round(size * 0.738),
            round(size * 0.57),
            round(size * 0.761),
        ),
        radius=round(size * 0.012),
        fill=soft_line,
    )

    image.alpha_composite(content)
    return image


def main() -> None:
    ICONSET_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    master = draw_icon(1024)
    master.save(PREVIEW_PATH)

    for filename, pixels in SLOTS:
        target = master.resize((pixels, pixels), Image.Resampling.LANCZOS)
        target.save(ICONSET_DIR / filename)

    print(f"Generated app icon assets in {ICONSET_DIR}")


if __name__ == "__main__":
    main()
