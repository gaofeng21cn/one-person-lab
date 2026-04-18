# OPL Desktop bootstrap and LibreChat retirement-lane design

## Context

- 当前 `opl frontdesk-bootstrap` 实际调用的是 `frontdesk-librechat-install`，默认 GUI 入口仍依赖 Docker。
- 用户已经确认本地默认入口要收口到桌面端，Docker 驱动的 LibreChat 只保留为可选兼容 lane。
- 仓库里已经有 `opl web`、`frontdesk-entry-guide`、`project-progress`、`workspace-inbox` 这些 OPL 自有 truth surface，可以先直接复用，不必等待另一套前端重写完成。

## Goal

这次 slice 只做四件事：

1. 把 `opl frontdesk-bootstrap` 从 LibreChat 默认安装入口切到 Desktop 默认入口。
2. 落下一套 repo-tracked 的 `OPL Atlas` 桌面骨架，作为本地 GUI frontdoor。
3. 让 Desktop 默认复用现有 `opl web` / frontdesk API truth，而不是再发明第二套状态系统。
4. 把 LibreChat 降为显式 optional lane，只保留 `frontdesk-librechat-*` 与 hosted pilot/package 能力。

## Non-goals

- 不在这一 tranche 重写 `opl web` 的全部渲染层。
- 不在这一 tranche 交付完整的 macOS signed app bundle。
- 不移除 LibreChat package / hosted pilot export。
- 不改 Hermes runtime、domain runtime 或 domain handoff contract。

## Technical route

技术路线分两层：

1. `Desktop shell`
   - 使用 `Electron` 作为桌面壳。
   - `OPL Atlas` 先做成本地 Electron shell，直接加载本机 `opl web` frontdesk URL。
   - Desktop config 由 OPL 自己写入 frontdesk state dir，避免 GUI 自己猜端口、workspace 和 bootstrap 顺序。

2. `Truth and bootstrap`
   - `frontdesk-bootstrap` 负责：
     - 安装 / 启动本地 `opl web` service
     - 绑定当前 workspace
     - 写入 desktop bootstrap config
     - 导出 Desktop launch contract
   - `frontdesk-librechat-install` 继续保留为 optional Docker lane。

## Design

### 1. 新增 Desktop bootstrap state

在 frontdesk state dir 新增：

- `desktop-config.json`
- `desktop-pilot/`

其中：

- `desktop-config.json` 保存 Desktop 需要的本地 frontdesk URL、workspace path、sessions limit、active project 等最小启动配置。
- `desktop-pilot/` 保存 Electron app 所需的 repo-tracked package/shell 资产。

### 2. `frontdesk-bootstrap` 的新语义

`opl frontdesk-bootstrap --path <workspace>` 现在表示：

- 准备本机 Desktop frontdoor
- 安装并启动本地 `opl web` service
- 同步 Desktop bootstrap config
- 对 MAS workspace 继续保留 profile-based workspace bind
- 返回 `frontdesk_desktop` payload，而不是 `frontdesk_librechat` payload

### 3. Desktop shell first, renderer later

当前 tranche 的桌面前台优先复用现有 `opl web`：

- Electron shell 负责桌面窗口、加载 URL、错误兜底页和本地配置读取。
- 真正的 `workspace -> task -> file -> progress` 用户面继续由 `opl web` 提供。
- 后续若要把 renderer 迁到 React/Vite，那是下一 tranche；当前先把默认入口与产品路径收稳。

### 4. LibreChat retirement policy

本轮之后，LibreChat 的定位固定为：

- `optional_local_shell`
- `hosted_pilot_reference`
- `migration_bridge`

默认用户路径不再推荐：

- `opl frontdesk-bootstrap -> LibreChat`

默认用户路径改为：

- `opl frontdesk-bootstrap -> OPL Atlas Desktop`

## Validation

- source tests 覆盖 `frontdesk-bootstrap` 新 payload 与无 Docker 默认路径
- source tests 覆盖 LibreChat lane 继续可独立安装
- Desktop package 资产测试覆盖 `package.json / electron entry / preload / app shell`
- `npm test`
- `npm run build`
- `git diff --check`

## Risks

- 当前 Desktop shell 先复用 `opl web` renderer，所以视觉层仍受现有 `opl web` 限制。
- Electron app 在这一 tranche 先落开发态 package，不承诺 signed app bundle。

## Conclusion

这次 slice 的目标是把“本机 GUI 主入口”从 Docker 壳换成 OPL 自有 Desktop 壳，让 LibreChat 从默认链路退到可选链路，同时继续只复用现有 frontdesk truth surface。
