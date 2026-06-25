# Production deploy (Oracle Cloud / self-hosted)

Split containers: **gateway** + **ai-runtime** + **postgres/redis/qdrant** via `infra/docker/compose.production.yml`.

## Architecture

```
Internet → Caddy (:443) → gateway (:10000) → ai-runtime (:8000, internal)
                              ↓
                    postgres / redis / qdrant (no public ports)
```

Push to `main` → GitHub Actions builds images → OCIR → SSH deploy on VM.

## Oracle Cloud checklist

### 1. Compute (VM)

| Setting | Value |
|---------|--------|
| Shape | `VM.Standard.A1.Flex` (Ampere, ARM64 — images are multi-arch) |
| OS | Ubuntu 22.04 or 24.04 |
| RAM | 8 GB+ recommended (4 GB minimum) |
| Boot volume | 50 GB+ |

### 2. Networking (VCN security list / NSG)

Open **only** these ingress rules to `0.0.0.0/0`:

| Port | Purpose |
|------|---------|
| 22 | SSH |
| 80 | HTTP (Caddy → Let's Encrypt) |
| 443 | HTTPS |

Do **not** open 5432, 6379, 6333, or 10000 publicly — Caddy terminates TLS on 443 and proxies to localhost:10000.

### 3. DNS

Create an `A` record for `api.aiassistant.dartix.live` → VM public IP.

If your DNS zone is `dartix.live`, set **Name/Host** to `api.aiassistant` (not `api` alone).

Set the same URL in `.env.production`:

- `API_PUBLIC_URL=https://api.aiassistant.dartix.live`
- `NEXT_PUBLIC_API_URL=https://api.aiassistant.dartix.live`

Update Google OAuth authorized redirect URIs to match.

### 4. OCIR (Container Registry)

In OCI Console → Developer Services → Container Registry:

1. Create repos: `ai-assistant-gateway`, `ai-assistant-ai-runtime`
2. Note **Tenancy namespace** (Object Storage namespace)
3. Create an **Auth Token** for your user (Profile → Auth Tokens)

Login format:

- Registry: `<region>.ocir.io`
- Username: `<tenancy-namespace>/oracleidentitycloudservice/<your-email>`
- Password: auth token (not account password)

### 5. GitHub

Add repository secrets (Settings → Secrets → Actions):

| Secret | Example |
|--------|---------|
| `OCI_REGION` | `uk-london-1` |
| `OCI_TENANCY_NAMESPACE` | from OCI tenancy |
| `OCI_USERNAME` | `namespace/oracleidentitycloudservice/you@email.com` |
| `OCI_AUTH_TOKEN` | OCI auth token |
| `OCI_VM_HOST` | VM public IP |
| `OCI_VM_USER` | `ubuntu` |
| `OCI_VM_SSH_KEY` | private SSH key (full PEM) |
| `DEPLOY_HEALTH_URL` | `https://api.aiassistant.dartix.live` |

Create GitHub **environment** `production` (Settings → Environments).

For a **private repo**, add a deploy key on the VM:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub   # add as deploy key in GitHub repo settings
git remote set-url origin git@github.com:ORG/Ai-Assistant.git
```

## One-time VM setup

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in

# Caddy (TLS)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
sudo cp /opt/ai-assistant/infra/deploy/Caddyfile.example /etc/caddy/Caddyfile
# edit domain, then: sudo systemctl reload caddy

# App
sudo mkdir -p /opt && sudo chown $USER:$USER /opt
git clone git@github.com:ORG/Ai-Assistant.git /opt/ai-assistant
cd /opt/ai-assistant
cp .env.production.example .env.production   # fill secrets + real domain
chmod +x infra/deploy/*.sh
./infra/deploy/bootstrap-vm.sh
```

`.env.production` is gitignored — CI deploys will not overwrite it.

OCIR login on the VM is **automatic** during CI deploy (credentials passed via SSH). Manual pull still works after `docker login <region>.ocir.io`.

## CI/CD flow

1. `.github/workflows/deploy.yml` runs tests.
2. Builds and pushes both images to OCIR (`:sha` + `:latest`).
3. SSH to VM → `git pull` → `infra/deploy/deploy.sh`.
4. Deploy logs into OCIR, pulls images, recreates gateway + ai-runtime, runs migrations, health check.

Manual deploy: **Actions → Deploy → Run workflow**.

## Local production smoke

```bash
pnpm docker build
pnpm docker up production
pnpm docker down production   # tear down
```

## Manual deploy on VM

```bash
export GATEWAY_IMAGE=<region>.ocir.io/<namespace>/ai-assistant-gateway:latest
export AI_RUNTIME_IMAGE=<region>.ocir.io/<namespace>/ai-assistant-ai-runtime:latest
export DEPLOY_HEALTH_URL=https://api.aiassistant.dartix.live
export OCI_REGISTRY=<region>.ocir.io
export OCI_USERNAME=<namespace>/oracleidentitycloudservice/you@email.com
export OCI_AUTH_TOKEN=<token>
./infra/deploy/deploy.sh
```

Skip image pull (local build): `SKIP_PULL=true ./infra/deploy/deploy.sh`

## Production hardening notes

- Infra ports (postgres/redis/qdrant) are **not** published to the host in `compose.production.yml`.
- Gateway WhatsApp session files persist in Docker volume `gateway_data`.
- Change default postgres password in `compose.core.yml` + `DATABASE_URL` for real production (or use OCI managed PostgreSQL later).
- Mobile app: set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.production` to match `API_PUBLIC_URL`, then EAS build.

## Verify deployment

```bash
curl https://api.aiassistant.dartix.live/health
curl https://api.aiassistant.dartix.live/health/ready
docker compose -p ai-assistant -f infra/docker/compose.production.yml ps
```
