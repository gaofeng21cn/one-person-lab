# One Person Lab App 仓库拆分计划

Owner: `One Person Lab`
Purpose: `app_repo_split_plan`
State: `active_plan`
Machine boundary: 本文是人读迁移计划，不是机器接口。机器可读真相继续归 `contracts/`、源码、CLI/API 行为、release artifact、runtime ledger、provider receipt 和 App 仓自己的 release / test contract。
Date: `2026-05-15`

## 结论

One Person Lab App 应从当前 `opl-aion-shell` 的 GUI fork 仓定位，迁移为独立的 App 产品仓。目标拓扑是：

```text
one-person-lab/                 # OPL Framework
one-person-lab-app/             # One Person Lab App
  docs/
  contracts/
  scripts/
  shells/
    aionui/                     # 当前稳定 AionUI shell adapter
    aionui-next/                # 可选实验线，例如 AionUI 2.0 适配
```

`one-person-lab` 继续作为最顶层 OPL Framework 仓，持有 stage-led runtime、Temporal-backed provider、contracts、CLI、module / skill sync、domain discovery、runtime snapshot 和 framework-level verification。

`one-person-lab-app` 面向终端用户，持有 App 定义、用户文档、截图教程、发布说明、打包、更新、页面状态测试、首启测试和当前 GUI shell adapter。

当前 AionUI fork 不应成为 App 仓顶层身份。它应作为 `shells/aionui/` 下的 upstream-backed shell adapter 维护，以便跟随 AionUI upstream，也便于未来替换 GUI。

推荐实施方式是 **直接把现有 GitHub 仓 `gaofeng21cn/opl-aion-shell` 改名为 `gaofeng21cn/one-person-lab-app`，再在这个仓内做目录重组**。

理由：

- 当前 `gaofeng21cn/opl-aion-shell` 不是 GitHub fork；它已经是 OPL App 产品主线仓，`origin` 只是上游 AionUI remote。
- 改名保留 issues、PR、release、stars/watch、branch protection、Actions secrets、GitHub Release 历史和所有 commit history。
- GitHub 会为旧 repo URL 提供 redirect，短期兼容成本低。
- 后续 upstream AionUI intake 仍可通过 `upstream=https://github.com/iOfficeAI/AionUi` 完成，不因为 repo 改名而丢失同步能力。

新建全新 `one-person-lab-app` repo 只作为备选：当必须保留 `opl-aion-shell` 作为冻结 archive、需要重新定义可见历史、或 GitHub repo rename 因权限 / 发布策略被阻塞时才使用。新建 repo 的成本更高，因为需要搬迁 release、secrets、branch protection、Actions、issues/PR 链接和本地 checkout。

## 目标

- 降低 `one-person-lab` 主仓复杂度，让它保持 framework-first：开发者、运行依赖环境、合同、CLI、runtime 和全面测试。
- 让 App 仓变成 user-first：安装包、页面体验、图文教程、首启、更新、截图、用户帮助和可见状态。
- 保留 AionUI upstream 跟随能力，避免把 AionUI 目录搬入后变成普通 vendored code。
- 支持 AionUI 2.0 或其他 GUI 基座的并行试验：新基座先在 `shells/<candidate>/` 调试，验证通过后再切换 active shell。
- 保持 OPL Framework、One Person Lab App 和 Foundry Agents 三层 truth owner 不漂移。

## 非目标

- 本计划不把 App 变成 runtime owner。
- 本计划不复制 `opl install`、module install、skill sync、runtime manager、Temporal provider 或 domain truth 逻辑。
- 本计划不要求 MAS/MAG/RCA 改变 direct skill path 或 domain authority。
- 本计划不要求一次性切换 release source-of-truth；发布迁移应分阶段完成。
- 本计划不把 AionUI upstream 文档纳入 OPL docs lifecycle governance。

## 仓库职责

### `one-person-lab`

保留：

