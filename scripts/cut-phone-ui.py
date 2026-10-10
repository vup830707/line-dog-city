#!/usr/bin/env python3
"""Cut the phone UI sheet into transparent PNG sprites.

The sheet is a white contact sheet. Rounded icon cards, the puppy charm, and
the phone bezel stay. White outside each sprite, and the phone's empty screen,
become transparent. Near-white fringe next to that transparency is cleared so
the edges do not halo on the night plaza.
"""

from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "game" / "phone" / "phone-ui-sheet.jpg"
OUT = ROOT / "public" / "assets" / "phone"

# Inclusive boxes measured from the 1280×720 sheet.
SPRITES = {
    "app-build.png": (28, 36, 223, 231),
    "app-staff.png": (237, 37, 425, 231),
    "app-collection.png": (441, 37, 631, 231),
    "app-letters.png": (649, 36, 837, 231),
    "app-settings.png": (851, 37, 1040, 233),
    "app-market.png": (1057, 37, 1248, 231),
    "charm.png": (299, 248, 518, 633),
    "frame.png": (703, 257, 991, 682),
}


def near_white(r: int, g: int, b: int) -> bool:
    return min(r, g, b) >= 246 and max(r, g, b) - min(r, g, b) <= 10


def knock_out_edge_white(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    width, height = image.size
    src = image.load()
    seen = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < width and 0 <= y < height) or seen[y][x]:
            continue
        r, g, b, _a = src[x, y]
        if not near_white(r, g, b):
            continue
        seen[y][x] = True
        src[x, y] = (r, g, b, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return image


def pale_halo(r: int, g: int, b: int) -> bool:
    """Neutral white matte. Warm cream fur and icon cards stay."""
    return min(r, g, b) >= 236 and max(r, g, b) - min(r, g, b) <= 18


def strict_white(r: int, g: int, b: int, a: int) -> bool:
    return a >= 16 and min(r, g, b) >= 248 and max(r, g, b) - min(r, g, b) <= 12


def clear_enclosed_white(image: Image.Image, min_pixels: int = 80) -> Image.Image:
    """Drop large white holes, such as the charm strap loop. Tiny highlights stay."""
    image = image.convert("RGBA")
    width, height = image.size
    src = image.load()
    seen = [[False] * width for _ in range(height)]
    for y in range(height):
        for x in range(width):
            if seen[y][x] or not strict_white(*src[x, y]):
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            seen[y][x] = True
            cells = [(x, y)]
            while queue:
                cx, cy = queue.popleft()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < width and 0 <= ny < height and not seen[ny][nx] and strict_white(*src[nx, ny]):
                        seen[ny][nx] = True
                        queue.append((nx, ny))
                        cells.append((nx, ny))
            if len(cells) >= min_pixels:
                for cx, cy in cells:
                    r, g, b, _a = src[cx, cy]
                    src[cx, cy] = (r, g, b, 0)
    return image


def clear_fringe(image: Image.Image, passes: int = 8) -> Image.Image:
    """Drop the neutral white halo that touches transparency. Cream art stops the flood."""
    image = image.convert("RGBA")
    width, height = image.size
    for _ in range(passes):
        src = image.load()
        kill: list[tuple[int, int]] = []
        for y in range(height):
            for x in range(width):
                r, g, b, a = src[x, y]
                if a < 16 or not pale_halo(r, g, b):
                    continue
                if any(
                    0 <= x + dx < width and 0 <= y + dy < height and src[x + dx, y + dy][3] < 16
                    for dx in (-1, 0, 1)
                    for dy in (-1, 0, 1)
                    if dx or dy
                ):
                    kill.append((x, y))
        for x, y in kill:
            r, g, b, _a = src[x, y]
            src[x, y] = (r, g, b, 0)
    return image


def punch_screen(image: Image.Image) -> Image.Image:
    """Clear the empty cream screen so the bezel can frame HTML."""
    image = image.convert("RGBA")
    width, height = image.size
    src = image.load()
    cx, cy = width // 2, height // 2
    target = src[cx, cy]
    if target[3] < 16:
        return image

    def screen_color(r: int, g: int, b: int, a: int) -> bool:
        if a < 16:
            return False
        return abs(r - target[0]) + abs(g - target[1]) + abs(b - target[2]) <= 42 and r >= 236

    seen = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque([(cx, cy)])
    seen[cy][cx] = True
    while queue:
        x, y = queue.popleft()
        r, g, b, a = src[x, y]
        if not screen_color(r, g, b, a):
            continue
        src[x, y] = (r, g, b, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and not seen[ny][nx]:
                seen[ny][nx] = True
                queue.append((nx, ny))
    return image


def trim(image: Image.Image, pad: int = 2) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return image
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(image.width, bbox[2] + pad)
    bottom = min(image.height, bbox[3] + pad)
    return image.crop((left, top, right, bottom))


def crop(sheet: Image.Image, box: tuple[int, int, int, int], pad: int = 6) -> Image.Image:
    left = max(0, box[0] - pad)
    top = max(0, box[1] - pad)
    right = min(sheet.width, box[2] + 1 + pad)
    bottom = min(sheet.height, box[3] + 1 + pad)
    return sheet.crop((left, top, right, bottom))


def letter_paper() -> Image.Image:
    image = Image.new("RGBA", (480, 640), (255, 248, 232, 255))
    draw = ImageDraw.Draw(image)
    for y in range(72, 600, 28):
        draw.line((36, y, 450, y), fill=(226, 206, 176, 255), width=1)
    draw.line((64, 28, 64, 612), fill=(214, 120, 112, 255), width=2)
    draw.rectangle((8, 8, 471, 631), outline=(214, 176, 128, 255), width=3)
    return image


def coin_icon() -> Image.Image:
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((4, 4, 60, 60), fill=(226, 168, 62, 255), outline=(120, 72, 18, 255), width=3)
    draw.ellipse((14, 14, 50, 50), fill=(244, 204, 102, 255))
    draw.ellipse((24, 18, 40, 30), fill=(255, 236, 190, 255))
    draw.ellipse((22, 34, 30, 42), fill=(120, 72, 18, 255))
    draw.ellipse((34, 34, 42, 42), fill=(120, 72, 18, 255))
    draw.ellipse((26, 40, 38, 50), fill=(120, 72, 18, 255))
    return image


def weather_icons() -> dict[str, Image.Image]:
    icons: dict[str, Image.Image] = {}
    sunny = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(sunny)
    draw.ellipse((16, 16, 48, 48), fill=(255, 204, 74, 255), outline=(196, 130, 28, 255), width=2)
    for angle in range(0, 360, 45):
        import math

        rad = math.radians(angle)
        x1 = 32 + math.cos(rad) * 18
        y1 = 32 + math.sin(rad) * 18
        x2 = 32 + math.cos(rad) * 28
        y2 = 32 + math.sin(rad) * 28
        draw.line((x1, y1, x2, y2), fill=(255, 186, 64, 255), width=3)
    icons["weather-sunny.png"] = sunny

    hot = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(hot)
    draw.ellipse((14, 18, 50, 54), fill=(232, 96, 48, 255), outline=(140, 42, 18, 255), width=2)
    draw.ellipse((24, 10, 40, 26), fill=(255, 176, 64, 255))
    icons["weather-hot.png"] = hot

    cold = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(cold)
    draw.ellipse((18, 18, 46, 46), fill=(186, 220, 244, 255), outline=(70, 120, 170, 255), width=2)
    draw.line((32, 8, 32, 56), fill=(90, 150, 200, 255), width=3)
    draw.line((8, 32, 56, 32), fill=(90, 150, 200, 255), width=3)
    draw.line((14, 14, 50, 50), fill=(90, 150, 200, 255), width=3)
    draw.line((50, 14, 14, 50), fill=(90, 150, 200, 255), width=3)
    icons["weather-cold.png"] = cold

    rain = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(rain)
    draw.ellipse((8, 12, 34, 36), fill=(210, 214, 224, 255), outline=(90, 98, 120, 255))
    draw.ellipse((22, 8, 54, 36), fill=(232, 236, 244, 255), outline=(90, 98, 120, 255))
    draw.line((18, 40, 12, 56), fill=(90, 150, 210, 255), width=3)
    draw.line((32, 40, 26, 56), fill=(90, 150, 210, 255), width=3)
    draw.line((46, 40, 40, 56), fill=(90, 150, 210, 255), width=3)
    icons["weather-rain.png"] = rain
    return icons


def screen_insets(frame: Image.Image) -> tuple[int, int, int, int]:
    """Return the transparent screen hole as left, top, right, bottom pixels."""
    width, height = frame.size
    src = frame.load()
    minx, miny, maxx, maxy = width, height, 0, 0
    found = False
    for y in range(height):
        for x in range(width):
            if src[x, y][3] < 16:
                # Ignore the outside of the bezel: only the interior hole.
                if x < width * 0.2 or x > width * 0.85 or y < height * 0.08 or y > height * 0.92:
                    continue
                found = True
                minx = min(minx, x)
                miny = min(miny, y)
                maxx = max(maxx, x)
                maxy = max(maxy, y)
    if not found:
        return (0, 0, width, height)
    return (minx, miny, width - 1 - maxx, height - 1 - maxy)


def main() -> None:
    sheet = Image.open(SHEET).convert("RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    for name, box in SPRITES.items():
        image = knock_out_edge_white(crop(sheet, box))
        if name == "frame.png":
            image = punch_screen(image)
        image = clear_fringe(trim(clear_fringe(clear_enclosed_white(image))))
        image.save(OUT / name)
        print(f"{name} {image.size}")
    frame = Image.open(OUT / "frame.png")
    print("frame screen insets LTRB", screen_insets(frame), "size", frame.size)
    letter_paper().save(OUT / "letter-paper.png")
    coin_icon().save(OUT / "coin.png")
    for name, image in weather_icons().items():
        image.save(OUT / name)
        print(name, image.size)


if __name__ == "__main__":
    main()
