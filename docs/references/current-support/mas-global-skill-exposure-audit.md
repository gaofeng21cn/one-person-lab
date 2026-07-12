# MAS 全局 Skill 暴露审计

Owner: `One Person Lab`
Purpose: `references_current_support_mas_global_skill_exposure_audit`
State: `support_reference`
Machine boundary: 本文是人读审计和治理口径。它不修改 `~/.codex/skills`、Codex plugin cache、MAS runtime truth、owner receipt、typed blocker、publication readiness 或 clinical data readiness。本机安装状态必须按 fresh Codex / OPL readback 重新读取。

## 结论

MAS / MDS 相关 Skill 不应作为 OPL 默认 `global_user` 暴露面。默认路径应是：

- MAS professional Skill：由 `mas-scholar-skills` canonical source repo 维护，经 OPL Connect 按 domain profile 同步到 workspace / quest-local `.codex/skills`。
- MAS audit / runtime truth Skill：只给 developer/operator 或 MAS project/profile-local 使用，不作为普通 Codex 全局候选。
- DeepScientist / MDS historical workflow Skill：保留为 legacy / provenance / project-internal workflow，不升级为 OPL 默认 family skill；需要继续使用时，应迁到 MAS project/profile/workspace/quest-local，或折叠成一个显式 router / aggregate entry。

全局安装本身不是 canonical source，也不是默认推荐暴露层级。Codex metadata 会污染日常上下文，因此新增或保留任何 MAS 相关全局 Skill 都必须有显式用户选择、可卸载路径和污染风险说明。

## 当前本机读回

本轮只读检查发现用户级 `~/.codex/skills` 下存在下列 MAS / MDS 相关 Skill。它们不因此成为 OPL 默认生态的一部分：

| Skill | 当前管理方式 | 预期暴露层级 | 是否符合预期 | 治理动作 |
| --- | --- | --- | --- | --- |
| `mas-scholar-skills` | 用户级 Codex Skill，源语义来自 external `mas-scholar-skills` repo。 | `domain_profile` -> `workspace_local` / `quest_local`；`global_user` 仅限显式个人安装。 | partial | OPL 默认不要求全局安装；当前产品路径以 MAS package closure 和 workspace / quest activation 为准。 |
| `mas-runtime-truth-audit` | 用户级 MAS audit Skill。 | `developer_codex` 或 MAS project/profile-local。 | partial | 保留为开发者诊断能力可以接受；普通 OPL / Codex 默认 profile 不应自动暴露。 |
| `mas-display-pack-audit` | 用户级 MAS display audit Skill。 | `developer_codex` 或 MAS project/profile-local。 | partial | 只服务 display pack / visual audit 诊断，不作为默认 professional pack。 |
| `mas-contract-first-external-intake` | 用户级 MAS external-intake audit Skill。 | `developer_codex` 或 MAS project/profile-local。 | partial | 只在 external-learning intake / contract-first review 时显式启用。 |
| `deepscientist-scout` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local，或 aggregate router 下按需发现。 | not_expected_default | 不进入 OPL 默认全局生态；需要迁移时由 MAS owner 映射到 stage prompt 或 workspace-local skill。 |
| `deepscientist-idea` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-baseline` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-experiment` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-analysis-campaign` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-decision` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-write` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-review` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-rebuttal` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-figure-polish` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-finalize` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-optimize` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |
| `deepscientist-intake-audit` | 用户级 DeepScientist historical workflow Skill。 | legacy / MAS project-local / quest-local。 | not_expected_default | 同上。 |

## 执行规则

- OPL Framework 文档、profile 和 tests 只能把这些 Skill 标成 exposure governance fact；不能直接删除或迁移用户级安装。
- `mas-scholar-skills` 的默认证据来自 OPL Packages dependency/status readback、source repo provider manifest 和 workspace / quest lifecycle receipt，不来自用户全局 registry。
- MAS audit Skill 只有在 operator/developer 明确处理 MAS runtime truth、display pack、external intake 时才应进入任务上下文。
- DeepScientist / MDS Skill 若继续保留，应作为 legacy workflow pack 被 MAS owner 显式路由；OPL 不把它们列入 default companion 或 family domain default skill。
- 后续如果要实际清理 `~/.codex/skills`，必须单独走用户确认和可回滚迁移，不在 OPL repo docs landing 中隐式执行。
