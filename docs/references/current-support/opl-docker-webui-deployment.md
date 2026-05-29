# OPL Docker WebUI 部署参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_docker_webui_deployment`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

这份参考文档面向在 Linux 服务器、Docker 容器或浏览器访问路径中部署 One Person Lab 的使用者和维护者。

当前性规则：本文只保留 Docker/WebUI 人读部署参考。当前镜像内容、默认端口、环境变量、auth/session 行为和 release gate 必须从 `opl-aion-shell` Dockerfile / web-cli / web-host、`one-person-lab-app` release workflow / contracts / tests、OPL `.github/workflows/packages.yml` 的 WebUI GHCR 发布 job、`src/package-distribution.ts` 的镜像坐标和实际 image manifest 读取；不要从本文推导 Full DMG payload、no-auth 模式、companion skill bundle、默认语言 build arg、provider readiness 或 release readiness。

## 当前 WebUI 边界

面向用户的 WebUI 是 `opl-aion-shell` 维护的 One Person Lab 品牌 AionUI 壳，并由 `one-person-lab-app` 作为 App/WebUI 产品发布和 release gate owner。OPL 主仓继续负责安装入口、运行时合同、模块管理、文档和 GHCR WebUI 镜像坐标；当前 OPL packages workflow 只是从 App repo 的 active shell checkout 构建并推送机器镜像，不接管 App release truth。

已退役的 headless Product API Web surface 不是用户 WebUI 入口。新的部署说明不要把历史本地 Product API 端口写成浏览器入口。

## Docker 镜像

从 shell 仓构建 WebUI 镜像：

```bash
git clone https://github.com/gaofeng21cn/opl-aion-shell.git
cd opl-aion-shell
docker build -t one-person-lab-webui .
```

当前 WebUI 有两条不同机器路径：

- App release gate 在 `one-person-lab-app` 的 release workflow 中从 `shells/aionui` 构建并 smoke Docker WebUI。
- OPL 中央 package workflow 在 `.github/workflows/packages.yml` 中从 `one-person-lab-app#main:shells/aionui` 构建并推送 `ghcr.io/<owner>/one-person-lab-webui:<opl_version>` 和 `latest`。

两条路径都以 active AionUI shell Dockerfile 为构建输入。镜像入口是 `aionui-web start --remote --port 3000`，并打入 AionUI web-cli、SPA 静态文件和 bundled backend。不要把 Full DMG 的 runtime payload、`officecli` binary、`OPL_PACKAGED_SKILLS_ROOT=/opt/opl/skills`、Temporal/provider payload、Codex 配置初始化或 companion skill bundle 写成当前 Docker 镜像默认内容；这些 payload 属于 App Full first-install package、OPL install / managed profile 或显式挂载的 managed payload。

WebUI 容器的 runtime 环境变量由 `opl-aion-shell` 的 Dockerfile / web-cli / web-host 和实际 image manifest 决定；App release workflow 和 OPL package workflow 只负责按对应 gate 构建/验证/发布。当前远程访问和数据目录使用 `AIONUI_ALLOW_REMOTE`、`AIONUI_DATA_DIR`、`AIONUI_PORT` 与 `AIONUI_LOG_DIR`；OPL package workflow 的 `VITE_OPL_DEFAULT_LANGUAGE=zh-CN` 只是当前构建输入，不是部署合同。不要把历史 `ALLOW_REMOTE`、`DATA_DIR`、未实现的 OPL no-auth 变量或 Full runtime payload 变量写成推荐入口。

## 标准浏览器访问

用持久化数据目录和远程浏览器访问启动 WebUI：

```bash
docker run --rm \
  -p 3000:3000 \
  -v opl-data:/data \
  -e AIONUI_ALLOW_REMOTE=true \
  -e AIONUI_DATA_DIR=/data \
  one-person-lab-webui
```

打开：

```text
http://127.0.0.1:3000/
```

服务器部署时，应把这个端口放在可信反向代理、TLS 和访问控制层之后。

## 容器中的 Codex 默认配置

OPL 在安装或运行时从环境变量读取 Codex 默认配置。这些值不是写死在 Dockerfile 里，而是通过 `docker run -e`、Docker Compose `environment:`、部署平台环境变量或 secret manager 注入。

