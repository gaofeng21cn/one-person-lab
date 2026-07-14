# OPL Docker WebUI 部署参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_docker_webui_deployment`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

这份参考文档面向在 Linux 服务器、Docker 容器或浏览器访问路径中部署 One Person Lab 的使用者和维护者。

当前性规则：本文只保留 Docker/WebUI 人读部署参考。当前镜像内容、默认端口、环境变量、auth/session 行为和 release gate 必须从 `opl-aion-shell` Dockerfile / web-cli / web-host、`one-person-lab-app` release workflow / contracts / tests、App-owned WebUI GHCR 发布证据、`src/local-codex-defaults.ts` / `opl system configure-codex` 的 Codex profile 写入路径、`opl system docker-webui doctor --json` 的只读排障 read model、`opl system seed-apply --json` / `opl system startup-maintenance --json` 的 seed readback 和实际 image manifest 读取；不要从本文推导 Full DMG payload、no-auth 模式、companion skill bundle、默认语言 build arg、provider readiness、Codex 自动初始化或 release readiness。App release Docker smoke 当前只证明 active shell Docker image build、container start、HTTP `/` 和 `/manifest.webmanifest` 可用；auth/session、resetpass 和 admin credential seeding 仍归 shell backend / web-cli 实现。

## 当前 WebUI 边界

面向用户的 WebUI 是 `opl-aion-shell` 维护的 One Person Lab 品牌 AionUI 壳，并由 `one-person-lab-app` 作为 App/WebUI 产品发布和 release gate owner。OPL 主仓继续负责安装入口、运行时合同、模块管理和文档；WebUI 镜像坐标、构建发布和 release gate 归 App 仓，不再由 Framework package manifest 暴露。

已退役的 headless Product API Web surface 不是用户 WebUI 入口。新的部署说明不要把历史本地 Product API 端口写成浏览器入口。

## Docker 镜像

从 shell 仓构建 WebUI 镜像：

```bash
git clone https://github.com/gaofeng21cn/opl-aion-shell.git
cd opl-aion-shell
docker build -t one-person-lab-webui .
```

当前 WebUI 机器路径归 App owner：

- App release gate 在 `one-person-lab-app` 的 release workflow 中从 `shells/aionui` 构建并 smoke Docker WebUI。

该路径以 active AionUI shell Dockerfile 为构建输入。当前 Dockerfile 的 runtime `CMD` 执行 packaged binary `./aionui-web/aionui-web start --remote --port 3000`，并打入 AionUI web-cli、SPA 静态文件和 bundled backend。不要把 Full DMG 的 runtime payload、`officecli` binary、`OPL_PACKAGED_SKILLS_ROOT=/opt/opl/skills`、Temporal/provider payload、Codex 配置初始化或 companion skill bundle 写成当前 Docker 镜像默认内容；这些 payload 属于 App Full first-install package、OPL install / managed profile 或显式挂载的 managed payload。

WebUI 容器的 runtime 环境变量由 `opl-aion-shell` 的 Dockerfile / web-cli / web-host 和实际 image manifest 决定；App release workflow 负责按 App gate 构建/验证/发布。当前远程访问和数据目录使用 `AIONUI_ALLOW_REMOTE`、`AIONUI_DATA_DIR`、`AIONUI_PORT` 与 `AIONUI_LOG_DIR`；shell web-cli 同时解析 `AIONUI_REMOTE` 作为 remote alias，但推荐部署入口仍使用 `AIONUI_ALLOW_REMOTE`。App package/release 构建输入不是 OPL Framework 部署合同。不要把历史 `ALLOW_REMOTE`、`DATA_DIR`、未实现的 OPL no-auth 变量、`OPL_CODEX_*` profile 输入或 Full runtime payload 变量写成 plain WebUI 镜像的推荐入口。

## Seed Manifest 与自维护入口

预热版 Docker/WebUI 镜像可以把 OPL Framework、模块/skill seed、Codex/toolchain 和镜像 manifest 作为镜像层输入；持久化运行状态仍应落在数据卷。OPL CLI 的 seed 维护入口是：

```bash
opl system docker-webui doctor --json

opl system seed-apply \
  --from /opt/opl/seed \
  --data-dir /data \
  --projects-dir /projects \
  --json
```

`opl system docker-webui doctor --json` 是排障用只读 JSON read model。它聚合可见的 `AIONUI_DATA_DIR` / `OPL_DATA_DIR` / `OPL_PROJECTS_DIR`、`install-manifest.json` 状态、镜像版本 / digest、`startup-maintenance` 下一步 guidance、Codex API key presence readback、可推导的浏览器 URL / port env，以及 `docker_runtime` 下的 Docker CLI / daemon、WebUI 容器、镜像、`/data` 和 `/projects` mount、端口绑定只读 readback；它不执行修复、不创建目录、不运行 startup-maintenance、不写 API key、不 pull image、不启停容器、不声明 release ready、runtime ready 或 module current。稳定顶层状态是 `ok`、`attention`、`not_configured`；首启状态机字段在 `startup_state.phase` 中表达 `not_configured`、`api_key_missing`、`needs_startup_maintenance`、`initializing`、`seed_applied`、`enterable`、`repairable_failure`；单项 observation 使用 `configured`、`not_configured`、`reachable`、`unreachable`、`exists`、`missing`、`found`、`invalid`、`not_visible`、`present`。`diagnostic_summary` 是安装器 / 教程友好的扁平汇总，包含 image version / digest、Docker runtime / daemon / container / image status、data/projects、browser URL、install manifest、startup maintenance、API key、next actions，并固定 `runtime_readiness_claim: not_claimed` / `can_claim_runtime_ready: false`。

