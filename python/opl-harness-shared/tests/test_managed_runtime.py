from __future__ import annotations

import json
from pathlib import Path
import unittest

from opl_harness_shared.managed_runtime import (
    MANAGED_RUNTIME_THREE_LAYER_CONTRACT_REF,
    build_managed_runtime_contract,
    read_bundled_managed_runtime_three_layer_contract,
    validate_managed_runtime_contract,
)


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PACKAGE_ROOT.parents[1]


class ManagedRuntimeContractTest(unittest.TestCase):
    def test_bundled_contract_matches_root_contract(self) -> None:
        bundled = read_bundled_managed_runtime_three_layer_contract()
        root_contract = json.loads(
            (REPO_ROOT / "contracts" / "opl-gateway" / "managed-runtime-three-layer-contract.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(bundled.contract_ref, root_contract["contract_ref"])
        self.assertEqual(bundled.contract_id, root_contract["contract_id"])
        self.assertEqual(list(bundled.required_owner_fields), root_contract["required_owner_fields"])
        self.assertEqual(
            list(bundled.required_surface_locator_fields),
            root_contract["required_surface_locator_fields"],
        )
        self.assertEqual(
            list(bundled.canonical_fail_closed_rules),
            root_contract["canonical_fail_closed_rules"],
        )

    def test_build_contract_uses_canonical_fail_closed_rules(self) -> None:
        payload = build_managed_runtime_contract(
            domain_owner="med-autoscience",
            executor_owner="med_deepscientist",
            supervision_status_surface="study_progress",
            attention_queue_surface="workspace_cockpit",
            recovery_contract_surface="study_runtime_status",
        )
        self.assertEqual(payload["shared_contract_ref"], MANAGED_RUNTIME_THREE_LAYER_CONTRACT_REF)
        self.assertEqual(payload["domain_owner"], "med-autoscience")
        self.assertEqual(payload["executor_owner"], "med_deepscientist")
        self.assertEqual(payload["supervision_status_surface"]["owner"], "med-autoscience")
        self.assertEqual(
            payload["fail_closed_rules"],
            [
                "domain_supervision_cannot_bypass_runtime",
                "executor_cannot_declare_global_gate_clear",
                "runtime_cannot_invent_domain_publishability_truth",
            ],
        )

    def test_validate_contract_rejects_non_canonical_fail_closed_rules(self) -> None:
        with self.assertRaisesRegex(ValueError, "fail_closed_rules"):
            validate_managed_runtime_contract(
                {
                    "shared_contract_ref": MANAGED_RUNTIME_THREE_LAYER_CONTRACT_REF,
                    "runtime_owner": "upstream_hermes_agent",
                    "domain_owner": "redcube_ai",
                    "executor_owner": "codex_cli",
                    "supervision_status_surface": {"surface_kind": "product_entry_session", "owner": "redcube_ai"},
                    "attention_queue_surface": {"surface_kind": "product_frontdoor", "owner": "redcube_ai"},
                    "recovery_contract_surface": {"surface_kind": "product_entry_session", "owner": "redcube_ai"},
                    "fail_closed_rules": ["wrong"],
                }
            )


if __name__ == "__main__":
    unittest.main()
