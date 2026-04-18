from __future__ import annotations

import unittest

from opl_harness_shared.status_narration import (
    PAPER_MILESTONE_ANSWER_CHECKLIST,
    PROGRESS_ANSWER_CHECKLIST,
    STATUS_NARRATION_CONTRACT_KIND,
    STATUS_NARRATION_SCHEMA_VERSION,
    build_status_narration_human_view,
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

    def test_build_status_narration_human_view_prefers_ai_narration_fields(self) -> None:
        payload = build_status_narration_contract(
            contract_id="study-progress",
            surface_kind="study_progress",
            stage={
                "current_stage": "publication_supervision",
                "recommended_next_stage": "bundle_stage_ready",
            },
            current_blockers=["当前论文交付目录与注册/合同约定不一致，需要先修正交付面。"],
            latest_update="论文主体内容已经完成，当前进入投稿打包收口。",
            next_step="优先核对 submission package 与 studies 目录中的交付面是否一致。",
        )

        view = build_status_narration_human_view(payload)

        self.assertEqual(view["current_stage_label"], "论文可发表性监管")
        self.assertEqual(view["latest_update"], "论文主体内容已经完成，当前进入投稿打包收口。")
        self.assertEqual(
            view["stage_summary"],
            "当前状态：论文可发表性监管；下一阶段：投稿打包就绪",
        )
        self.assertEqual(
            view["status_summary"],
            "当前状态：论文可发表性监管；下一阶段：投稿打包就绪；当前卡点：当前论文交付目录与注册/合同约定不一致，需要先修正交付面。",
        )
        self.assertEqual(
            view["next_step"],
            "优先核对 submission package 与 studies 目录中的交付面是否一致。",
        )
        self.assertEqual(
            view["current_blockers"],
            ["当前论文交付目录与注册/合同约定不一致，需要先修正交付面。"],
        )

    def test_build_status_narration_human_view_falls_back_to_legacy_fields(self) -> None:
        view = build_status_narration_human_view(
            None,
            fallback_current_stage="manual_finishing",
            fallback_latest_update="论文内容已经完成，当前可以给人审阅。",
            fallback_next_step="补齐作者、单位和伦理号。",
            fallback_blockers=["作者单位仍待确认。"],
        )

        self.assertEqual(view["current_stage_label"], "人工收尾与兼容保护")
        self.assertEqual(view["latest_update"], "论文内容已经完成，当前可以给人审阅。")
        self.assertEqual(view["next_step"], "补齐作者、单位和伦理号。")
        self.assertEqual(view["current_blockers"], ["作者单位仍待确认。"])

    def test_build_status_narration_human_view_humanizes_known_blocker_codes(self) -> None:
        view = build_status_narration_human_view(
            None,
            fallback_current_stage="publication_supervision",
            fallback_blockers=[
                "missing_submission_minimal",
                "submission checklist contains unclassified blocking items",
                "claim evidence map missing or incomplete",
            ],
        )

        self.assertEqual(
            view["current_blockers"],
            [
                "缺少最小投稿包导出。",
                "投稿检查清单里仍有未归类的硬阻塞。",
                "关键 claim-to-evidence 对照仍不完整。",
            ],
        )
        self.assertNotIn("missing_submission_minimal", view["status_summary"])


if __name__ == "__main__":
    unittest.main()
