from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]

SHARED_BOUNDARY_IDS = {
    "opl_operating_model",
    "opl_shared_foundation",
    "opl_shared_foundation_ownership",
}
FORBIDDEN_G4_LABELS = {
    "shared asset index",
    "shared memory index",
    "shared domain registry",
    "shared publication / delivery catalog",
}


def load_json(path: str) -> dict:
    return json.loads((REPO_ROOT / path).read_text())


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def assert_contains(text: str, snippets: list[str], path: Path) -> None:
    for snippet in snippets:
        require(snippet in text, f"missing snippet in {path}: {snippet}")


def verify_public_surface_index() -> None:
    doc = load_json("contracts/opl-gateway/public-surface-index.json")
    surfaces = doc["surfaces"]
    by_id = {}
    for surface in surfaces:
        by_id.setdefault(surface["surface_id"], []).append(surface)

    for surface_id in SHARED_BOUNDARY_IDS:
        entries = by_id.get(surface_id, [])
        require(len(entries) == 1, f"expected exactly one public-surface entry for {surface_id}")
        entry = entries[0]
        require(entry["category_id"] == "opl_contract_surface", f"wrong category for {surface_id}")
        require(entry["owner_scope"] == "opl", f"wrong owner_scope for {surface_id}")
        require(entry["truth_mode"] == "none", f"wrong truth_mode for {surface_id}")

    serialized = json.dumps(doc)
    for label in FORBIDDEN_G4_LABELS:
        require(
            label not in serialized,
            f"current public surface index should not materialize forbidden G4 label: {label}",
        )


def verify_surface_lifecycle_map() -> None:
    doc = load_json("contracts/opl-gateway/surface-lifecycle-map.json")
    require(
        SHARED_BOUNDARY_IDS.issubset(set(doc["covered_surface_ids"])),
        "surface lifecycle map missing shared boundary coverage",
    )

    entries = {surface["surface_id"]: surface for surface in doc["surfaces"]}
    expected_control_modes = {
        "opl_operating_model": "reference_boundary_doc",
        "opl_shared_foundation": "reference_boundary_doc",
        "opl_shared_foundation_ownership": "reference_boundary_doc",
    }
    for surface_id, expected_control_mode in expected_control_modes.items():
        entry = entries[surface_id]
        require(entry["control_mode"] == expected_control_mode, f"wrong control_mode for {surface_id}")
        require(entry["truth_mode"] == "none", f"wrong truth_mode for {surface_id}")
        require(
            entry["follow_on_route_surface"] is None,
            f"{surface_id} must not expose a follow-on route surface",
        )


def verify_surface_review_matrix() -> None:
    doc = load_json("contracts/opl-gateway/surface-review-matrix.json")
    require(
        SHARED_BOUNDARY_IDS.issubset(set(doc["covered_surface_ids"])),
        "surface review matrix missing shared boundary coverage",
    )

    entries = {entry["surface_id"]: entry for entry in doc["review_entries"]}
    for surface_id in SHARED_BOUNDARY_IDS:
        entry = entries[surface_id]
        require(entry["owner_scope"] == "opl", f"wrong review owner_scope for {surface_id}")
        require(entry["human_review_required"] is True, f"{surface_id} should require human review")
        require(
            entry["cross_domain_wording_check"] == "shared_gate_required",
            f"{surface_id} should stay on the shared wording gate",
        )


def verify_acceptance_matrix() -> None:
    doc = load_json("contracts/opl-gateway/acceptance-matrix.json")
    gates = {gate["gate_id"]: gate for gate in doc["gates"]}

    boundary_gate = gates["p23_m4_g4_candidate_index_boundary_integrity"]
    assert_contains(
        "\n".join(boundary_gate["contract_assertions"]),
        [
            "all four G4 indexes remain roadmap-only/future-only/reference-only/non-admitting candidates until a later explicit readiness contract and acceptance alignment freeze them",
            "no G4 candidate index is described as a current public-entry/discovery-ready/routed-action-ready/execution/truth-owner/approval/publish-control/release-control surface",
        ],
        REPO_ROOT / "contracts/opl-gateway/acceptance-matrix.json",
    )

    cross_domain_gate = gates["cross_domain_wording_consistency"]
    required_files = set(cross_domain_gate["required_files"])
    for path in [
        "docs/operating-model.md",
        "docs/operating-model.zh-CN.md",
        "docs/shared-foundation.md",
        "docs/shared-foundation.zh-CN.md",
        "docs/shared-foundation-ownership.md",
        "docs/shared-foundation-ownership.zh-CN.md",
    ]:
        require(path in required_files, f"cross-domain wording gate missing required file: {path}")


def verify_docs() -> None:
    checks = {
        Path("docs/operating-model.md"): [
            "owning shared-foundation control language without taking over domain-owned canonical truth",
            "`MedAutoScience` is the `Research Ops` domain gateway and harness",
            "`RedCube AI` is the visual-deliverable domain gateway and harness",
        ],
        Path("docs/operating-model.zh-CN.md"): [
            "拥有 shared-foundation 的顶层控制语言，但不接管各 domain 的 canonical truth",
            "`MedAutoScience` 是 `Research Ops` 的 domain gateway 与 harness",
            "`RedCube AI` 是视觉交付的 domain gateway 与 harness",
        ],
        Path("docs/shared-foundation.md"): [
            "The shared foundation does not imply one monolithic runtime.",
            "That compatibility does not make `OPL` the canonical truth store for every shared object;",
            "`MedAutoScience` as the active research domain gateway and harness",
            "`RedCube AI` as the visual-deliverable domain gateway and harness, with `ppt_deck` as the family that most directly maps to `Presentation Ops`",
        ],
        Path("docs/shared-foundation.zh-CN.md"): [
            "共享基础结构不等于单体 runtime。",
            "这种兼容性并不让 `OPL` 自动变成所有共享对象的 canonical truth store",
            "`MedAutoScience` 作为 active 的 research domain gateway 与 harness",
            "`RedCube AI` 作为视觉交付 domain gateway 与 harness，其中 `ppt_deck` 是最直接映射到 `Presentation Ops` 的 family",
        ],
        Path("docs/shared-foundation-ownership.md"): [
            "`OPL` owns the top-level semantic, indexing, identity, and cross-domain reuse rules for shared-foundation objects",
            "each `domain gateway` and `domain harness` owns the canonical truth, mutation, audit writeback, and delivery truth for domain-local objects",
            "never an automatic transfer of canonical truth from domains into `OPL`",
            "should not appear on the current `OPL` public surface until a later explicit contract freezes",
        ],
        Path("docs/shared-foundation-ownership.zh-CN.md"): [
            "`OPL` 负责 shared-foundation 对象的顶层语义、索引、身份和跨域复用规则",
            "各 `domain gateway` 与 `domain harness` 负责 domain-local 对象的 canonical truth、mutation、审计回写与交付真相",
            "绝不自动把 canonical truth 从 domain 转移到 `OPL`",
            "在后续显式合同至少冻结下面这些条件之前，不应出现在当前 `OPL` public surface 里",
        ],
    }

    for relative_path, snippets in checks.items():
        path = REPO_ROOT / relative_path
        assert_contains(path.read_text(), snippets, path)


def main() -> None:
    verify_public_surface_index()
    verify_surface_lifecycle_map()
    verify_surface_review_matrix()
    verify_acceptance_matrix()
    verify_docs()
    print("shared-foundation boundary verification OK")


if __name__ == "__main__":
    main()
