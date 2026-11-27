import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppServerTurnUsage } from '../src/executors/codex/app-server-usage.ts';

function breakdown(inputTokens: number, outputTokens: number, cachedInputTokens = 0, reasoningOutputTokens = 0) {
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, cachedInputTokens, reasoningOutputTokens };
}

test('resumed turns exclude previous usage and count repeated updates once', () => {
  const observe = createAppServerTurnUsage();
  const first = { total: breakdown(15, 10, 5, 3), last: breakdown(5, 3, 2, 1) };
  assert.deepEqual(observe(first), {
    input_tokens: 5, output_tokens: 3, cached_input_tokens: 2, reasoning_output_tokens: 1, total_tokens: 8,
  });
  assert.equal(observe(first), null);
  assert.equal(observe({ total: {}, last: first.last }), null);
  const second = { total: breakdown(20, 13, 7, 4), last: first.last };
  assert.deepEqual(observe(second), {
    input_tokens: 10, output_tokens: 6, cached_input_tokens: 4, reasoning_output_tokens: 2, total_tokens: 16,
  });
  assert.equal(observe(second), null);
  const afterReset = breakdown(3, 2);
  assert.deepEqual(observe({ total: afterReset, last: afterReset }), {
    input_tokens: 13, output_tokens: 8, cached_input_tokens: 4, reasoning_output_tokens: 2, total_tokens: 21,
  });
});
