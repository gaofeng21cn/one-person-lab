import { spawnSync } from 'node:child_process';

import { GatewayContractError } from './contracts.ts';

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function normalizeCommandOutput(stdout: string, stderr = '') {
  return [stdout, stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
}

type HermesStatusSectionMap = Record<string, Record<string, string>>;

export function parseHermesStatusOutput(output: string) {
  const sections: HermesStatusSectionMap = {};
  let currentSection: string | null = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const sectionMatch = line.match(/^◆\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      sections[currentSection] = {};
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const fieldMatch =
      line.match(/^\s{2,}([A-Za-z0-9./() _-]+):\s{2,}(.*)$/)
      ?? line.match(/^\s{2,}(.+?)\s{2,}(.+)$/);

    if (!fieldMatch) {
      continue;
    }

    sections[currentSection][fieldMatch[1].trim()] = fieldMatch[2].trim();
  }

  const messagingPlatforms = Object.entries(sections['Messaging Platforms'] ?? {})
    .filter(([, value]) => value.startsWith('✓'))
    .map(([name]) => name);

  return {
    sections,
    summary: {
      project_root: sections.Environment?.Project ?? null,
      model: sections.Environment?.Model ?? null,
      terminal_backend: sections['Terminal Backend']?.Backend ?? null,
      gateway_status: sections['Gateway Service']?.Status ?? null,
      gateway_manager: sections['Gateway Service']?.Manager ?? null,
      scheduled_jobs: sections['Scheduled Jobs']?.Jobs
        ? Number.parseInt(sections['Scheduled Jobs'].Jobs, 10)
        : null,
      active_sessions: sections.Sessions?.Active
        ? Number.parseInt(sections.Sessions.Active, 10)
        : null,
      configured_messaging_platforms: messagingPlatforms,
    },
  };
}

export function parseHermesProcessTable(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const command = match[7];
      const normalized = command.toLowerCase();

      return {
        pid: Number.parseInt(match[1], 10),
        ppid: Number.parseInt(match[2], 10),
        cpu_percent: Number.parseFloat(match[3]),
        memory_percent: Number.parseFloat(match[4]),
        rss_kb: Number.parseInt(match[5], 10),
        elapsed: match[6],
        command,
        role: normalized.includes('gateway run')
          ? 'gateway'
          : normalized.includes('hermes')
            ? 'runtime_process'
            : 'other',
      };
    });
}

export function collectHermesProcessUsage() {
  const result = runCommand('ps', ['-axo', 'pid=,ppid=,pcpu=,pmem=,rss=,etime=,command=']);
  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      'Failed to collect process data for Hermes runtime status.',
      {
        command: ['ps', '-axo', 'pid=,ppid=,pcpu=,pmem=,rss=,etime=,command='],
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }

  const processes = parseHermesProcessTable(result.stdout).filter((entry) =>
    /(^|\s|\/)hermes($|\s)|hermes_cli(\.main)?/i.test(entry.command),
  );

  return {
    raw_output: processes
      .map((entry) =>
        [
          entry.pid,
          entry.ppid,
          entry.cpu_percent.toFixed(1),
          entry.memory_percent.toFixed(1),
          entry.rss_kb,
          entry.elapsed,
          entry.command,
        ].join(' '),
      )
      .join('\n'),
    processes,
    summary: {
      process_count: processes.length,
      total_rss_kb: processes.reduce((sum, entry) => sum + entry.rss_kb, 0),
      total_cpu_percent: Number(
        processes.reduce((sum, entry) => sum + entry.cpu_percent, 0).toFixed(1),
      ),
    },
  };
}
