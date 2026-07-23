# OPL Release 与 Package 分发参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_release_packages_modular_distribution`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## 定位

- `one-person-lab-app` GitHub Releases 面向用户下载，承载 `One-Person-Lab-<OPL版本>-<平台>-<架构>` 这类桌面 App 安装包。
- GitHub Packages 面向机器消费，承载 OPL Packages 与预构建 helper；Framework、Temporal-backed runtime 和系统依赖属于 OPL Base，不作为 Agent package 发布或由 Agent 反向管理。WebUI/Docker 镜像坐标与发布证据归 `one-person-lab-app`。
- `opl-aion-shell` 继续是 GUI 源码与构建输入；用户入口、版本叙事、下载面、updater metadata、标准 DMG 与 Full 版 DMG 都归 `one-person-lab-app` release。

## Currentness policy

本文冻结 release / Packages / App / package 分发 owner boundary，不冻结日期、Release Set generation、GUI 版本号、archive size、checksum、package source head SHA、release artifact、workflow run、GHCR digest、branch/SHA state、本机 package build 结果、Full payload layout、App first-run sequence、签名/公证模式或 VM gate 结果。当前 package 坐标、release discipline、channel manifest shape 和 install/update source 必须从 fresh `opl connect packages manifest`、`src/modules/connect/package-distribution.ts`、`scripts/package-archives.mjs`、`scripts/package-release-discipline.mjs`、`.github/workflows/release-package-channel.yml`、`.github/workflows/packages.yml` 与相关测试读取；App 下载资产、Full DMG、updater metadata、Full manifest、first-run matrix、签名/公证结果和 release evidence 继续归 `one-person-lab-app`。

稳定读法是：`GitHub Releases` 是用户下载入口，`GitHub Packages/GHCR` 是机器制品通道。first-party package canonical ids 固定为 `mas`、`mag`、`rca`、`oma`、`obf`、`mas-scholar-skills`、`opl-flow`，每个对象只有一个 OCI repository：`ghcr.io/<owner>/one-person-lab-packages/<canonical-id>`。moving channel 只允许 `candidate` 与 `latest-stable`；不可变 SemVer tag 必须绑定唯一 digest，普通安装只消费 `latest-stable`。`opl_release_set.v2` 是 OPL Base、OPL App 与七个 Packages 的九组件精确 BOM；未变化组件复用上一精确 digest。完整 BOM 通过 readback 后才发布 `ghcr.io/<owner>/one-person-lab-manifest:<release-set-generation>` catalog carrier，稳定推广只移动同一 immutable carrier digest。该 carrier 不是第八个 Package，也不进入普通安装列表。旧 `one-person-lab-modules/*`、repo-slug OCI 与裸 `latest` 只作 migration/history locator，不得作为当前安装源。Developer Mode 是 App/system settings 中启用 GitHub repo / local checkout package 来源的正式入口；低层 path/repo URL override 不改变普通 latest-stable 来源。

Agent package 与 capability dependency 采用 owner-manifest 单源：MAS、MAS Scholar Skills 与其他 capability repo 分开维护；MAS agent package manifest 声明 Agent Package Core 与 required dependency，ScholarSkills provider manifest 独占完整 export catalog。Agent Package Core 只管理 descriptor、digest lock、dependency graph、trust tier、lifecycle/use receipt、exposure 和 shortcut refs；Codex Plugin/local marketplace、OPL App shortcut、workflow profile 和 runtime source 都只是 carrier/projection。所有安装渠道都要求 OPL Base，并通过同一个 `opl packages` lifecycle 解析依赖；不再保留绕过 Base dependency graph 的 standalone fat-plugin 安装语义。OPL App 托管 MAS 时，`mas-scholar-skills` 作为 required managed dependency 随 MAS 闭包自动安装、更新、回滚，普通 UI 不提供独立安装入口；Developer Mode 只替换显式 package source，不创建第二 lifecycle。