`opl system startup-maintenance --json` 也会执行同一 seed apply，并在 `system_action.details.seed_boundary` 返回本次镜像 seed、Framework 安装目录、Codex/toolchain、modules/skills、数据目录和项目目录的 receipt 状态。两条路径都会写入：

```text
/data/opl/state/install-manifest.json
```

如果显式设置 `OPL_STATE_DIR`，状态文件写入 `${OPL_STATE_DIR}/install-manifest.json`；WebUI 部署推荐让它指向 `/data/opl/state`。

seed apply 读取的输入：

| 输入 | 用途 |
| --- | --- |
| `--from <seed-dir>` / `OPL_IMAGE_SEED_DIR` | 镜像内预热 seed 目录；canonical 路径是 `/opt/opl/seed`，metadata 文件是 `/opt/opl/seed/metadata.json` |
| `--data-dir <data-dir>` / `OPL_DATA_DIR` / `AIONUI_DATA_DIR` | OPL CLI 维护路径的数据目录；显式 CLI 参数优先 |
| `--projects-dir <projects-dir>` / `OPL_PROJECTS_DIR` | 项目目录；未设置时默认为 `<data-dir>/projects` |
| `OPL_IMAGE_MANIFEST_PATH` | 镜像内提供的 image manifest JSON 路径；canonical 路径是 `/opt/opl/image-manifest.json`，用于报告镜像入口版本、digest、revision 和 `seed_strategy` |
| `OPL_IMAGE_SEED_METADATA_PATH` | seed metadata JSON 路径；未设置时优先读 `/opt/opl/seed/metadata.json` |
| `OPL_STATE_DIR` | OPL 状态目录；推荐 `/data/opl/state` |

`install-manifest.json` 是 OPL Framework 的安装/seed 边界 readback，不是 release readiness、provider readiness、domain truth、owner receipt、typed blocker 或 human gate。组件 receipt 至少区分：

- `image_manifest`
- `opl_framework`
- `codex_cli`
- `companion_skills`
- `domain_modules`
- `data_dir`
- `projects_dir`

镜像 manifest 的 canonical 路径是 `/opt/opl/image-manifest.json`。`seed_strategy` 只接受 `payload_manifest`、`payload_preheated` 或 `metadata_only`；`metadata_only` 只允许 slim 镜像，stable/latest full seed 禁止，不能新增 `manifest_payload_dir` 这类第三种名字。

镜像 seed metadata 文件是 `/opt/opl/seed/metadata.json`，schema 固定为 `dev.onepersonlab.opl-webui-image-seed.v1`。full seed 至少应包含 `opl_framework`、`codex_cli`、`companion_skills` 和 `domain_modules` 四类组件。每个组件应提供 `id`、`version`、`source`、`payload_path`、`receipt_kind`，并提供 `sha256` 或 `source_fingerprint`。`seed-apply` 会把这些 payload materialize 到 data volume 下的 Framework-owned 位置，并在 public `components[]` 与 `receipts[]` 中写入 canonical `component_id`、`component_kind`、`receipt_ref`、`payload_path`、`materialized_path`、`receipt_kind`、`sha256` / `source_fingerprint` 和 size。旧内部 id `framework_install_dir`、`codex_toolchain`、`modules_skills` 只可作为 legacy input mapping，不应出现在 public install manifest / CLI JSON 给 App/Shell gate 消费。

`component_kind` / receipt operation 只允许表达：

- `image_seed`：来自镜像 seed 的首次物化或观察。
- `managed_update`：由 Framework managed update / runtime toolchain 维护的观察面。
- `migration`：数据卷目录和项目目录等 persistent volume reconcile。

组件状态只表示本次命令是否观察到或物化对应文件或目录；缺少可验证输入时报告 `pending` 或 `not_available`。`opl system` 和 `opl system initialize` 的 `seed_install` read model 会回显 `image_version`、`image_digest`、`data_dir`、`projects_dir` 和 manifest 路径，并显式报告 `readiness_claim: not_claimed` / `can_claim_ready_or_current: false`。

`opl system startup-maintenance --json` 的 `system_action.details.docker_webui_startup` 复用 doctor 的只读首启状态机，但 `startup_maintenance.execution_policy` 会标成 `executed_by_startup_maintenance`。这只说明本次维护命令已经执行 seed/materialization 和 managed-maintenance 路径；如果 `api_key.status` 仍是 `missing`，安装器应提示运行 `opl system configure-codex --api-key-stdin --json`，不要把 seed applied 展示成 Codex provider 或 runtime ready。

