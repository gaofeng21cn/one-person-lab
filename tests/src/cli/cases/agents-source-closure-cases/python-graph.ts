import { assert, fs, os, path, test } from '../../helpers.ts';
import { buildPythonSourceGraph } from '../../../../../src/authority/workspace/standard-agent-source-closure/python-graph.ts';

import { buildRepo, runSourceClosure, writeSource } from './source-repo-fixture.ts';

export function registerPythonPyprojectRelativeCalls() {
  test('agents source-closure resolves Python pyproject scripts and relative calls', () => {
    const repoDir = buildRepo();
    writeSource(repoDir, 'pyproject.toml', [
      '[project]',
      'name = "sample-agent"',
      'version = "0.0.0"',
      '[project.scripts]',
      'sample-agent = "sample.cli:main"',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/cli.py', [
      'from .handler import handle',
      'def main():',
      '    return handle()',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/handler.py', [
      'def handle():',
      '    return "ok"',
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'passed');
    assert.equal(report.entrypoints[0].source_kind, 'pyproject_script');
    assert.equal(report.reachable_symbols.some((symbol: { symbol: string }) => symbol.symbol === 'handle'), true);
  });

}

export function registerPythonPackageInitRelativeImports() {
  test('agents source-closure resolves relative imports from package init modules', () => {
    const repoDir = buildRepo();
    writeSource(repoDir, 'pyproject.toml', [
      '[project]',
      'name = "sample-agent"',
      'version = "0.0.0"',
      '[project.scripts]',
      'sample-agent = "sample.nested:main"',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/nested/__init__.py', [
      'from .handler import handle',
      'def main():',
      '    return handle()',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/nested/handler.py', [
      'def handle():',
      '    return "ok"',
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'passed');
    assert.equal(
      report.unresolved_edges.some((edge: { reason: string }) => edge.reason === 'relative_import_unresolved'),
      false,
    );
    assert.equal(report.reachable_symbols.some((symbol: { symbol: string }) => symbol.symbol === 'handle'), true);
  });

}

export function registerPythonNamespaceRelativeImports() {
  test('agents source-closure resolves relative submodules in namespace packages', () => {
    const repoDir = buildRepo();
    writeSource(repoDir, 'pyproject.toml', [
      '[project]',
      'name = "sample-agent"',
      'version = "0.0.0"',
      '[project.scripts]',
      'sample-agent = "sample.namespace.entry:main"',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/namespace/entry.py', [
      'from . import handler',
      'def main():',
      '    return handler.handle()',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/namespace/handler.py', [
      'def handle():',
      '    return "ok"',
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'passed');
    assert.equal(
      report.unresolved_edges.some((edge: { reason: string }) => edge.reason === 'relative_import_unresolved'),
      false,
    );
    assert.equal(report.reachable_symbols.some((symbol: { symbol: string }) => symbol.symbol === 'handle'), true);
  });

}

export function registerPythonLiteralDynamicImports() {
  test('agents source-closure treats literal dynamic imports and attribute reads as static context', () => {
    const repoDir = buildRepo();
    writeSource(repoDir, 'pyproject.toml', [
      '[project]',
      'name = "sample-agent"',
      'version = "0.0.0"',
      '[project.scripts]',
      'sample-agent = "sample.literal_import:main"',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/literal_import.py', [
      'from importlib import import_module',
      'def main(value):',
      '    import_module("sample.helper")',
      '    return getattr(value, "name", None)',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/helper.py', 'VALUE = "ok"\n');

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'passed');
    assert.deepEqual(report.unresolved_edges, []);
    assert.equal(
      report.reachable_symbols.some(
        (symbol: { file: string; symbol: string }) =>
          symbol.file === 'python/sample/helper.py' && symbol.symbol === '<module>',
      ),
      true,
    );
  });

}

export function registerPythonDynamicAttributeReads() {
  test('agents source-closure distinguishes dynamic attribute reads from executable dispatch', () => {
    const repoDir = buildRepo();
    writeSource(repoDir, 'pyproject.toml', [
      '[project]',
      'name = "sample-agent"',
      'version = "0.0.0"',
      '[project.scripts]',
      'sample-agent = "sample.attributes:main"',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/attributes.py', [
      'def main(value, field_name):',
      '    return getattr(value, field_name)',
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'passed');
    assert.deepEqual(report.unresolved_edges, []);
  });

}

export function registerPythonModuleDynamicDispatch() {
  test('agents source-closure still blocks module-level dynamic attribute dispatch', () => {
    const repoDir = buildRepo();
    writeSource(repoDir, 'pyproject.toml', [
      '[project]',
      'name = "sample-agent"',
      'version = "0.0.0"',
      '[project.scripts]',
      'sample-agent = "sample.attributes:main"',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/attributes.py', [
      'def __getattr__(name):',
      '    return getattr(object(), name)',
      'def main():',
      '    return "ok"',
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'blocked');
    assert.equal(report.unresolved_edges.some(
      (edge: { expression: string }) => edge.expression === 'getattr(object(), name)',
    ), true);
  });

}

export function registerPythonStdoutStreaming() {
  test('Python source closure does not buffer helper stdout', () => {
    const repoDir = buildRepo();
    writeSource(repoDir, 'python/sample/cli.py', 'def main():\n    return "ok"\n');
    const fakePython = path.join(repoDir, 'fake-python');
    writeSource(repoDir, 'fake-python', [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      'const outputPath = process.argv.at(-1);',
      "if (!outputPath || outputPath.endsWith('.py')) process.exit(2);",
      "process.stdin.on('data', () => {});",
      "process.stdin.on('end', () => {",
      "  const chunk = 'x'.repeat(1024 * 1024);",
      '  for (let index = 0; index < 40; index += 1) process.stdout.write(chunk);',
      '  fs.writeFileSync(outputPath, JSON.stringify({',
      '    scan_complete: true,',
      '    symbols: [],',
      '    call_edges: [],',
      '    unresolved_edges: [],',
      '    observed_calls: [],',
      '    diagnostics: [],',
      '    pyproject_scripts: {},',
      '  }));',
      '});',
      '',
    ].join('\n'));
    fs.chmodSync(fakePython, 0o755);

    const graph = buildPythonSourceGraph(repoDir, ['python/sample/cli.py'], fakePython);

    assert.equal(graph.scan_complete, true);
    assert.deepEqual(graph.diagnostics, []);
  });

}

export function registerPythonReadonlyEffects() {
  test('agents source-closure does not classify readonly os.open or ordinary object methods as writes', () => {
    const repoDir = buildRepo();
    writeSource(repoDir, 'pyproject.toml', [
      '[project]',
      'name = "sample-agent"',
      'version = "0.0.0"',
      '[project.scripts]',
      'sample-agent = "sample.readonly:main"',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/readonly.py', [
      'import os',
      'import sys',
      'def main(resolved, metrics, name):',
      '    descriptor = os.open(resolved, os.O_RDONLY | os.O_NOFOLLOW)',
      '    metrics.update({"count": 1})',
      '    name.replace("old", "new")',
      '    sys.path.insert(0, "vendor")',
      '    return descriptor',
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];

    assert.equal(report.status, 'passed');
    assert.deepEqual(report.observed_effects, []);
  });

}

export function registerPythonOpenModes() {
  test('agents source-closure distinguishes read-only open APIs from explicit Path writes', () => {
    const repoDir = buildRepo();
    writeSource(repoDir, 'pyproject.toml', [
      '[project]',
      'name = "sample-agent"',
      'version = "0.0.0"',
      '[project.scripts]',
      'sample-agent = "sample.open_modes:main"',
      '',
    ].join('\n'));
    writeSource(repoDir, 'python/sample/open_modes.py', [
      'import tarfile',
      'from PIL import Image',
      'def main(path):',
      '    path.open(newline="", encoding="utf-8")',
      '    Image.open(path)',
      '    tarfile.open(path)',
      '    path.open("wb")',
      '    tarfile.open(path, "w")',
      '',
    ].join('\n'));

    const report = runSourceClosure(repoDir).reports[0];
    const openEffects = report.observed_effects.filter(
      (effect: { effect_kind: string; callee: string }) => effect.effect_kind === 'filesystem_write',
    );

    assert.equal(report.status, 'blocked');
    assert.deepEqual(
      openEffects.map((effect: { callee: string }) => effect.callee),
      ['path.open', 'tarfile.open'],
    );
    assert.equal(openEffects[0].line, 7);
    assert.equal(openEffects[1].line, 8);
  });
}