First-party carrier payload 由 `scripts/first-party-package-payload.mjs` 从 canonical package manifest、Framework-owned `package-payload-allowlists/<canonical-id>.json`、frozen `owner-cohort-lock.json`、绑定 origin 的 owner worktree 与 exact commit 生成。每个 canonical manifest 的 `codex_surface.carrier_source_commit`、cohort lock、调用者 `--source-commit` 和生成 payload 的 `source_commit` 必须是同一个 exact SHA；worktree `origin` 必须等于 allowlist 的 canonical source repo，commit object 必须存在，并且能从固定 `refs/remotes/origin/main` 到达。package/plugin/source/output identity 不能由调用者覆盖；allowlist 是唯一文件集合，`source_root: "."` 也不触发递归全仓发现。

Connect 对一个新的发布候选仍严格校验 manifest、Release Set catalog、payload carrier SHA、ABI 与依赖闭包；失败候选不得成为新 generation。通过 admission 的值写入 package lock、install/update receipt、dependency closure 和 use binding，作为“当时解析到了什么”的 provenance。运行入口不要求这些 provenance 与后来 source 永远相等：缺失或漂移时先尝试最新可运行 generation，再自动回退 LKG；只要 current/LKG 中仍有完整 ABI、必需模块/Skill 且 health/handler probe 通过，activation/use 继续。`owner_source_commit`、digest、lock 与 receipt 都不等于 domain truth、artifact validity、runtime launch permission 或 installed Stable verdict。

Full runtime 的内建 Package 选择由 Framework `contracts/opl-framework/bundled-full-runtime-package-catalog.json` 独占；该 catalog 将 canonical seven 的 manifest、payload、owner source commit 与 runtime module relative path 绑定为同一离线 authority。`opl system configure-codex` 只接受内部 bundled reconciliation，可从 App wrapper 的显式 module env 或 `OPL_FULL_RUNTIME_HOME/<runtime_module_relative_path>` 读取 package root，并逐文件校验 payload digest；public CLI/App action 不能选择 catalog、伪造 `bundled_full_runtime_modules` 或注入 `agentRoot`。MAS 的 Full 安装必须同时存在 `modules/mas` 与 `modules/mas-scholar-skills`，后者缺失时返回 `agent_package_bundled_dependency_root_missing`，不得联网补齐。App Full carrier 因而必须按 catalog 打包完整 dependency module、`opl-runtime-module.json` marker 和 wrapper env/标准路径；Framework focused fixture 只证明离线闭包实现，不等于已发布 App asset、Live 安装、reload 或 rollback 执行证据。

已发布的 `opl_agent_package_payload_manifest` 与 `opl_package_payload_manifest.v1` 只允许 `--check` readback；必须推进 owner SemVer 后才能创建严格的 `opl_package_payload_manifest.v2`，同一 SemVer 不得用 v2 覆盖历史 envelope。v2 为每个 Git blob 保留 `100644` 或 `100755` mode，拒绝 symlink 和其他 tree mode，并用 `ordered_path_length_file_length_bytes` 对 path length、path bytes、file length 与 file bytes 生成无歧义 content lock。发布采用 fsync 后的临时 regular file、hard-link create-if-absent CAS 与目录 fsync；并发 loser 只能接受 exact bytes，相同 SemVer 的不同 authority/bytes 必须 fail closed，启动清理也只删除当前 target 且 writer PID 已死亡的严格命名临时文件。

## 版本模型

- 每个 Package 使用 owner SemVer。`major` 表示不兼容的 contract、ABI 或依赖边界变化，`minor` 表示向后兼容的新能力，`patch` 表示向后兼容的修复或内容更新；未稳定版本可使用 `alpha`、`beta`、`rc` prerelease。MAS 的 PEP 440 等语言版本只是 carrier projection，canonical Package version 仍是 SemVer。
- Release Set 使用 UTC CalVer generation `YY.M.D`，同日修订使用 `YY.M.D-rN`。它是九组件精确 BOM：Base 与 Packages 保留独立 SemVer，App 保留用户可见 CalVer；每个组件记录 source commit、artifact ref 与 digest。`rN` 只标识 BOM generation，不触发未变化组件更新。
- `one-person-lab-manifest` 是 Release Set catalog carrier，不是 Package identity。尚无 stable baseline 时，daily workflow 会把 Base、App 与 canonical 七 Packages 初始化为 candidate；之后只处理 versioned changed component 或显式 repair。普通用户无需手动选择 generation，Base/App/Packages 各自从 stable BOM 解析自己的精确版本与 digest。
- 当前 Package 数字版本不在本文复制；应直接读取七个 canonical `contracts/opl-framework/packages/<canonical-id>.json` 的 `version` 与 fresh package manifest，避免人读快照成为第二真相源。
- Homebrew 只管理 OPL Base 的 Formula `opl`；七个 Package 均不提供独立 Formula/Cask，避免形成第二套 install/update/rollback lifecycle。

