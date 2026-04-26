import { buildNativeHelperDoctor } from './native-helper-runtime.ts';

const NATIVE_HELPERS = [
  { helper_id: 'opl-sysprobe', binary: 'opl-sysprobe' },
  { helper_id: 'opl-doctor-native', binary: 'opl-doctor-native' },
  { helper_id: 'opl-runtime-watch', binary: 'opl-runtime-watch' },
  { helper_id: 'opl-artifact-indexer', binary: 'opl-artifact-indexer' },
  { helper_id: 'opl-state-indexer', binary: 'opl-state-indexer' },
] as const;

const output = buildNativeHelperDoctor(NATIVE_HELPERS);

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
