import fs from 'node:fs';

const captureFile = process.env.OPL_TEST_BATCH_STATE_CAPTURE_FILE;
if (!captureFile || !process.env.OPL_STATE_DIR) {
  throw new Error('Batch state isolation probe requires capture and state paths.');
}
fs.mkdirSync(process.env.OPL_STATE_DIR, { recursive: true });
fs.writeFileSync(
  `${process.env.OPL_STATE_DIR}/workspace-registry.json`,
  '{"version":"g2","bindings":[]}\n',
);
fs.appendFileSync(captureFile, `${process.env.OPL_STATE_DIR}\n`);
