"""Family-shared harness substrate helpers."""

from .hermes_supervision import (
    HermesSupervisionSpec,
    ensure_script_file,
    job_drift,
    jobs_path,
    load_jobs,
    matching_jobs,
    remove_empty_parent_dirs,
    render_supervision_script,
    resolve_job_script_path,
    schedule_matches,
    script_path,
    select_primary_job,
    status_summary,
)
from .managed_runtime import (
    MANAGED_RUNTIME_THREE_LAYER_CONTRACT_REF,
    ManagedRuntimeThreeLayerContract,
    build_managed_runtime_contract,
    read_bundled_managed_runtime_three_layer_contract,
    read_managed_runtime_three_layer_contract,
    validate_managed_runtime_contract,
)
from .product_entry_companions import (
    build_product_entry_overview,
    build_product_entry_quickstart,
    build_product_entry_readiness,
    build_product_entry_resume_surface,
    collect_family_human_gate_ids,
)

__all__ = [
    "HermesSupervisionSpec",
    "MANAGED_RUNTIME_THREE_LAYER_CONTRACT_REF",
    "ManagedRuntimeThreeLayerContract",
    "build_managed_runtime_contract",
    "build_product_entry_overview",
    "build_product_entry_quickstart",
    "build_product_entry_readiness",
    "build_product_entry_resume_surface",
    "collect_family_human_gate_ids",
    "ensure_script_file",
    "job_drift",
    "jobs_path",
    "load_jobs",
    "matching_jobs",
    "read_bundled_managed_runtime_three_layer_contract",
    "read_managed_runtime_three_layer_contract",
    "remove_empty_parent_dirs",
    "render_supervision_script",
    "resolve_job_script_path",
    "schedule_matches",
    "script_path",
    "select_primary_job",
    "status_summary",
    "validate_managed_runtime_contract",
]
