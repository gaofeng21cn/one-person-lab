#!/usr/bin/env node
import { runTemporalResidencyProof } from '../src/family-runtime-temporal-residency-proof.ts';
import { runTemporalProductionResidencyProof } from '../src/family-runtime-temporal-provider.ts';

const production = process.argv.includes('--production');

const paths = {
  root: `${process.env.OPL_STATE_DIR?.trim() || `${process.cwd()}/.opl-state`}/family-runtime`,
};

(production ? runTemporalProductionResidencyProof(paths) : runTemporalResidencyProof())
  .then((proof) => {
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
