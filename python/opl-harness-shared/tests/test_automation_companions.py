from __future__ import annotations

from opl_harness_shared.automation_companions import (
    build_automation_catalog,
    build_automation_descriptor,
)


def test_automation_companion_helpers_normalize_shared_descriptors() -> None:
    mas_automation = build_automation_descriptor(
        automation_id="mas_runtime_supervision",
        title="MAS runtime supervision",
        owner="medautoscience",
        trigger_kind="interval",
        target_surface_kind="runtime_watch",
        summary="Refresh study runtime supervision on a managed interval.",
        readiness_status="automation_ready",
        gate_policy="publication_gated",
        output_expectation=["refresh runtime watch", "record controller intervention"],
        target_command="watch-runtime --interval-seconds 300 --max-ticks 1",
    )
    assert mas_automation["automation_id"] == "mas_runtime_supervision"

    rca_automation = build_automation_descriptor(
        automation_id="rca_autopilot_continuation",
        title="RCA autopilot continuation",
        owner="redcube_ai",
        trigger_kind="continuation_board",
        target_surface_kind="product_entry_session",
        summary="Continue the active deliverable loop through the tracked autopilot board.",
        readiness_status="tracked_follow_on",
        gate_policy="operator_review_gated",
        output_expectation=["continue same entry session", "preserve publication review truth"],
    )

    catalog = build_automation_catalog(
        summary="Family automation surfaces exposed through the current domain entry repos.",
        automations=[mas_automation, rca_automation],
        readiness_summary="Some automations are landed, some remain tracked follow-on surfaces.",
    )
    assert catalog["surface_kind"] == "automation"
    assert len(catalog["automations"]) == 2
    assert catalog["readiness_summary"] == "Some automations are landed, some remain tracked follow-on surfaces."
