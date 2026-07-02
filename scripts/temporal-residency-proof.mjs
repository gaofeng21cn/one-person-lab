#!/usr/bin/env node
import { runTemporalResidencyProof } from '../src/modules/runway/family-runtime-temporal-residency-proof.ts';
import { runTemporalProductionResidencyProof } from '../src/modules/runway/family-runtime-temporal-provider.ts';
import { resolveOplStatePaths } from '../src/modules/runway/runtime-state-paths.ts';

const production = process.argv.includes('--production');
const stateDir = resolveOplStatePaths().state_dir;

const paths = {
  root: `${stateDir}/family-runtime`,
};

(production ? runTemporalProductionResidencyProof(paths) : runTemporalResidencyProof())
  .then((proof) => {
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
