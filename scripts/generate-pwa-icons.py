#!/usr/bin/env python3
"""Generate PWA icons (192/512 + maskable + favicon + apple + OG) from public/logo.png.

Uses ImageMagick (`convert`), which is available in the dev environment, so this
script has no third-party Python dependencies. Run from the repo root:

    python3 scripts/generate-pwa-icons.py
"""
import subprocess
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"
SRC = PUBLIC / "logo.png"
BG = "#101010"  # brand background for maskable / social cards

if not SRC.exists():
    raise SystemExit(f"Missing source logo: {SRC}")


def convert(args):
    subprocess.run(["convert", *args], check=True)


# Standard icons (preserve the logo's own transparency).
convert([str(SRC), "-resize", "32x32", str(PUBLIC / "favicon-32.png")])
convert([str(SRC), "-resize", "180x180", str(PUBLIC / "apple-icon.png")])
convert([str(SRC), "-resize", "192x192", str(PUBLIC / "icon-192.png")])
convert([str(SRC), "-resize", "512x512", str(PUBLIC / "icon-512.png")])

# Maskable icons: logo at 80% (inside the 80% safe zone) on a solid background.
convert(["-size", "192x192", "xc:" + BG, "(", str(SRC), "-resize", "154x154", ")",
         "-gravity", "center", "-composite", str(PUBLIC / "icon-192-maskable.png")])
convert(["-size", "512x512", "xc:" + BG, "(", str(SRC), "-resize", "410x410", ")",
         "-gravity", "center", "-composite", str(PUBLIC / "icon-512-maskable.png")])

# Open Graph social card (JPG has no alpha → dark background).
convert(["-size", "1200x630", "xc:" + BG, "(", str(SRC), "-resize", "360x360", ")",
         "-gravity", "center", "-composite", "-quality", "90", str(PUBLIC / "opengraph.jpg")])

# Self-contained SVG favicons (embed the PNG so they render as images).
import base64
b64 = base64.b64encode(SRC.read_bytes()).decode()
(PUBLIC / "favicon.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">'
    f'<image width="180" height="180" href="data:image/png;base64,{b64}"/></svg>'
)
(PUBLIC / "icon.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
    f'<image width="512" height="512" href="data:image/png;base64,{b64}"/></svg>'
)

print("All MindSpool PWA icons generated.")
