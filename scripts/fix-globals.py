#!/usr/bin/env python3
"""Safe, mechanical replacements unlocked by lib/globals.d.ts.
Only touches exact `(window as any).__isAppDirty` and `navigator as any`
casts — narrowing-free because the globals.d.ts now types them."""
import re
from pathlib import Path

FILES = [
    "pages/SettingsPage.tsx",
    "WizardModal.tsx",
    "layout/AppShell.tsx",
    "lib/device.ts",
    "lib/theme.tsx",
    "lib/confetti.ts",
    "runtime/RealtimeSessionView.tsx",
    "feed/PostCard.tsx",
]

total = 0
for rel in FILES:
    p = Path(rel)
    if not p.exists():
        print(f"skip (missing): {rel}")
        continue
    src = p.read_text()
    orig = src
    # (window as any).__isAppDirty  ->  window.__isAppDirty
    src = src.replace("(window as any).__isAppDirty", "window.__isAppDirty")
    # (navigator as any).foo  ->  navigator.foo
    src = src.replace("(navigator as any).", "navigator.")
    # const nav = navigator as any;  ->  const nav = navigator;  (then nav.foo is typed)
    src = src.replace("navigator as any", "navigator")
    if src != orig:
        n = orig.count("(window as any).__isAppDirty") + orig.count("(navigator as any).") + orig.count("navigator as any")
        p.write_text(src)
        print(f"  {rel}: {n} replacement(s)")
        total += n
    else:
        print(f"  {rel}: no match")

print(f"total replacements: {total}")
