#!/usr/bin/env python3
"""Generate PWA icons (192/512 + maskable) from public/icon.svg."""
import io, os
from pathlib import Path
import cairosvg
from PIL import Image

PUBLIC = Path("/home/z/my-project/BRAIN-DRAIN-latest-/public")
SRC = PUBLIC / "icon.svg"
BG = (16, 16, 16)      # #101010
FG = (255, 255, 255)

svg = SRC.read_text()
svg_fixed = svg.replace(
    """@media (prefers-color-scheme: light) {
      .background { fill: black; }
      .foreground { fill: white; }
    }
    @media (prefers-color-scheme: dark) {
      .background { fill: white; }
      .foreground { fill: black; }
    }""",
    f".background {{ fill: rgb{BG}; }} .foreground {{ fill: rgb{FG}; }}",
)

def render(size: int) -> Image.Image:
    png = cairosvg.svg2png(bytestring=svg_fixed.encode(), output_width=size * 2, output_height=size * 2)
    return Image.open(io.BytesIO(png)).resize((size, size), Image.LANCZOS)

def render_maskable(size: int) -> Image.Image:
    # Logo at 60% (inside the 80% safe zone) on a full-bleed background.
    svg_transparent = svg.replace(
        """@media (prefers-color-scheme: light) {
      .background { fill: black; }
      .foreground { fill: white; }
    }
    @media (prefers-color-scheme: dark) {
      .background { fill: white; }
      .foreground { fill: black; }
    }""",
        f".background {{ fill: transparent; }} .foreground {{ fill: rgb{FG}; }}",
    )
    logo_size = int(size * 0.6)
    png = cairosvg.svg2png(bytestring=svg_transparent.encode(), output_width=logo_size * 2, output_height=logo_size * 2)
    logo = Image.open(io.BytesIO(png)).resize((logo_size, logo_size), Image.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", (size, size), BG + (255,))
    canvas.paste(logo, ((size - logo_size) // 2, (size - logo_size) // 2), logo)
    return canvas

jobs = [
    ("icon-192.png", lambda: render(192)),
    ("icon-512.png", lambda: render(512)),
    ("icon-192-maskable.png", lambda: render_maskable(192)),
    ("icon-512-maskable.png", lambda: render_maskable(512)),
    ("apple-icon.png", lambda: render(180)),
    ("favicon-32.png", lambda: render(32)),
]
for name, fn in jobs:
    fn().save(PUBLIC / name, format="PNG", optimize=True)
    print(f"  OK {name} ({(PUBLIC / name).stat().st_size / 1024:.1f} KB)")
print("All PWA icons generated.")
