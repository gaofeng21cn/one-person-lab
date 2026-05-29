# OPL Docker WebUI 部署参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_docker_webui_deployment`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

这份参考文档面向在 Linux 服务器、Docker 容器或浏览器访问路径中部署 One Person Lab 的使用者和维护者。

当前性规则：本文只保留 Docker/WebUI 人读部署参考。当前镜像内容、默认端口、环境变量、auth/session 行为和 release gate 必须从 `opl-aion-shell` Dockerfile / web-cli / web-host、`one-person-lab-app` release workflow / contracts / tests、OPL `.github/workflows/packages.yml` 的 WebUI GHCR 发布 job、`src/package-distribution.ts` 的镜像坐标、`src/local-codex-defaults.ts` / `opl system configure-codex` 的 Codex profile 写入路径和实际 image manifest 读取；不要从本文推导 Full DMG payload、no-auth 模式、companion skill bundle、默认语言 build arg、provider readiness、Codex 自动初始化或 release readiness。App release Docker smoke 当前只证明 active shell Docker image build、container start、HTTP `/` 和 `/manifest.webmanifest` 可用；auth/session、resetpass 和 admin credential seeding 仍归 shell backend / web-cli 实现。

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

两条路径都以 active AionUI shell Dockerfile 为构建输入。当前 Dockerfile 的 runtime `CMD` 执行 packaged binary `./aionui-web/aionui-web start --remote --port 3000`，并打入 AionUI web-cli、SPA 静态文件和 bundled backend。不要把 Full DMG 的 runtime payload、`officecli` binary、`OPL_PACKAGED_SKILLS_ROOT=/opt/opl/skills`、Temporal/provider payload、Codex 配置初始化或 companion skill bundle 写成当前 Docker 镜像默认内容；这些 payload 属于 App Full first-install package、OPL install / managed profile 或显式挂载的 managed payload。

WebUI 容器的 runtime 环境变量由 `opl-aion-shell` 的 Dockerfile / web-cli / web-host 和实际 image manifest 决定；App release workflow 和 OPL package workflow 只负责按对应 gate 构建/验证/发布。当前远程访问和数据目录使用 `AIONUI_ALLOW_REMOTE`、`AIONUI_DATA_DIR`、`AIONUI_PORT` 与 `AIONUI_LOG_DIR`；shell web-cli 同时解析 `AIONUI_REMOTE` 作为 remote alias，但推荐部署入口仍使用 `AIONUI_ALLOW_REMOTE`。OPL package workflow 的 `VITE_OPL_DEFAULT_LANGUAGE=zh-CN` 只是当前构建输入，不是部署合同。不要把历史 `ALLOW_REMOTE`、`DATA_DIR`、未实现的 OPL no-auth 变量、`OPL_CODEX_*` profile 输入或 Full runtime payload 变量写成 plain WebUI 镜像的推荐入口。

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

## Codex 默认配置边界

当前 plain `one-person-lab-webui` 镜像的启动命令是 packaged `aionui-web` binary 的 `start --remote --port 3000`。它读取的是 shell-owned WebUI runtime 配置，不会因为 `docker run -e OPL_CODEX_MODEL=...` 或 Compose `environment:` 中出现 `OPL_CODEX_*` 就自动写入 Codex 配置。

`OPL_CODEX_*`、`CODEX_HOME` 和 `OPL_WORKSPACE_ROOT` 是 OPL CLI / managed profile 路径的输入。它们只有在容器、镜像层或维护步骤中实际运行 `opl install`、`opl system configure-codex --api-key-stdin` 或其他调用 `bootstrapLocalCodexDefaults` 的 OPL CLI 路径时才会生效。当前 WebUI Docker image reference 只声明 WebUI 容器可持久化 `/data`；Codex config 的生成必须由显式 OPL CLI 配置步骤、Full first-install package、managed payload 或预先注入的 `CODEX_HOME/config.toml` 承担。

