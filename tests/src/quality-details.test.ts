import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { cliPath, repoRoot, runCli, runCliInCwd, runCliRaw, runCliRawInCwd } from './cli/helpers.ts';

function makeQualityFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-details-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(root, '.sentrux'), { recursive: true });

  fs.writeFileSync(
    path.join(root, 'src', 'main.ts'),
    [
      "import { helper } from './util.ts';",
      '',
      'export function complicated(input: number, mode: string, extra: boolean, retries: number, label: string) {',
      '  let total = 0;',
      '  if (input > 0 && extra) {',
      '    total += helper(input);',
      '  } else if (mode === "fallback") {',
      '    total -= 1;',
      '  }',
      '  for (let index = 0; index < retries; index += 1) {',
      '    total += index;',
      '  }',
      '  while (total < 10) {',
      '    total += 1;',
      '  }',
      '  return label ? total : 0;',
      '}',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(root, 'src', 'util.ts'),
    [
      'export function helper(value: number) {',
      '  return value + 1;',
      '}',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(root, 'src', 'deep.py'),
    [
      'from .leaf import finish',
      '',
      'def python_branch(value, flag, mode, label, retries):',
      '    total = 0',
      '    if value and flag:',
      '        total += 1',
      '    elif mode == "x":',
      '        total -= 1',
      '    for index in range(retries):',
      '        total += index',
      '    return finish(total)',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(root, 'src', 'leaf.py'),
    [
      'def finish(value):',
      '    return value',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(root, 'tests', 'main.test.ts'),
    [
      "import { complicated } from '../src/main.ts';",
      '',
      'complicated(1, "x", true, 2, "label");',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(root, '.sentrux', 'rules.toml'),
    [
      '[constraints]',
      'max_depth = 1',
      'max_file_lines = 5',
      '',
      '[[layers]]',
      'name = "entry"',
      'paths = ["src/main.ts"]',
      'order = 1',
      '',
      '[[layers]]',
      'name = "leaf"',
      'paths = ["src/util.ts"]',
      'order = 2',
      '',
      '[[boundaries]]',
      'from = "entry"',
      'to = "leaf"',
      'reason = "entry should not depend directly on leaf in this fixture"',
      '',
    ].join('\n'),
  );

  return root;
}

test('quality details emits function, dependency, test gap, and rules diagnostics', () => {
  const fixtureRoot = makeQualityFixture();
  try {
    const output = runCli(['quality', 'details', '--root', fixtureRoot, '--format', 'json', '--limit', '10']);

    assert.equal(output.quality_details.surface_kind, 'opl_code_quality_details.v1');
    assert.equal(output.quality_details.root, fs.realpathSync.native(fixtureRoot));
    assert.ok(output.quality_details.repo_summary.functions >= 4);
    assert.ok(
      output.quality_details.function_findings.some(
        (finding: { file: string; function_name: string }) =>
          finding.file === 'src/main.ts' && finding.function_name === 'complicated',
      ),
    );
    assert.ok(
      output.quality_details.dependency_findings.some(
        (finding: { kind: string; path: string[] }) =>
          finding.kind === 'deep_dependency_path' && finding.path.includes('src/util.ts'),
      ),
    );
    assert.ok(
      output.quality_details.test_gap_findings.some(
        (finding: { file: string }) => finding.file === 'src/deep.py',
      ),
    );
    assert.ok(
      output.quality_details.rules_findings.some(
        (finding: { rule_kind: string; file?: string }) =>
          finding.rule_kind === 'max_file_lines' && finding.file === 'src/main.ts',
      ),
    );
    assert.ok(output.quality_details.agent_triage_targets.length > 0);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('quality details markdown format is raw markdown for GitHub step summaries', () => {
  const fixtureRoot = makeQualityFixture();
  try {
    const result = runCliRaw(['quality', 'details', '--root', fixtureRoot, '--format', 'markdown', '--limit', '5']);

    assert.match(result.stdout, /^# OPL Quality Details/m);
    assert.match(result.stdout, /Function Findings/);
    assert.match(result.stdout, /Rules Findings/);
    assert.equal(result.stderr, '');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function makeQualityGitFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-details-git-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'risk.py'),
    [
      'def reviewer(value):',
      '    if value > 0:',
      '        return value',
      '    return 0',
      '',
    ].join('\n'),
  );
  spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'codex@example.invalid'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Codex Test'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'baseline'], { cwd: root, encoding: 'utf8' });
  fs.writeFileSync(
    path.join(root, 'src', 'risk.py'),
    [
      'def reviewer(value):',
      '    if value > 0:',
      '        value += 1',
      '    if value > 1:',
      '        value += 1',
      '    if value > 2:',
      '        value += 1',
      '    if value > 3:',
      '        value += 1',
      '    if value > 4:',
      '        value += 1',
      '    if value > 5:',
      '        value += 1',
      '    if value > 6:',
      '        value += 1',
      '    if value > 7:',
      '        value += 1',
      '    if value > 8:',
      '        value += 1',
      '    if value > 9:',
      '        value += 1',
      '    if value > 10:',
      '        value += 1',
      '    if value > 11:',
      '        value += 1',
      '    if value > 12:',
      '        value += 1',
      '    if value > 13:',
      '        value += 1',
      '    if value > 14:',
      '        value += 1',
      '    if value > 15:',
      '        value += 1',
      '    return value',
      '',
    ].join('\n'),
  );
  return root;
}

function makeQualifiedNameGitFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-quality-details-qualified-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'models.py'),
    [
      'class StablePayload:',
      '    @classmethod',
      '    def from_payload(cls, payload):',
      '        if payload.get("enabled"):',
      '            return cls()',
      '        return cls()',
      '',
      'class ChangedPayload:',
      '    @classmethod',
      '    def from_payload(cls, payload):',
      '        return cls()',
      '',
    ].join('\n'),
  );
  spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'codex@example.invalid'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Codex Test'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'baseline'], { cwd: root, encoding: 'utf8' });
  fs.writeFileSync(
    path.join(root, 'src', 'models.py'),
    [
      'class StablePayload:',
      '    @classmethod',
      '    def from_payload(cls, payload):',
      '        if payload.get("enabled"):',
      '            return cls()',
      '        return cls()',
      '',
      'class ChangedPayload:',
      '    @classmethod',
      '    def from_payload(cls, payload):',
      '        if payload.get("a"):',
      '            payload["a"] = True',
      '        if payload.get("b"):',
      '            payload["b"] = True',
      '        if payload.get("c"):',
      '            payload["c"] = True',
      '        if payload.get("d"):',
      '            payload["d"] = True',
      '        if payload.get("e"):',
      '            payload["e"] = True',
      '        if payload.get("f"):',
      '            payload["f"] = True',
      '        if payload.get("g"):',
      '            payload["g"] = True',
      '        if payload.get("h"):',
      '            payload["h"] = True',
      '        if payload.get("i"):',
      '            payload["i"] = True',
      '        if payload.get("j"):',
      '            payload["j"] = True',
      '        if payload.get("k"):',
      '            payload["k"] = True',
      '        if payload.get("l"):',
      '            payload["l"] = True',
      '        if payload.get("m"):',
      '            payload["m"] = True',
      '        if payload.get("n"):',
      '            payload["n"] = True',
      '        if payload.get("o"):',
      '            payload["o"] = True',
      '        return cls()',
      '',
    ].join('\n'),
  );
  return root;
}

test('quality details compare-ref reports functions crossing the complex threshold', () => {
  const fixtureRoot = makeQualityGitFixture();
  try {
    const output = runCliInCwd(
      ['quality', 'details', '--root', fixtureRoot, '--format', 'json', '--compare-ref', 'HEAD', '--limit', '10'],
      fixtureRoot,
    );

    assert.equal(output.quality_details.baseline_diff.compare_ref, 'HEAD');
    assert.equal(output.quality_details.baseline_diff.complex_function_threshold, 15);
    assert.equal(output.quality_details.baseline_diff.new_complex_functions, 1);
    assert.ok(
      output.quality_details.function_change_findings.some(
        (finding: { file: string; function_name: string; cyclomatic_complexity: number }) =>
          finding.file === 'src/risk.py'
          && finding.function_name === 'reviewer'
          && finding.cyclomatic_complexity > 15,
      ),
    );

    const markdown = runCliRawInCwd(
      ['quality', 'details', '--root', fixtureRoot, '--format', 'markdown', '--compare-ref', 'HEAD', '--limit', '10'],
      fixtureRoot,
    );
    assert.match(markdown.stdout, /Baseline Diff/);
    assert.match(markdown.stdout, /src\/risk.py/);
    assert.match(markdown.stdout, /new_complex_function/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('quality details compare-ref uses qualified names for same-name class methods', () => {
  const fixtureRoot = makeQualifiedNameGitFixture();
  try {
    const output = runCliInCwd(
      ['quality', 'details', '--root', fixtureRoot, '--format', 'json', '--compare-ref', 'HEAD', '--limit', '10'],
      fixtureRoot,
    );

    assert.equal(output.quality_details.baseline_diff.new_complex_functions, 1);
    assert.deepEqual(
      output.quality_details.function_change_findings.map(
        (finding: { qualified_name: string }) => finding.qualified_name,
      ),
      ['ChangedPayload.from_payload'],
    );
    assert.ok(
      output.quality_details.function_findings.some(
        (finding: { function_name: string; qualified_name: string }) =>
          finding.function_name === 'from_payload'
          && finding.qualified_name === 'ChangedPayload.from_payload',
      ),
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('bin/opl routes quality commands into the OPL CLI instead of Codex passthrough', () => {
  const fixtureRoot = makeQualityFixture();
  try {
    const result = spawnSync(
      path.join(repoRoot, 'bin', 'opl'),
      ['quality', 'details', '--root', fixtureRoot, '--format', 'json', '--limit', '3'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          OPL_SKIP_SKILL_SYNC: '1',
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.quality_details.surface_kind, 'opl_code_quality_details.v1');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
