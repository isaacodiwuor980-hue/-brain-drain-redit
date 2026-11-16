# Runbook — Brain Drain

## On-call rotation

- **Primary:** [name + phone]
- **Secondary:** [name + phone]
- **Escalation:** [name + phone]

## Alerting

Configure alerts for:
- **Error rate > 5%** on `/api/*` routes (5-min window)
- **p(95) latency > 2s** on `/api/feed`
- **Health check failure** on `/api/healthz` (3 consecutive failures)
- **Server restart count** > 5 in 10 minutes (crash loop)
- **Disk usage** > 80% (analytics JSONL + logs)
- **Supabase connection errors** > 10 in 1 minute

---

## Incident Response

### SEV-1: App completely down

1. **Acknowledge** the alert within 5 minutes.
2. **Check health:** `curl -sf https://domain.com/api/healthz`
   - If 200: the app is up; check DNS / CDN.
   - If non-200 or timeout: SSH into the server.
3. **Check processes:**
   ```bash
   pgrep -af "node dist/server"
   pgrep -af "keep-server-alive"
   tail -50 /tmp/bd-server.log
   ```
4. **Restart if needed:**
   ```bash
   bash scripts/ensure-server.sh   # idempotent — safe to run any time
   ```

   > **⚠️ SANDBOX REAPER — READ BEFORE CHANGING LAUNCH COMMANDS**
   > The agent sandbox SIGKILLs every process that is still a descendant
   > of the shell that launched it, the moment that command finishes.
   > `setsid`, `nohup`, and `disown` do NOT protect against it. The ONLY
   > escape is double-fork orphaning: the wrapper must already have
   > ppid=1 (reparented to tini, PID 1) BEFORE the launching command
   > exits. `ensure-server.sh` does this via
   > `bash -c 'setsid bash scripts/keep-server-alive.sh & exit 0'`.
   > NEVER simplify that to `setsid ... &` — the preview will die the
   > instant your command ends and you will chase phantom bugs.
5. **If crash-looping:** check for bad deploy.
   ```bash
   # Rollback to last known good
   git log --oneline -5
   git checkout HEAD~1
   npm run build
   bash scripts/deploy.sh
   ```
6. **Communicate:** post status update on status page within 15 minutes.

### SEV-2: Degraded performance

1. **Check load:** `top` / `htop` — is CPU/memory saturated?
2. **Check logs:** `tail -100 /tmp/bd-server.log | grep -i error`
3. **Check Supabase:** is the dashboard showing elevated latency?
4. **Scale up:** increase instance count or upgrade instance size.
5. **If analytics file is huge:**
   ```bash
   ls -lh data/analytics-events.jsonl
   # If > 1GB, rotate:
   mv data/analytics-events.jsonl data/analytics-events.$(date +%Y%m%d).jsonl
   # Server creates a new file on next write.
   ```

### SEV-3: Single user report

1. Reproduce locally with the user's steps.
2. Check `/api/client-errors` logs for their session:
   ```bash
   grep "Client error" /tmp/bd-server.log | tail -20
   ```
3. File issue. Fix in next deploy.

---

## Common Failures + Fixes

### Failure: "Cannot find module 'recharts'"
- **Cause:** `npm ci` ran with `--production` flag (skips devDeps, but recharts is now a production dep).
- **Fix:** Run `npm ci` without `--production`, or ensure `recharts` is in `dependencies` not `devDependencies`.

### Failure: Blank page in browser
- **Cause 1:** Server running in dev mode (`NODE_ENV` not set to `production`).
  - **Fix:** Set `NODE_ENV=production`, restart.
- **Cause 2:** Stale service worker from a previous dev session.
  - **Fix:** In browser DevTools → Application → Service Workers → Unregister. Hard refresh.
- **Cause 3:** `X-Frame-Options: DENY` blocking iframe preview.
  - **Fix:** Verify `server.ts` sets `SAMEORIGIN` (not `DENY`).

### Failure: "Supabase GET failed: 401"
- **Cause:** `SUPABASE_SERVICE_ROLE_KEY` is wrong or expired.
- **Fix:** Regenerate in Supabase dashboard → Settings → API → service_role key. Update `.env`, restart.

### Failure: "Firebase token verification failed"
- **Cause:** `FIREBASE_PROJECT_ID` mismatch or token from wrong project.
- **Fix:** Verify `FIREBASE_PROJECT_ID` in `.env` matches the Firebase project in `firebase-applet-config.json`.

### Failure: Rate limit (429) on legitimate traffic
- **Cause:** `RATE_LIMIT_MAX` too low for the traffic level.
- **Fix:** Increase `RATE_LIMIT_MAX` in `.env` (default 60/min). For multi-instance, switch to Redis-backed rate limiter.

### Failure: IndexedDB quota exceeded
- **Cause:** User's browser storage is full (usually from analytics events).
- **Fix:** This is handled client-side by the IDB layer. If persistent, user can clear site data in DevTools.

---

## Maintenance Mode

```bash
# Enable (returns 503 on all routes except /api/healthz)
echo "MAINTENANCE_MODE=true" >> .env
bash scripts/deploy.sh

# Disable
sed -i 's/MAINTENANCE_MODE=true/MAINTENANCE_MODE=false/' .env
bash scripts/deploy.sh
```

---

## Backup + Restore

### Backup (daily via cron)
```bash
# Add to crontab:
0 3 * * * cd /app && bash scripts/backup-supabase.sh >> /var/log/backup.log 2>&1
```

### Restore
```bash
# List backups
ls -t backups/backup-*.sql.gz

# Restore (DESTRUCTIVE — replaces current DB state)
gunzip -c backups/backup-20251008-030000.sql.gz | psql "$SUPABASE_DB_URL"
```

---

## Contact

- **Repo:** [GitHub URL]
- **Status page:** [status URL]
- **On-call:** [PagerDuty URL]
