import { DEFAULT_NATIVE_HELPERS, buildNativeHelperDoctor } from './native-helper-runtime.ts';

const output = buildNativeHelperDoctor(DEFAULT_NATIVE_HELPERS);

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
