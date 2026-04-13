# medautoscience action_graph consumption spec

## Context

- `tests/src/cli.test.ts` already verifies that MAG and RedCube domain manifests, dashboard entries, and handoff bundles surface the `family_orchestration.action_graph` and reference data.
- MAS (medautoscience) adds the `family_orchestration.action_graph` payload in its manifest fixture, but the CLI tests currently do not assert that the MAS clip consumes those fields.
- The goal is to assert that the OPL consumption surfaces (domain manifests, dashboard, and handoff) all include the MAS action graph reference, node count, edge count, and graph identifier so any regression would surface quickly.

## Requirements & Constraints

- No new abstractions or code paths; only expand the existing CLI test coverage.
- Keep the tests targeted to the OPL worktree and avoid touching other repositories, following the worktree-only instruction.
- Ensure the spec is short-lived and focused on verifying that MAS data flows through the intended consumers.

## Proposed Approach

1. Extend the current `domain-manifests resolves real family manifest fixtures …` test to assert that the medautoscience manifest contains `family_orchestration.action_graph_ref.ref`, the `graph_id`, and the expected node/edge counts from the fixture.
2. Within the same test (after `runCli(['dashboard', …])`), assert that `scienceEntry.family_action_graph_ref`, `family_action_graph_node_count`, and `family_action_graph_edge_count` match the counts derived from the MAS fixture.
3. Add a dedicated `handoff-envelope` test scenario that binds MAS, routes a submission_delivery/publication request to it, and then checks that `handoff_bundle.domain_manifest_recommendation.family_orchestration` exposes the action graph reference, identifier, and node/edge counts.

## Validation

- Run `npm run test:fast` to cover the updated CLI tests.