- `opl` CLI、`opl exec`、`opl resume`、`opl system initialize`。
- Codex-default session/runtime、explicit activation layer、stage control plane、typed family queue。
- Temporal-backed family runtime provider、stage attempt ledger、human gate、resume、dead-letter、provider proof 和 runtime projection。
- `contracts/`、shared helper、domain discovery、standard domain-agent skeleton、module install、skill sync、package/runtime payload manifest。
- Framework 级测试矩阵：typecheck、fast/meta/artifact/fresh-install、runtime/provider、contracts、domain descriptor parity。

只保留薄 App 关系：

- App release discovery / install surface。
- App 可消费的 machine-readable runtime / system / module / agent / workspace / session / progress / artifact 输出。
- App/workbench 目标和 authority boundary 的 framework-side 文档。

不再持有：

- GUI source fork。
- Electron builder policy。
- App 页面状态测试。
- App screenshot / visual tutorial。
- App updater metadata 生成细节。
- AionUI upstream intake 的实现目录。

### `one-person-lab-app`

持有：

- One Person Lab App 的产品定义、用户文档、截图教程、发布说明和支持文档。
- App release contract、shell adapter contract、页面状态测试矩阵、首启测试矩阵。
- 标准 App 包、Full first-install 包、updater metadata、packaged runtime validation。
- Electron / WebUI / accessibility / Playwright 页面状态测试。
- 当前 GUI shell adapter：`shells/aionui/`。
- 候选 GUI shell lab：例如 `shells/aionui-next/`。

不持有：

- OPL Framework runtime truth。
- Domain truth、quality verdict、publication/fundability/visual/export authority。
- OPL provider implementation、generic queue、generic stage runner 或 domain memory body。

## Repo 策略选择

| 方案 | 结论 | 适用场景 | 成本 / 风险 |
| --- | --- | --- | --- |
| **A. 改名现有 `gaofeng21cn/opl-aion-shell` 为 `gaofeng21cn/one-person-lab-app`** | 推荐 | 当前默认路径。现有仓已经不是 GitHub fork，且已承载 App 发布、验证和产品主线。 | 需要更新 remote、README、workflow、release 文案、`opl install` asset discovery。旧 URL 依赖需要确认 GitHub redirect 足够。 |
| B. 新建全新 `one-person-lab-app`，导入 `opl-aion-shell` 历史 | 备选 | 需要把旧仓冻结为 archive，或 repo rename 无权限 / 不符合发布策略。 | 需要重新设置 secrets、branch protection、Actions、Release、issue/PR 管理；历史和旧链接迁移成本更高。 |
| C. 保留 `opl-aion-shell` 名称，只在仓内移动到 `shells/aionui` | 不推荐作为最终态 | 只适合短期技术预演。 | 顶层 repo 名仍把 App 产品身份绑定到 AionUI，长期认知问题没有解决。 |

因此，本文后续“建立 `one-person-lab-app`”默认指 **rename 现有 repo**，不是新建空仓。只有在明确选择方案 B 时，才按新仓导入路径执行。

## 目标目录形态

```text
one-person-lab-app/
  AGENTS.md
  README.md
  README.zh-CN.md
  docs/
    README.md
    status.md
    release/
    testing/
    user-guides/
    screenshots/
    history/
  contracts/
    app-shell-adapter.json
    app-release-channel.json
    app-page-state-matrix.json
    app-first-run-test-matrix.json
  scripts/
    package-app
    prepare-release-assets
    validate-release
    validate-active-shell
  shells/
    aionui/
      AGENTS.md
      package.json
      electron-builder.yml
      src/
      scripts/
    aionui-next/
      AGENTS.md
      ...
```

顶层 `contracts/app-shell-adapter.json` 应只声明 active shell、shell root、upstream family、release role 和 validation command，不把 AionUI 的内部结构变成 App 顶层 truth。

示例语义：

```json
{
  "active_shell": "aionui",
  "shell_root": "shells/aionui",
  "upstream_family": "AionUI",
  "release_role": "stable_app_shell",
  "validation": [
    "install",
    "typecheck",
    "test",
    "packaged_runtime_validation",
    "app_startup_smoke"
  ]
}
```

