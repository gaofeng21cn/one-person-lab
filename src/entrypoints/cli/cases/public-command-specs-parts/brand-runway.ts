import {
  buildRunwayHandoffGatesProjection,
  buildRunwayReadinessProjection,
  buildRunwayReconcileProjection,
  buildRunwayRecoveryRepairProjection,
  buildFamilyRuntimeControlLoopStatus,
} from '../../../../modules/runway/family-runtime-control-loop.ts';
import {
  openQueueDb,
} from '../../../../modules/runway/family-runtime-store.ts';
import { runFamilyRuntime } from '../../../../modules/runway/family-runtime.ts';
import { assertNoArgs } from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

async function buildRunwayControlLoopProjection(
  projection: 'readiness' | 'reconcile' | 'handoff-gates' | 'recovery-repair',
) {
  const { db, paths } = openQueueDb();
  try {
    const controlLoop = await buildFamilyRuntimeControlLoopStatus(db, paths, 'temporal');
    if (projection === 'readiness') {
      return {
        version: 'g2',
        opl_runway_readiness: buildRunwayReadinessProjection(controlLoop),
      };
    }
    if (projection === 'reconcile') {
      return {
        version: 'g2',
        opl_runway_reconcile: buildRunwayReconcileProjection(controlLoop),
      };
    }
    if (projection === 'handoff-gates') {
      return {
        version: 'g2',
        opl_runway_handoff_gates: buildRunwayHandoffGatesProjection(controlLoop),
      };
    }
    return {
      version: 'g2',
      opl_runway_recovery_repair: buildRunwayRecoveryRepairProjection(controlLoop),
    };
  } finally {
    db.close();
  }
}

export function buildBrandRunwayCommandSpecs(): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    'runway control-loop status': {
      usage: 'opl runway control-loop status',
      summary: 'Read the Runway control-loop runtime status while keeping Temporal, worker supervisor, scheduler cadence, and Progress Reconciler authority separate.',
      examples: ['opl runway control-loop status --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, specs['runway control-loop status']);
        return runFamilyRuntime(['control-loop', 'status', '--provider', 'temporal']);
      },
    },
    'runway readiness': {
      usage: 'opl runway readiness',
      summary: 'Read the Runway provider-backed runtime readiness projection without claiming domain or production readiness.',
      examples: ['opl runway readiness --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, specs['runway readiness']);
        return buildRunwayControlLoopProjection('readiness');
      },
    },
    'runway reconcile': {
      usage: 'opl runway reconcile',
      summary: 'Read the Runway desired/current reconciliation projection and selected next safe action.',
      examples: ['opl runway reconcile --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, specs['runway reconcile']);
        return buildRunwayControlLoopProjection('reconcile');
      },
    },
    'runway handoff-gates': {
      usage: 'opl runway handoff-gates',
      summary: 'Read Runway handoff gates and accepted owner-answer refs without treating provider completion as a domain answer.',
      examples: ['opl runway handoff-gates --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, specs['runway handoff-gates']);
        return buildRunwayControlLoopProjection('handoff-gates');
      },
    },
    'runway recovery-repair': {
      usage: 'opl runway recovery-repair',
      summary: 'Read Runway recovery and repair classification with the selected repair action, if any.',
      examples: ['opl runway recovery-repair --json'],
      group: 'brand-runway',
      handler: (args) => {
        assertNoArgs(args, specs['runway recovery-repair']);
        return buildRunwayControlLoopProjection('recovery-repair');
      },
    },
  };
  return specs;
}
