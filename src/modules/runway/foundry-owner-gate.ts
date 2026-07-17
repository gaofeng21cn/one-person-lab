import { spawn } from 'node:child_process';

import { canonicalJsonBytes } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  FailClosedOwnerGate,
  type OwnerGate,
  type OwnerGateVerification,
  type OwnerGateVerificationContext,
} from '../foundry/index.ts';

const DEFAULT_OWNER_GATE_TIMEOUT_MS = 30_000;
const MAX_OWNER_GATE_OUTPUT_BYTES = 1024 * 1024;

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function configuredTimeout() {
  const value = Number(process.env.OPL_FOUNDRY_OWNER_GATE_TIMEOUT_MS);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_OWNER_GATE_TIMEOUT_MS;
}

function configuredArgs() {
  const raw = process.env.OPL_FOUNDRY_OWNER_GATE_ARGS?.trim();
  if (!raw) return [];
  const parsed = parseJsonText(raw);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    fail('OPL_FOUNDRY_OWNER_GATE_ARGS must be a JSON array of strings.');
  }
  return parsed as string[];
}

async function execute(input: {
  executable: string;
  args: string[];
  stdin: Buffer;
  timeoutMs: number;
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(input.executable, input.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(Buffer.concat(stdout));
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Foundry OwnerGate verifier timed out.'));
    }, input.timeoutMs);
    child.on('error', (error) => finish(error));
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OWNER_GATE_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finish(new Error('Foundry OwnerGate verifier exceeded its output limit.'));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= 64 * 1024) return;
      const accepted = chunk.subarray(0, 64 * 1024 - stderrBytes);
      stderr.push(accepted);
      stderrBytes += accepted.length;
    });
    child.on('close', (code, signal) => {
      if (code !== 0) {
        finish(new Error(
          `Foundry OwnerGate verifier exited ${String(code)} (${String(signal)}): ${Buffer.concat(stderr).toString('utf8').slice(-4000)}`,
        ));
        return;
      }
      finish();
    });
    child.stdin.end(input.stdin);
  });
}

export class ProcessFoundryOwnerGate implements OwnerGate {
  readonly #executable: string;
  readonly #args: string[];
  readonly #timeoutMs: number;

  constructor(input: { executable: string; args?: string[]; timeout_ms?: number }) {
    if (!input.executable.trim()) fail('Foundry OwnerGate executable must not be empty.');
    this.#executable = input.executable;
    this.#args = input.args ?? [];
    this.#timeoutMs = input.timeout_ms ?? configuredTimeout();
  }

  async verify(input: OwnerGateVerificationContext): Promise<OwnerGateVerification> {
    let output: Buffer;
    try {
      output = await execute({
        executable: this.#executable,
        args: this.#args,
        timeoutMs: this.#timeoutMs,
        stdin: canonicalJsonBytes({
          surface_kind: 'opl_foundry_owner_gate_process_request',
          version: 'opl-foundry-owner-gate-process-request.v1',
          context: input,
        }),
      });
    } catch (error) {
      fail('Foundry OwnerGate verifier process failed closed.', {
        failure_code: 'foundry_owner_gate_verifier_process_failed',
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      return parseJsonText(output.toString('utf8')) as OwnerGateVerification;
    } catch (error) {
      fail('Foundry OwnerGate verifier returned invalid JSON.', {
        failure_code: 'foundry_owner_gate_verifier_invalid_json',
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function configuredFoundryOwnerGate(): OwnerGate {
  const executable = process.env.OPL_FOUNDRY_OWNER_GATE_BIN?.trim();
  return executable
    ? new ProcessFoundryOwnerGate({ executable, args: configuredArgs() })
    : new FailClosedOwnerGate(
        'Foundry OwnerGate is unconfigured; set OPL_FOUNDRY_OWNER_GATE_BIN to a trusted verifier executable.',
      );
}
