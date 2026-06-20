# BookForge OKF Context Bundle Fixture

Fixture role: POC readback for mapping a standard Foundry Agent `agent/` semantic pack into OKF concept metadata.

## Progressive disclosure

1. Overview: this bundle lists BookForge semantic pack concepts without copying prompt, skill, knowledge, tool, stage, or quality gate bodies.
2. Stage map: open the stage concepts first, then follow cross links to matching prompt, skill, knowledge, and quality gate refs.
3. Concept details: each concept carries `type`, `title`, `description`, `resource`, `tags`, `source_refs`, and authority metadata.

## Body-free resource refs

- [Storyline Architecture Stage](#stage-storyline-architecture) links to `agent/stages/storyline-architecture.md`.
- [Storyline Architecture Prompt](#prompt-storyline-architecture) links to `agent/prompts/storyline-architecture.md`.
- [Storyline Architecture Skill](#skill-storyline-architecture) links to `agent/skills/storyline-architecture.md`.
- [Storyline Architecture Quality Gate](#quality-gate-storyline-architecture) links to `agent/quality_gates/storyline-architecture-quality-gate.md`.

## No-authority metadata

The OKF bundle is `body_free_refs_only`.

- `opl_can_write_domain_truth=false`
- `opl_can_write_memory_body=false`
- `opl_can_authorize_quality_or_export=false`
- `bundle_can_claim_domain_ready=false`
- `bundle_can_claim_quality_verdict=false`
- `bundle_can_claim_progress=false`
