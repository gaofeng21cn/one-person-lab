from __future__ import annotations

import unittest

import opl_framework
from opl_framework import status_narration
from opl_framework.status_narration import (
    PROGRESS_ANSWER_CHECKLIST,
    STATUS_NARRATION_CONTRACT_KIND,
    STATUS_NARRATION_SCHEMA_VERSION,
    build_status_narration_contract,
    build_status_narration_human_view,
)


class StatusNarrationContractTest(unittest.TestCase):
    def test_framework_status_narration_does_not_export_domain_paper_checklist(self) -> None:
        self.assertFalse(hasattr(status_narration, "PAPER_MILESTONE_ANSWER_CHECKLIST"))
        self.assertFalse(hasattr(opl_framework, "PAPER_MILESTONE_ANSWER_CHECKLIST"))

    def test_build_status_narration_contract_accepts_caller_checklist(self) -> None:
        custom_checklist = (
            "milestone_status",
            "review_readiness",
            "remaining_scope",
        )
        payload = build_status_narration_contract(
            contract_id="artifact-status",
            surface_kind="artifact_contract_health",
            milestone={
                "milestone_id": "content_complete",
                "reached": True,
                "empty": "",
            },
            stage={"current_stage": "write"},
            readiness={"review_ready": True, "submission_ready": False},
            remaining_scope={"scope_id": "objective_info_only"},
            current_blockers=["", "metadata missing"],
            next_step="补齐必要字段。",
            facts={"supported_claim_count": 12, "ignored": None},
            answer_checklist=custom_checklist,
        )

        self.assertEqual(payload["schema_version"], STATUS_NARRATION_SCHEMA_VERSION)
        self.assertEqual(payload["contract_kind"], STATUS_NARRATION_CONTRACT_KIND)
        self.assertEqual(payload["milestone"]["milestone_id"], "content_complete")
        self.assertNotIn("empty", payload["milestone"])
        self.assertEqual(payload["current_blockers"], ["metadata missing"])
        self.assertEqual(payload["facts"]["supported_claim_count"], 12)
        self.assertEqual(
            payload["narration_policy"]["answer_checklist"],
            list(custom_checklist),
        )
        self.assertEqual(payload["narration_policy"]["mode"], "ai_first")
        self.assertEqual(
            sorted(payload["narration_policy"]),
            ["answer_checklist", "mode", "style"],
        )

    def test_status_narration_contract_uses_progress_defaults_when_no_checklist_is_given(self) -> None:
        payload = build_status_narration_contract(
            contract_id="task-progress",
            surface_kind="task_progress",
        )

        self.assertEqual(
            payload["narration_policy"]["answer_checklist"],
            list(PROGRESS_ANSWER_CHECKLIST),
        )

    def test_build_status_narration_human_view_uses_caller_code_labels(self) -> None:
        domain_labels = {
            "domain_supervision": "领域可交付监管",
            "bundle_stage_ready": "打包阶段就绪",
            "missing_required_bundle": "缺少最小交付包导出。",
            "evidence_map_incomplete": "关键证据对照仍不完整。",
        }
        payload = build_status_narration_contract(
            contract_id="task-progress",
            surface_kind="task_progress",
            stage={
                "current_stage": "domain_supervision",
                "recommended_next_stage": "bundle_stage_ready",
            },
            current_blockers=[
                "missing_required_bundle",
                "evidence map incomplete",
            ],
            latest_update="主体内容已经完成，进入收口阶段。",
            next_step="核对交付目录与合同是否一致。",
        )

        view = build_status_narration_human_view(payload, code_labels=domain_labels)

        self.assertEqual(view["current_stage_label"], "领域可交付监管")
        self.assertEqual(view["recommended_next_stage_label"], "打包阶段就绪")
        self.assertEqual(view["latest_update"], "主体内容已经完成，进入收口阶段。")
        self.assertEqual(
            view["stage_summary"],
            "当前状态：领域可交付监管；下一阶段：打包阶段就绪",
        )
        self.assertEqual(
            view["current_blockers"],
            ["缺少最小交付包导出。", "关键证据对照仍不完整。"],
        )
        self.assertEqual(
            view["status_summary"],
            "当前状态：领域可交付监管；下一阶段：打包阶段就绪；当前卡点：缺少最小交付包导出。；关键证据对照仍不完整。",
        )
        self.assertEqual(view["next_step"], "核对交付目录与合同是否一致。")

    def test_build_status_narration_human_view_uses_generic_labels_and_fallbacks(self) -> None:
        view = build_status_narration_human_view(
            {"recommended_next_stage": "revision"},
            fallback_current_stage="manual_finishing",
            fallback_latest_update="主体内容已完成，可以进入人工审阅。",
            fallback_next_step="继续后续流程。",
            fallback_blockers=["domain_specific_blocker"],
        )

        self.assertEqual(view["current_stage_label"], "人工收尾与兼容保护")
        self.assertEqual(view["recommended_next_stage_label"], "Revision")
        self.assertEqual(view["stage_summary"], "当前状态：人工收尾与兼容保护；下一阶段：Revision")
        self.assertEqual(view["current_blockers"], ["domain_specific_blocker"])

    def test_build_status_narration_human_view_falls_back_for_unlabeled_domain_stages(self) -> None:
        view = build_status_narration_human_view(
            {"recommended_next_stage": "revision"},
            fallback_current_stage="publication_supervision",
            fallback_blockers=["missing_submission_minimal"],
        )

        self.assertEqual(view["current_stage_label"], "Publication Supervision")
        self.assertEqual(view["recommended_next_stage_label"], "Revision")
        self.assertEqual(view["current_blockers"], ["missing_submission_minimal"])


if __name__ == "__main__":
    unittest.main()
