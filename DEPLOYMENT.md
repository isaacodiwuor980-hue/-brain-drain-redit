# Deployment Guide — MindSpool

## Pre-deploy Checklist

- [ ] `.env` populated with production values (see `.env.example`)
- [ ] `NODE_ENV=production` set
- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set (or confirmed local-only)
- [ ] `FIREBASE_PROJECT_ID` set
- [ ] `CORS_ORIGIN` set to the production domain
- [ ] Supabase migration `0001_initial_schema.sql` applied
- [ ] Firestore rules deployed (`firebase deploy --only firestore:rules`)
- [ ] DNS + SSL configured for the production domain

## Deploy to Render (recommended for quick launch)

1. **Create a Web Service** on Render, connected to the Git repo.
2. **Build command:** `npm ci && npm run build`
3. **Start command:** `node dist/server.cjs`
4. **Environment variables:** set all from `.env.example` (Render injects `PORT` automatically).
5. **Health check:** Render → Settings → Health Check → Path: `/api/healthz`
6. **Deploy.** Render runs `npm run build` then `node dist/server.cjs`.

## Deploy via Docker

```bash
# Build
docker build -t MindSpool:latest .

# Run (single instance)
docker run -d \
  --name MindSpool \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  MindSpool:latest

# Scale (3 instances behind a load balancer)
docker compose up --build --scale app=3
```

## Deploy to a VPS

```bash
# 1. SSH into the server
ssh user@your-server

# 2. Clone + install
git clone <repo-url> /app && cd /app
npm ci --production
npm run build

# 3. Start with the auto-restart wrapper
setsid bash scripts/keep-server-alive.sh </dev/null >/var/log/bd-wrapper.log 2>&1 &

# 4. Verify health
curl http://localhost:3000/api/healthz
curl http://localhost:3000/api/ready

# 5. Configure Nginx as reverse proxy (SSL termination)
#    → see Nginx config snippet below
```

### Nginx reverse proxy config

```nginx
server {
    listen 443 ssl http2;
    server_name MindSpool.app;

    ssl_certificate /etc/letsencrypt/live/MindSpool.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/MindSpool.app/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 80;
    server_name MindSpool.app;
    return 301 https://$server_name$request_uri;
}
```

## Zero-downtime deploy (rolling)

```bash
# 1. Build new version
npm run build

# 2. Verify the new server.cjs is valid
node --check dist/server.cjs

# 3. Restart — the keep-server-alive wrapper auto-restarts node within 1s
bash scripts/deploy.sh

# 4. Health check
curl -sf http://localhost:3000/api/healthz | jq -e '.status == "ok"'
```

## Rollback

```bash
# 1. Revert to the previous Git commit
git log --oneline -5
git checkout <previous-commit>

# 2. Rebuild + redeploy
npm run build
bash scripts/deploy.sh

# 3. Verify
curl http://localhost:3000/api/healthz
```

## Database migration (Supabase)

```bash
# Apply migration
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_initial_schema.sql

# Apply seed data
psql "$SUPABASE_DB_URL" -f supabase/seeds/001_seed_data.sql

# Backup before migration
bash scripts/backup-supabase.sh
```

## Post-deploy verification

```bash
# 1. Health
curl -sf https://your-domain.com/api/healthz | jq

# 2. Readiness
curl -sf https://your-domain.com/api/ready | jq

# 3. All routes return 200
for path in / /library /missions /settings /api/health /api/feed; do
  curl -s -o /dev/null -w "$path: %{http_code}\n" https://your-domain.com$path
done

# 4. SSL grade
curl -sI https://your-domain.com/ | grep -i strict-transport
```
