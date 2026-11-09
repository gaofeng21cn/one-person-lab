import { spawnSync } from 'node:child_process';
import { NodeHandle } from 'typescript/unstable/sync';

import { assert, fs, path, repoRoot, test } from '../../helpers.ts';
import { buildTypescriptSourceGraph } from '../../../../../src/authority/workspace/standard-agent-source-closure-parts/typescript-graph.ts';

import {
  actionCatalogAction,
  buildRepo,
  installActionCatalog,
  installTypescriptEntry,
  runSourceClosure,
  writeJson,
  writeSource,
} from './source-repo-fixture.ts';

export function runGit(repoDir: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

export function registerWorkspaceAuthority() {
  test('workspace authority does not depend on execution adapter implementation', () => {
    const workspaceRoot = path.join(repoRoot, 'src', 'authority', 'workspace');
    const pending = [workspaceRoot];
    const violations: string[] = [];
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) {
        continue;
      }
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          pending.push(entryPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          const source = fs.readFileSync(entryPath, 'utf8');
          if (/['"][^'"]*\/adapters\/execution(?:\/|['"])/u.test(source)) {
            violations.push(path.relative(repoRoot, entryPath));
          }
        }
      }
    }

    assert.deepEqual(violations, []);
  });

}

export function registerPackageActionHandlerTypescript() {
  test('agents source-closure resolves package, action, handler, and TypeScript calls', () => {
    const repoDir = buildRepo();
    const cliSource = [
      "import { exportedHandle as run } from './barrel.js';",
      "import './side-effect.ts';",
      'export function main() { return run(); }',
      'main();',
      '',
    ].join('\n');
    installTypescriptEntry(repoDir, cliSource);
    writeSource(repoDir, 'src/barrel.ts', "export { handle as exportedHandle } from './handler.ts';\n");
    writeSource(repoDir, 'src/handler.ts', "export function handle() { return 'ok'; }\n");
    writeSource(repoDir, 'src/side-effect.ts', "function initialize() { return 'ready'; }\ninitialize();\n");

    const result = runSourceClosure(repoDir);
    const report = result.reports[0];

    assert.equal(result.status, 'passed');
    assert.equal(report.scan_complete, true);
    assert.deepEqual(
      new Set(report.entrypoints.map((entry: { source_kind: string }) => entry.source_kind)),
      new Set(['package_bin', 'action_catalog', 'handler_registry']),
    );
    assert.equal(report.reachable_symbols.some((symbol: { symbol: string }) => symbol.symbol === 'handle'), true);
    const edges = report.call_edges.map((edge: { from_symbol: string; to_symbol: string; edge_kind: string }) => (
      `${edge.from_symbol} -> ${edge.to_symbol} (${edge.edge_kind})`
    ));
    assert.ok(edges.includes('src/cli.ts#main -> src/handler.ts#handle (call)'));
    assert.ok(edges.includes('src/barrel.ts#<module> -> src/handler.ts#handle (static_import)'));
    assert.ok(edges.includes('src/cli.ts#<module> -> src/side-effect.ts#<module> (static_import)'));
    assert.ok(edges.includes('src/side-effect.ts#<module> -> src/side-effect.ts#initialize (call)'));
  });

  test('TypeScript source closure retains unresolved relative aliases as blocking edges', () => {
    const repoDir = buildRepo();
    try {
      writeSource(repoDir, 'src/cli.ts', "import { missing as run } from './missing.ts';\nexport const main = () => run();\n");
      const graph = buildTypescriptSourceGraph(repoDir, ['src/cli.ts']);
      assert.equal(graph.unresolved_edges.length, 1);
      assert.equal(graph.unresolved_edges[0]?.reason, 'relative_import_unresolved');
      assert.equal(graph.unresolved_edges[0]?.expression, './missing.ts');
      assert.equal(graph.unresolved_edges[0]?.sensitive, true);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });

  test('TypeScript source closure fails closed when compiler declaration handles cannot resolve', (t) => {
    const repoDir = buildRepo();
    try {
      writeSource(repoDir, 'src/cli.ts', 'function handle() { return true; }\nexport const main = () => handle();\n');
      t.mock.method(NodeHandle.prototype, 'resolve', () => undefined);
      const graph = buildTypescriptSourceGraph(repoDir, ['src/cli.ts']);
      assert.equal(graph.scan_complete, false);
      assert.ok(graph.diagnostics.some((diagnostic) => diagnostic.startsWith('typescript_symbol_resolution_error:')));
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
}

export function registerNestedWorkspaceBins() {
  test('agents source-closure discovers nested workspace package bins', () => {
    const repoDir = buildRepo();
    writeJson(path.join(repoDir, 'package.json'), {
      name: 'sample-monorepo',
      version: '0.0.0',
      private: true,
      workspaces: ['apps/*'],
    });
    writeJson(path.join(repoDir, 'apps', 'sample-cli', 'package.json'), {
      name: '@sample/cli',
      version: '0.0.0',
      type: 'module',
      bin: { sample: 'dist/cli.js' },
    });
    writeSource(repoDir, 'apps/sample-cli/src/cli.ts', [
      "export function main() { return 'ok'; }",
      'main();',
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];
    const nestedBin = report.entrypoints.find((entry: { entrypoint_id: string }) => (
      entry.entrypoint_id === 'package_bin:apps/sample-cli/package.json#sample'
    ));

    assert.equal(report.status, 'passed');
    assert.equal(nestedBin?.declared_ref, 'apps/sample-cli/package.json#/bin/sample');
    assert.equal(nestedBin?.file, 'apps/sample-cli/src/cli.ts');
    assert.equal(nestedBin?.resolution_status, 'resolved');
  });

}

export function registerNestedWorkspaceExports() {
  test('agents source-closure discovers nested workspace package exports', () => {
    const repoDir = buildRepo();
    writeJson(path.join(repoDir, 'package.json'), {
      name: 'sample-monorepo',
      version: '0.0.0',
      private: true,
      workspaces: ['packages/*'],
    });
    writeJson(path.join(repoDir, 'packages', 'sample-domain', 'package.json'), {
      name: '@sample/domain',
      version: '0.0.0',
      type: 'module',
      exports: { '.': './dist/index.js' },
    });
    writeSource(repoDir, 'packages/sample-domain/src/index.ts', [
      "export { handle } from './handler.js';",
      '',
    ].join('\n'));
    writeSource(repoDir, 'packages/sample-domain/src/handler.ts', [
      "export function handle() { return 'ok'; }",
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];
    const packageExport = report.entrypoints.find((entry: { entrypoint_id: string }) => (
      entry.entrypoint_id === 'package_export:packages/sample-domain/package.json#.'
    ));

    assert.equal(report.status, 'passed');
    assert.equal(packageExport?.declared_ref, 'packages/sample-domain/package.json#/exports/.');
    assert.equal(packageExport?.file, 'packages/sample-domain/src/index.ts');
    assert.equal(packageExport?.resolution_status, 'resolved');
    assert.equal(
      report.reachable_symbols.some((symbol: { symbol: string }) => symbol.symbol === 'handle'),
      true,
    );
  });

}

export function registerTypescriptDynamicImportDispatch() {
  test('agents source-closure fails closed on dynamic import and dispatch', () => {
    const repoDir = buildRepo();
    installTypescriptEntry(repoDir, [
      'export async function main(name: string) {',
      '  const loaded = await import(name);',
      '  return loaded[name]();',
      '}',
      "void main(process.argv[2] ?? './handler.ts');",
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];
    const reasons = report.unresolved_edges.map((edge: { reason: string }) => edge.reason);

    assert.equal(report.status, 'blocked');
    assert.equal(reasons.includes('dynamic_import'), true);
    assert.equal(reasons.includes('dynamic_dispatch'), true);
  });

}

export function registerHostedStageBindings() {
  test('agents source-closure accepts canonical OPL-hosted stage bindings', () => {
    const repoDir = buildRepo();
    writeJson(path.join(repoDir, 'agent', 'stages', 'manifest.json'), {
      surface_kind: 'family_stage_manifest',
    });
    installActionCatalog(repoDir, [{
      ...actionCatalogAction('hosted', {
        kind: 'stage_binding',
        stage_manifest_ref: 'agent/stages/manifest.json',
      }),
      stage_route: {
        entry_stage_ref: 'sample-stage',
        required_stage_refs: ['sample-stage'],
        optional_stage_refs: [],
        terminal_stage_refs: ['sample-stage'],
        route_policy: 'ai_selected_progress_route',
      },
    }]);

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'passed');
    assert.equal(
      report.entrypoints.some((entry: { entrypoint_id: string; resolution_status: string }) =>
        entry.entrypoint_id === 'action_catalog:hosted' && entry.resolution_status === 'resolved'
      ),
      true,
    );
  });

}

export function registerMissingStageAndHandler() {
  test('agents source-closure blocks missing stage manifests and unresolved handler refs', () => {
    const repoDir = buildRepo();
    installActionCatalog(repoDir, [
      {
        ...actionCatalogAction('hosted', {
          kind: 'stage_binding',
          stage_manifest_ref: 'agent/stages/manifest.json',
        }),
        stage_route: {
          entry_stage_ref: 'sample-stage',
          required_stage_refs: ['sample-stage'],
          optional_stage_refs: [],
          terminal_stage_refs: ['sample-stage'],
          route_policy: 'ai_selected_progress_route',
        },
      },
      actionCatalogAction('missing-handler', {
        kind: 'handler_ref',
        handler_ref: 'handler:missing-handler',
      }),
    ]);

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'blocked');
    assert.equal(
      report.entrypoints.some((entry: { entrypoint_id: string; resolution_status: string }) =>
        entry.entrypoint_id === 'action_catalog:hosted'
        && entry.resolution_status === 'hosted_declaration_unverified'
      ),
      true,
    );
    assert.equal(
      report.entrypoints.some((entry: { entrypoint_id: string; resolution_status: string }) =>
        entry.entrypoint_id === 'action_handler:missing-handler'
        && entry.resolution_status === 'unresolved'
      ),
      true,
    );
  });

}

export function registerDirtyWorkspaceBytes() {
  test('agents source-closure scans current dirty workspace bytes including untracked replacements', () => {
    const repoDir = buildRepo();
    const oldCli = [
      "import { handle } from './old-handler.ts';",
      'export function main() { return handle(); }',
      'main();',
      '',
    ].join('\n');
    installTypescriptEntry(repoDir, oldCli);
    writeSource(repoDir, 'src/old-handler.ts', "export function handle() { return 'old'; }\n");
    writeJson(path.join(repoDir, 'contracts', 'domain_handler_registry.json'), {
      surface_kind: 'domain_handler_registry',
      version: 'domain-handler-registry.v1',
      handlers: [{
        handler_id: 'run',
        binding: { kind: 'typescript_export', file: 'src/old-handler.ts', export: 'handle' },
      }],
    });
    runGit(repoDir, ['init', '-q']);
    runGit(repoDir, ['add', '.']);

    fs.rmSync(path.join(repoDir, 'src', 'old-handler.ts'));
    writeSource(repoDir, 'src/cli.ts', [
      "import { handleReplacement } from './replacement-handler.ts';",
      'export function main() { return handleReplacement(); }',
      'main();',
      '',
    ].join('\n'));
    writeSource(
      repoDir,
      'src/replacement-handler.ts',
      "export function handleReplacement() { return 'new'; }\n",
    );
    fs.symlinkSync(
      'replacement-handler.ts',
      path.join(repoDir, 'src', 'linked-handler.ts'),
    );
    writeJson(path.join(repoDir, 'contracts', 'domain_handler_registry.json'), {
      surface_kind: 'domain_handler_registry',
      version: 'domain-handler-registry.v1',
      handlers: [{
        handler_id: 'run',
        binding: {
          kind: 'typescript_export',
          file: 'src/replacement-handler.ts',
          export: 'handleReplacement',
        },
      }],
    });

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'passed');
    assert.equal(Object.hasOwn(report.source_digests, 'src/old-handler.ts'), false);
    assert.equal(Object.hasOwn(report.source_digests, 'src/replacement-handler.ts'), true);
    assert.equal(Object.hasOwn(report.source_digests, 'src/linked-handler.ts'), false);
    assert.equal(
      report.reachable_symbols.some((symbol: { symbol: string }) => symbol.symbol === 'handleReplacement'),
      true,
    );
  });
}