## AionUI upstream 跟随规则

`shells/aionui/` 不作为普通 vendor 目录维护。它必须保留 upstream-backed 维护能力：

1. 迁移时使用 history-preserving 方式，例如 `git filter-repo --to-subdirectory-filter shells/aionui`、`git subtree` 或等价的 prefix-preserving import。
2. `shells/aionui/AGENTS.md` 明确该目录服从 AionUI upstream intake 规则、OPL overlay 边界和验证矩阵。
3. upstream AionUI 更新进入独立 intake 分支或 worktree，先吸收 upstream，再重放 / 收缩 OPL overlay。
4. OPL-specific 改动应集中在 adapter、bridge、branding、packaging policy、runtime surface 调用和页面集成层，避免把业务逻辑散落到大量 upstream 原文件。
5. 每次 upstream intake 都要做本地补丁退役审计：upstream 已覆盖的深补丁删除或收缩成薄 adapter。
6. 稳定 shell 和实验 shell 分开：`shells/aionui/` 维护当前发布线，`shells/aionui-next/` 可用于 AionUI 2.0 这类大版本适配。

迁移后的推荐 remote 命名：

```text
origin    git@github.com:gaofeng21cn/one-person-lab-app.git
upstream  https://github.com/iOfficeAI/AionUi
```

如果短期仍保留 `gaofeng` remote，也应在迁移收口时统一成 `origin=one-person-lab-app`、`upstream=AionUI`，避免 “origin 是上游 / gaofeng 是产品仓” 的旧 fork-style 读法继续污染 App repo。

## AionUI 2.0 或新 GUI 基座策略

大版本升级不直接覆盖稳定 shell。推荐流程：

1. 新建 `shells/aionui-next/` 或 `shells/<new-gui>/`。
2. 接入同一组 OPL CLI / machine-readable surfaces。
3. 映射 `system`、`engines`、`modules`、`agents`、`workspaces`、`sessions`、`progress`、`artifacts`。
4. 实现 App 必需页面：运行状态、设置、环境、模块、技能、关于页、首启状态、更新状态。
5. 跑类型检查、单元测试、i18n、packaged runtime validation、页面状态测试、真实 App startup smoke。
6. 更新 `contracts/app-shell-adapter.json` 的 active shell。
7. 只在新 shell 发布验证完成后，退役旧 shell 或迁入 `docs/history/` 记录。

这个流程让 AionUI 2.0 适配可以并行进行，不影响当前稳定用户包和 updater 通道。

## 落地流程

迁移分七个阶段执行。每个阶段都要有退出条件和回滚点，不把 repo rename、目录移动、release 切换和 AionUI 2.0 适配压成一次性大改。

### 0. 冻结迁移基线

目的：确认当前 App 仓可以安全作为 rename / restructure 起点。

动作：

- 确认 `one-person-lab` 当前文档已经记录 Framework/App split。
- 确认 `opl-aion-shell` 工作区干净或只含已归属的迁移改动。
- 记录当前 product main branch、latest release tag、当前 App 版本、GUI/AionUI baseline、Full 包状态和本机安装版状态。
- 运行当前 App 仓 baseline 验证：i18n、typecheck、test、lint、packaged runtime validation、标准 package build、真实 App smoke。

退出条件：

- 当前 App 仓能从 `gaofeng/main` 构建并验证。
- 当前 `one-person-lab` release / install 路径有回滚参考。
- 记录一份 migration baseline note，包含 commit id、release id、验证命令和已知未完成项。

回滚点：

- 不改 GitHub repo 名。
- 不移动目录。
- 继续使用当前 `opl-aion-shell` 发布路径。

### 1. GitHub repo 改名

目的：先把顶层产品身份改正，再做目录重组。

动作：