## 当前分发边界

| 分发对象 | 推荐渠道 | 是否打入桌面 App | 理由 |
| --- | --- | --- | --- |
| One Person Lab 桌面 App | `one-person-lab-app` GitHub Releases | 是 | 用户直接下载和安装 |
| One Person Lab Full 首次安装包 | `one-person-lab-app` GitHub Releases 额外 asset | 只打入 Full 包，不进入标准更新包 | 新用户首次安装时按 App-owned Full manifest / product profile 预置声明的 Framework runtime、domain / Foundry Packages、provider support payload、companion tools 和 skills；App 自动更新继续走标准包 |
| OPL Base：Framework / Temporal / shared contracts / native helper | 唯一 Homebrew Formula `opl`、headless installer 或 App bootstrap 的同一 Base 合同；native helper 通过 Base-owned OCI prebuild 恢复 | Full 可携带 Base payload | Base 独立安装、更新和修复；Agent 只消费，不反向管理；Packages 无 Formula/Cask |
| MAS (`mas`) | `ghcr.io/<owner>/one-person-lab-packages/mas:latest-stable`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | domain agent 独立演进，按 agent package manifest 声明 required capability dependency，并由 `opl packages` 管理 |
| MDS | MAS 显式可选 companion；不进入默认 OPL package / Full payload | 否 | 仅作为 MAS-declared backend audit、provenance、historical fixture、intake 或 parity oracle 引用 |
| MAG (`mag`) | `ghcr.io/<owner>/one-person-lab-packages/mag:latest-stable`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | domain agent 独立演进，由 `opl packages` 安装/更新 |
| RCA (`rca`) | `ghcr.io/<owner>/one-person-lab-packages/rca:latest-stable`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | 交付物链路可能较大，不应拖慢 App 更新 |
| OMA (`oma`; repo/plugin carrier `opl-meta-agent`) | `ghcr.io/<owner>/one-person-lab-packages/oma:latest-stable`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | Agent Foundry managed builder/tester；carrier 名不替代 canonical id |
| OPL Book Forge (`obf`; repo/plugin carrier `opl-bookforge`) | `ghcr.io/<owner>/one-person-lab-packages/obf:latest-stable`；Developer Mode 可显式切到 git checkout / path / repo URL | 否 | 书稿 domain agent；carrier 名不替代 canonical id |
| MAS Scholar Skills (`mas-scholar-skills`) | `ghcr.io/<owner>/one-person-lab-packages/mas-scholar-skills:latest-stable` | 否 | MAS required managed dependency；随 MAS 闭包自动管理，普通 UI 不独立安装，未安装 MAS 时不是全局默认 package |
| OPL Flow (`opl-flow`) | `ghcr.io/<owner>/one-person-lab-packages/opl-flow:latest-stable` | 否 | 普通 OPL Package；profile/policy merge 进入同一 package 事务，不形成专属 lifecycle |
| WebUI Docker 镜像 | App-owned GitHub Packages container registry | 否 | 实际坐标、构建发布、digest 和 release evidence 归 `one-person-lab-app`；Framework package manifest 不再暴露该 App-owned reference |

表中的 repo、plugin 和 module 名是 carrier locator，不是 package identity 轴。compact standard-agent list 固定为 `MAS/MAG/RCA/OMA/OBF`；全称固定为 Med Auto Science、Med Auto Grant、RedCube AI、OPL Meta Agent、OPL Book Forge。`mas-scholar-skills` 是 framework capability package，`opl-flow` 是 workflow plugin package，二者都不是 standard domain agent。

## Package 体积基线

本地完整工作树大小不能代表分发体积。分发时不带 `.git`、未跟踪文件、缓存、虚拟环境和构建产物；浅克隆工作树仍会包含 `.git` 元数据，适合作为开发安装方式，不适合作为 App 内置体积估算。

