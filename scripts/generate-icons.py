#!/usr/bin/env python3
"""Génère les icônes PNG de la PWA (aucune dépendance : encodeur PNG minimal).

Le dessin est vectoriel puis rendu par sur-échantillonnage x4 pour l'anticrénelage :
une épingle blanche sur fond vert, arrondie comme une icône d'application.

Usage : python3 scripts/generate-icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"

BRAND = (15, 123, 95)
BRAND_DARK = (10, 91, 70)
WHITE = (255, 255, 255)

SS = 4  # facteur de sur-échantillonnage


def write_png(path: Path, pixels: list[list[tuple[int, int, int, int]]]) -> None:
    height = len(pixels)
    width = len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filtre "None"
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def rounded_rect(x: float, y: float, size: float, radius: float) -> bool:
    """Vrai si (x, y) est dans un carré arrondi de côté `size` centré en (0, 0)."""
    half = size / 2
    dx = abs(x) - (half - radius)
    dy = abs(y) - (half - radius)
    if dx <= 0 or dy <= 0:
        return abs(x) <= half and abs(y) <= half
    return dx * dx + dy * dy <= radius * radius


def pin(x: float, y: float, size: float) -> bool:
    """Épingle : disque + pointe triangulaire, dimensionnée en fraction de `size`."""
    r = size * 0.17
    cy = -size * 0.09
    if x * x + (y - cy) ** 2 <= r * r:
        return True
    # Pointe : triangle entre la base du disque et le bas de l'épingle.
    tip_y = cy + size * 0.40
    if cy <= y <= tip_y:
        progress = (y - cy) / (tip_y - cy)
        half_width = r * 0.95 * (1 - progress) ** 0.85
        return abs(x) <= half_width
    return False


def hole(x: float, y: float, size: float) -> bool:
    """Trou central de l'épingle."""
    cy = -size * 0.09
    r = size * 0.062
    return x * x + (y - cy) ** 2 <= r * r


def render(size: int, maskable: bool) -> list[list[tuple[int, int, int, int]]]:
    # Une icône « maskable » doit rester lisible dans une zone sûre de 80 % : on
    # remplit tout le carré et on réduit le dessin.
    plate = size * (1.0 if maskable else 0.94)
    radius = size * (0.5 if maskable else 0.235)
    art = size * (0.62 if maskable else 0.78)

    rows: list[list[tuple[int, int, int, int]]] = []
    for py in range(size):
        row: list[tuple[int, int, int, int]] = []
        for px in range(size):
            inside = 0
            ink = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS - size / 2
                    y = py + (sy + 0.5) / SS - size / 2
                    if maskable:
                        in_plate = True
                    else:
                        in_plate = rounded_rect(x, y, plate, radius)
                    if not in_plate:
                        continue
                    inside += 1
                    if pin(x, y, art) and not hole(x, y, art):
                        ink += 1
            total = SS * SS
            if inside == 0:
                row.append((0, 0, 0, 0))
                continue
            alpha = round(255 * inside / total)
            # Léger dégradé vertical du fond, pour ne pas paraître plat.
            mix = py / max(1, size - 1)
            bg = tuple(
                round(BRAND[i] + (BRAND_DARK[i] - BRAND[i]) * mix) for i in range(3)
            )
            weight = ink / total
            color = tuple(round(bg[i] + (WHITE[i] - bg[i]) * min(1.0, weight * 1.0)) for i in range(3))
            row.append((color[0], color[1], color[2], alpha))
        rows.append(row)
    return rows


def favicon_svg() -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<rect width="64" height="64" rx="15" fill="#0f7b5f"/>'
        '<path d="M32 13a11 11 0 0 0-11 11c0 8 11 20 11 20s11-12 11-20a11 11 0 0 0-11-11Z" fill="#fff"/>'
        '<circle cx="32" cy="24" r="4" fill="#0f7b5f"/>'
        "</svg>\n"
    )


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    targets = [
        (ICONS / "icon-192.png", 192, False),
        (ICONS / "icon-512.png", 512, False),
        (ICONS / "icon-maskable-512.png", 512, True),
        (PUBLIC / "apple-touch-icon.png", 180, True),
    ]
    for path, size, maskable in targets:
        write_png(path, render(size, maskable))
        print(f"{path.relative_to(ROOT)} ({size}×{size})")

    (PUBLIC / "favicon.svg").write_text(favicon_svg(), encoding="utf-8")
    print("public/favicon.svg")


if __name__ == "__main__":
    main()