## App / Settings 默认入口

Framework 侧默认 Settings read-model 通过 `opl app state --profile fast|full --json#settings_control_center` 暴露 Docker/WebUI action section。App / WebUI shell 应消费这些 action refs，而不是自己推导 Docker、seed、API key 或 startup 状态：

| action_id | 现有委托入口 | 用户含义 |
| --- | --- | --- |
| `settings_install_docker_webui` | `opl install --headless` | 执行 Framework 统一 headless 基座入口；不声明 App/WebUI release ready |
| `settings_configure_webui_api_key` | `printf <api-key> \| opl system configure-codex --api-key-stdin --json` | 通过 stdin-only 路径写 Codex provider config；API key 不进入 Settings JSON payload |
| `settings_select_webui_seed` | `OPL_IMAGE_MANIFEST_PATH=<manifest> OPL_IMAGE_SEED_DIR=<seed> opl system startup-maintenance --json` | 选择镜像 manifest / seed 输入并进入既有维护路径 |
| `settings_run_webui_startup_maintenance` | `opl system startup-maintenance --json` | 执行 seed/materialization 和 managed-maintenance，返回 Docker WebUI startup readback |
| `settings_open_docker_webui` | `opl system docker-webui doctor --json#docker_webui_doctor.browser.url` | 从 doctor read model 读取浏览器 URL；实际打开浏览器归 App shell |
| `settings_diagnose_docker_webui` | `opl system docker-webui doctor --json` | 只读诊断 Docker CLI、daemon、container、image、mount、port、seed、API key 和下一步 |

这些 action 的 authority boundary 仍固定为不能写 domain truth、owner receipt、typed blocker、runtime/provider queue，也不能声明 App release ready、runtime ready 或 production ready。Live Evidence、release evidence、真实容器访问和 owner acceptance 仍是后置验收 lane。

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
| `OPL_IMAGE_MANIFEST_PATH` | OPL CLI seed/app startup-maintenance 路径读取的镜像 manifest |
| `OPL_IMAGE_SEED_DIR` | OPL CLI seed/app startup-maintenance 路径读取的镜像 seed 目录 |
| `OPL_WEBUI_IMAGE` | `opl system docker-webui doctor --json` 用于只读 `docker image inspect` 的 WebUI image ref；未设置时尝试从 seed manifest image refs 读取 |
| `OPL_DATA_DIR` | OPL CLI seed/app startup-maintenance 路径的数据目录；未设置时可由 `AIONUI_DATA_DIR` 提供 |
| `OPL_PROJECTS_DIR` | OPL CLI seed/app startup-maintenance 路径的项目目录；默认 `<data-dir>/projects` |
| `OPL_STATE_DIR` | OPL CLI 状态目录，例如 `/data/opl/state` |
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
    OPL_CODEX_MODEL=gpt-5.6-sol \
    OPL_CODEX_REASONING_EFFORT=max \
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

预热镜像的维护 service 可以在 WebUI 启动前运行：

```bash
HOME=/data \
CODEX_HOME=/data/codex \
AIONUI_DATA_DIR=/data \
OPL_STATE_DIR=/data/opl/state \
OPL_PROJECTS_DIR=/projects \
OPL_IMAGE_MANIFEST_PATH=/opt/opl/image-manifest.json \
OPL_IMAGE_SEED_DIR=/opt/opl/seed \
OPL_IMAGE_SEED_METADATA_PATH=/opt/opl/seed/metadata.json \
opl system startup-maintenance --json
```

如果维护 service 只执行 seed materialization，也可以用显式参数，不需要写宿主全局目录：

```bash
HOME=/data \
CODEX_HOME=/data/codex \
opl system seed-apply \
  --from /opt/opl/seed \
  --data-dir /data \
  --projects-dir /projects \
  --json
```

WebUI 可以读取 `system_action.details.seed_boundary` 或后续 `opl system initialize --json` 的 `system_initialize.seed_install` 展示“镜像入口版本”和“OPL 数据卷安装状态”。

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
- 把用户项目目录作为独立 `/projects` 挂载；用 `OPL_PROJECTS_DIR` 告诉 OPL CLI 当前项目根。
- 预热版镜像启动维护用 `opl system seed-apply --from <seed-dir> --data-dir /data --projects-dir <projects-dir> --json` 或 `opl system startup-maintenance --json` 写入 `/data/opl/state/install-manifest.json`，供 WebUI 展示 seed/install readback。
- 需要容器内 Codex 默认配置时，使用显式 OPL CLI 配置步骤或预置 `CODEX_HOME=/data/codex`，不要只给 WebUI entrypoint 传 `OPL_CODEX_*`。
- companion skills、OfficeCLI、MinerU 和 Full runtime payload 继续走 `opl install`、`opl skill companion apply`、App Full first-install package 或显式挂载的 managed payload；不要假设 WebUI 镜像已经内置这些 payload。
- provider API key 使用部署 secrets 管理。
- OPL 主仓继续作为安装入口和合同来源；`opl-aion-shell` 作为 WebUI 实现和构建来源，`one-person-lab-app` 持有用户下载与发布面。
