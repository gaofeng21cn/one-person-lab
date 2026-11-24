import { fileURLToPath } from 'node:url';

import {
  buildAgentPackageStoreStorageInventory,
  buildWebuiDataVolumeStorageInventory,
  scanStoragePath,
} from '../../../../../src/adapters/integration/storage-owner-inventory.ts';
import {
  compactStorageOwnerProjection,
  readStorageOwnerInventorySnapshot,
  STORAGE_OWNER_INVENTORY_MAX_SNAPSHOT_BYTES,
  STORAGE_OWNER_INVENTORY_TTL_MS,
} from '../../../../../src/adapters/integration/storage-owner-inventory-snapshot.ts';
import { resolveOplStatePaths } from '../../../../../src/kernel/runtime-state-paths.ts';
import { assert, fs, os, path, spawn, test } from '../../helpers.ts';

const storageInventoryWriterFixture = fileURLToPath(
  new URL('../../../../fixtures/storage-owner-inventory-writer.ts', import.meta.url),
);

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function waitForFiles(files: string[], timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      if (files.every((file) => fs.existsSync(file))) {
        resolve();
      } else if (Date.now() >= deadline) {
        reject(new Error(`Timed out waiting for fixture files: ${files.join(', ')}`));
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });
}

function spawnStorageInventoryWriter(input: {
  stateDir: string;
  section: 'agent_package_store' | 'webui_data_volume';
  projection: Record<string, unknown>;
  readyFile: string;
  startFile: string;
}) {
  const child = spawn(process.execPath, [
    '--experimental-strip-types',
    storageInventoryWriterFixture,
    input.section,
    JSON.stringify(input.projection),
    input.readyFile,
    input.startFile,
  ], {
    env: { ...process.env, OPL_STATE_DIR: input.stateDir },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const completed = new Promise<void>((resolve, reject) => {
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`storage inventory writer exited ${code}: ${stderr}`));
    });
  });
  return { child, completed };
}

test('storage scanner is bounded, excludes requested roots, and never follows symlinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-storage-scan-'));
  const dataRoot = path.join(root, 'data');
  const projectsRoot = path.join(dataRoot, 'projects');
  const outsideFile = path.join(root, 'outside.bin');
  try {
    fs.mkdirSync(projectsRoot, { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'small.txt'), 'small');
    fs.writeFileSync(path.join(projectsRoot, 'project.bin'), Buffer.alloc(32_768));
    fs.writeFileSync(outsideFile, Buffer.alloc(32_768));
    fs.symlinkSync(outsideFile, path.join(dataRoot, 'outside-link'));

    const usage = scanStoragePath(dataRoot, {
      excludedRoots: [projectsRoot],
      maxEntries: 64,
      deadlineMs: 1_000,
    });
    assert.equal(usage.complete, true);
    assert.equal(usage.reason_code, null);
    assert.equal(usage.excluded_root_count, 1);
    assert.equal((usage.bytes ?? Number.POSITIVE_INFINITY) < 32_768, true);

    assert.equal(scanStoragePath(dataRoot, { maxEntries: 1 }).reason_code, 'entry_limit_exceeded');
    assert.equal(scanStoragePath(path.join(root, 'missing')).reason_code, 'path_missing');
    assert.equal(scanStoragePath(path.join(dataRoot, 'outside-link')).reason_code, 'path_symlink');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Agent Package storage inventory delegates byte accounting to the native carrier owner', () => {
  const scannedRoots: string[] = [];
  const projection = buildAgentPackageStoreStorageInventory({
    lockIndex: {
      packages: [{
        package_id: 'legacy.package',
        physical_surface: {
          codex_plugin_cache_path: '/forged/legacy/cache',
        },
      }],
    },
    installedPackageIds: new Set(['legacy.package']),
    persist: false,
    scan: (candidate) => {
      scannedRoots.push(candidate);
      return {
        complete: true,
        reason_code: null,
        bytes: 100,
        entry_count: 1,
        excluded_root_count: 0,
      };
    },
  });

  assert.deepEqual(scannedRoots, []);
  assert.equal(projection.status, 'attention_required');
  assert.equal(projection.bytes, null);
  assert.equal(projection.reclaimable_bytes, null);
  assert.equal(projection.reason_code, 'carrier_owned_storage_unmeasured');
  assert.equal(projection.owner_route, '/settings/agents');
  assert.deepEqual(projection.projected_action, {
    kind: 'navigate',
    status: 'available',
    action_id: null,
    route: '/settings/agents',
    dry_run_required: false,
  });
});

