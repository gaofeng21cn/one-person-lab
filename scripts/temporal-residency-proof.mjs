#!/usr/bin/env node
import { runTemporalResidencyProof } from '../src/family-runtime-temporal-residency-proof.ts';

runTemporalResidencyProof()
  .then((proof) => {
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
