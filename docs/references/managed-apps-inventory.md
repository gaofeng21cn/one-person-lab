# OPL App 与 Agent 纳管范围参考

本文提供项目与 Package identity 的人读映射，帮助理解统一目录的覆盖范围。它不参与应用发现或注册；动态安装、可安装、版本、授权和就绪状态来自 [Package Directory](../specs/package-directory.md)。

## 读取完整清单

```bash
opl packages list --json
opl app state --profile fast --json
```

第一条读取 Package 管理面，第二条读取 App 使用的 `app_state.agent_packages.directory.entries`。目录会合并 Framework 的 [owner projections](../../contracts/opl-framework/packages/) 与 native carrier 可发现的 descriptor，因此内置 JSON 文件数不是应用总数。已安装的本地包、宿主能力和有权访问的私有包也可以出现；仅有 Skill 文件不等于已进入 Package Directory。

读取清单时同时保留 `package_id`、`package_role`、`installed`、`installed_version`、`selected_version`、`installability`、`readiness` 和 `available_actions`。原始输出只保存于当前用户的审阅空间；公开文档不保存个人安装版本、私有仓库清单、身份或凭证。

## Framework 已有 owner projection

下表说明内置项目身份，是否安装或可从当前软件源安装仍以运行时回读为准。私有软件的目录访问和下载授权参见 [Package Directory](../specs/package-directory.md)。

| Package ID | 名称 | 角色 | owner |
| --- | --- | --- | --- |
| `mag` | Med Auto Grant | `standard_agent` | `med-autogrant` |
| `mas` | Med Auto Science | `standard_agent` | `med-autoscience` |
| `med-autocast` | Med Auto Cast | `standard_agent` | `med-autocast` |
| `obf` | OPL Book Forge | `standard_agent` | `opl-bookforge` |
| `occ` | OPL Capital Compass | `standard_agent` | 私有源码 owner；采用 `authorized_only` 访问策略，分发权限以 Package manifest 和 registry access readback 为准 |
| `oma` | OPL Meta Agent | `standard_agent` | `opl-meta-agent` |
| `rca` | RedCube AI | `standard_agent` | `redcube-ai` |
| `opl-flow` | OPL Flow | `workflow_profile` | `opl-flow` |
| `glkvm-native` | GLKVM Native | `capability_package` | 私有源码 owner；分发权限以 Package manifest 和 registry access readback 为准 |
| `iphone-steward` | iPhone App Steward | `capability_package` | 私有源码 owner；分发权限以 Package manifest 和 registry access readback 为准 |
| `mac-media-assets` | MAC Media Assets | `capability_package` | `mac-media-assets` |
| `mas-scholar-skills` | MAS Scholar Skills | `capability_package` | `mas-scholar-skills` |
| `opl-channel-weixin` | OPL Channel Weixin | `capability_package` | `one-person-lab-app` 的渠道能力 |
| `opl-fleet-agent` | OPL Fleet Agent Integration | `capability_package` | `opl-fleet-agent` |
| `opl-persona` | OPL Persona | `capability_package` | `opl-persona` |
| `opl-relay` | OPL Relay | `capability_package` | `opl-relay` |
| `photo-steward` | Photo Steward | `capability_package` | `photo-steward` |
| `opl-link-desktop-connector` | OPL Link Desktop Connector | `capability_package` | 私有 companion 的 connector；`development_only` |

`development_only` 不进入普通可安装发现，但已安装 carrier 可以保留在本机目录，供用户查看和管理。嵌套能力与所属产品按 Package ID 区分，不按仓库数重复计数。

## 通过 native carrier 发现的项目

