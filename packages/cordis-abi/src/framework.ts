export const CORDIS_FRAMEWORK_PACKAGE = '@deepseek-ai/cordis';
export const CORDIS_FRAMEWORK_VERSION = '4.0.5';
export const CORDIS_FRAMEWORK_INTEGRITY =
  'sha512-Sktq5axy0owk9PdnivBRNOJjHEVEibCt0+TDDZcv0+UH2KS1M910fX4kn5y45YFsrpZIi1mJf/1s5VzywMUnyg==';

// Cordis exposes fiber.state, while its const enum is erased from ESM output.
export const CORDIS_FIBER_STATE = {
  PENDING: 0,
  ACTIVE: 2,
} as const;

export const CORDIS_ABI_PACKAGE_REF = Object.freeze({
  package_id: '@one-person-lab/cordis-abi',
  package_version: '0.1.0',
  package_ref: 'npm:@one-person-lab/cordis-abi@0.1.0',
});
