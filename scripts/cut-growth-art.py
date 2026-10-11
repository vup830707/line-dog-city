#!/usr/bin/env python3
"""Cut the PR D sheets into transparent PNGs.

Product icons, upgrade overlays, locked-slot blockers, and the eight ichiban
figures. Skewer snacks reuse the wish icons (no skewer product art was drawn).
The skewer stall reuses the ice cart plus the star crest.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/growth"
UPLOADS = Path("/home/ubuntu/.cursor/projects/workspace/uploads")
MANIFEST = ROOT / "public/assets/art25/manifest.json"

PRODUCTS = UPLOADS / "product-icons_8851.jpg"
OVERLAYS = UPLOADS / "upgrade-overlays_fb0d.jpg"
FIGURES = UPLOADS / "ichiban-figures_d9f9.jpg"


def knock_out_white(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    width, height = image.size
    src = image.load()
    out = Image.new("RGBA", (width, height))
    dst = out.load()
    assert src is not None and dst is not None
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
    return out


def trim(image: Image.Image) -> Image.Image:
    bbox = image.getbbox()
    if bbox is None:
        raise SystemExit("crop was empty after knocking out white")
    return image.crop(bbox)


def save_crop(sheet: Image.Image, box: tuple[int, int, int, int], path: Path) -> dict[str, int]:
    crop = trim(knock_out_white(sheet.crop(box)))
    path.parent.mkdir(parents=True, exist_ok=True)
    crop.save(path)
    return {"width": crop.width, "height": crop.height}


def main() -> None:
    products = Image.open(PRODUCTS)
    overlays = Image.open(OVERLAYS)
    figures = Image.open(FIGURES)
    records: list[dict[str, object]] = []

    product_boxes = {
        "vanilla": (234, 8, 324, 178),
        "strawberry": (458, 16, 552, 178),
        "chocolate": (680, 8, 770, 178),
        "sundae": (882, 0, 1028, 186),
        "sunny": (218, 190, 340, 318),
        "breeze": (442, 190, 564, 318),
        "warm": (664, 190, 786, 318),
        "raindrop": (888, 190, 1010, 318),
        "quick": (268, 324, 350, 440),
        "starlight": (556, 324, 638, 440),
        "dream": (828, 324, 910, 440),
        "slip": (206, 452, 390, 564),
        "portrait": (478, 448, 672, 580),
        "chart": (758, 442, 1046, 580),
        "small": (232, 586, 342, 698),
        "starwish": (508, 586, 622, 696),
        "meteor": (766, 596, 990, 690),
    }
    for name, box in product_boxes.items():
        size = save_crop(products, box, OUT / "products" / f"{name}.png")
        records.append({"path": f"products/{name}.png", **size})

    # Skewer snacks reuse the wish icons. Copy the files so the product id has its own path.
    for src, dest in (("small", "skewer-small"), ("starwish", "skewer-double"), ("meteor", "skewer-meteor")):
        image = Image.open(OUT / "products" / f"{src}.png")
        image.save(OUT / "products" / f"{dest}.png")
        records.append({"path": f"products/{dest}.png", "width": image.width, "height": image.height, "note": f"reuses {src}"})

    overlay_boxes = {
        "overlay-bunting": (22, 82, 294, 190),
        "overlay-bulbs": (314, 86, 544, 190),
        "overlay-frame": (568, 36, 808, 228),
        "overlay-crest": (1078, 64, 1230, 208),
        "blocker-fence": (34, 312, 282, 466),
        "blocker-bush": (328, 304, 554, 478),
        "blocker-crates": (612, 298, 876, 488),
        "banner": (898, 352, 1254, 464),
        "coin": (582, 542, 686, 644),
    }
    for name, box in overlay_boxes.items():
        size = save_crop(overlays, box, OUT / f"{name}.png")
        records.append({"path": f"{name}.png", **size})

    # The two lantern pieces are one overlay. Paste them onto a shared canvas.
    left = trim(knock_out_white(overlays.crop((852, 44, 938, 224))))
    right = trim(knock_out_white(overlays.crop((952, 44, 1022, 202))))
    lanterns = Image.new("RGBA", (left.width + right.width + 16, max(left.height, right.height)), (0, 0, 0, 0))
    lanterns.paste(left, (0, lanterns.height - left.height), left)
    lanterns.paste(right, (left.width + 16, lanterns.height - right.height), right)
    lanterns = trim(lanterns)
    lanterns.save(OUT / "overlay-lanterns.png")
    records.append({"path": "overlay-lanterns.png", "width": lanterns.width, "height": lanterns.height})

    figure_boxes = {
        "temple": (14, 8, 308, 336),
        "dreamIce": (396, 10, 590, 336),
        "starCap": (694, 28, 906, 336),
        "pajama": (984, 24, 1210, 338),
        "weatherCan": (56, 344, 292, 670),
        "chargeTail": (366, 380, 638, 670),
        "chicken": (674, 360, 910, 672),
        "milkTea": (988, 356, 1196, 672),
    }
    for name, box in figure_boxes.items():
        size = save_crop(figures, box, OUT / "figures" / f"{name}.png")
        records.append({"path": f"figures/{name}.png", **size})

    manifest_path = OUT / "manifest.json"
    manifest_path.write_text(json.dumps({"assets": records}, indent=2) + "\n")
    art = json.loads(MANIFEST.read_text())
    existing = {item["path"] for item in art["assets"]}
    for record in records:
        rel = f"../growth/{record['path']}"
        if rel in existing:
            continue
        art["assets"].append(
            {
                "path": rel,
                "kind": "growth",
                "name": Path(str(record["path"])).stem,
                "width": record["width"],
                "height": record["height"],
                "anchor": "bottom-center",
                "source": "uploads/pr-d-sheets",
            }
        )
    MANIFEST.write_text(json.dumps(art, indent=1) + "\n")
    print(f"cut {len(records)} growth pngs")


if __name__ == "__main__":
    main()
