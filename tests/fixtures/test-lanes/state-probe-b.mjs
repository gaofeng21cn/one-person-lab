import fs from 'node:fs';

const captureFile = process.env.OPL_TEST_BATCH_STATE_CAPTURE_FILE;
if (!captureFile || !process.env.OPL_STATE_DIR) {
  throw new Error('Batch state isolation probe requires capture and state paths.');
}
fs.appendFileSync(captureFile, `${process.env.OPL_STATE_DIR}\n`);
