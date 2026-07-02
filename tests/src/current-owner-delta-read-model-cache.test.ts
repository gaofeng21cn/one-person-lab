import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  readCurrentOwnerDeltaReadModelProjectionCache,
  writeCurrentOwnerDeltaReadModelProjectionCache,
} from '../../src/modules/ledger/current-owner-delta-read-model-cache.ts';
import { resolveOplStatePaths } from '../../src/modules/runway/runtime-state-paths.ts';

function readModel(sourceFingerprint = 'sha256:current-owner-delta-cache') {
  return {
    surface_kind: 'opl_current_owner_delta_read_model',
    current_owner: 'medautoscience',
    required_delta: 'domain_owner_receipt_quality_gate_or_typed_blocker_required',
    current_owner_delta: {
      surface_kind: 'opl_current_owner_delta',
      delta_id: 'current-owner-delta:medautoscience:publication:owner-answer',
      domain_id: 'medautoscience',
      current_owner: 'medautoscience',
      stage_id: 'publication_aftercare/reviewer-refresh',
      source_fingerprint: sourceFingerprint,
      owner_route_currentness_basis: {
        work_unit_fingerprint: sourceFingerprint,
        truth_epoch: 'truth-event-1',
        runtime_health_epoch: 'runtime-health-event-1',
      },
    },
  };
}

function withTempStateDir<T>(run: () => T) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-delta-cache-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    return run();
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

test('current owner delta cache rejects stale currentness identity', () => {
  withTempStateDir(() => {
    const paths = resolveOplStatePaths();
    assert.equal(writeCurrentOwnerDeltaReadModelProjectionCache({
      readModel: readModel(),
      sourceSurface: 'framework_readiness',
      sourceCommand: 'opl framework readiness --family-defaults --json',
      paths,
    }), true);

    const accepted = readCurrentOwnerDeltaReadModelProjectionCache({
      paths,
      acceptedSourceSurfaces: ['framework_readiness'],
      expectedCurrentnessIdentity: {
        source_fingerprint: 'sha256:current-owner-delta-cache',
        truth_epoch: 'truth-event-1',
      },
    });
    assert.equal(accepted?.current_owner, 'medautoscience');

    const stale = readCurrentOwnerDeltaReadModelProjectionCache({
      paths,
      acceptedSourceSurfaces: ['framework_readiness'],
      expectedCurrentnessIdentity: {
        source_fingerprint: 'sha256:stale-owner-delta-cache',
      },
    });
    assert.equal(stale, null);
  });
});

test('current owner delta cache treats legacy cache without source currentness basis as stale', () => {
  withTempStateDir(() => {
    const paths = resolveOplStatePaths();
    fs.mkdirSync(paths.state_dir, { recursive: true });
    fs.writeFileSync(
      paths.current_owner_delta_read_model_cache_file,
      `${JSON.stringify({
        version: 'g1',
        surface_kind: 'opl_current_owner_delta_read_model_projection_cache',
        cache_policy:
          'non_authoritative_app_fast_projection_cache_from_owner_delta_first_sources',
        source_surface: 'framework_readiness',
        source_command: 'opl framework readiness --family-defaults --json',
        cached_at: new Date().toISOString(),
        current_owner_delta_read_model: readModel(),
        authority_boundary: {
          cache_is_domain_truth: false,
        },
      }, null, 2)}\n`,
      'utf8',
    );

    assert.equal(
      readCurrentOwnerDeltaReadModelProjectionCache({
        paths,
        acceptedSourceSurfaces: ['framework_readiness'],
      }),
      null,
    );
  });
});
