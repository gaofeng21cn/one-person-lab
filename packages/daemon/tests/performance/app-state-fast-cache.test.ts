import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, it } from 'node:test';
import {
  connectTestRpc,
  createDaemonSandbox,
  writeMinimalV2Package,
  type DaemonSandbox,
} from '../helpers/sandbox.ts';

const sandboxes: DaemonSandbox[] = [];

function trackSandbox(): DaemonSandbox {
  const sb = createDaemonSandbox();
  sandboxes.push(sb);
  return sb;
}

afterEach(async () => {
  while (sandboxes.length > 0) {
    await sandboxes.pop()!.cleanup();
  }
});

describe('AppStateCache heavy fast-read performance', () => {
  it('meets <20ms P99 SLA for 100 consecutive trusted fast reads under realistic heavy workspace/config/invocation load', async () => {
    const sb = trackSandbox();
    await sb.startInProcess();
    const app = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    try {
      // 1. Install opl-flow with 32KB template
      const flowDir = writeMinimalV2Package(path.join(sb.root, 'opl-flow'), { id: 'opl-flow', intent: 'extension' });
      fs.mkdirSync(path.join(flowDir, 'profile'), { recursive: true });
      fs.writeFileSync(path.join(flowDir, 'profile', 'manifest.json'), JSON.stringify({
        schema: 'opl_flow_profile_manifest.v2',
        runtime_profile: { path: 'profile/default.md' },
      }));
      fs.writeFileSync(path.join(flowDir, 'profile', 'default.md'), 'Flow line\n'.repeat(3000), 'utf8');
      await app.call('pack.link', { dir: flowDir, sync_codex: false });

      // 2. Write 16KB AGENTS.md and realistic config.toml
      fs.writeFileSync(path.join(sb.codexHome, 'AGENTS.md'), 'User rule\n'.repeat(1600), 'utf8');
      fs.writeFileSync(
        path.join(sb.codexHome, 'config.toml'),
        'model = "gpt-5.4"\nmodel_reasoning_effort = "high"\nmodel_provider = "oplgateway"\n\n[model_providers.oplgateway]\nbase_url = "https://gflabtoken.cn/v1"\nexperimental_bearer_token = "sk-heavy-bench"\n',
        'utf8',
      );

      // 3. Link a domain agent package + bind workspace with 10 work items
      const masDir = writeMinimalV2Package(path.join(sb.root, 'bench-mas'), { id: 'bench-mas', intent: 'agent' });
      fs.mkdirSync(path.join(masDir, 'contracts'), { recursive: true });
      fs.writeFileSync(path.join(masDir, 'contracts', 'domain_descriptor.json'), JSON.stringify({
        surface_kind: 'domain_agent_descriptor',
        package_id: 'bench-mas',
        domain_id: 'bench-mas',
        standard_agent_interface: {
          version: 'opl_standard_agent_interface.v1',
          inventory_projection: {
            source_kind: 'workspace_relative_json',
            relative_path: 'state/tasks.json',
            items_pointer: '/tasks',
            field_map: {
              work_item_id: 'id',
              display_name: 'title',
              business_status: 'status',
            },
          },
        },
      }));
      await app.call('pack.link', { dir: masDir, sync_codex: false });

      const domainWs = path.join(sb.root, 'domain-ws');
      fs.mkdirSync(path.join(domainWs, 'state'), { recursive: true });
      fs.writeFileSync(path.join(domainWs, 'state', 'tasks.json'), JSON.stringify({
        tasks: Array.from({ length: 10 }, (_, idx) => ({
          id: `item-${idx + 1}`,
          title: `Benchmark Task ${idx + 1}`,
          status: 'active',
        })),
      }));
      await app.call('workspace.init', { root_path: domainWs, name: 'Bench Domain WS', domain_id: 'bench-mas' });

      // 4. Add connection + grant + 50 connect grants/requests load
      const conn = await app.call('connect.add', {
        provider_type: 'heavy_bench',
        display_name: 'Heavy Bench Provider',
        credential_handle: 'provider:heavy_bench:bench',
        capabilities: Array.from({ length: 10 }, (_, i) => ({
          capability_id: `cap-${i}`,
          title: `Cap ${i}`,
          risk: 'read' as const,
        })),
      }) as { connection_id: string };
      for (let i = 0; i < 10; i++) {
        await app.call('connect.requestAccess', {
          connection_id: conn.connection_id,
          consumer_package_id: 'bench-mas',
          capability_ids: [`cap-${i}`],
        });
      }

      // Warmup
      for (let i = 0; i < 5; i++) {
        await app.call('app.state.get', { profile: 'fast' });
      }

      const durations: number[] = [];
      for (let i = 0; i < 100; i++) {
        const t0 = performance.now();
        const state = await app.call('app.state.get', { profile: 'fast' }) as any;
        durations.push(performance.now() - t0);
        if (i === 0) {
          assert.equal(state.app_state.operator.workbench.work_item_projection_v2.items.length, 10);
          assert.equal(state.app_state.codex_personalization.opl_flow_default_user_agents.status, 'available');
          assert.equal(state.app_state.settings_control_center.app_settings_read_model.codex_model_policy.api_key_present, true);
        }
      }
      durations.sort((a, b) => a - b);
      const pct = (p: number) => durations[Math.min(durations.length - 1, Math.ceil((p / 100) * durations.length) - 1)]!;
      const p50 = pct(50);
      const p95 = pct(95);
      const p99 = pct(99);
      process.stderr.write(`AppStateCache heavy fast benchmark: P50=${p50.toFixed(3)}ms, P95=${p95.toFixed(3)}ms, P99=${p99.toFixed(3)}ms\n`);
      assert.ok(p99 < 20, `Expected trusted heavy fast P99 < 20ms, got ${p99.toFixed(3)}ms`);
    } finally {
      await app.close();
    }
  });
});
