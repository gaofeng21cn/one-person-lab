**English** | [中文](./opl-docker-webui-deployment.zh-CN.md)

# OPL Docker WebUI Deployment Reference

This reference is for operators who deploy One Person Lab on Linux servers, inside Docker, or behind a browser-only access path.

## Current WebUI Boundary

The user-facing WebUI is the OPL-branded AionUI shell maintained in `opl-aion-shell` and published as the One Person Lab App / WebUI build. The OPL main repository remains the installer, runtime contract, module management, and documentation surface.

The retired headless Product API Web surface is not a user WebUI path. Do not expose or document the historical local Product API port as the browser entry point for new deployments.

## Docker Image

Build the WebUI image from the `opl-aion-shell` repository:

```bash
git clone https://github.com/gaofeng21cn/opl-aion-shell.git
cd opl-aion-shell
docker build -t one-person-lab-webui .
```

Docker builds default to Simplified Chinese UI text. To rebuild with another default language:

```bash
docker build \
  --build-arg VITE_OPL_DEFAULT_LANGUAGE=en-US \
  -t one-person-lab-webui .
```

## Standard Browser Access

Run the WebUI with a persistent data directory and remote browser access enabled:

```bash
docker run --rm \
  -p 3000:3000 \
  -v opl-data:/data \
  -e ALLOW_REMOTE=true \
  -e DATA_DIR=/data \
  one-person-lab-webui
```

Open:

```text
http://127.0.0.1:3000/
```

For a server deployment, put this port behind the organization’s trusted reverse proxy, TLS, and access-control layer.

## No-Auth Mode For Trusted Deployments

For a private Docker environment where access control is already handled by the host, VPN, reverse proxy, or platform gateway, the WebUI can enter directly without the built-in login screen:

```bash
docker run --rm \
  -p 3000:3000 \
  -v opl-data:/data \
  -e ALLOW_REMOTE=true \
  -e DATA_DIR=/data \
  -e OPL_WEBUI_AUTH_MODE=none \
  one-person-lab-webui
```

`OPL_WEBUI_AUTH_MODE=none` is only appropriate for trusted local, private-network, or already-authenticated deployments. Do not expose a no-auth container directly to the public internet.

Compatibility alias:

```bash
-e AIONUI_WEBUI_AUTH_MODE=none
```

## Codex Defaults In Containers

OPL reads Codex defaults from environment variables at install or runtime. These values are not baked into the Dockerfile and should be supplied by `docker run -e`, Docker Compose `environment:`, deployment-platform environment variables, or secret managers.

| Variable | Purpose |
| --- | --- |
| `CODEX_HOME` | Codex config directory inside the container, for example `/data/codex` |
| `OPL_CODEX_MODEL` | Default Codex model written to `CODEX_HOME/config.toml` |
| `OPL_CODEX_REASONING_EFFORT` | Default reasoning effort, for example `xhigh` |
| `OPL_CODEX_BASE_URL` | Third-party OpenAI-compatible API base URL |
| `OPL_CODEX_API_KEY` | API key for the configured provider |

Example:

```bash
docker run --rm \
  -p 3000:3000 \
  -v opl-data:/data \
  -e ALLOW_REMOTE=true \
  -e DATA_DIR=/data \
  -e CODEX_HOME=/data/codex \
  -e OPL_CODEX_MODEL=gpt-5.5 \
  -e OPL_CODEX_REASONING_EFFORT=xhigh \
  -e OPL_CODEX_BASE_URL=https://your-provider.example/v1 \
  -e OPL_CODEX_API_KEY=sk-... \
  one-person-lab-webui
```

Install and maintenance logs may report whether an API key is present, but should not print the key value.

## Docker Compose Example

```yaml
services:
  one-person-lab:
    image: one-person-lab-webui:latest
    ports:
      - "3000:3000"
    volumes:
      - opl-data:/data
    environment:
      ALLOW_REMOTE: "true"
      DATA_DIR: /data
      CODEX_HOME: /data/codex
      OPL_WEBUI_AUTH_MODE: none
      OPL_CODEX_MODEL: gpt-5.5
      OPL_CODEX_REASONING_EFFORT: xhigh
      OPL_CODEX_BASE_URL: https://your-provider.example/v1
      OPL_CODEX_API_KEY: ${OPL_CODEX_API_KEY}

volumes:
  opl-data:
```

Keep `OPL_CODEX_API_KEY` in the host shell, deployment secrets, or a `.env` file that is not committed to source control.

## Verification

Check that the container is serving the WebUI:

```bash
curl -fsS http://127.0.0.1:3000/
```

In no-auth mode, the auth endpoint should identify the built-in no-auth session:

```bash
curl -fsS http://127.0.0.1:3000/api/auth/user
```

Expected shape:

```json
{
  "success": true,
  "user": {
    "id": "opl-webui-noauth",
    "username": "admin"
  }
}
```

## Operational Notes

- Persist `/data` so workspaces, Codex configuration, cache, and WebUI state survive container restarts.
- Use `CODEX_HOME=/data/codex` when the container should keep Codex defaults with the rest of the OPL state.
- Use deployment secrets for provider API keys.
- Keep the OPL main repository as the documented installer and contract source; keep `opl-aion-shell` as the WebUI implementation and build source.