源码归档大小是 release-time manifest fact：`scripts/package-archives.mjs` 以每个 package checkout 的 `git archive --format=tar.gz HEAD` 生成 tarball，并把 `source_archive.size`、`source_archive.sha256` 和 `source_git.head_sha` 写入 `opl-release-manifest.json` / `opl-channel-manifest.json` / `SHA256SUMS`。`framework_core.homebrew_formula` 同时从 `framework_core.version` 与 `source_git.head_sha` 投影 immutable GitHub commit archive URL；Homebrew tap sync 下载该 URL 后计算并写入 formula sha256，不能自行推断版本或改用 moving branch/tag。长期文档只保留这个读取规则，不保留某次本地 archive 的 MB 快照。

## Packages 适用方式

当前 GitHub Packages/GHCR 是 OPL Packages 安装更新的默认机器通道。现状是：

- 用户下载入口仍是 GitHub Releases 里的桌面 App 安装包。
- package distribution/readback 对每个 canonical id 只输出 `ghcr.io/<owner>/one-person-lab-packages/<canonical-id>`，并分别记录 immutable version/digest 与 `candidate` / `latest-stable` channel currentness；App-owned WebUI 镜像坐标从 App release/contracts/evidence 读取。旧 namespace 只作 migration/history locator。
- First-party OPL agent package 的 dependency graph 来自对应 agent package manifest 的 Agent Package Core；Codex Plugin/local marketplace、OPL App shortcuts、workflow profile、runtime/app release、MCP/Web/native 等只作为 carrier / owner surfaces 投影。MAS manifest 若声明 `mas-scholar-skills` 为 required capability package，OPL 只消费这条声明生成 channel/package/readback；不得把该依赖散落成 OPL 私有常量、App 专属列表、单一 Codex carrier manifest、workflow profile 或 hard-coded MAS 知识。
- Source-only 或尚未发布的 first-party agent package manifest 不携带 `distribution_payload`，package/channel compiler 也不投影空值、预设 `latest` 或 fixture digest。只有真实发布元数据存在时才声明该对象；published registry 的 ordinary-user source 必须绑定合法 distribution payload、immutable tag 与 digest lock。
- Manifest 同时投影 bundled Codex default profile；该 profile 只表达产品默认 provider/model endpoint 与 profile role，不包含 secret，也不替代用户本地 Codex 配置或 executor policy。
- `.github/workflows/release-package-channel.yml` 是 exact-digest stable promotion gate；`.github/workflows/daily-package-channel.yml` 是 changed-component candidate gate。daily 从冻结 Framework source 的 package manifests 生成 owner cohort，只读取其中已选择的 exact owner commit；其他 owner 仓后续 `main` 开发不会阻塞无关 Package 发布。存在 `latest-stable` 时，owner/tag/候选构建失败或已选择内容变化却未推进 owner version 会生成 `retained_previous_stable` 证据、保留整个上一稳定 Release Set 且不发布未知 candidate；首次 bootstrap 没有 LKG 时仍停止。`.github/workflows/packages.yml` 只构建 candidate，stable gate 从 immutable generation 读取完整 BOM 后逐组件 retag 精确 digest，不重新构建或重新解析 owner HEAD。
- `scripts/package-archives.mjs` 会生成 `opl-release-manifest.json`、`opl-channel-manifest.json` 与 `SHA256SUMS`，并把 Base、App、每个 Package 的独立版本、source commit、artifact ref 与 digest 写入 v2 BOM。Framework core 另投影 Homebrew 所需的 Base SemVer、source head 与 immutable commit archive URL，tap 只负责下载后计算 sha256；App component manifest 由 App release workflow 持有并随 Release asset 发布。
- `scripts/package-release-discipline.mjs` 是 CI gate：检查 channel manifest、artifact build、checksum、rollback、旧版本清理策略与 active package channel、release-gated `workflow_call` / manual dispatch repair 语义是否齐全。缺 checksum、缺回退策略、缺清理策略，或误称 tag push 自动发布 / Framework-owned WebUI publish 时，package workflow 应直接失败。
- Native helper 预构建 workflow 会继续上传 CI artifact，同时把 tar.gz archive 推送到 GHCR，并在 workflow 内验证 native helper package retention/status policy。
- 普通 install/update 从各 canonical package 的 `latest-stable` 解析目标；Developer Mode `enabled=on` 且 `mode=developer_apply_safe` 时，只把显式 package source 切到 Git checkout/local path，不改变 OPL Base 或依赖 owner。
- 所有载体共用 OPL managed dependency truth。MAS 与 `mas-scholar-skills` 分开 materialize、同一闭包事务锁定；不存在绕过 OPL Base/Packages 的 standalone dependency manager。
- App 启动、每个 hosted action 与每个新 child Attempt 都静默解析 source channel 的最新可运行 generation；普通用户从 package channel 获取，显式开发 override 从可信 checkout 的当前 bytes 获取。刷新失败时自动选择 LKG，不要求 operator 先 repair/reload。
- Package runtime-source carrier 安装/更新先把目标 archive 或 developer snapshot 校验到 content-addressed generation root，再原子发布 generation pointer；既有 generation 不覆盖、不删除，正在运行的 Attempt 继续使用它已绑定的 generation。package transaction 期间不自动 GC plugin payload、developer snapshot 或 runtime generation；清理是显式 maintenance，只能删除无活跃引用且不属于 current/LKG 的 generation。`opl-runtime-module.json` marker 是内部 locator，不是 Package identity。
- 显式 `developer_checkout_override` 不伪装成 package-channel release：Packages 记录 checkout 的 Git HEAD、tracked diff 与非忽略 untracked 内容摘要作为 provenance，按当前可读 bytes 静默创建 immutable developer generation，并运行 health/handler probe。checkout 后续变化由下一 hosted action/new Attempt 自动解析，无需重复 install；OPL 不 pull、reset、覆盖或回滚用户 checkout。
- 新增 framework capability package 时，不新增专属 clone / pull / update manager。它必须进入 canonical id/OCI、owner manifest、SemVer/digest gate、closure transaction、scope activation 与同一 lifecycle receipt。MAS Scholar Skills 是该规则的当前实例：ordinary App 只从 MAS row/launch 管理其依赖，Developer Mode/local checkout 只作为显式开发者 source。

