#!/usr/bin/env python3
"""B11: move client runtime deps from devDependencies to dependencies.

They currently work only because Vite bundles them into the client build;
any future `npm install --production` or SSR/prerender tooling would break.
Versions are unchanged — this is pure metadata placement.
"""
import json

PKG = "/home/z/my-project/MindSpool-latest-/package.json"

MOVE = [
    "react", "react-dom", "wouter", "@tanstack/react-query", "firebase",
    "framer-motion", "d3", "recharts", "date-fns", "lucide-react",
    "clsx", "tailwind-merge", "class-variance-authority",
    "tailwindcss", "@tailwindcss/vite", "@tailwindcss/typography",
    "tw-animate-css",
]

with open(PKG) as f:
    data = json.load(f)

moved = []
for name in MOVE:
    if name in data["devDependencies"]:
        data["dependencies"][name] = data["devDependencies"].pop(name)
        moved.append(name)
# The whole @radix-ui component set ships to the browser too.
for name in [k for k in list(data["devDependencies"]) if k.startswith("@radix-ui/")]:
    data["dependencies"][name] = data["devDependencies"].pop(name)
    moved.append(name)

data["dependencies"] = dict(sorted(data["dependencies"].items()))
data["devDependencies"] = dict(sorted(data["devDependencies"].items()))

with open(PKG, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print(f"moved {len(moved)} packages to dependencies:")
for name in moved:
    print(f"  {name}")
