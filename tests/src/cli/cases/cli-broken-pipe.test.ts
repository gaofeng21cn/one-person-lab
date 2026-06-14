import { EventEmitter } from 'node:events';

import { assert, test } from '../helpers.ts';
import { installBrokenPipeExitHandler, isBrokenPipeError } from '../../../../src/cli/broken-pipe.ts';

class FakePipeStream extends EventEmitter {
  destroyed = false;

  destroy() {
    this.destroyed = true;
    return this;
  }
}

test('CLI broken-pipe handler exits cleanly on EPIPE without throwing', () => {
  const stream = new FakePipeStream();
  const exits: number[] = [];

  installBrokenPipeExitHandler(stream, (code) => {
    exits.push(code);
  });

  stream.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));

  assert.deepEqual(exits, [0]);
  assert.equal(stream.destroyed, true);
});

test('CLI broken-pipe classifier does not hide non-pipe errors', () => {
  assert.equal(isBrokenPipeError(Object.assign(new Error('boom'), { code: 'ECONNRESET' })), false);
});
