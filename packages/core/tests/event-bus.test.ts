import assert from 'node:assert/strict';
import test from 'node:test';

import { EventBus } from '../src/index.ts';

type TestEvents = {
  ping: { seq: number };
  done: string;
};

test('EventBus on, once, off, and unsubscribe work deterministically', () => {
  const bus = new EventBus<TestEvents>();
  const seen: number[] = [];
  const onceSeen: string[] = [];

  const offPing = bus.on('ping', (p) => {
    seen.push(p.seq);
  });
  bus.once('done', (msg) => {
    onceSeen.push(msg);
  });

  assert.equal(bus.listenerCount('ping'), 1);
  assert.equal(bus.listenerCount(), 2);

  bus.emit('ping', { seq: 1 });
  bus.emit('done', 'first');
  bus.emit('done', 'second');
  offPing();
  bus.emit('ping', { seq: 2 });

  assert.deepEqual(seen, [1]);
  assert.deepEqual(onceSeen, ['first']);
  assert.equal(bus.listenerCount(), 0);
});

test('EventBus isolates listener errors and snapshots listeners before iteration', async () => {
  const errors: Array<{ event: keyof TestEvents; msg: string }> = [];
  const bus = new EventBus<TestEvents>({
    onError: (event, err) => {
      errors.push({ event, msg: err instanceof Error ? err.message : String(err) });
    },
  });

  const order: string[] = [];
  let unsubSelf: () => void = () => {};
  unsubSelf = bus.on('ping', () => {
    order.push('first');
    unsubSelf();
    throw new Error('boom-sync');
  });
  bus.on('ping', () => {
    order.push('second');
  });

  bus.emit('ping', { seq: 42 });
  assert.deepEqual(order, ['first', 'second']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.msg, 'boom-sync');

  bus.clear();
  bus.on('done', async () => {
    order.push('async-fail');
    throw new Error('boom-async');
  });
  bus.on('done', async (val) => {
    order.push(`async-ok:${val}`);
  });

  await bus.emitAsync('done', 'ok');
  assert.deepEqual(order, ['first', 'second', 'async-fail', 'async-ok:ok']);
  assert.equal(errors.length, 2);
  assert.equal(errors[1]?.msg, 'boom-async');
});