## 三层生命周期与 Managed Update Kernel

用户只管理三个对象，`managed_update.components[].component_id` 也只允许对应的三个 lifecycle owner：

| 用户对象 | Canonical 入口 | Lifecycle owner | 内部 provider | 边界 |
| --- | --- | --- | --- | --- |
| OPL Base | `opl update status|check|plan|apply|repair|rollback` | `opl_base` | `runtime_substrate` | 管理 Framework/App-owned runtime root；dependency 与 integration 状态折叠在 Base 内。 |
| OPL App | `opl app state --profile fast` 与 App/host updater | `opl_app` | `installation_carrier` | Framework 只读回 host route；桌面 bundle、Docker/WebUI image、Linux carrier 由 App/host owner 更新。 |
| OPL Packages | `opl packages list|status|install|update|enable|disable|repair|rollback|uninstall` | `opl_packages` | `capability_packages` | 管理 package lock、dependency/runtime-source carrier、digest、物化、projection、profile migration、LKG rollback 和单一 lifecycle receipt。 |

`runtime_substrate`、`installation_carrier` 与 `capability_packages` 只是 adapter dispatch 的 `provider_id`，不是 selector、公共 component 或独立 lifecycle owner。Codex plugin/skill 可见性属于 Packages 的 `projection_status`；OPL Flow profile semantic merge 属于 `profile_migration_status`；companion dependency/integration 属于 Base。旧 component alias、旧 receipt id 和旧 namespace 不迁移，读取时 fail closed。

Kernel 继续提供统一状态词汇、idempotency lock、受控 runner 和 component receipt ledger，但不再把内部 adapter 暴露成用户选项：

