# OPL App 与 Agent 纳管范围准则

本文只说明 Package Directory 与产品宿主、外部工具及非安装单元的划分准则，不重复复制动态软件列表。当前全量安装与目录状态统一由运行时回读获取。

## 读取完整动态清单

```bash
opl packages list --json
opl app state --profile fast --json
```

第一条读取 Package 管理面，第二条读取 App 使用的 `app_state.agent_packages.directory.entries`。目录动态合并 [官方目录](https://github.com/gaofeng21cn/opl-catalog) 与 native carrier 可发现的 descriptor；读取时保留 `package_id`、`package_role`、`installed`、`installed_version`、`selected_version`、`installability`、`readiness` 和 `available_actions`。公开文档不保存个人安装版本、私有仓库清单、身份或凭证。

## 纳入与分类准则

- **OPL Package（`standard_agent` / `workflow_profile` / `capability_package`）**：须具备稳定 `package_id`、实际入口、受支持的本机 carrier 及回读合同；`development_only` 条目仅用于显式开发诊断，不进入普通可安装列表。
- **平台与通用能力**：随 Codex/宿主原生管理器发现（如 `browser`、`documents`、`pdf`、`presentations` 等）的外部能力保留原发布者归属，不复制成 OPL 自有包。
- **嵌套或设备连接器**：仅在独立 connector manifest（如声明在自身 `opl-package.json` 且满足发布与权限回读合同）完成准入后按独立 Package identity 管理，不把整座仓库直接算作已安装软件。
- **产品宿主与基础设施**：如 `one-person-lab`、`one-person-lab-app`、`opl-studio`、`opl-dsh`、`one-person-lab-cloud`、`homebrew-one-person-lab`、`opl-fleet-cockpit`、`opl-codex-models`、`opl-health-platform` 等属于宿主、分发或平台产品，各自维护版本与生命周期，不混入普通 Agent Package 列表。
- **不纳入软件目录的仓库**：纯技能集合（无 Package descriptor 的资源仓）、直接上游依赖 fork、数据/播放列表仓、个人主页与只读归档仓均不进入可安装软件目录。

## 维护判断顺序

新增或调整准入判断时，先核对 GitHub 仓库元数据与实际 `opl-package.json` / native carrier descriptor，按稳定 `package_id` 去重，以 manifest、publication admission 与运行时 readback 为准，不从仓库名或历史存在推断可安装性。