- 在 GitHub 将 `gaofeng21cn/opl-aion-shell` rename 为 `gaofeng21cn/one-person-lab-app`。
- 本地更新 remote：产品仓 remote 指向 `git@github.com:gaofeng21cn/one-person-lab-app.git`，AionUI upstream remote 指向 `https://github.com/iOfficeAI/AionUi`。
- 保留旧 URL redirect 兼容窗口，但新文档和脚本不再新增 `opl-aion-shell` 作为产品仓名。
- 检查 GitHub Actions secrets、branch protection、Release、workflow permissions 是否随 rename 保留。

退出条件：

- `git fetch` / `git push --dry-run` 指向新 repo 名。
- GitHub Release 和 Actions 可见。
- `one-person-lab` 文档仍把当前发布路径写成兼容阶段，不宣称 release source-of-truth 已切换。

回滚点：

- GitHub repo 可改回 `opl-aion-shell`。
- 本地 remote 可恢复旧 URL。

### 2. App 顶层 skeleton 落地

目的：把 App 产品层放在仓顶层，但暂时不移动 AionUI 源码。

动作：

- 新增 / 重写 App 顶层 `README*`、`docs/README.md`、`docs/status.md`、`docs/release/`、`docs/testing/`、`docs/user-guides/`、`contracts/`。
- 新增 `contracts/app-shell-adapter.json`，先指向当前根目录或临时 shell root。
- 新增顶层 `scripts/validate-active-shell`，先代理当前 shell 的既有验证命令。
- 标记当前 AionUI-root 仍处于 pre-prefix compatibility window。

退出条件：

- App 顶层文档已经能说明 App 产品身份、Framework dependency、active shell、release channel 和测试矩阵。
- 顶层验证脚本能调用现有 shell 验证。
- 用户下载 / updater / Full 包语义没有变化。

回滚点：

- 删除新增 App 顶层 skeleton，保持现有布局。

### 3. 将当前 AionUI fork 移入 `shells/aionui/`

目的：完成顶层 App 产品层与 AionUI shell adapter 的物理分层。

推荐技术路径：

- 在迁移分支内把当前 AionUI-root 文件移动到 `shells/aionui/`。
- 保留 App 顶层 skeleton、`contracts/`、`docs/`、`scripts/` 在 repo root。
- 对 package manager、workspace、electron-builder、workflow、script path、asset path、test path 做最小路径修正。
- 新增 `shells/aionui/AGENTS.md`，冻结 upstream intake、OPL overlay、验证和禁止复制 runtime truth 的规则。

可选技术实现：

```bash
# 方案 3A：在现有历史上做一次普通 move，保留 Git 对 rename 的追踪。
# 适合保留完整 repo history，同时让未来 git log --follow 能追踪多数文件。
mkdir -p shells/aionui
git mv <aionui-root-files> shells/aionui/

# 方案 3B：用 filter-repo 生成带 prefix 的历史，再合入 App 顶层 skeleton。
# 适合想让整个 AionUI 历史天然位于 shells/aionui/，但需要更严格的仓库重写流程。
git filter-repo --to-subdirectory-filter shells/aionui
```

默认推荐 3A：**rename 现有 repo + 普通 `git mv` 到 `shells/aionui/`**。它不重写公开历史，GitHub Release / PR / commit link 风险最低；上游 AionUI 更新仍通过 remote + intake 分支解决。只有当历史展示必须天然带 prefix 时，才选择 3B。

退出条件：

- `contracts/app-shell-adapter.json` 指向 `shells/aionui`。
- 顶层 App 脚本能进入 `shells/aionui` 执行 install/build/test/package。
- packaged runtime validation 和真实 App smoke 通过。
- AionUI upstream intake 文档已指向 `shells/aionui/AGENTS.md`。

回滚点：

- 在迁移分支回退本阶段 commit。
- 若已合并但未发布，可 revert 目录移动 commit。

### 4. Release / installer 兼容切换

目的：保持用户安装不破，同时让 App repo 开始成为 App 包 source-of-truth。

动作：

