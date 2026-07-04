import { spawnSync } from 'node:child_process';

import { assert, parseJsonText, path, repoRoot, runCli, test } from '../helpers.ts';

test('bin/opl routes agent-lab commands into the OPL CLI instead of Codex passthrough', () => {
  const result = spawnSync(
    path.join(repoRoot, 'bin', 'opl'),
    ['agent-lab', 'complete', '--json'],
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
  const output = parseJsonText(result.stdout) as any;
  assert.equal(output.agent_lab_complete.surface_kind, 'opl_agent_lab_complete_control_plane');
});

test('agent-lab command surface does not embed the independent meta-agent product', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);
  const examples = output.help.examples as string[];

  assert.equal(commands.some((command: string) => command.includes('meta-builder')), false);
  assert.equal(commands.some((command: string) => command.includes('meta-agent')), false);
  assert.equal(examples.some((example) => example.includes('meta-builder')), false);
  assert.equal(examples.some((example) => example.includes('meta-agent')), false);
});

test('agent-lab command surface does not add domain-specific production evidence lanes', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);
  const examples = output.help.examples as string[];

  assert.equal(commands.some((command: string) => command === 'agent-lab mag-live-acceptance'), false);
  assert.equal(commands.some((command: string) => command.includes('mag-live-acceptance')), false);
  assert.equal(examples.some((example) => example.includes('mag-live-acceptance')), false);
});
