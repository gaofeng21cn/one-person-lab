# 历史规格：medautoscience action_graph consumption

Owner: `One Person Lab`
Purpose: `historical_superpowers_worker_spec`
State: `history_only`
Machine boundary: 本文是早期 worker spec 归档。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned MAS surfaces 和真实验证 evidence。

> 历史读法：本文保留 2026-04-13 的 MAS action graph consumption 设计草稿。下面的 context、goal、approach 和 validation 只用于追溯当时 consumer coverage 设计；当前 MAS action/stage truth 归 MAS owner，OPL 只消费 refs/projection/consumer verification，不把本 spec 当作 active contract 或 current oracle。

## 历史背景

- `tests/src/cli.test.ts` already verifies that MAG and RedCube domain manifests, dashboard entries, and handoff bundles surface the `family_orchestration.action_graph` and reference data.
- MAS (medautoscience) adds the `family_orchestration.action_graph` payload in its manifest fixture, but the CLI tests currently do not assert that the MAS clip consumes those fields.
- The goal is to assert that the OPL consumption surfaces (domain manifests, dashboard, and handoff) all include the MAS action graph reference, node count, edge count, and graph identifier so any regression would surface quickly.

## 历史需求与约束

- No new abstractions or code paths; only expand the existing CLI test coverage.
- Keep the tests targeted to the OPL worktree and avoid touching other repositories, following the worktree-only instruction.
- Ensure the spec is short-lived and focused on verifying that MAS data flows through the intended consumers.

## 历史方案

1. Extend the current `domain-manifests resolves real family manifest fixtures …` test to assert that the medautoscience manifest contains `family_orchestration.action_graph_ref.ref`, the `graph_id`, and the expected node/edge counts from the fixture.
2. Within the same test (after `runCli(['dashboard', …])`), assert that `scienceEntry.family_action_graph_ref`, `family_action_graph_node_count`, and `family_action_graph_edge_count` match the counts derived from the MAS fixture.
3. Add a dedicated `handoff-envelope` test scenario that binds MAS, routes a submission_delivery/publication request to it, and then checks that `handoff_bundle.domain_manifest_recommendation.family_orchestration` exposes the action graph reference, identifier, and node/edge counts.

## 历史验证

- Run `npm run test:fast` to cover the updated CLI tests.
