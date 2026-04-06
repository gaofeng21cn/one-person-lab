#!/usr/bin/env node

import {
  GatewayContractError,
  findDomainOrThrow,
  findWorkstreamOrThrow,
  loadGatewayContracts,
} from './contracts.ts';
import { explainDomainBoundary, resolveRequestSurface } from './resolver.ts';
import type { ResolveRequestInput } from './types.ts';

type CommandHandler = (args: string[]) => unknown;

function printJson(payload: unknown, stream: NodeJS.WriteStream = process.stdout) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function parseKeyValueArgs(args: string[]): ResolveRequestInput {
  const parsed: Partial<Record<'intent' | 'target' | 'goal' | 'preferred-family' | 'request-kind', string>> =
    {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token.startsWith('--')) {
      throw new GatewayContractError(
        'cli_usage_error',
        `Unexpected positional argument: ${token}.`,
        { token },
      );
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new GatewayContractError(
        'cli_usage_error',
        `Missing value for option: ${token}.`,
        { option: token },
      );
    }

    parsed[token.slice(2) as keyof typeof parsed] = value;
    index += 1;
  }

  if (!parsed.intent || !parsed.target || !parsed.goal) {
    throw new GatewayContractError(
      'cli_usage_error',
      'resolve-request-surface and explain-domain-boundary require --intent, --target, and --goal.',
      { required: ['--intent', '--target', '--goal'] },
    );
  }

  return {
    intent: parsed.intent,
    target: parsed.target,
    goal: parsed.goal,
    preferredFamily: parsed['preferred-family'],
    requestKind: parsed['request-kind'],
  };
}

function main() {
  const contracts = loadGatewayContracts(process.cwd());
  const [command, ...args] = process.argv.slice(2);

  const handlers: Record<string, CommandHandler> = {
    'list-workstreams': () => ({
      version: 'g2',
      workstreams: contracts.workstreams.workstreams.map((workstream) => ({
        workstream_id: workstream.workstream_id,
        label: workstream.label,
        status: workstream.status,
        domain_id: workstream.domain_id,
      })),
    }),
    'get-workstream': (commandArgs) => {
      const [workstreamId] = commandArgs;
      if (!workstreamId) {
        throw new GatewayContractError(
          'cli_usage_error',
          'get-workstream requires a workstream id.',
          { required: ['workstream_id'] },
        );
      }

      return {
        version: 'g2',
        workstream: findWorkstreamOrThrow(contracts, workstreamId),
      };
    },
    'list-domains': () => ({
      version: 'g2',
      domains: contracts.domains.domains.map((domain) => ({
        domain_id: domain.domain_id,
        gateway_surface: domain.gateway_surface,
        owned_workstreams: domain.owned_workstreams,
      })),
    }),
    'get-domain': (commandArgs) => {
      const [domainId] = commandArgs;
      if (!domainId) {
        throw new GatewayContractError(
          'cli_usage_error',
          'get-domain requires a domain id.',
          { required: ['domain_id'] },
        );
      }

      return {
        version: 'g2',
        domain: findDomainOrThrow(contracts, domainId),
      };
    },
    'resolve-request-surface': (commandArgs) => ({
      version: 'g2',
      resolution: resolveRequestSurface(parseKeyValueArgs(commandArgs), contracts),
    }),
    'explain-domain-boundary': (commandArgs) => ({
      version: 'g2',
      boundary_explanation: explainDomainBoundary(
        parseKeyValueArgs(commandArgs),
        contracts,
      ),
    }),
  };

  if (!command) {
    throw new GatewayContractError(
      'cli_usage_error',
      'A command is required.',
      {
        commands: Object.keys(handlers),
      },
    );
  }

  const handler = handlers[command];
  if (!handler) {
    throw new GatewayContractError('unknown_command', `Unknown command: ${command}.`, {
      command,
      commands: Object.keys(handlers),
    });
  }

  printJson(handler(args));
}

try {
  main();
} catch (error) {
  if (error instanceof GatewayContractError) {
    printJson(error.toJSON(), process.stderr);
    process.exitCode = error.exitCode;
  } else {
    const unexpected =
      error instanceof Error
        ? error.message
        : 'Unexpected non-error failure while running the OPL gateway CLI.';
    printJson(
      {
        version: 'g2',
        error: {
          code: 'unexpected_error',
          message: unexpected,
          exit_code: 1,
        },
      },
      process.stderr,
    );
    process.exitCode = 1;
  }
}