- App repo 顶层 scripts 生成标准 App 包、Full first-install 包和 updater metadata。
- `one-person-lab` 暂时继续作为用户下载 release 面，或读取 App repo 生成的 release manifest。
- 更新 `opl install` / GUI release discovery，使其读取 App release manifest 或新 repo asset，但保留旧 release fallback 一个兼容周期。
- 明确 standard updater 不能引用 Full 包。

退出条件：

- 标准 App updater 只看到标准资产。
- Full first-install 包有显式 `Full` 命名和 payload validation。
- `opl install` 能找到当前平台 App 包。
- 旧 `opl-aion-shell` 名称只作为 redirect / history / migration note 出现。

回滚点：

- `opl install` fallback 到旧 release asset selection。
- App repo release 不作为唯一下载源，直到新路径验证完整。

### 5. AionUI 2.0 / next shell 并行适配

目的：证明新拓扑能承载大版本 GUI 迁移。

动作：

- 在 `shells/aionui-next/` 或 `shells/aionui-v2-lab/` 接入 AionUI 2.0。
- 不影响 `shells/aionui/` 稳定发布线。
- 新 shell 使用同一组 App 顶层 contracts 和 OPL machine-readable surfaces。
- 通过 App 页面状态矩阵、packaged runtime validation、真实 App smoke 后，才切 active shell。

退出条件：

- stable shell 和 next shell 可并存。
- active shell contract 是唯一切换点。
- 旧 shell 可退役或保留为 history/provenance，不污染 App 顶层。

回滚点：

- 删除或冻结 `shells/aionui-next/`。
- active shell 继续指向 `shells/aionui/`。

### 6. 收口与旧名退役

目的：让新拓扑成为默认事实。

动作：

- 更新 `one-person-lab` README / status / install docs，把 App repo 写成 `one-person-lab-app`。
- 更新 `opl install`、release docs、GitHub Actions、badges、screenshots、user guides 中的旧仓名。
- `opl-aion-shell` 只作为历史旧名、GitHub redirect 或 migration note 出现。
- 关闭临时 compatibility wording。

退出条件：

- 新文档不再把 `opl-aion-shell` 当作当前产品仓名。
- App repo 顶层和 `shells/aionui` owner split 可被新维护者直接理解。
- Framework repo 验证和 App repo 验证均通过。

回滚点：

- 如果 App repo source-of-truth 仍有 blocker，继续保留兼容阶段 release discovery，不切默认。

## 命令级检查清单

### `one-person-lab` 主仓

迁移文档阶段：

```bash
git diff --check
npm run line-budget
npm run test:meta
```

release discovery 切换阶段：

```bash
npm run typecheck
npm run test:fast
npm run test:artifact
npm run test:fresh-install
```

### `one-person-lab-app` / active shell

当前 `opl-aion-shell` baseline 阶段沿用现有命令：

```bash
bun run i18n:types
node scripts/check-i18n.js
bunx tsc --noEmit
bun run test
bun run lint
node scripts/validate-packaged-runtime.js --scan-all
```

目录重组后，顶层 App 命令应代理到 active shell：

```bash
node scripts/validate-active-shell
node scripts/prepare-release-assets
node scripts/validate-release
```

真实安装 / 页面状态验证：

```text
build standard App package
build Full first-install package
replace /Applications/One Person Lab.app
launch installed App
check runtime page
check settings overview
check environment tab
check about page
check updater channel excludes Full assets
check console/runtime errors
```

## 验证矩阵

Framework repo 验证：

- `scripts/verify.sh`
- `npm test` / `npm run test:fast`
- `npm run test:meta`
- `npm run test:artifact`
- `npm run test:fresh-install`
- `npm run line-budget`
- domain descriptor / contract parity lanes

App repo 验证：

- active shell dependency install。
- i18n type generation and validation。
- TypeScript typecheck。
- unit / integration tests。
- lint / format。
- packaged runtime validation with scan-all behavior。
- standard App package build。
- Full first-install package build and payload validation。
- updater metadata validation：standard updater 不选择 Full 包。
-真实 App startup smoke。
- 关键页面状态测试：runtime、settings overview、environment、about、update / release state、first launch readiness。