| 执行模式 | 适用 owner | 能做什么 | 不能声称 |
| --- | --- | --- | --- |
| `controlled_apply` | `opl_base` | 校验并切换 App-owned runtime current/staged/rollback pointer。 | Homebrew/global npm/system PATH/System Temporal mutation，或 App carrier 已更新。 |
| `auto_apply` | `opl_packages` | 从普通 channel 或可信 developer source 创建并验证新的 immutable generation，原子发布 current/LKG pointer，完成 projection 和 provenance receipt transaction。 | 覆盖 developer checkout、删除活跃 generation，或写 domain truth/owner receipt/quality verdict。 |
| `manual_required` | `opl_app` 或任何 owner-gated target | 返回 host/owner route、typed reason 与 readback。 | 由 Framework 代替 host updater 或静默覆盖用户 profile。 |

`opl update` 固定选择 `opl_base`，不接受 component selector；`opl packages update` 固定选择 `opl_packages`。两者共享 `managed-update-kernel.lock` 和 `managed-update-component-receipts.json`，receipt 同时记录 lifecycle owner、内部 provider、adapter、content identity、post-apply 与 reload guidance。`opl_app` 只进入读模型和 owner handoff，不进入 Framework apply runner。

受控 adapter 边界保持不变：`runtime_substrate_adapter` 只写 App-owned runtime root；`capability_packages_adapter` 只处理 clean managed package roots；`installation_carrier_status_adapter` 只读 App/host route。Package transaction 后可刷新 plugin registry、local marketplace、plugin-packaged skills 与 OMA generated carrier，但这些都不是第二套 package truth。OPL Flow profile 只能 semantic merge，禁止静默覆盖用户 Codex profile。

App / Settings 的 package 动作委托唯一 `opl packages` lifecycle；`settings_check_app_update` 只读取 App/host update route，Base rollback 仍委托 `opl update rollback`。MAS workspace / quest 每次 activation/launch 都执行 use-boundary reconciliation：检查 MAS latest-stable root、兼容 ScholarSkills latest-stable、digest/ABI/SemVer/trust/content lock，并在需要时原子更新 closure、默认物化 provider manifest 的全部 35 Skills。managed projection 缺失或漂移在该事务内自动恢复；`repair` 只保留为显式恢复入口，运行中不热切换。

Packages 是 App 不变时的机器更新通道，但不替代 App repo `Releases` 的用户下载入口。普通用户仍从 `one-person-lab-app` 的 `Releases` 获取桌面安装包；package 安装真相必须记录 immutable version、digest、SHA-256、source fingerprint 或 Git head。MAS/MAG/RCA 等 domain repo 不提供第二套用户安装型 Release，domain truth、artifact body、quality/export verdict 与 owner receipt 始终留在 domain owner。

Manifest 的本地入口只用于读取 fresh machine output，不作为本文冻结的字段快照：

```bash
opl connect packages manifest
npm run packages:manifest -- --release-set-generation <yy.m.d[-rN]>
npm run packages:payload -- --manifest contracts/opl-framework/packages/<canonical-id>.json --allowlist contracts/opl-framework/package-payload-allowlists/<canonical-id>.json --owner-cohort-lock <owner-cohort-lock.json> --repo <owner-repo-root> --source-commit <full-sha>
npm run packages:daily-check -- --candidate-manifest dist/opl-packages/opl-channel-manifest.json --current-manifest <latest-stable-channel-manifest.json> --release-set-generation <yy.m.d[-rN]>
npm run packages:release-discipline -- --manifest dist/opl-packages/opl-release-manifest.json
npm run packages:cleanup-ghcr -- --summary-path ghcr-package-cleanup.json
npm run packages:cleanup-ghcr -- --protected-tag <tag> --execute
```

Fresh 读法按机器入口分层：

