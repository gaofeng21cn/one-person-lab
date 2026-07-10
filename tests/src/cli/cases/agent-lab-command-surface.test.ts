import { spawnSync } from 'node:child_process';

import { assert, parseJsonText, path, repoRoot, runCli, test } from '../helpers.ts';

test('bin/opl routes agent-lab commands into the OPL CLI', () => {
  const result = spawnSync(path.join(repoRoot, 'bin', 'opl'), ['agent-lab', 'complete', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1', OPL_SKIP_SKILL_SYNC: '1' },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    (parseJsonText(result.stdout) as any).agent_lab_complete.surface_kind,
    'opl_agent_lab_complete_control_plane',
  );
});

test('agent-lab has no domain-specific live acceptance command', () => {
  const help = runCli(['help']).help;
  const publicText = [
    ...help.commands.map((entry: { command: string }) => entry.command),
    ...help.examples,
  ];

  assert.equal(publicText.some((entry: string) => entry.includes('mag-live-acceptance')), false);
});
