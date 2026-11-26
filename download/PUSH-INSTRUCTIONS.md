# Push to GitHub — step by step

You have a verified git bundle in `download/new-MindSpool.bundle` (1.4 MB,
complete history, all 3 branches). The target repo
`https://github.com/isaacodiwuor980-hue/new-MindSpool.git` is **empty and
public**, and this sandbox has **no GitHub credentials** (no PAT, no SSH key,
no `gh` CLI), so the push must run from **your own machine** where you are
authenticated. Bundles carry refs + objects only — not config — so you set
the remote after cloning.

## Path A — clone from the bundle, push to GitHub (recommended)

```bash
# 1. Move the bundle somewhere on your machine, then clone it:
git clone /path/to/new-MindSpool.bundle new-MindSpool
cd new-MindSpool
#    → lands on feat/community-rebuild @ fa7e6fe (all fixes)

# 2. Repoint origin from the bundle file to your GitHub repo:
git remote set-url origin https://github.com/isaacodiwuor980-hue/new-MindSpool.git

# 3. Push both branches:
git push -u origin feat/community-rebuild
git push origin main

# 4. On GitHub: Settings → Branches → set default branch to
#    feat/community-rebuild  (it has all the latest fixes; main is 22 commits behind).
#    OR fast-forward main up to it first:
#       git checkout main && git merge --ff-only feat/community-rebuild && git push origin main

# 5. Verify the round-trip:
git clone https://github.com/isaacodiwuor980-hue/new-MindSpool.git verify
cd verify && npm ci && npm start   # → http://localhost:3000
```

## Path B — you already cloned the empty GitHub repo

```bash
cd new-MindSpool                                    # your empty authenticated clone
git fetch /path/to/new-MindSpool.bundle 'refs/heads/*:refs/heads/*'
git checkout feat/community-rebuild
git push -u origin feat/community-rebuild
git push origin main
```

## Path C — you want me to push directly from here

I can't without a credential. If you want this, generate a GitHub **classic
PAT** with `repo` scope for the `isaacodiwuor980-hue` account and paste it
in chat — I'll run the push and then clear it. **Caveat:** anything pasted in
chat lives in the transcript, so Path A/B (you push locally) is safer and
needs no token sharing.

## What's inside (verified this session)
- Branch `feat/community-rebuild` @ `fa7e6fe` — all the work: rate limiter,
  OTP removal, honest spectator, lint 0 warnings, serve.js auto-build,
  docker-compose env_file optional.
- Branch `main` @ `73f863f` — 22 commits behind the feature branch.
- Branch `backup/pre-community-rebuild-2026-11-05` — pre-rebuild snapshot.
- 271 tracked files; `dist/`, `node_modules/`, `.env` are gitignored and not
  included. `package-lock.json` + `.env.example` are included.

## After cloning, the one-command start
```bash
npm ci && npm start     # builds if dist/ is missing, serves on :3000 with crash-restart
```
