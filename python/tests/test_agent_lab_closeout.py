from __future__ import annotations

from opl_framework import evaluate_agent_lab_self_evolution_closeout


def _policy() -> dict:
    return {
        "policy_ref": "policy:example/closeout.v1",
        "target_domain_ids": ["exampledomain"],
        "target_owner_acceptance": {
            "allowed_changed_file_prefixes": ["src/example/"],
            "accepted_result_status": "passed",
            "required_fresh_observations": ["fresh_run"],
            "accepted_scorecard_passed": False,
            "required_failure_taxonomy": "domain_blocker_preserved",
            "required_promotion_safety_status": "requires_owner_gate",
        },
    }


def _draft(changed_files: list[str] | None = None) -> dict:
    return {
        "work_order_id": "wo-1",
        "target_agent": {"domain_id": "exampledomain"},
        "status": "executed_absorbed_and_cleaned",
        "absorption": {"absorbed": True, "absorbed_head": "abc123"},
        "verification": {
            "all_passed": True,
            "command_results": [{"exit_code": 0}],
            "required_verification_refs": ["verify://1"],
        },
        "cleanup": {"worktree_removed": True, "branch_removed": True},
        "no_forbidden_write_proof": {
            "can_write_target_domain_truth": False,
            "can_write_target_domain_memory_body": False,
            "can_mutate_target_domain_artifact_body": False,
            "can_authorize_target_domain_quality_or_export": False,
            "proof_refs": ["proof://1"],
        },
        "patch": {
            "changed_files": ["src/example/patch.py"] if changed_files is None else changed_files,
        },
        "agent_lab_re_evaluation": {
            "suite_result": {
                "result_id": "res-1",
                "status": "passed",
                "observations": {"fresh_run": True},
                "runs": [
                    {
                        "scorecard": {"passed": False},
                        "failure_taxonomy": ["domain_blocker_preserved"],
                        "stage_completion_policy_assessment": {"status": "passed", "blockers": []},
                        "promotion_safety_assessment": {
                            "safety_status": "requires_owner_gate",
                            "automatic_mechanism_promotion_ready": False,
                            "missing_required_refs": [],
                        },
                    }
                ],
            }
        },
        "source_execution_receipt_ref": "exec://1",
    }


def test_agent_lab_closeout_routes_accepted_waived_and_blocked() -> None:
    accepted = evaluate_agent_lab_self_evolution_closeout(
        _draft(),
        _policy(),
        owner="example-agent",
        version="example-closeout.v1",
        ref_prefix="example-closeout",
    )
    assert accepted["return_shape"] == "domain_receipt"
    assert accepted["status"] == "mechanism_change_accepted"
    assert accepted["owner_receipt_ref"].startswith("example-closeout:wo-1/")

    waived = evaluate_agent_lab_self_evolution_closeout(
        _draft([]),
        _policy(),
        owner="example-agent",
        version="example-closeout.v1",
        ref_prefix="example-closeout",
    )
    assert waived["return_shape"] == "no_regression_evidence"
    assert waived["status"] == "mechanism_change_waived"

    blocked = evaluate_agent_lab_self_evolution_closeout(
        _draft(["outside/file.py"]),
        _policy(),
        owner="example-agent",
        version="example-closeout.v1",
        ref_prefix="example-closeout",
    )
    assert blocked["return_shape"] == "typed_blocker"
    assert "changed_file_outside_mechanism_scope" in blocked["reason_codes"]
