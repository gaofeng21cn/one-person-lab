import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');
export const binPath = path.join(repoRoot, 'bin', 'opl');

export function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

export function runCliRaw(args: string[], envOverrides: Record<string, string> = {}) {
  return runEntryPathRaw(cliPath, args, envOverrides);
}

export function runCliFailure(args: string[], envOverrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: JSON.parse(result.stderr),
  };
}

export function runEntryPathRaw(
  entryPath: string,
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const command = entryPath === cliPath ? process.execPath : entryPath;
  const commandArgs =
    entryPath === cliPath
      ? ['--experimental-strip-types', cliPath, ...args]
      : args;
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return result;
}

export function runEntryPathFailure(
  entryPath: string,
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const command = entryPath === cliPath ? process.execPath : entryPath;
  const commandArgs =
    entryPath === cliPath
      ? ['--experimental-strip-types', cliPath, ...args]
      : args;
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: JSON.parse(result.stderr),
  };
}

export function createFakeCodexFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-default-fixture-'));
  const codexPath = path.join(fixtureRoot, 'codex');
  fs.writeFileSync(
    codexPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    codexPath,
  };
}

const fakeFamilySkillDescriptions: Record<string, string> = {
  mas: 'Use when Codex should operate MedAutoScience through its stable runtime, controller, overlay, and workspace contracts instead of ad-hoc scripts.',
  mag: 'Use when Codex should operate Med Auto Grant through its grant-authoring product entry, user-loop, and schema-backed contracts instead of ad-hoc repo scripting.',
  rca: 'Operate RedCube AI as the formal RCA visual-deliverable domain app through product-entry, recoverable deliverable runtime, and same-session continuation contracts.',
  'opl-meta-agent': 'Use when Codex should operate OPL Meta Agent to design, test, improve, or take over testing for OPL-compatible Foundry Agents.',
};

export const retiredCliCommandMatrix: Array<{
  args: string[];
  command: string;
  errorCode: string;
  replacements?: RegExp[];
}> = [
  {
    args: ['ask', 'Plan the next paper submission steps.'],
    command: 'opl ask',
    errorCode: 'unknown_command',
  },
  {
    args: ['chat', 'Plan the next paper submission steps.'],
    command: 'opl chat',
    errorCode: 'unknown_command',
  },
  {
    args: ['shell'],
    command: 'opl shell',
    errorCode: 'unknown_command',
  },
  {
    args: ['@mas', 'tighten the manuscript argument around invasive phenotype findings'],
    command: 'opl @mas',
    errorCode: 'unknown_command',
  },
  {
    args: ['@mag', 'Draft a grant revision response pack.', '--dry-run'],
    command: 'opl @mag',
    errorCode: 'unknown_command',
  },
  {
    args: ['@rca', 'Prepare a defense-ready slide deck.', '--dry-run'],
    command: 'opl @rca',
    errorCode: 'unknown_command',
  },
  {
    args: ['web'],
    command: 'web',
    errorCode: 'unknown_command',
  },
  {
    args: [['mcp', 'stdio'].join('-')],
    command: ['mcp', 'stdio'].join('-'),
    errorCode: 'unknown_command',
  },
];

export function createFakeFamilySkillWorkspace(captureDir: string) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-skills-'));
  const specs = [
    {
      project: 'med-autoscience',
      plugin: 'med-autoscience',
      canonicalPlugin: 'mas',
      installer: path.join('scripts', 'install-codex-plugin.sh'),
      scriptBody: `#!/usr/bin/env bash
set -euo pipefail
printf 'med-autoscience\\n' >> ${JSON.stringify(path.join(captureDir, 'sync.log'))}
cat <<'EOF'
{"repo":"med-autoscience","sync":"ok"}
EOF
`,
    },
    {
      project: 'med-autogrant',
      plugin: 'med-autogrant',
      canonicalPlugin: 'mag',
      installer: path.join('scripts', 'install-codex-plugin.sh'),
      scriptBody: `#!/usr/bin/env bash
set -euo pipefail
printf 'med-autogrant\\n' >> ${JSON.stringify(path.join(captureDir, 'sync.log'))}
cat <<'EOF'
{"repo":"med-autogrant","sync":"ok"}
EOF
`,
    },
    {
      project: 'redcube-ai',
      plugin: 'redcube-ai',
      canonicalPlugin: 'rca',
      installer: path.join('scripts', 'install-codex-plugin.ts'),
      scriptBody: `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(path.join(captureDir, 'sync.log'))}, 'redcube-ai\\n');
process.stdout.write(JSON.stringify({ repo: 'redcube-ai', sync: 'ok' }) + '\\n');
`,
    },
    {
      project: 'opl-meta-agent',
      plugin: 'opl-meta-agent',
      canonicalPlugin: 'opl-meta-agent',
      installer: path.join('scripts', 'install-codex-plugin.mjs'),
      scriptBody: `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(path.join(captureDir, 'sync.log'))}, 'opl-meta-agent\\n');
process.stdout.write(JSON.stringify({ repo: 'opl-meta-agent', sync: 'ok' }) + '\\n');
`,
    },
  ];

  for (const spec of specs) {
    const repoRoot = path.join(workspaceRoot, spec.project);
    const pluginRoot = path.join(repoRoot, 'plugins', spec.canonicalPlugin);
    const skillRoot = path.join(pluginRoot, 'skills', spec.canonicalPlugin);
    const installerPath = path.join(repoRoot, spec.installer);
    fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.mkdirSync(path.dirname(installerPath), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, '.agents', 'plugins'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: spec.canonicalPlugin, skills: './skills/' }, null, 2),
    );
    fs.writeFileSync(
      path.join(repoRoot, '.agents', 'plugins', 'marketplace.json'),
      JSON.stringify({ name: `${spec.canonicalPlugin}-local`, plugins: [] }, null, 2),
    );
    fs.writeFileSync(
      path.join(skillRoot, 'SKILL.md'),
      `---\nname: ${spec.canonicalPlugin}\ndescription: ${fakeFamilySkillDescriptions[spec.canonicalPlugin]}\n---\n\n# ${spec.canonicalPlugin.toUpperCase()} App Skill\n\nThis fixture represents a canonical family app skill with a real workflow entry, not a placeholder.\n`,
    );
    fs.mkdirSync(path.join(skillRoot, 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(skillRoot, 'agents', 'openai.yaml'),
      `interface:\n  display_name: "${spec.project === 'med-autoscience' ? 'Med Auto Science' : spec.project === 'med-autogrant' ? 'Med Auto Grant' : spec.project === 'redcube-ai' ? 'RedCube AI' : 'OPL Meta Agent'}"\n  short_description: "Canonical family app skill"\n  default_prompt: "Use $${spec.canonicalPlugin} to inspect the current family app state."\n`,
    );
    fs.writeFileSync(installerPath, spec.scriptBody, { mode: 0o755 });
  }

  return {
    workspaceRoot,
    syncLogPath: path.join(captureDir, 'sync.log'),
  };
}