[Journey Atlas](https://github.com/gaofeng21cn/journey-atlas) 使用稳定 Package ID `travel-passport`，包含 `opl-package.json`、marketplace 和 Codex plugin carrier。它可以从已安装 descriptor 进入目录，角色为 `capability_package`。其公共代码与个人旅行记录分开；同一 identity 不因个人数据仓和公共代码仓各自存在而重复注册。

宿主也可以投影通用能力，包括 `browser`、`chrome`、`codex-app-tools`、`computer-use`、`documents`、`latex`、`pdf`、`presentations`、`spreadsheets`、`template-creator`、`unified-computer-use` 和 `visualize`。这些身份属于各自发布者，OPL 读取其 native carrier 的安装状态和可用操作，不复制成 OPL 自有发布包。

## 有实现、尚未进入普通可安装目录的公开项目

| 项目 | 已有接入面 | 尚未准入的具体原因 |
| --- | --- | --- |
| `rednote-steward` | 根 manifest、Codex plugin、CLI/MCP/App contribution | manifest 为 `development_only`，未进入当前普通可安装发现；单独插件安装与统一目录准入分别验收 |
| `agent-session-vault` | 根 manifest、Skill、App contribution | manifest 为 `development_only`，未进入普通可安装发现 |
| `agent-old-photo-workflow` | 根 manifest、Skill、carrier 声明 | manifest 为 `development_only`，publication ref 为空 |
| `opl-netfleet` | `integrations/opl-netfleet-connector/opl-package.json` | Package identity 是嵌套 connector；需按 connector 的发布、设备权限和回读合同准入，不能把整仓当作已安装包 |
| `u60-pro-companion` | `integrations/opl-u60-connector/opl-package.json` | Package identity 是设备 connector；需按设备 carrier 的发布和回读合同准入，fork 属性本身不构成排除理由 |
| `kindle-pilot` | Python 项目与 `skill/kindle-pilot/SKILL.md` | 尚未发现 `opl-package.json`、marketplace 或 OPL carrier 声明 |

其他私有候选项目由授权用户的私人清单评估，不在公共文档枚举其名称或用途。候选准入按 [Agent 原生应用开发标准](../policies/agent-native-app-policy.md) 和 [Package Directory](../specs/package-directory.md) 执行；不因 GitHub 仓库活跃或有 Release 就自动准入。

## 产品宿主和基础设施

这些是产品、运行环境或分发工程，不等同于普通 Agent Package。下表说明责任归属，不声称它们已经出现在 `/apps` Package 列表。

| 项目 | 归属 | 管理入口 |
| --- | --- | --- |
| `one-person-lab` | Framework 基座 | Framework CLI、运行时状态与更新 owner |
| `one-person-lab-app` | OPL App 产品 | App updater 与产品发布渠道 |
| `opl-studio` | Desktop/WebUI Application Host | 随 OPL App 或 headless carrier 管理 |
| `opl-dsh` | 官方 DSH 增强套件 | 对应宿主的原生安装与升级机制 |
| `one-person-lab-cloud` | Cloud 产品 | Cloud 部署和实例 owner |
| `homebrew-one-person-lab` | Homebrew tap | `brew tap gaofeng21cn/one-person-lab` |
| `opl-fleet-cockpit` | Fleet 界面 | 自托管 Web/iOS 产品部署 |
| `opl-codex-models` | macOS 原生工具 | Homebrew Cask 和原生产品更新 |
| `opl-health-platform` | 医疗领域产品平台 | 领域产品入口；不冒充标准 Agent |

私有实例配置、个人数据和移动端 companion 分别由实例、知识/数据和产品 owner 管理；软件包目录不能把这些对象公开复制为通用应用。

## 明确不纳入普通 OPL Package 的公开项目

| 项目 | 理由 |
| --- | --- |
| `opl-skills` | 技能来源集合；只有具备 Package descriptor 的独立分发单元才进入目录 |
| `ha_xiaomi_home` | Home Assistant 上游集成 fork；未建立独立 OPL Package 生命周期 |
| `clash-party` | 外部应用 fork；未建立独立 OPL Package 生命周期 |
| `codex-acp` | 外部协议桥 fork；应作为所选 executor/宿主依赖消费 |
| `CitationClaw` | 外部项目 fork；未建立独立 OPL Package 生命周期 |
| `japan-iptv` | 播放列表和数据发布项目，不是 Agent/App 安装单元 |
| `gaofeng21cn` | GitHub 个人主页，不是软件安装单元 |
| `opl-aion-shell`、`opl-hermes-shell`、`opl-dsh-legacy`、`opl-agui-codex-shell` | 已归档的历史宿主或技术验证，现役宿主以 App 合同为准 |
| `homebrew-codex-tps`、`codex-tps` | 已归档的旧分发/升级桥，由 OPL Fleet Agent 和现役 tap 承接 |
| `one-person-lab-cloud-docs-archive`、`opl-doc` | 已归档的文档来源，不是软件包 |
| `omx-project-installer`、`oh-my-codex` | 已归档的历史工作流/安装器 |
| `DeepScientist`、`med-deepscientist`、`tokscale`、`IDP-fusion`、`gaofenglib` | 已归档的依赖 fork、研究代码或历史工具 |

## 更新本清单

先读取当前 GitHub repository metadata，再将仓库与 owner manifest 的 `source_repo`、`package_id` 以及运行时 directory 关联。一个仓库可能提供多个 Package，一个 Package 也可能由迁移前后的多个仓库指向；按稳定 identity 去重。新增或修改判断必须引用 manifest、publication admission、carrier 或真实回读，不从名称、描述或 fork 属性推断是否可安装。

完整账户审阅可以包含授权可见的私有仓库，保存在用户私人空间。公共参考文档只维护已公开的软件身份、归属和准入方法；本机版本、动态计数和私人清单不提交到公共 Framework。
