#!/usr/bin/env python3
"""Build the title-screen plates from the supplied paintings.

Backgrounds stay JPEG (same precache path as the plaza). The logo JPEG is
matted on white; this knocks that matte out and pulls the pale edge back
toward the ink so the letters do not keep a white fringe.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/art25/title"
MANIFEST = ROOT / "public/assets/art25/manifest.json"
UPLOADS = Path("/home/ubuntu/.cursor/projects/workspace/uploads")
UNLIT = UPLOADS / "title-bg-unlit_e6fd.jpg"
LIT = UPLOADS / "title-bg-lit_d656.jpg"
LOGO = UPLOADS / "title-logo-white_0360.jpg"


def knock_out_white(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    width, height = image.size
    src = image.load()
    out = Image.new("RGBA", (width, height))
    dst = out.load()
    for y in range(height):
        for x in range(width):
            r, g, b = src[x, y]
            chroma = max(r, g, b) - min(r, g, b)
            if r >= 248 and g >= 248 and b >= 248:
                dst[x, y] = (0, 0, 0, 0)
                continue
            if min(r, g, b) <= 232 or chroma >= 30:
                dst[x, y] = (r, g, b, 255)
                continue
            dist = max(255 - r, 255 - g, 255 - b)
            alpha = max(0, min(255, int((dist - 7) * (255 / 36))))
            if alpha < 12:
                dst[x, y] = (0, 0, 0, 0)
                continue
            scale = alpha / 255
            fr = int(max(0, min(255, (r - 255 * (1 - scale)) / scale)))
            fg = int(max(0, min(255, (g - 255 * (1 - scale)) / scale)))
            fb = int(max(0, min(255, (b - 255 * (1 - scale)) / scale)))
            dst[x, y] = (fr, fg, fb, alpha)

    # Recolor partial pixels from the nearest solid ink so the edge is not white.
    for y in range(height):
        for x in range(width):
            r, g, b, a = dst[x, y]
            if a == 0 or a == 255:
                continue
            nearest = None
            best = 99
            for sx, sy in ((x + dx, y + dy) for dx in range(-3, 4) for dy in range(-3, 4)):
                if not (0 <= sx < width and 0 <= sy < height):
                    continue
                if dst[sx, sy][3] != 255:
                    continue
                dist = max(abs(sx - x), abs(sy - y))
                if dist < best:
                    best = dist
                    nearest = dst[sx, sy]
                    if dist == 1:
                        break
            if nearest is not None:
                dst[x, y] = (nearest[0], nearest[1], nearest[2], a)
    return out


def crop_to_ink(image: Image.Image, pad: int = 8) -> Image.Image:
    width, height = image.size
    src = image.load()
    min_x, min_y, max_x, max_y = width, height, 0, 0
    for y in range(height):
        for x in range(width):
            if src[x, y][3] < 16:
                continue
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
    box = (
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(width, max_x + 1 + pad),
        min(height, max_y + 1 + pad),
    )
    return image.crop(box)


def fringe_count(image: Image.Image) -> int:
    src = image.load()
    width, height = image.size
    count = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = src[x, y]
            if a > 200 and r >= 246 and g >= 246 and b >= 246:
                count += 1
    return count


def save_background(source: Path, dest: Path) -> None:
    image = Image.open(source).convert("RGB")
    image.save(dest, format="JPEG", quality=80, optimize=True, progressive=True)


def register(manifest_path: Path, entries: list[dict]) -> None:
    manifest = json.loads(manifest_path.read_text())
    assets = [item for item in manifest["assets"] if not str(item.get("path", "")).startswith("title/")]
    assets.extend(entries)
    manifest["assets"] = assets
    manifest["generated_count"] = len(assets)
    manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    save_background(UNLIT, OUT / "bg-unlit.jpg")
    save_background(LIT, OUT / "bg-lit.jpg")
    logo = crop_to_ink(knock_out_white(Image.open(LOGO)))
    logo.save(OUT / "logo.png", format="PNG", optimize=True)
    print(f"logo {logo.size} fringe {fringe_count(logo)}")
    print(f"unlit {(OUT / 'bg-unlit.jpg').stat().st_size} lit {(OUT / 'bg-lit.jpg').stat().st_size}")

    def entry(name: str, filename: str, image: Image.Image) -> dict:
        return {
            "path": f"title/{filename}",
            "kind": "title",
            "name": name,
            "width": image.size[0],
            "height": image.size[1],
            "anchor": "center",
            "anchor_px": [image.size[0] // 2, image.size[1] // 2],
            "tileable_x": False,
            "source": "uploads/title",
        }

    register(
        MANIFEST,
        [
            entry("bg-unlit", "bg-unlit.jpg", Image.open(OUT / "bg-unlit.jpg")),
            entry("bg-lit", "bg-lit.jpg", Image.open(OUT / "bg-lit.jpg")),
            entry("logo", "logo.png", logo),
        ],
    )


if __name__ == "__main__":
    main()
