# Production deploy (Oracle Cloud / self-hosted)

Split containers: **gateway** + **ai-runtime** + **postgres/redis/qdrant** via `infra/docker/compose.production.yml`.

## Architecture

```
Internet → Caddy (:443) → gateway (:10000) → ai-runtime (:8000, internal)
                              ↓
                    postgres / redis / qdrant (no public ports)
```

## Deploy strategies

| Strategy | When | CI job |
|----------|------|--------|
| **VM build** (default) | No OCIR, or first-time setup | `deploy-vm-build` |
| **OCIR pull** | Set repo variable `USE_OCIR=true`, or manual workflow with OCIR enabled | `build-and-deploy` |

Scripts:

| Script | Purpose |
|--------|---------|
| `remote-deploy.sh` | CI entry point: git sync, deploy lock, strategy dispatch |
| `build-and-deploy.sh` | Build images on VM, then start stack |
| `deploy.sh` | Pull images (or use local tags), start stack, migrate, health check |

## Oracle Cloud checklist

### 1. Compute (VM)

| Setting | Value |
|---------|--------|
| Shape | `VM.Standard.A1.Flex` (Ampere, ARM64) |
| OS | Ubuntu 22.04 or 24.04 |
| RAM | 8 GB+ recommended (4 GB minimum) |
| Boot volume | 50 GB+ |

### 2. Networking

Open ingress to `0.0.0.0/0` only for ports **22**, **80**, and **443**.

Do not expose postgres, redis, qdrant, or gateway port 10000 publicly. Caddy terminates TLS on 443 and proxies to localhost:10000.

### 3. DNS

Point `api.aiassistant.dartix.live` (A record) to the VM public IP.

Set in `.env.production`:

- `API_PUBLIC_URL=https://api.aiassistant.dartix.live`
- `NEXT_PUBLIC_API_URL=https://api.aiassistant.dartix.live`

Update Google OAuth redirect URIs to match.

### 4. OCIR (optional)

Create repos `ai-assistant-gateway` and `ai-assistant-ai-runtime` in the same region as the VM.

| Field | Value |
|-------|--------|
| Registry | `<region>.ocir.io` (e.g. `ap-mumbai-1.ocir.io`) |
| Username | `<namespace>/oracleidentitycloudservice/<email>` |
| Password | OCI **Auth Token** (not account password) |

`OCI_REGION` secret must be the region id only (e.g. `ap-mumbai-1`).

Enable OCIR deploy: repository variable `USE_OCIR=true`, or run workflow manually with OCIR enabled.

### 5. GitHub secrets

| Secret | Example |
|--------|---------|
| `OCI_REGION` | `ap-mumbai-1` |
| `OCI_TENANCY_NAMESPACE` | from OCI tenancy |
| `OCI_USERNAME` | `namespace/oracleidentitycloudservice/you@email.com` |
| `OCI_AUTH_TOKEN` | OCI auth token |
| `OCI_VM_HOST` | VM public IP |
| `OCI_VM_USER` | `ubuntu` |
| `OCI_VM_SSH_KEY` | private SSH key (full PEM) |
| `DEPLOY_HEALTH_URL` | `https://api.aiassistant.dartix.live` |

Create GitHub **environment** `production`.

For a private repo, add a deploy key on the VM and use SSH remote URL for `git clone`.

## One-time VM setup

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

sudo mkdir -p /opt && sudo chown $USER:$USER /opt
git clone git@github.com:ORG/Ai-Assistant.git /opt/ai-assistant
cd /opt/ai-assistant
cp .env.production.example .env.production
chmod +x infra/deploy/*.sh
./infra/deploy/build-and-deploy.sh
```

Install Caddy from `infra/deploy/Caddyfile.example` for HTTPS.

`.env.production` is gitignored. CI will not overwrite it.

## CI/CD flow

1. `verify` — tests and workspace build.
2. **Default:** SSH → `remote-deploy.sh` with `DEPLOY_STRATEGY=build`.
3. **With OCIR:** build and push images in CI, then SSH → `remote-deploy.sh` with `DEPLOY_STRATEGY=pull`.

Manual deploy: **Actions → Deploy → Run workflow**.

## Manual deploy on VM

Pull from OCIR:

```bash
export GATEWAY_IMAGE=<region>.ocir.io/<namespace>/ai-assistant-gateway:latest
export AI_RUNTIME_IMAGE=<region>.ocir.io/<namespace>/ai-assistant-ai-runtime:latest
export DEPLOY_HEALTH_URL=https://api.aiassistant.dartix.live
export OCI_REGISTRY=<region>.ocir.io
export OCI_USERNAME=<namespace>/oracleidentitycloudservice/you@email.com
export OCI_AUTH_TOKEN=<token>
./infra/deploy/deploy.sh
```

Build locally: `./infra/deploy/build-and-deploy.sh`

## Verify deployment

```bash
curl https://api.aiassistant.dartix.live/health
curl https://api.aiassistant.dartix.live/health/ready
docker compose -p ai-assistant -f infra/docker/compose.production.yml ps
```

## Troubleshooting

**Deploy timed out in GitHub Actions.** First VM build can exceed 90 minutes on small shapes. The workflow allows 180 minutes. If it still fails, SSH to the VM and run `./infra/deploy/build-and-deploy.sh` once.

**VM unreachable during deploy.** Docker builds on low-RAM instances can exhaust memory. Restart the instance in OCI Console, then run a single deploy (do not run CI and manual deploy concurrently).

**OCIR Unauthorized.** Regenerate the auth token, confirm username format and region match the VM. Use VM build (default) until OCIR credentials are fixed.
