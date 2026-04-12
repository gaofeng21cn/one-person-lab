import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';

export type HermesBinarySource = 'env' | 'path';

export interface HermesBinaryInfo {
  path: string;
  source: HermesBinarySource;
}

export interface HermesGatewayServiceStatus {
  loaded: boolean;
  raw_output: string;
}

export interface HermesRuntimeInspection {
  binary: HermesBinaryInfo | null;
  version: string | null;
  gateway_service: HermesGatewayServiceStatus;
  issues: string[];
}

export interface HermesCommandOptions {
  hermesBinary?: HermesBinaryInfo | null;
  quiet?: boolean;
  inheritStdio?: boolean;
}

export interface HermesCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function isExecutableCandidate(filePath: string) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function resolveHermesFromPath(): HermesBinaryInfo | null {
  const pathEntries = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of pathEntries) {
    const candidate = path.join(entry, 'hermes');
    if (isExecutableCandidate(candidate)) {
      return {
        path: candidate,
        source: 'path',
      };
    }
  }

  return null;
}

export function resolveHermesBinary(): HermesBinaryInfo | null {
  const envCandidate = process.env.OPL_HERMES_BIN?.trim();

  if (envCandidate) {
    if (!isExecutableCandidate(envCandidate)) {
      throw new GatewayContractError(
        'hermes_binary_not_found',
        'OPL_HERMES_BIN is set but does not point to a runnable Hermes binary.',
        {
          hermes_binary: envCandidate,
          env_var: 'OPL_HERMES_BIN',
        },
      );
    }

    return {
      path: envCandidate,
      source: 'env',
    };
  }

  return resolveHermesFromPath();
}

function runBinary(
  hermesBinary: HermesBinaryInfo,
  args: string[],
  options: HermesCommandOptions = {},
): HermesCommandResult {
  const result = spawnSync(hermesBinary.path, args, {
    encoding: 'utf8',
    stdio: options.inheritStdio ? 'inherit' : 'pipe',
    env: process.env,
  });

  if (result.error) {
    throw new GatewayContractError(
      'hermes_command_failed',
      `Failed to launch Hermes for: hermes ${args.join(' ')}`,
      {
        hermes_binary: hermesBinary.path,
        args,
        cause: result.error.message,
      },
    );
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function inspectHermesRuntime(): HermesRuntimeInspection {
  const binary = resolveHermesBinary();

  if (!binary) {
    return {
      binary: null,
      version: null,
      gateway_service: {
        loaded: false,
        raw_output: '',
      },
      issues: [
        'Hermes binary not found. Set OPL_HERMES_BIN or install `hermes` into PATH.',
      ],
    };
  }

  const issues: string[] = [];

  const versionResult = runBinary(binary, ['version']);
  const version = versionResult.exitCode === 0 ? versionResult.stdout.trim() : null;
  if (!version) {
    issues.push('Hermes version command did not return a usable version string.');
  }

  const gatewayResult = runBinary(binary, ['gateway', 'status']);
  const gatewayRawOutput = [gatewayResult.stdout, gatewayResult.stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
  const gatewayLoaded =
    gatewayResult.exitCode === 0 &&
    /Gateway service is loaded/i.test(gatewayRawOutput);

  if (!gatewayLoaded) {
    issues.push(
      'Hermes gateway service is not currently loaded. Local ask/chat can still work, but product-grade messaging entry is not ready.',
    );
  }

  return {
    binary,
    version,
    gateway_service: {
      loaded: gatewayLoaded,
      raw_output: gatewayRawOutput,
    },
    issues,
  };
}

export function buildHermesCliPreview(args: string[]) {
  return ['hermes', ...args];
}

export function runHermesCommand(
  args: string[],
  options: HermesCommandOptions = {},
): HermesCommandResult {
  const hermesBinary = options.hermesBinary ?? resolveHermesBinary();

  if (!hermesBinary) {
    throw new GatewayContractError(
      'hermes_binary_not_found',
      'Hermes binary is required for OPL Product Entry ask/chat commands.',
      {
        env_var: 'OPL_HERMES_BIN',
      },
    );
  }

  return runBinary(hermesBinary, args, options);
}

export function parseHermesQuietChatOutput(output: string) {
  const sessionMatch = output.match(/session_id:\s*(\S+)/i);
  const sessionId = sessionMatch?.[1] ?? null;
  const response = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .filter((line) => !/^session_id:\s*\S+/i.test(line))
    .filter((line) => !/^[╭╰]/.test(line))
    .join('\n')
    .trim();

  if (!sessionId) {
    throw new GatewayContractError(
      'hermes_output_parse_failed',
      'Hermes quiet chat output did not include a session_id line.',
      {
        output,
      },
    );
  }

  return {
    response,
    sessionId,
  };
}
