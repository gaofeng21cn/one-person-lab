import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

const DEV_DIAGNOSTIC_MODULE_ENV = 'OPL_TEMPORAL_TEST_SERVER_PROOF_MODULE';

function devDiagnosticModuleUrl() {
  const raw = process.env[DEV_DIAGNOSTIC_MODULE_ENV]?.trim();
  if (!raw) {
    return null;
  }
  return raw.startsWith('file:') ? raw : pathToFileURL(path.resolve(raw)).href;
}

function devDiagnosticNotConfiguredProof() {
  return {
    surface_kind: 'opl_temporal_residency_live_proof',
    provider_kind: 'temporal',
    proof_environment: 'temporal_test_server_dev_diagnostic',
    closeout_status: 'production_residency_code_path_not_run',
    diagnostic_status: 'dev_diagnostic_module_not_configured',
    required_env: [DEV_DIAGNOSTIC_MODULE_ENV],
    checks: {
      temporal_test_server_started: false,
      worker_completed_attempt: false,
      worker_restart_requery: false,
      signal_history_preserved: false,
      typed_closeout_claim_evidence_supported: false,
      missing_closeout_advances_with_diagnostic: false,
      domain_truth_boundary_preserved: false,
    },
    authority_boundary: {
      opl: 'temporal_residency_dev_diagnostic_loader_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  };
}

export async function runTemporalResidencyProof() {
  const moduleUrl = devDiagnosticModuleUrl();
  if (!moduleUrl) {
    return devDiagnosticNotConfiguredProof();
  }
  const proofModule = await import(moduleUrl) as {
    runTemporalResidencyProof?: () => Promise<Record<string, unknown>>;
  };
  if (typeof proofModule.runTemporalResidencyProof !== 'function') {
    throw new FrameworkContractError('contract_shape_invalid', 'Temporal test-server proof module is invalid.', {
      module_url: moduleUrl,
      required_export: 'runTemporalResidencyProof',
    });
  }
  return await proofModule.runTemporalResidencyProof();
}
