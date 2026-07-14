import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const pidFile = process.env.OPL_TEST_LANE_ORPHAN_PID_FILE;
if (!pidFile) {
  throw new Error('Process-group cleanup probe requires a PID capture path.');
}

const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], {
  stdio: 'ignore',
});
child.unref();
fs.writeFileSync(pidFile, `${child.pid}\n`);

test('intentional failure leaves process-group cleanup to the lane runner', () => {
  assert.fail('intentional process-group cleanup probe failure');
});
