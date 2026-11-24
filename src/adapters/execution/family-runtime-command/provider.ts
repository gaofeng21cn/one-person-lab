import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type { FamilyRuntimeProviderKind } from '../family-runtime-types.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { assertProviderKind, parseCliOptions } from './shared.ts';

import { DatabaseSync } from 'node:sqlite';
import { residencyProofReceipt } from '../family-runtime-residency-proof-events.ts';
import {
  persistTemporalProductionProof,
  temporalProviderSloExecutionReceipt,
} from '../family-runtime-provider-proof-receipts.ts';
import { runTemporalProviderSloTick } from '../family-runtime-provider-slo-executor.ts';
import { runProviderWorkerSupervisorCommand } from '../family-runtime-provider-worker-supervisor.ts';
import {
  ensureFamilyRuntimeProvider,
  ensureFamilyRuntimeProviderWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from '../family-runtime-providers.ts';
import { buildFamilyRuntimeControlLoopStatus } from '../family-runtime-control-loop.ts';
import {
  familyRuntimePaths,
  insertEvent,
} from '../family-runtime-store.ts';
export function parseProviderOnlyArgs(
  mode: 'status' | 'doctor' | 'install' | 'repair',
  args: string[],
): FamilyRuntimeCommandInput {
  let providerKind: FamilyRuntimeProviderKind | undefined;
  parseCliOptions(args, 0, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `family-runtime ${mode} accepts only --provider.`, {
        extra_args: args,
        usage: `opl family-runtime ${mode} [--provider temporal]`,
      });
    }
  });
  return { mode, providerKind };
}

export function parseResidencyProofArgs(rest: string[]): FamilyRuntimeCommandInput {
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let live = false;
  let production = false;
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else if (token === '--live') {
      live = true;
      return false;
    } else if (token === '--production') {
      production = true;
      return false;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime residency proof option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime residency proof --provider temporal [--live|--production]',
      });
    }
  });
  if (live && production) {
    throw new FrameworkContractError('cli_usage_error', 'Use only one Temporal residency proof mode.', {
      mutually_exclusive: ['--live', '--production'],
    });
  }
  return { mode: 'residency_proof', providerKind, live, production };
}

export function parseProviderSloTickArgs(rest: string[]): FamilyRuntimeCommandInput {
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let force = false;
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else if (token === '--force') {
      force = true;
      return false;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime provider-slo tick option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime provider-slo tick --provider temporal [--force]',
      });
    }
  });
  return { mode: 'provider_slo_tick', providerKind, force };
}

export function parseControlLoopStatusArgs(rest: string[]): FamilyRuntimeCommandInput {
  const action = rest[0];
  if (action !== 'status') {
    throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime control-loop action: ${action}.`, {
      action,
      usage: 'opl family-runtime control-loop status --provider temporal',
    });
  }
  let providerKind: FamilyRuntimeProviderKind | undefined;
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime control-loop option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime control-loop status --provider temporal',
      });
    }
  });
  return { mode: 'control_loop_status', providerKind };
}

export function parseProviderWorkerSupervisorArgs(rest: string[]): FamilyRuntimeCommandInput {
  const action = rest[1];
  if (action !== 'status' && action !== 'install' && action !== 'remove' && action !== 'trigger') {
    throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime provider-worker supervisor action: ${action}.`, {
      action,
      usage: 'opl family-runtime provider-worker supervisor status|install|remove|trigger --provider temporal',
    });
  }
  let providerKind: FamilyRuntimeProviderKind | undefined;
  parseCliOptions(rest, 2, (token, value) => {
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime provider-worker supervisor option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime provider-worker supervisor status|install|remove|trigger --provider temporal',
      });
    }
  });
  return { mode: 'provider_worker_supervisor', action, providerKind };
}


async function temporalProviderModule() {
  return await import('../family-runtime-temporal-provider.ts');
}

export async function runFamilyRuntimeWorkerCommand(
  parsed: FamilyRuntimeCommandInput,
  paths: ReturnType<typeof familyRuntimePaths>,
): Promise<Record<string, unknown>> {
    if (parsed.mode === 'worker_status' || parsed.mode === 'worker_start' || parsed.mode === 'worker_stop') {
  const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
  if (providerKind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', `family-runtime worker ${parsed.mode.slice('worker_'.length)} currently supports only --provider temporal.`, {
      provider_kind: providerKind,
      allowed_provider_kinds: ['temporal'],
    });
  }
  const temporalProvider = await temporalProviderModule();
  if (parsed.mode === 'worker_status') {
    return {
      version: 'g2',
      family_runtime_worker: {
        surface_id: 'opl_family_runtime_worker',
        action: 'status',
        ...(await temporalProvider.inspectTemporalWorkerLifecycle(paths)),
      },
    };
  }
  if (parsed.mode === 'worker_start') {
    const result = await temporalProvider.startTemporalWorkerLifecycle(paths, { detach: parsed.detach });
    return {
      version: 'g2',
      family_runtime_worker: {
        surface_id: 'opl_family_runtime_worker',
        action: 'start',
        ...result,
      },
    };
  }
  const result = await temporalProvider.stopTemporalWorkerLifecycle(paths);
  return {
    version: 'g2',
    family_runtime_worker: {
      surface_id: 'opl_family_runtime_worker',
      action: 'stop',
      ...result,
    },
  };
    }
  throw new FrameworkContractError('unknown_command', `Unhandled family runtime worker mode: ${(parsed as { mode: string }).mode}.`);
}

