import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createDaemonSandbox, type DaemonSandbox } from './helpers/sandbox.ts';

const DEFAULT_REAL_MAS_DIR = '/Users/gaofeng/workspace/med-autoscience';
const sandboxes: DaemonSandbox[] = [];

function resolveRealMasDir(): string | null {
  const override = process.env.OPL_TEST_REAL_MAS_DIR;
  if (override !== undefined) {
    const trimmed = override.trim();
    return trimmed ? trimmed : null;
  }
  return DEFAULT_REAL_MAS_DIR;
}

function trackSandbox(): DaemonSandbox {
  const sb = createDaemonSandbox();
  sandboxes.push(sb);
  return sb;
}

function createSyntheticMasV1Fixture(dstRoot: string): void {
  const nestedPluginDir = path.join(dstRoot, 'plugins', 'med-autoscience');
  fs.mkdirSync(path.join(nestedPluginDir, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(nestedPluginDir, 'skills', 'med-autoscience'), { recursive: true });
  fs.mkdirSync(path.join(nestedPluginDir, 'assets', 'branding'), { recursive: true });
  fs.mkdirSync(path.join(dstRoot, 'agent', 'stages'), { recursive: true });
  fs.mkdirSync(path.join(dstRoot, 'bin'), { recursive: true });

  fs.writeFileSync(
    path.join(nestedPluginDir, 'skills', 'med-autoscience', 'SKILL.md'),
    [
      '---',
      'name: med-autoscience',
      'description: Synthetic MedAutoScience skill for Wave 1 Gate 1 CI verification.',
      '---',
      '',
      '# MedAutoScience',
      '',
      'Canonical OPL Agent id is `mas`.',
      '',
    ].join('\n'),
    'utf8',
  );

  // Minimal valid 8-byte PNG signature + IHDR chunk bytes
  fs.writeFileSync(
    path.join(nestedPluginDir, 'assets', 'branding', 'medautoscience-logo.png'),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );

  fs.writeFileSync(
    path.join(dstRoot, 'agent', 'stages', 'manifest.json'),
    JSON.stringify({ stages: ['direction_and_route_selection', 'baseline_and_evidence_setup'] }, null, 2),
    'utf8',
  );

  fs.writeFileSync(
    path.join(dstRoot, 'bin', 'mas-app-contribution'),
    '#!/usr/bin/env sh\necho \'{}\'\n',
    { mode: 0o755 },
  );

  fs.writeFileSync(
    path.join(nestedPluginDir, '.codex-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: 'med-autoscience',
        version: '0.3.3',
        description:
          'Medical research planning, literature review, data analysis, manuscript writing, peer review, revision, and submission.',
        homepage: 'https://github.com/gaofeng21cn/med-autoscience',
        repository: 'https://github.com/gaofeng21cn/med-autoscience',
        license: 'Apache-2.0',
        keywords: ['medical-research', 'codex', 'domain-agent'],
        interface: {
          displayName: 'Med Auto Science',
          shortDescription: 'Medical research planning and publication.',
          longDescription: 'Synthetic MAS v1 fixture exercising full Wave 1 Gate 1 codex-sync parity.',
          developerName: 'one-person-lab',
          category: 'Research',
          capabilities: ['Interactive', 'Write'],
          logo: './assets/branding/medautoscience-logo.png',
          brandColor: '#1F7A8C',
          defaultPrompt: [
            'Select the MAS Stage action for this research question.',
            'Review the available evidence and return the next owner route.',
            'Prepare a publication handoff with explicit quality debt and blockers.',
          ],
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  fs.writeFileSync(
    path.join(nestedPluginDir, 'opl-package.json'),
    JSON.stringify(
      {
        surface_kind: 'opl_agent_package_manifest.v1',
        package_id: 'mas',
        version: '0.3.3',
        requires: ['mas-scholar-skills'],
        domain_descriptor_ref: 'agent/stages/manifest.json',
        presentation: {
          software_type: 'agent',
          display_name_i18n: { 'zh-CN': 'Med Auto Science', 'en-US': 'Med Auto Science' },
          description_i18n: {
            'zh-CN': '医学研究选题、文献分析、数据分析、论文写作、审稿、返修与投稿。',
            'en-US':
              'Medical research planning, literature review, data analysis, manuscript writing, peer review, revision, and submission.',
          },
          icon_ref: 'assets/branding/medautoscience-logo.png',
        },
        codex_surface: {
          plugin_id: 'med-autoscience',
          required_skill_ids: ['med-autoscience'],
          required_capability_package_ids: ['mas-scholar-skills'],
          app_contribution_abi: {
            argv: ['./bin/mas-app-contribution'],
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );
}

function copyMasIsolated(srcRoot: string, dstRoot: string): void {
  const skipNames = new Set(['.git', '.venv', '.ruff_cache', '.codegraph', 'outputs', 'tmp', '__pycache__']);
  function walk(curSrc: string, curDst: string, relBase = ''): void {
    fs.mkdirSync(curDst, { recursive: true });
    for (const ent of fs.readdirSync(curSrc, { withFileTypes: true })) {
      if (skipNames.has(ent.name)) continue;
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      // Omit external python/opl_framework symlink to keep temp sandbox isolated
      if (rel === 'src/opl_framework') continue;
      const s = path.join(curSrc, ent.name);
      const d = path.join(curDst, ent.name);
      if (ent.isSymbolicLink()) {
        const target = fs.readlinkSync(s);
        const resolved = path.resolve(path.dirname(s), target);
        if (resolved.startsWith(srcRoot)) {
          fs.symlinkSync(target, d);
        }
        continue;
      }
      if (ent.isDirectory()) {
        walk(s, d, rel);
      } else if (ent.isFile()) {
        fs.copyFileSync(s, d);
      }
    }
  }
  walk(srcRoot, dstRoot);
}

afterEach(async () => {
  while (sandboxes.length > 0) {
    await sandboxes.pop()!.cleanup();
  }
});

function writeGate1CodexProtocolStub(stubPath: string, oplHome: string): string {
  const script = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const args = process.argv.slice(2);
if (args[0] === '--version' || args[0] === '-V') {
  process.stdout.write('codex-cli 0.171.0\\n');
  process.exit(0);
}
if (args[0] === 'app-server') {
  const mpPath = path.join(${JSON.stringify(oplHome)}, 'carriers', 'codex-marketplace', 'marketplace.json');
  const mpDir = path.dirname(mpPath);
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const t = line.trim();
    if (!t) return;
    const frame = JSON.parse(t);
    if (frame.method === 'initialized' && frame.id === undefined) return;
    if (frame.method === 'initialize') {
      process.stdout.write(JSON.stringify({ id: frame.id, result: { userAgent: 'codex-stub/0.171.0' } }) + '\\n');
      return;
    }
    if (frame.method === 'plugin/list') {
      const marketplaces = [];
      if (fs.existsSync(mpPath)) {
        const mpJson = JSON.parse(fs.readFileSync(mpPath, 'utf8'));
        const mpName = mpJson.name || 'opl-local';
        const plugins = (mpJson.plugins || []).map((entry) => {
          const rawSource = typeof entry.source === 'string'
            ? entry.source
            : (entry.source && typeof entry.source.path === 'string' ? entry.source.path : './plugins/' + entry.name);
          const pluginDir = path.resolve(mpDir, rawSource);
          const pjPath = path.join(pluginDir, '.codex-plugin', 'plugin.json');
          const pj = fs.existsSync(pjPath) ? JSON.parse(fs.readFileSync(pjPath, 'utf8')) : {};
          const pluginName = entry.name || pj.name || path.basename(pluginDir);
          const version = pj.version || entry.version || '0.0.0';
          return {
            id: entry.id || (pluginName + '@' + mpName),
            name: pluginName,
            version,
            localVersion: version,
            source: { type: 'local', path: pluginDir },
            installed: entry.installed !== undefined ? Boolean(entry.installed) : true,
            enabled: entry.enabled !== undefined ? Boolean(entry.enabled) : true,
          };
        });
        marketplaces.push({ name: mpName, path: mpDir, plugins });
      }
      process.stdout.write(JSON.stringify({ id: frame.id, result: { marketplaces, marketplaceLoadErrors: [] } }) + '\\n');
      return;
    }
    if (frame.id !== undefined) {
      process.stdout.write(JSON.stringify({ id: frame.id, error: { code: -32601, message: 'Method not found' } }) + '\\n');
    }
  });
  rl.on('close', () => process.exit(0));
} else {
  process.exit(2);
}
`;
  fs.mkdirSync(path.dirname(stubPath), { recursive: true });
  fs.writeFileSync(stubPath, script, { mode: 0o755 });
  return stubPath;
}

async function runGate1Flow(sb: DaemonSandbox, tmpMas: string): Promise<void> {
  // 1. migrate-v1 --apply --clean removes plugins/ source mirror
  const mig = await sb.spawnCli(['pack', 'migrate-v1', tmpMas, '--json']);
  assert.equal(mig.code, 0, `migrate-v1 failed:\n${mig.stdout}\n${mig.stderr}`);
  assert.equal(fs.existsSync(path.join(tmpMas, 'plugins')), false, 'Expected zero plugins/ mirror after migrate-v1');

  const v2Manifest = JSON.parse(fs.readFileSync(path.join(tmpMas, 'opl-package.json'), 'utf8')) as {
    schema_version: string;
    identity: { id: string; icon?: string; default_prompts?: string[] };
  };
  assert.equal(v2Manifest.schema_version, 'opl.package.v2');
  assert.equal(v2Manifest.identity.id, 'mas');
  assert.ok(Array.isArray(v2Manifest.identity.default_prompts) && v2Manifest.identity.default_prompts.length > 0);
  assert.equal(v2Manifest.identity.icon, 'assets/branding/medautoscience-logo.png');

  // 2. pack build creates deterministic opl-release.lock.json
  const built = await sb.spawnCli(['pack', 'build', tmpMas, '--json']);
  assert.equal(built.code, 0, `pack build failed:\n${built.stdout}\n${built.stderr}`);
  assert.equal(fs.existsSync(path.join(tmpMas, 'opl-release.lock.json')), true);

  // 3. pack link projects .codex-plugin/plugin.json + symlinks into OPL_HOME/carriers/codex-marketplace
  const linked = await sb.spawnCli(['pack', 'link', tmpMas, '--json']);
  assert.equal(linked.code, 0, `pack link failed:\n${linked.stdout}\n${linked.stderr}`);

  const pluginDir = path.join(sb.oplHome, 'carriers', 'codex-marketplace', 'plugins', 'med-autoscience');
  const pluginJsonPath = path.join(pluginDir, '.codex-plugin', 'plugin.json');
  assert.equal(fs.existsSync(pluginJsonPath), true, 'Expected .codex-plugin/plugin.json');
  const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8')) as {
    name: string;
    interface?: { logo?: string; defaultPrompt?: string[] };
  };
  assert.equal(pluginJson.name, 'med-autoscience');
  assert.ok(pluginJson.interface?.defaultPrompt && pluginJson.interface.defaultPrompt.length > 0);

  const skillsLink = path.join(pluginDir, 'skills', 'med-autoscience');
  const assetsLink = path.join(pluginDir, 'assets');
  assert.equal(fs.lstatSync(skillsLink).isSymbolicLink(), true);
  assert.equal(fs.lstatSync(assetsLink).isSymbolicLink(), true);
  assert.ok(pluginJson.interface?.logo, 'Expected interface.logo in projected .codex-plugin/plugin.json');
  const logoRel = pluginJson.interface.logo.replace(/^\.\//, '');
  assert.equal(fs.existsSync(path.join(pluginDir, logoRel)), true, `Expected projected logo at ${logoRel}`);

  // 4. pack sync codex verifies bidirectional codex app-server --stdio plugin/list readback
  const synced = await sb.spawnCli(['pack', 'sync', 'codex', '--json']);
  assert.equal(synced.code, 0, `pack sync codex failed:\n${synced.stdout}\n${synced.stderr}`);
  const syncBody = synced.json as { ok: boolean; synced: Array<{ package_id: string; verified_by_readback: boolean }> };
  assert.equal(syncBody.ok, true);
  assert.equal(
    syncBody.synced.some((s) => s.package_id === 'mas' && s.verified_by_readback === true),
    true,
  );

  // 5. pack unlink cleans marketplace while keeping tmpMas intact
  const unlinked = await sb.spawnCli(['pack', 'unlink', 'mas', '--json']);
  assert.equal(unlinked.code, 0, `pack unlink failed:\n${unlinked.stdout}\n${unlinked.stderr}`);
  assert.equal(fs.existsSync(pluginDir), false);
  assert.equal(fs.existsSync(path.join(tmpMas, 'opl-package.json')), true);
}

describe('Wave 1 Gate 1: MAS migrate-v1 + build + link + codex plugin/list parity', () => {
  it('migrates self-contained synthetic MAS v1 fixture, builds lock, links zero-copy Codex plugin, verifies plugin/list parity, and unlinks cleanly', async () => {
    const sb = trackSandbox();
    const gate1Stub = writeGate1CodexProtocolStub(path.join(sb.root, 'gate1-bin', 'codex.mjs'), sb.oplHome);
    sb.env.OPL_CODEX_BIN = gate1Stub;
    await sb.startInProcess();

    const tmpMas = path.join(sb.workspaceDir, 'med-autoscience');
    createSyntheticMasV1Fixture(tmpMas);
    await runGate1Flow(sb, tmpMas);
  });

  it('migrates isolated real MAS checkout when present on disk, builds lock, links zero-copy Codex plugin, verifies plugin/list parity, and unlinks cleanly', async (t) => {
    const realMasDir = resolveRealMasDir();
    if (!realMasDir || !fs.existsSync(realMasDir)) {
      t.skip('Optional external med-autoscience checkout not present on disk');
      return;
    }

    const sb = trackSandbox();
    const gate1Stub = writeGate1CodexProtocolStub(path.join(sb.root, 'gate1-bin', 'codex.mjs'), sb.oplHome);
    sb.env.OPL_CODEX_BIN = gate1Stub;
    await sb.startInProcess();

    const tmpMas = path.join(sb.workspaceDir, 'med-autoscience');
    copyMasIsolated(realMasDir, tmpMas);
    await runGate1Flow(sb, tmpMas);
  });
});