| 机器入口 | 当前职责 | 不从本文读取的动态事实 |
| --- | --- | --- |
| `src/modules/connect/package-distribution.ts` / `opl connect packages manifest` | 定义 Package manifest shape、canonical ids、Release Set、GHCR 坐标、Codex default profile 投影、install/update source 和 `package_consumption_status`。 | 当前 SemVer、generation、生成时间、owner、release channel、Codex profile 字段值和 Package 坐标的实际输出。 |
| `scripts/package-archives.mjs` | 用 package source checkout 的 `git archive --format=tar.gz HEAD` 生成 source tarball，写出 `opl-release-manifest.json`、`opl-channel-manifest.json` 和 `SHA256SUMS`。 | archive size、sha256、source branch、source head SHA 和本机输出路径。 |
| `scripts/package-release-discipline.mjs` | 校验 manifest 声明 package-channel current source、channel manifest output、checksum、rollback 和 retention policy。 | 某次 release 的 previous manifest、retain count、失败列表和实际 gate 输出。 |
| `scripts/cleanup-ghcr-package-versions.mjs` | 按 manifest 的 native-helper policy、canonical Package 与 Release Set lifecycle 做 GHCR retention dry-run；只有 `--execute` 才删除候选 Package versions。 | 当前远端 Package version 列表、候选删除列表、显式 protected tag、实际删除结果。 |
| `.github/workflows/release-package-channel.yml` | GitHub Release `published` 后自动调用 packages reusable workflow；手工 `workflow_dispatch` 可作为 release gate 修复入口。 | release event、caller workflow run、被调用 packages workflow run。 |
| `.github/workflows/daily-package-channel.yml` | 每天逐包比较 latest-stable 与候选 source/content fingerprint；只为 changed Package 验证 owner SemVer、生成 immutable artifact 并移动 `candidate`，不直接提升 stable。 | 当天调度 run、changed Package set、candidate digest、是否实际发布。 |
| `.github/workflows/packages.yml` | 通过 reusable `workflow_call` 构建 changed Package source archive、运行 SemVer/digest/release-discipline gate、复用 unchanged digest、验证完整七成员 BOM，最后发布 immutable Release Set carrier 并上传同源 manifest/checksum artifact；直接 `workflow_dispatch` 仅作人工修复入口；不构建或发布 WebUI image。 | workflow run 状态、artifact URL、远端 Package/Release Set 可见性、精确 digest readback 和本机 Package build 结果。 |
| `.github/workflows/native-helper-prebuilds.yml` / `scripts/native-helper-prebuild.mjs` | 维护 native helper prebuild artifact / GHCR package 的构建入口。 | 具体 target、native helper version、checksum、CI artifact 和 GHCR tag。 |
| `one-person-lab-app` release contracts / workflows / evidence | 拥有标准 App 安装包、Full DMG、Full manifest、first-run matrix、updater metadata、签名/公证和用户下载面。 | App release ready、Full package asset、download URL、latest yml、Full runtime layout、payload refs、签名/公证结果和 release evidence。 |

具体发布物按三层切开：

| 发布物 | 推荐 Packages 名称 | 内容 | 触发方 |
| --- | --- | --- | --- |
| Agent / capability / workflow package | `ghcr.io/<owner>/one-person-lab-packages/<canonical-id>:<semver>`；moving tags 仅 `candidate`、`latest-stable` | 不含 `.git`、缓存、venv、node_modules 的源码归档、owner manifest 与 digest metadata | `opl packages` 消费 latest-stable；Developer Mode 可显式 override 到 Git checkout / local path |
| Native helper prebuild | `ghcr.io/gaofeng21cn/one-person-lab-native-helper:<target>-<version>` | Rust helper 二进制、manifest、checksum | `opl system repair-native-helpers` / `opl install`；底层 lifecycle script 为 `npm run native:repair` |
| OPL Base | Framework release/source carrier、唯一 Homebrew Formula `opl` 与 headless/App bootstrap installer | CLI、Framework contracts/helpers、Temporal-backed runtime dependency intent 与 Base metadata | `opl update`；不进入 Agent package OCI，也不由 Agent 管理 |
| Package catalog / Release Set carrier | `ghcr.io/<owner>/one-person-lab-manifest:<yy.m.d[-rN]>` 与同源 workflow artifact | canonical ids、精确 SemVer、owner commits、OCI refs、digests、dependency closure 与 promotion result | `opl packages` 解析；carrier 不进入 Package identity 或独立生命周期 |

维护规则：