export async function runFamilyRuntimeProviderCommand(context: {
  db: DatabaseSync;
  paths: ReturnType<typeof familyRuntimePaths>;
  parsed: FamilyRuntimeCommandInput;
}): Promise<Record<string, unknown>> {
  const { db, paths, parsed } = context;
  if (parsed.mode === 'install' || parsed.mode === 'repair') {
    const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
    const temporalVisibilityRepair = providerKind === 'temporal' && parsed.mode === 'repair'
      ? await (await temporalProviderModule()).ensureTemporalVisibilityReadiness({ paths })
      : null;
    const provider = parsed.mode === 'repair'
      ? await ensureFamilyRuntimeProviderWithLifecycle(providerKind, parsed.mode, paths)
      : ensureFamilyRuntimeProvider(providerKind, parsed.mode);
    insertEvent(db, {
      eventType: `provider_${parsed.mode}`,
      source: 'opl-cli',
      payload: {
        provider_kind: providerKind,
        status: temporalVisibilityRepair?.repair_status ?? provider.status,
        actions: provider.actions,
        temporal_worker_repair: 'temporal_worker_repair' in provider ? provider.temporal_worker_repair : null,
        temporal_visibility_repair: temporalVisibilityRepair,
      },
    });
    return {
      version: 'g2',
      family_runtime_provider: {
        ...provider,
        temporal_visibility_repair: temporalVisibilityRepair,
      },
    };
  }
  if (parsed.mode === 'residency_proof') {
    const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
    if (providerKind !== 'temporal') {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime residency proof currently supports only --provider temporal.', {
        provider_kind: providerKind,
        allowed_provider_kinds: ['temporal'],
      });
    }
    const { buildTemporalResidencyProof } = await import('../family-runtime-residency-proof.ts');
    const proof = await buildTemporalResidencyProof(db, paths, {
      live: parsed.live,
      production: parsed.production,
    });
    const persistedProofRef = persistTemporalProductionProof(paths, proof);
    const sloExecutionReceipt = temporalProviderSloExecutionReceipt({
      proof,
      persistedProofRef,
      trigger: 'manual_residency_proof',
    });
    insertEvent(db, {
      eventType: 'temporal_residency_proof',
      source: 'opl-cli',
      payload: {
        provider_kind: 'temporal',
        proof_mode: proof.proof_mode,
        closeout_status: proof.closeout_status,
        proof_receipt: residencyProofReceipt(proof),
        persisted_proof_ref: persistedProofRef,
        provider_slo_execution_receipt: sloExecutionReceipt,
      },
    });
    insertEvent(db, {
      eventType: 'temporal_provider_slo_execution_receipt',
      source: 'opl-cli',
      payload: sloExecutionReceipt,
    });
    return {
      version: 'g2',
      family_runtime_residency_proof: {
        surface_id: 'opl_family_runtime_residency_proof',
        persisted_proof_ref: persistedProofRef,
        provider_slo_execution_receipt: sloExecutionReceipt,
        ...proof,
      },
    };
  }
  if (parsed.mode === 'provider_slo_tick') {
    const providerKind = resolveFamilyRuntimeProviderKind(parsed.providerKind);
    if (providerKind !== 'temporal') {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime provider-slo tick currently supports only --provider temporal.', {
        provider_kind: providerKind,
        allowed_provider_kinds: ['temporal'],
      });
    }
    return {
      version: 'g2',
      family_runtime_provider_slo_tick: await runTemporalProviderSloTick(db, paths, {
        force: parsed.force,
      }),
    };
  }
  if (parsed.mode === 'control_loop_status') {
    return {
      version: 'g2',
      family_runtime_control_loop: await buildFamilyRuntimeControlLoopStatus(db, paths, parsed.providerKind),
    };
  }
  if (parsed.mode === 'provider_worker_supervisor') {
    return {
      version: 'g2',
      family_runtime_provider_worker_supervisor: await runProviderWorkerSupervisorCommand(db, paths, parsed),
    };
  }
  throw new FrameworkContractError('unknown_command', `Unhandled family runtime provider mode: ${(parsed as { mode: string }).mode}.`);
}