| 变量 | 用途 |
| --- | --- |
| `AIONUI_ALLOW_REMOTE` | plain WebUI 启动路径的远程访问开关 |
| `AIONUI_DATA_DIR` | plain WebUI 启动路径的数据目录 |
| `AIONUI_PORT` / `PORT` | plain WebUI 启动端口 |
| `AIONUI_LOG_DIR` | plain WebUI log 目录 |
| `HOME` | 仅在运行 OPL CLI / Codex CLI 时作为普通进程 Home 使用 |
| `OPL_WORKSPACE_ROOT` | OPL CLI managed profile 的显式 workspace root，例如 `/data/workspaces` |
| `CODEX_HOME` | OPL CLI / Codex CLI 配置目录，例如 `/data/codex` |
| `OPL_CODEX_MODEL_PROVIDER` | OPL CLI configure/bootstrap 路径写入 `CODEX_HOME/config.toml` 的默认 model provider |
| `OPL_CODEX_MODEL` | OPL CLI configure/bootstrap 路径写入 `CODEX_HOME/config.toml` 的默认 Codex 模型 |
| `OPL_CODEX_REASONING_EFFORT` | OPL CLI configure/bootstrap 路径使用的默认 reasoning effort |
| `OPL_CODEX_PROVIDER_NAME` | OPL CLI configure/bootstrap 路径使用的 provider display/name 字段 |
| `OPL_CODEX_BASE_URL` | OPL CLI configure/bootstrap 路径使用的 OpenAI-compatible API base URL |
| `OPL_CODEX_API_KEY` | OPL CLI configure/bootstrap 路径使用的 provider API key |

plain WebUI 默认启动示例只传 WebUI runtime 变量：

```bash
docker run --rm \
  -p 3000:3000 \
  -v opl-data:/data \
  -e AIONUI_ALLOW_REMOTE=true \
  -e AIONUI_DATA_DIR=/data \
  one-person-lab-webui
```

若部署方案要求容器内持久化 Codex 默认配置，先在包含 OPL CLI 的安装或维护步骤中显式写入配置，再复用同一个 `/data` / `CODEX_HOME` volume：

```bash
printf "%s" "$OPL_CODEX_API_KEY" \
  | CODEX_HOME=/data/codex \
    OPL_CODEX_MODEL=gpt-5.5 \
    OPL_CODEX_REASONING_EFFORT=xhigh \
    OPL_CODEX_BASE_URL=https://your-provider.example/v1 \
    opl system configure-codex --api-key-stdin
```

安装和维护日志可以报告是否检测到 API key，但不应打印 key 的值。不要把上面的 OPL CLI 配置步骤写成 plain WebUI image entrypoint 已自动执行。

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

volumes:
  opl-data:
```

如果同一 Compose stack 另有包含 OPL CLI 的初始化或维护 service，可以在那里设置 `HOME=/data`、`OPL_WORKSPACE_ROOT=/data/workspaces`、`CODEX_HOME=/data/codex` 和 `OPL_CODEX_*`，并把 API key 放在宿主机 shell、部署平台 secrets 或不提交到代码仓库的 `.env` 文件里。plain WebUI service 本身不声明这些变量为生效入口。

## 验证

确认容器正在提供 WebUI：

```bash
curl -fsS http://127.0.0.1:3000/
```

WebUI auth 和 session 行为由 `opl-aion-shell` backend 持有。当前 Web host 会把 auth endpoint 反向代理给 backend，而不是在静态层内置 OPL no-auth session。App stable Docker/WebUI release gate 当前只验证镜像构建、镜像 size 记录、容器启动、HTTP `/` 和 `/manifest.webmanifest`；`/api/auth/user` 属于 shell-owned auth/session 行为的实现验证，不是 OPL package manifest 或 App stable release readiness 的替代 gate：

```bash
curl -fsS http://127.0.0.1:3000/api/auth/user
```

未登录或首次启动时，按 shell backend 的登录、initial admin password seeding 和 `aionui-web resetpass` 流程处理；不要依赖 `OPL_WEBUI_AUTH_MODE=none` 或 `AIONUI_WEBUI_AUTH_MODE=none`，这两个变量不是当前实现入口。

## 运行维护说明

- 持久化 `/data`，让 WebUI 状态在容器重启后保留；如果部署中显式运行 OPL CLI / Codex CLI，也把 workspace、Codex 配置和缓存放进同一个受管 volume。
- 需要容器内 Codex 默认配置时，使用显式 OPL CLI 配置步骤或预置 `CODEX_HOME=/data/codex`，不要只给 WebUI entrypoint 传 `OPL_CODEX_*`。
- companion skills、OfficeCLI、MinerU 和 Full runtime payload 继续走 `opl install`、`opl skill companion apply`、App Full first-install package 或显式挂载的 managed payload；不要假设 WebUI 镜像已经内置这些 payload。
- provider API key 使用部署 secrets 管理。
- OPL 主仓继续作为安装入口和合同来源；`opl-aion-shell` 作为 WebUI 实现和构建来源，`one-person-lab-app` 持有用户下载与发布面。
