#!/usr/bin/env python3
"""Clear the white matte on stall sprites.

Seeds are near-white pixels on the alpha edge, plus the same pixels in the
bottom 20% where the foot halo is thicker. The mask then grows 4px, but only
through light gray that is still next to the silhouette, so interior whites
(ice cream, machine panels) stay.
"""

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public/assets/art25/stalls"
TOL = 28
FRINGE = 4


def near_white(r: int, g: int, b: int) -> bool:
    return r >= 255 - TOL and g >= 255 - TOL and b >= 255 - TOL


def light_gray(r: int, g: int, b: int) -> bool:
    return min(r, g, b) >= 210 and max(r, g, b) - min(r, g, b) <= 24


def defringe(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    width, height = image.size
    src = image.load()
    dist = [[99] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()
    for y in range(height):
        for x in range(width):
            if src[x, y][3] < 16:
                dist[y][x] = 0
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        depth = dist[y][x]
        if depth >= 16:
            continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and dist[ny][nx] == 99:
                dist[ny][nx] = depth + 1
                queue.append((nx, ny))

    clear = [[False] * width for _ in range(height)]
    for y in range(height):
        for x in range(width):
            r, g, b, a = src[x, y]
            if a >= 16 and near_white(r, g, b) and 1 <= dist[y][x] <= FRINGE:
                clear[y][x] = True

    band = int(height * 0.8)
    seen = [[False] * width for _ in range(height)]
    queue.clear()
    for y in range(band, height):
        for x in range(width):
            if clear[y][x]:
                seen[y][x] = True
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < width and 0 <= ny < height) or seen[ny][nx] or ny < band - FRINGE:
                continue
            r, g, b, a = src[nx, ny]
            if a < 16 or not near_white(r, g, b) or dist[ny][nx] > FRINGE + 4:
                continue
            seen[ny][nx] = True
            clear[ny][nx] = True
            queue.append((nx, ny))

    grown = [row[:] for row in clear]
    for y in range(height):
        for x in range(width):
            if not clear[y][x]:
                continue
            for dy in range(-FRINGE, FRINGE + 1):
                for dx in range(-FRINGE, FRINGE + 1):
                    if dx * dx + dy * dy > FRINGE * FRINGE:
                        continue
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    r, g, b, a = src[nx, ny]
                    if a < 16 or dist[ny][nx] > FRINGE + 2:
                        continue
                    if light_gray(r, g, b):
                        grown[ny][nx] = True

    out = image.copy()
    pixels = out.load()
    for y in range(height):
        for x in range(width):
            if grown[y][x]:
                r, g, b, _a = pixels[x, y]
                pixels[x, y] = (r, g, b, 0)
    return out


def main() -> None:
    for path in sorted(ROOT.glob("*.png")):
        image = Image.open(path)
        cleaned = defringe(image)
        if cleaned.size != image.size:
            raise SystemExit(f"{path.name} changed size")
        cleaned.save(path)
        print(path.name, image.size)


if __name__ == "__main__":
    main()