- Release 继续放 DMG/ZIP/DEB 等用户安装包。
- Packages 只放 canonical Agent/capability/workflow package 与同源 artifact；Framework/Temporal 属于 Base，WebUI 镜像发布和坐标归 `one-person-lab-app`。
- 普通环境管理逐包读取 `latest-stable`；Developer Mode override 只改变显式 package source。
- MAS 与 `mas-scholar-skills` repo 分开维护；OPL 根据 MAS manifest 建立 required dependency graph。普通 UI 只安装/管理 MAS，ScholarSkills 作为嵌套 managed dependency 自动处理，不合并 repo，也不增加专属入口。
- Daily package channel 只响应 Package source/content fingerprint 变化或显式 Release Set repair。仅 `generated_at` 或 channel metadata 变化不得触发 Package 重发；changed Package 必须先通过 owner manifest SemVer 与 immutable digest gate，unchanged Package 复用上一精确 digest。任何 candidate admission 失败都只能降级到完整上一 `latest-stable`，不得把未验证字节混入或用 `force_publish` 绕过。
- 人工 force publish 也不能让同一 canonical id/version 指向新 digest，不能跳过 SemVer drift、trust、content-lock 或 package gates。
- 每个制品必须有版本、来源、校验和、回滚目标和安装策略。
- 旧版本清理不靠手工记忆：package workflow 必须保留 current `candidate`、`latest-stable`、声明的 LKG/rollback digest 与策略要求的 immutable versions；cleanup 只能 `dry_run_first_explicit_execute_required`。真正删除 package version 需要显式执行与 package admin / `delete:packages` 权限，不在普通 release workflow 中隐式发生。
- `MDS` 不进入默认 manifest / Full payload；如 MAS 需要 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle，只能通过 MAS 明确声明的可选 companion 路径读取。
- `OMA`、`mas-scholar-skills` 与 `opl-flow` 都进入同一个 OPL Packages 对象模型；前者是 standard Agent，后两者分别是 required capability dependency 与 workflow plugin package。实际可拉取性以 canonical OCI digest 和 workflow promotion readback 为准。
- 若后续改变 package channel、override 语义或重新引入 Framework WebUI reference，先改 `src/package-distribution.ts`、release discipline、workflow 和相关测试，再更新本文。

## App 内置策略

标准 App 和自动更新包默认不把 `MAS/MAG/RCA/OMA/OBF` 打进桌面 App：

- App 更新频率应由 GUI 与 OPL release 节奏决定。
- domain Package 的修复、回滚和验证应独立于 App 发版。
- Docker/服务器用户更适合直接拉 WebUI 镜像和 Package 制品。
- 专业用户可能已有本地 sibling checkout，OPL 应优先识别并复用，不强行覆盖。

Full 首次安装包是 App repo 标准 App 之外的额外 GitHub Release asset，用于减少新用户从安装到开始 Med Auto Science、Med Auto Grant、RedCube AI、OPL Meta Agent、OPL Book Forge 工作的等待。Framework/Temporal 作为 OPL Base payload 由 App carrier 消费，但 App 不因此拥有 Base lifecycle；Framework也不拥有 App 发布流程、Full manifest、updater metadata、first-run VM gate 或签名/公证结果。

当前 Full 首次安装包的具体文件名、runtime 安装路径、runtime metadata 路径、payload allowlist、Codex / Temporal payload assertion、size budget、同 tag 刷新策略、`latest*.yml` 排除规则、签名/公证模式和 VM release gate 只从 `one-person-lab-app` 的 `contracts/app-release-channel.json`、`contracts/app-first-run-test-matrix.json`、`scripts/full-first-install-package.ts`、`scripts/build-full-first-install-package.ts`、`scripts/publish-release.ts`、release workflow 和远端 release evidence 读取。OPL 支撑文档只保留稳定边界：

- Full 是 first-install download，不是标准 updater channel；标准 App 自动更新继续只读 App-owned standard metadata。
- Full payload 只能 assembly / validate declared framework runtime、domain Package、Foundry Agent 和 companion tool payload；runtime truth、provider implementation、domain truth、quality verdict 和 artifact authority 仍归 OPL Framework 与 domain agents。
- Full runtime readiness 以 App-owned first-run / release gate 读取；Temporal-backed provider 是 production online runtime 的必需 substrate，Hermes/Gateway payload 只能作为退役或显式 diagnostic/proof 语境，不能写成 Full 默认在线底座。
- App release ready、Full package ready、签名/公证通过、VM smoke 通过或 user-path evidence observed 都不能由本文推出；必须回到 App repo contracts、workflows、release evidence 和真实 GitHub Release assets。
