**English** | [中文](./roadmap.zh-CN.md)

# OPL Roadmap

## Current Public Mainline

As of `2026-04-11`, the public `OPL` mainline remains the admitted-domain federation surface plus the local `TypeScript CLI`-first / read-only gateway baseline that is already materialized in this repository.

That currently means:

- `OPL` remains the top-level gateway and federation language for the lab.
- `MedAutoScience` remains the active `Research Ops` domain gateway and harness.
- `RedCube AI` remains the admitted visual-deliverable domain gateway and harness.
- `Grant Foundry -> Med Auto Grant` remains public signal / future direction only rather than an admitted domain gateway.
- the formal entry at the `OPL` layer remains `CLI-first`, `MCP` remains the supported protocol layer, and `controller` remains an internal surface only.
- the current deployment shape remains the `Codex`-default host-agent runtime, but that is not the identity of the `OPL` product or of the shared substrate.

Earlier phase and activation-package freezes remain useful historical anchors in `docs/references/`, but they are no longer the right label for the active repo-tracked follow-on.

## Current Repo-Tracked Follow-On: `S1 / shared runtime substrate v1 contract freeze`

The current repo-tracked follow-on is not “another sync tranche.”
It is `S1 / shared runtime substrate v1 contract freeze`.

`S1` exists to freeze the top-level runtime-substrate language needed for `OPL` to evolve toward a family of vertical online agent products without pretending that the runtime is already unified or hosted.

`S1` freezes six shared object groups:

- `runtime profile`
- `session substrate`
- `gateway runtime status`
- `memory provider hook`
- `delivery / cron substrate`
- `approval / interrupt / resume`

For `S1` to count as done at the `OPL` top layer:

- `README*`, `docs/README*`, `roadmap*`, `operating-model*`, `unified-harness-engineering-substrate*`, `opl-runtime-naming-and-boundary-contract*`, `contracts/README.md`, and `contracts/opl-gateway/README*` must stop fighting each other.
- the Hermes absorption result must be frozen as `adopted / adapted / deferred / rejected`.
- the next truthful adoption order for `med-autoscience`, `med-autogrant`, and `redcube-ai` must be repo-tracked.
- no second truth hub may be introduced.

## Why Now

This freeze is timely for three reasons:

- the public gateway and domain boundary wording is already much more stable than the runtime-substrate wording beneath it
- the three business repositories now need one shared north star before they drift into three incompatible runtime stories
- the Hermes benchmark already provides enough external reference to freeze language and ownership boundaries honestly, without inventing shared implementation that does not exist

## What `S1` Must Not Do

`S1` must not:

- claim that a unified platform runtime already exists
- claim that a hosted `Web / API` runtime is already implemented
- turn `OPL` into the current runtime owner
- force the three business repositories into one execution kernel
- treat future product entry as current truth
- write unproven runtime-substrate language directly into `contracts/opl-gateway/*.json`

## Immediate Follow-On After `S1`

After the top-layer freeze, the next truthful order is:

1. `med-autoscience`
   - prove the first mature local product-runtime pilot on top of the frozen substrate language
2. `med-autogrant`
   - absorb the same language into a clearer revision / final / export runtime path
3. `redcube-ai`
   - stay later until `source-readiness / research-mainline` is more stable, then absorb only the parts that are actually reusable

This is a domain-adoption order, not a claim that all three domains must become identical.

## Current Evaluation Criteria

To judge whether `OPL` is moving in the right direction, these checks matter:

- can readers clearly distinguish the public mainline from the current repo-tracked follow-on?
- can readers tell that `OPL` is still `Gateway / Federation` rather than the runtime owner?
- can readers tell that `shared runtime substrate v1` is a contract freeze rather than an implementation claim?
- can readers tell that `CLI-first` remains the formal entry, `MCP` remains supported, and `controller` remains internal?
- can readers tell which domain should adopt the frozen substrate language first, second, and later?

## Further Reading

- [OPL Operating Model](./operating-model.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.md)
- [OPL Runtime Naming And Boundary Contract](./opl-runtime-naming-and-boundary-contract.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [Hermes Agent Runtime Substrate Benchmark](./references/hermes-agent-runtime-substrate-benchmark.md)
- [OPL Vertical Online Agent Platform Roadmap](./references/opl-vertical-online-agent-platform-roadmap.md)
