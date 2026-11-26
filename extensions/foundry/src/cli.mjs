import path from 'node:path';
import { comparePackages, evaluatePackage } from './eval.mjs';
import { promotePackage, rollbackPackage } from './registry.mjs';
import { initPackage } from './scaffold.mjs';
import { validatePackage } from './validate.mjs';

const SUBCOMMAND_HELP = {
  init: 'Usage: opl foundry init <dir> --id <kebab-id> [--intent <agent|app|extension|channel>] [--pkg-version <semver>] [--publisher <name>] [--force]',
  validate: 'Usage: opl foundry validate <dir>',
  eval: 'Usage: opl foundry eval <dir> [--suite <path>] [--target-agent-id <id>] [--target-domain-id <id>] [--run-id <id>] [--state-dir <dir>]',
  compare: 'Usage: opl foundry compare --baseline <dir> --candidate <dir> [--regression-tolerance <num>] [--state-dir <dir>]',
  promote: 'Usage: opl foundry promote <targetAgentId> --run-id <runId> [--pkg-version <semver>] [--expected-revision <n>] [--authority-receipt-ref <ref>] [--state-dir <dir>]',
  rollback: 'Usage: opl foundry rollback <targetAgentId> [--to-version <ver> | --version-digest <sha256:...>] --authority-receipt-ref <ref> [--expected-revision <n>] [--reason <text>] [--state-dir <dir>]',
};

const BOOLEAN_FLAGS = new Set(['force', 'help', 'json']);

function mergeArgsAndOptions(rawArgs = [], rawOptions = {}) {
  const positionals = [];
  const opts = { ...rawOptions };

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = String(rawArgs[i]);
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        const key = arg.slice(2, eq);
        const val = arg.slice(eq + 1);
        opts[key] = BOOLEAN_FLAGS.has(key) ? val === 'true' : val;
      } else {
        const key = arg.slice(2);
        if (BOOLEAN_FLAGS.has(key)) {
          opts[key] = true;
        } else if (i + 1 < rawArgs.length && !String(rawArgs[i + 1]).startsWith('--')) {
          opts[key] = rawArgs[++i];
        } else {
          opts[key] = true;
        }
      }
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, opts };
}

function optStr(opts, ...keys) {
  for (const key of keys) {
    const val = opts[key];
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  }
  return undefined;
}

export function registerFoundryCli(context = {}) {
  const baseCwd = typeof context?.caller_cwd === 'string' && context.caller_cwd.trim().length > 0
    ? path.resolve(context.caller_cwd.trim())
    : process.cwd();
  const resolveFromCaller = (rawPath) => (
    typeof rawPath === 'string' && rawPath.trim().length > 0
      ? path.resolve(baseCwd, rawPath.trim())
      : undefined
  );

  return {
    namespace: 'foundry',
    description: 'OPL Foundry — package scaffolding, validation, evaluation, comparison, promotion, and rollback.',
    commands: ['init', 'validate', 'eval', 'compare', 'promote', 'rollback'],
    handlers: {
      init: (rawArgs = [], rawOptions = {}) => {
        const { positionals, opts } = mergeArgsAndOptions(rawArgs, rawOptions);
        if (opts.help) return { ok: true, help: SUBCOMMAND_HELP.init };
        const rawDir = positionals[0] ?? optStr(opts, 'dir', 'target');
        return initPackage({
          dir: rawDir ? resolveFromCaller(rawDir) : undefined,
          id: optStr(opts, 'id'),
          intent: optStr(opts, 'intent'),
          version: optStr(opts, 'pkg-version', 'version'),
          publisher: optStr(opts, 'publisher'),
          summaryEn: optStr(opts, 'summary'),
          force: opts.force === true,
        });
      },

      validate: (rawArgs = [], rawOptions = {}) => {
        const { positionals, opts } = mergeArgsAndOptions(rawArgs, rawOptions);
        if (opts.help) return { ok: true, help: SUBCOMMAND_HELP.validate };
        const rawDir = positionals[0] ?? optStr(opts, 'dir', 'target') ?? '.';
        return validatePackage(resolveFromCaller(rawDir));
      },

      eval: (rawArgs = [], rawOptions = {}) => {
        const { positionals, opts } = mergeArgsAndOptions(rawArgs, rawOptions);
        if (opts.help) return { ok: true, help: SUBCOMMAND_HELP.eval };
        const rawDir = positionals[0] ?? optStr(opts, 'dir', 'target') ?? '.';
        const rawSuite = optStr(opts, 'suite');
        const rawStateDir = optStr(opts, 'state-dir');
        return evaluatePackage({
          dir: resolveFromCaller(rawDir),
          suite: rawSuite ? resolveFromCaller(rawSuite) : undefined,
          targetAgentId: optStr(opts, 'target-agent-id'),
          targetDomainId: optStr(opts, 'target-domain-id'),
          runId: optStr(opts, 'run-id'),
          stateDir: rawStateDir ? resolveFromCaller(rawStateDir) : undefined,
        });
      },

      compare: (rawArgs = [], rawOptions = {}) => {
        const { positionals, opts } = mergeArgsAndOptions(rawArgs, rawOptions);
        if (opts.help) return { ok: true, help: SUBCOMMAND_HELP.compare };
        const rawBaseline = optStr(opts, 'baseline') ?? positionals[0];
        const rawCandidate = optStr(opts, 'candidate') ?? positionals[1];
        const rawStateDir = optStr(opts, 'state-dir');
        return comparePackages({
          baseline: rawBaseline ? resolveFromCaller(rawBaseline) : undefined,
          candidate: rawCandidate ? resolveFromCaller(rawCandidate) : undefined,
          regressionTolerance: optStr(opts, 'regression-tolerance'),
          stateDir: rawStateDir ? resolveFromCaller(rawStateDir) : undefined,
        });
      },

      promote: (rawArgs = [], rawOptions = {}) => {
        const { positionals, opts } = mergeArgsAndOptions(rawArgs, rawOptions);
        if (opts.help) return { ok: true, help: SUBCOMMAND_HELP.promote };
        const rawStateDir = optStr(opts, 'state-dir');
        return promotePackage({
          targetAgentId: positionals[0] ?? optStr(opts, 'target-agent-id'),
          runId: optStr(opts, 'run-id'),
          pkgVersion: optStr(opts, 'pkg-version', 'version'),
          expectedRevision: optStr(opts, 'expected-revision'),
          authorityReceiptRef: optStr(opts, 'authority-receipt-ref'),
          stateDir: rawStateDir ? resolveFromCaller(rawStateDir) : undefined,
        });
      },

      rollback: (rawArgs = [], rawOptions = {}) => {
        const { positionals, opts } = mergeArgsAndOptions(rawArgs, rawOptions);
        if (opts.help) return { ok: true, help: SUBCOMMAND_HELP.rollback };
        const rawStateDir = optStr(opts, 'state-dir');
        return rollbackPackage({
          targetAgentId: positionals[0] ?? optStr(opts, 'target-agent-id'),
          toVersion: optStr(opts, 'to-version'),
          versionDigest: optStr(opts, 'version-digest'),
          expectedRevision: optStr(opts, 'expected-revision'),
          authorityReceiptRef: optStr(opts, 'authority-receipt-ref'),
          reason: optStr(opts, 'reason'),
          stateDir: rawStateDir ? resolveFromCaller(rawStateDir) : undefined,
        });
      },
    },
  };
}
