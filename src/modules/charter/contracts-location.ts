import fs from 'node:fs';
import path from 'node:path';

import type { ContractsRootSource, FrameworkContractsLoadOptions } from '../../kernel/types.ts';
import { FrameworkContractError, type ErrorCode } from '../../kernel/contract-validation.ts';
import { REQUIRED_CONTRACT_FILE_NAMES } from './contracts-manifest.ts';

type NormalizedFrameworkContractsLoadOptions = {
  searchFrom: string | null;
  contractsDir: string | null;
  source: ContractsRootSource;
};

type ResolvedContractsLocation = {
  contractsDir: string;
  source: ContractsRootSource;
};

export const CONTRACT_LOAD_ERROR_CODES = new Set<ErrorCode>([
  'contract_file_missing',
  'contract_json_invalid',
  'contract_shape_invalid',
]);

function hasRequiredContractFiles(rootPath: string): boolean {
  return REQUIRED_CONTRACT_FILE_NAMES.every((fileName) =>
    fs.existsSync(path.join(rootPath, fileName)),
  );
}

function hasAnyRequiredContractFile(rootPath: string): boolean {
  return REQUIRED_CONTRACT_FILE_NAMES.some((fileName) =>
    fs.existsSync(path.join(rootPath, fileName)),
  );
}

function describeContractsRootSource(source: ContractsRootSource): string {
  switch (source) {
    case 'cli_flag':
      return 'CLI flag --contracts-dir';
    case 'env':
      return 'environment variable OPL_CONTRACTS_DIR';
    case 'api':
      return 'API contractsDir option';
    case 'cwd':
      return 'current working directory search root';
    case 'cli_entry':
      return 'active OPL CLI entrypoint';
  }
}

function requireNonEmptyPath(
  value: string | undefined,
  source: ContractsRootSource,
  detailKey: 'contracts_dir' | 'search_from',
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `${describeContractsRootSource(source)} must be a non-empty path.`,
      {
        source,
        [detailKey]: value ?? null,
      },
    );
  }

  return value;
}

function resolveContractsDirFromSearchRoot(rootPath: string): string {
  const searchRoot = path.resolve(rootPath);

  if (hasRequiredContractFiles(searchRoot)) {
    return searchRoot;
  }

  return path.join(searchRoot, 'contracts', 'opl-framework');
}

function resolveContractsDirFromCliEntrypoint(): string | null {
  const cliEntry = process.argv[1];
  if (!cliEntry) {
    return null;
  }

  let cursor = path.dirname(fs.realpathSync.native(cliEntry));
  while (true) {
    const contractsRoot = path.join(cursor, 'contracts', 'opl-framework');
    if (hasRequiredContractFiles(contractsRoot)) {
      return contractsRoot;
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return null;
    }
    cursor = parent;
  }
}

function resolveExplicitContractsDir(
  contractsDir: string,
  source: ContractsRootSource,
): string {
  const resolvedDir = path.resolve(contractsDir);

  for (const fileName of REQUIRED_CONTRACT_FILE_NAMES) {
    const filePath = path.join(resolvedDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new FrameworkContractError(
        'contract_file_missing',
        `Explicit contracts directory is missing required contract file: ${fileName}.`,
        {
          contracts_dir: resolvedDir,
          file: filePath,
          contracts_root_source: source,
        },
      );
    }
  }

  return resolvedDir;
}

function normalizeLoadOptions(
  input?: string | FrameworkContractsLoadOptions,
): NormalizedFrameworkContractsLoadOptions {
  if (typeof input === 'string') {
    return {
      searchFrom: requireNonEmptyPath(input, 'api', 'search_from'),
      contractsDir: null,
      source: 'api',
    };
  }

  if (input && Object.hasOwn(input, 'contractsDir')) {
    return {
      searchFrom: null,
      contractsDir: requireNonEmptyPath(input.contractsDir, input.source ?? 'api', 'contracts_dir'),
      source: input.source ?? 'api',
    };
  }

  if (input && Object.hasOwn(input, 'searchFrom')) {
    return {
      searchFrom: requireNonEmptyPath(input.searchFrom, input.source ?? 'api', 'search_from'),
      contractsDir: null,
      source: input.source ?? 'api',
    };
  }

  if (Object.hasOwn(process.env, 'OPL_CONTRACTS_DIR')) {
    return {
      searchFrom: null,
      contractsDir: requireNonEmptyPath(
        process.env.OPL_CONTRACTS_DIR,
        'env',
        'contracts_dir',
      ),
      source: 'env',
    };
  }

  return {
    searchFrom: process.cwd(),
    contractsDir: null,
    source: 'cwd',
  };
}

export function resolveContractsLocation(
  input?: string | FrameworkContractsLoadOptions,
): ResolvedContractsLocation {
  const options = normalizeLoadOptions(input);

  if (options.contractsDir !== null) {
    return {
      contractsDir: resolveExplicitContractsDir(options.contractsDir, options.source),
      source: options.source,
    };
  }

  if (options.searchFrom === null) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Contract root resolution requires either an explicit contracts directory or a search root.',
      { source: options.source },
    );
  }

  if (options.source === 'cwd') {
    const cwdSearchRoot = path.resolve(options.searchFrom);
    const cwdContractsDir = resolveContractsDirFromSearchRoot(cwdSearchRoot);
    if (
      hasRequiredContractFiles(cwdSearchRoot)
      || hasRequiredContractFiles(cwdContractsDir)
      || hasAnyRequiredContractFile(cwdContractsDir)
    ) {
      return {
        contractsDir: cwdContractsDir,
        source: options.source,
      };
    }

    const cliEntrypointContractsDir = resolveContractsDirFromCliEntrypoint();
    if (cliEntrypointContractsDir) {
      return {
        contractsDir: cliEntrypointContractsDir,
        source: 'cli_entry',
      };
    }
  }

  return {
    contractsDir: resolveContractsDirFromSearchRoot(options.searchFrom),
    source: options.source,
  };
}

export function enrichContractLoadError(
  error: FrameworkContractError,
  location: ResolvedContractsLocation,
): FrameworkContractError {
  const rawDetails = error.details ?? {};
  const {
    source: legacySource,
    contracts_root_source: existingContractsRootSource,
    contracts_dir: existingContractsDir,
    ...details
  } = rawDetails;

  return new FrameworkContractError(
    error.code,
    error.message,
    {
      ...details,
      contracts_dir:
        typeof existingContractsDir === 'string'
          ? existingContractsDir
          : location.contractsDir,
      contracts_root_source:
        typeof existingContractsRootSource === 'string'
          ? existingContractsRootSource
          : typeof legacySource === 'string'
            ? legacySource
            : location.source,
    },
    error.exitCode,
  );
}