跨仓验证：

- App 调用 `opl system initialize`、`opl runtime snapshot`、`opl agents descriptors`、`opl modules`、`opl skill sync` 等 machine-readable surfaces。
- App 不解析人读 Markdown 章节作为稳定接口。
- App 不推断 domain truth、quality verdict 或 artifact authority。
- App action routing 必须带明确 owner：OPL CLI / provider signal / domain sidecar / direct skill / manual handoff。

## 文档更新范围

`one-person-lab` 内当前应更新：

- `docs/decisions.md`：新增 App repo split / shell adapter 子目录化决策。
- `docs/status.md`：把当前事实和目标迁移拓扑分开写。
- `docs/active/README.md`：收录本计划。
- `docs/active/opl-family-development-reference.md`：更新 App / Workbench 责任与 AionUI fork 文档治理口径。
- `docs/active/current-state-vs-ideal-gap.md`：把 App 当前差距补成 repo 拆分和 shell adapter 化差距。
- `docs/product/README.md` 与 `docs/references/current-support/README.md`：指向本计划。
- `docs/references/current-support/opl-gui-shell-adapter-boundary.md`：明确当前仓与目标拓扑。
- `README*` 可在实际 repo 建立后更新用户入口；本计划阶段不强制改下载文案。

## 验收标准

- `one-person-lab` 文档明确 Framework repo 与 App repo 分工。
- `opl-aion-shell` 当前事实和 `one-person-lab-app/shells/aionui` 目标拓扑不混写。
- AionUI 明确是可替换 shell adapter，不是 App 顶层身份，也不是 OPL runtime owner。
- 迁移计划明确默认路径是 repo rename + 普通 `git mv` 到 `shells/aionui/`；filter-repo / subtree 只在需要 prefix-preserving 历史时使用。
- AionUI 2.0 这类大版本可走并行 `shells/*-next` 适配线。
- App release / Full package / updater / page-state tests 归 App repo；Framework repo 只保留 machine-readable surfaces 和 release discovery。

## 风险与控制

| 风险 | 控制 |
| --- | --- |
| AionUI 搬入后变成普通 vendor 目录 | 使用 repo rename + `git mv` 的可追踪移动，保留 upstream intake 规则和 `shells/aionui/AGENTS.md`；需要 prefix 历史时再用 filter-repo / subtree。 |
| App repo 顶层被 AionUI 规则主导 | 顶层只放 App product/release/testing contracts；AionUI 规则限制在 `shells/aionui/`。 |
| updater 误选 Full 包 | App repo release contract 明确 standard updater 只引用标准 App asset 和 `latest*.yml`。 |
| Framework/App 发布切换破坏用户安装 | 分阶段迁移，先保留 `one-person-lab` Release 用户入口，再切 source-of-truth。 |
| GUI 2.0 大版本升级影响稳定用户 | 使用 `shells/aionui-next/` 并行适配，通过验证后再切 active shell。 |
| App 复制 runtime 或 domain truth | App 只能消费 OPL CLI / machine-readable outputs 和 domain-owned projection refs；action routing 必须 owner-aware。 |

## 下一步

1. 在 `one-person-lab` 完成本计划和相关文档口径更新。
2. 对 `opl-aion-shell` 做 repo state / branch / release audit，确认可迁移基线。
3. 默认执行 GitHub repo rename：`gaofeng21cn/opl-aion-shell` -> `gaofeng21cn/one-person-lab-app`；只有遇到权限、发布策略或 archive 需求 blocker 时才改用新 repo。
4. 建立 `one-person-lab-app` 顶层 skeleton，再把现有 AionUI-root 用普通 `git mv` 移入 `shells/aionui/`；只有历史必须天然带 prefix 时才考虑 filter-repo / subtree。
5. 搬迁 App release / validation scripts，并保持当前 release 通道兼容。
6. 跑 App repo 完整验证和真实安装 smoke 后，再调整 `opl install` 的 App release discovery。
