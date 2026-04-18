from __future__ import annotations

import unittest

from opl_harness_shared.status_narration import (
    PAPER_MILESTONE_ANSWER_CHECKLIST,
    PROGRESS_ANSWER_CHECKLIST,
    STATUS_NARRATION_CONTRACT_KIND,
    STATUS_NARRATION_SCHEMA_VERSION,
    build_status_narration_contract,
)


class StatusNarrationContractTest(unittest.TestCase):
    def test_build_status_narration_contract_normalizes_payload(self) -> None:
        payload = build_status_narration_contract(
            contract_id="paper-status",
            surface_kind="paper_contract_health",
            milestone={
                "milestone_id": "content_complete",
                "reached": True,
                "empty": "",
            },
            stage={"current_stage": "write"},
            readiness={"review_ready": True, "submission_ready": False},
            remaining_scope={"scope_id": "objective_info_only"},
            current_blockers=["", "journal metadata missing"],
            next_step="补齐作者和伦理号。",
            facts={"supported_claim_count": 12, "ignored": None},
            answer_checklist=PAPER_MILESTONE_ANSWER_CHECKLIST,
        )

        self.assertEqual(payload["schema_version"], STATUS_NARRATION_SCHEMA_VERSION)
        self.assertEqual(payload["contract_kind"], STATUS_NARRATION_CONTRACT_KIND)
        self.assertEqual(payload["milestone"]["milestone_id"], "content_complete")
        self.assertNotIn("empty", payload["milestone"])
        self.assertEqual(payload["current_blockers"], ["journal metadata missing"])
        self.assertEqual(payload["facts"]["supported_claim_count"], 12)
        self.assertEqual(
            payload["narration_policy"]["answer_checklist"],
            list(PAPER_MILESTONE_ANSWER_CHECKLIST),
        )
        self.assertEqual(payload["narration_policy"]["mode"], "ai_first")
        self.assertEqual(payload["narration_policy"]["legacy_summary_role"], "fallback_only")

    def test_status_narration_contract_uses_progress_defaults_when_no_checklist_is_given(self) -> None:
        payload = build_status_narration_contract(
            contract_id="study-progress",
            surface_kind="study_progress",
        )

        self.assertEqual(
            payload["narration_policy"]["answer_checklist"],
            list(PROGRESS_ANSWER_CHECKLIST),
        )


if __name__ == "__main__":
    unittest.main()