没有显式指定 workspace root 时，OPL 会使用容器用户的 Home 目录。持久化 Docker 部署建议设置 `HOME=/data`，或显式设置 `OPL_WORKSPACE_ROOT=/data/workspaces`，这样容器替换后 workspace 仍然保留。

| 变量 | 用途 |
| --- | --- |
| `HOME` | 默认 Home；未设置 `OPL_WORKSPACE_ROOT` 时也作为隐式 workspace root |
| `OPL_WORKSPACE_ROOT` | 显式 workspace root，例如 `/data/workspaces` |
| `CODEX_HOME` | 容器内 Codex 配置目录，例如 `/data/codex` |
| `OPL_CODEX_MODEL` | 写入 `CODEX_HOME/config.toml` 的默认 Codex 模型 |
| `OPL_CODEX_REASONING_EFFORT` | 默认 reasoning effort，例如 `xhigh` |
| `OPL_CODEX_BASE_URL` | 第三方 OpenAI-compatible API base URL |
| `OPL_CODEX_API_KEY` | 对应 provider 的 API key |

示例：

```bash
docker run --rm \
  -p 3000:3000 \
  -v opl-data:/data \
  -e AIONUI_ALLOW_REMOTE=true \
  -e AIONUI_DATA_DIR=/data \
  -e HOME=/data \
  -e OPL_WORKSPACE_ROOT=/data/workspaces \
  -e CODEX_HOME=/data/codex \
  -e OPL_CODEX_MODEL=gpt-5.5 \
  -e OPL_CODEX_REASONING_EFFORT=xhigh \
  -e OPL_CODEX_BASE_URL=https://your-provider.example/v1 \
  -e OPL_CODEX_API_KEY=sk-... \
  one-person-lab-webui
```

安装和维护日志可以报告是否检测到 API key，但不应打印 key 的值。

## Docker Compose 示例

```yaml
services:
  one-person-lab:
    image: one-person-lab-webui:latest
    ports:
      - "3000:3000"
    volumes:
      - opl-data:/data
    environment:
      AIONUI_ALLOW_REMOTE: "true"
      AIONUI_DATA_DIR: /data
      HOME: /data
      OPL_WORKSPACE_ROOT: /data/workspaces
      CODEX_HOME: /data/codex
      OPL_CODEX_MODEL: gpt-5.5
      OPL_CODEX_REASONING_EFFORT: xhigh
      OPL_CODEX_BASE_URL: https://your-provider.example/v1
      OPL_CODEX_API_KEY: ${OPL_CODEX_API_KEY}

volumes:
  opl-data:
```

`OPL_CODEX_API_KEY` 应放在宿主机 shell、部署平台 secrets 或不提交到代码仓库的 `.env` 文件里。

## 验证

确认容器正在提供 WebUI：

```bash
curl -fsS http://127.0.0.1:3000/
```

WebUI auth 和 session 行为由 `opl-aion-shell` backend 持有。当前 Web host 会把 auth endpoint 反向代理给 backend，而不是在静态层内置 OPL no-auth session：

```bash
curl -fsS http://127.0.0.1:3000/api/auth/user
```

未登录或首次启动时，按 shell backend 的登录 / resetpass 流程处理；不要依赖 `OPL_WEBUI_AUTH_MODE=none` 或 `AIONUI_WEBUI_AUTH_MODE=none`，这两个变量不是当前实现入口。

## 运行维护说明

- 持久化 `/data`，让 workspace、Codex 配置、缓存和 WebUI 状态在容器重启后保留。
- 容器内建议使用 `CODEX_HOME=/data/codex`，让 Codex 默认配置跟随 OPL 状态一起保存。
- companion skills、OfficeCLI、MinerU 和 Full runtime payload 继续走 `opl install`、`opl skill companion apply`、App Full first-install package 或显式挂载的 managed payload；不要假设 WebUI 镜像已经内置这些 payload。
- provider API key 使用部署 secrets 管理。
- OPL 主仓继续作为安装入口和合同来源；`opl-aion-shell` 作为 WebUI 实现和构建来源，`one-person-lab-app` 持有用户下载与发布面。