test('WebUI inventory excludes Projects and exposes only carrier-host destructive authority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-storage-'));
  const dataDir = path.join(root, 'data');
  const previousOplDataDir = process.env.OPL_DATA_DIR;
  delete process.env.OPL_DATA_DIR;
  try {
    fs.mkdirSync(path.join(dataDir, 'projects'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'projects', 'private-project.bin'), Buffer.alloc(65_536));
    fs.writeFileSync(path.join(dataDir, 'logs', 'app.log'), 'small-log');

    const projection = buildWebuiDataVolumeStorageInventory({ dataDir, persist: false });
    assert.equal(projection.status, 'available');
    assert.equal((projection.bytes ?? Number.POSITIVE_INFINITY) < 65_536, true);
    assert.equal(projection.reclaimable_bytes, null);
    assert.equal(projection.owner_route, '/settings/storage#webui-data');
    assert.equal(projection.projected_action.kind, 'host_action_required');
    assert.equal(projection.projected_action.execution_owner, 'carrier_host');
    assert.equal(
      projection.projected_action.host_action_abi?.capability_id,
      'carrier_host.storage.webui_data_volume.lifecycle',
    );
    assert.equal(projection.projected_action.host_action_abi?.execute_action_id, null);

    const missing = buildWebuiDataVolumeStorageInventory({ dataDir: null, persist: false });
    assert.equal(missing.status, 'not_configured');
    assert.equal(missing.bytes, null);
    assert.equal(missing.reason_code, 'webui_data_root_not_configured');

    const namedVolume = buildWebuiDataVolumeStorageInventory({ dataDir: 'OnePersonLab/data', persist: false });
    assert.equal(namedVolume.status, 'unavailable');
    assert.equal(namedVolume.reason_code, 'named_volume_not_directly_observable');
  } finally {
    restoreEnv('OPL_DATA_DIR', previousOplDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('storage snapshot is bounded and stale, future, symlink, or oversized data fails open', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-storage-snapshot-'));
  const stateDir = path.join(root, 'state');
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  try {
    const observedAt = new Date();
    const projection = buildAgentPackageStoreStorageInventory({
      now: observedAt,
      persist: true,
    });
    assert.equal(projection.status, 'attention_required');
    assert.equal(projection.bytes, null);
    assert.equal(projection.reclaimable_bytes, null);
    assert.equal(projection.reason_code, 'carrier_owned_storage_unmeasured');

    const current = readStorageOwnerInventorySnapshot({ now: observedAt });
    assert.equal(current.agent_package_store.status, 'attention_required');
    assert.equal(current.agent_package_store.bytes, null);
    assert.equal(current.agent_package_store.reason_code, 'carrier_owned_storage_unmeasured');
    assert.equal(current.webui_data_volume.status, 'unavailable');

    buildWebuiDataVolumeStorageInventory({
      dataDir: null,
      now: observedAt,
      persist: true,
    });
    const afterBothOwners = readStorageOwnerInventorySnapshot({ now: observedAt });
    assert.equal(afterBothOwners.agent_package_store.status, 'attention_required');
    assert.equal(afterBothOwners.webui_data_volume.status, 'not_configured');
    const stateFiles = fs.readdirSync(stateDir).sort();
    assert.equal(stateFiles.includes('storage-owner-inventory-snapshot.json'), true);
    assert.equal(stateFiles.includes('storage-owner-inventory.sqlite'), true);
    assert.equal(stateFiles.includes('agent-package-lifecycle.sqlite'), false);
    assert.equal(stateFiles.includes('agent-package-locks.json'), false);
    assert.equal(stateFiles.includes('agent-package-lifecycle-ledger.json'), false);
    assert.equal(stateFiles.some((file) => file.endsWith('.tmp')), false);

    const stale = readStorageOwnerInventorySnapshot({
      now: new Date(observedAt.getTime() + STORAGE_OWNER_INVENTORY_TTL_MS + 1),
    });
    assert.equal(stale.agent_package_store.status, 'attention_required');
    assert.equal(stale.agent_package_store.stale, true);
    assert.equal(stale.agent_package_store.reason_code, 'inventory_cache_stale');

    const future = compactStorageOwnerProjection({
      status: 'available',
      observed_at: new Date(Date.now() + 60_000).toISOString(),
      bytes: 123,
      reclaimable_bytes: 0,
    }, 'agent_package_store');
    assert.equal(future.status, 'unavailable');
    assert.equal(future.bytes, null);

    const snapshotPath = resolveOplStatePaths().storage_owner_inventory_snapshot_file;
    const externalSnapshot = path.join(root, 'external-snapshot.json');
    fs.writeFileSync(externalSnapshot, JSON.stringify({ surface_kind: 'opl_storage_owner_inventory_snapshot.v1', version: 1 }));
    fs.rmSync(snapshotPath, { force: true });
    fs.symlinkSync(externalSnapshot, snapshotPath);
    assert.equal(readStorageOwnerInventorySnapshot().agent_package_store.status, 'unavailable');

    fs.rmSync(snapshotPath, { force: true });
    fs.writeFileSync(snapshotPath, Buffer.alloc(STORAGE_OWNER_INVENTORY_MAX_SNAPSHOT_BYTES + 1, 0x20));
    assert.equal(readStorageOwnerInventorySnapshot().agent_package_store.status, 'unavailable');
  } finally {
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('storage snapshot serializes independent owner projections without Package lifecycle state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-storage-snapshot-concurrent-'));
  const stateDir = path.join(root, 'state');
  const startFile = path.join(root, 'start');
  const readyAgent = path.join(root, 'ready-agent');
  const readyWebui = path.join(root, 'ready-webui');
  const observedAt = new Date().toISOString();
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  const agent = spawnStorageInventoryWriter({
    stateDir,
    section: 'agent_package_store',
    projection: {
      status: 'available',
      observed_at: observedAt,
      stale: false,
      bytes: 111,
      reclaimable_bytes: 11,
    },
    readyFile: readyAgent,
    startFile,
  });
  const webui = spawnStorageInventoryWriter({
    stateDir,
    section: 'webui_data_volume',
    projection: {
      status: 'available',
      observed_at: observedAt,
      stale: false,
      bytes: 222,
      reclaimable_bytes: 22,
    },
    readyFile: readyWebui,
    startFile,
  });
  try {
    await waitForFiles([readyAgent, readyWebui]);
    fs.writeFileSync(startFile, 'start\n');
    await Promise.all([agent.completed, webui.completed]);

    const snapshot = readStorageOwnerInventorySnapshot();
    assert.equal(snapshot.agent_package_store.status, 'attention_required');
    assert.equal(snapshot.agent_package_store.bytes, null);
    assert.equal(snapshot.agent_package_store.reason_code, 'carrier_owned_storage_unmeasured');
    assert.equal(snapshot.webui_data_volume.bytes, 222);
    const stateFiles = fs.readdirSync(stateDir).sort();
    assert.equal(stateFiles.includes('agent-package-lifecycle.sqlite'), false);
    assert.equal(stateFiles.includes('agent-package-locks.json'), false);
    assert.equal(stateFiles.includes('agent-package-lifecycle-ledger.json'), false);
    assert.equal(stateFiles.some((file) => file.endsWith('.tmp')), false);
  } finally {
    agent.child.kill();
    webui.child.kill();
    restoreEnv('OPL_STATE_DIR', previousStateDir);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
