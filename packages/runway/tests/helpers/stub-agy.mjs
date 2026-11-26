#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const logFile = process.env.OPL_STUB_AGY_LOG;
const mode = process.env.OPL_STUB_AGY_MODE || 'normal';
const convId = process.env.OPL_STUB_AGY_CONV_ID || `ag-conv-${process.pid}`;

function appendLog(entry) {
  if (!logFile) return;
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
}

if (args[0] === '--version') {
  process.stdout.write('1.5.17\n');
  process.exit(0);
}

if (args[0] === 'models') {
  process.stdout.write([
    'Fetching available models...',
    'gemini-4-neon-xhigh\tGemini 4 Neon (XHigh)',
    'gemini-4-neon-high\tGemini 4 Neon (High)',
    'gemini-4-neon-medium\tGemini 4 Neon (Medium)',
    'gemini-4-neon-low\tGemini 4 Neon (Low)',
    'claude-opus-5-5-high\tClaude Opus 5.5 (High)',
  ].join('\n') + '\n');
  process.exit(0);
}

const settingsIdx = args.indexOf('--settings');
let settingsSnapshot = null;
if (settingsIdx !== -1 && args[settingsIdx + 1]) {
  const settingsPath = args[settingsIdx + 1];
  try {
    settingsSnapshot = {
      path: settingsPath,
      content: JSON.parse(fs.readFileSync(settingsPath, 'utf8')),
    };
  } catch {
    settingsSnapshot = { path: settingsPath, error: 'unreadable' };
  }
}

appendLog({
  kind: 'print',
  argv: args,
  cwd: process.cwd(),
  settingsSnapshot,
});

if (mode === 'hang_ignore_sigterm') {
  process.on('SIGTERM', () => {
    // Ignore SIGTERM to verify SIGKILL escalation
  });
  process.stdout.write(`${JSON.stringify({ type: 'system', conversation_id: convId })}\n`);
  setInterval(() => {}, 1000);
} else if (mode === 'failed') {
  process.stdout.write(`${JSON.stringify({ type: 'system', conversation_id: convId })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'error', message: 'Simulated agy failure' })}\n`);
  process.exit(1);
} else if (mode === 'human_gate') {
  process.stdout.write(`${JSON.stringify({ type: 'system', conversation_id: convId })}\n`);
  process.stdout.write(`${JSON.stringify({
    type: 'human_gate_requested',
    question: 'Approve deployment of generated study protocol?',
    options: ['approve', 'reject'],
  })}\n`);
  process.stdout.write(`${JSON.stringify({
    type: 'result',
    status: 'success',
    result: 'Awaiting human approval',
    usage: { input_tokens: 150, output_tokens: 40, cached_tokens: 10 },
  })}\n`);
  process.exit(0);
} else {
  const isPlanMode = args.includes('--mode') && args[args.indexOf('--mode') + 1] === 'plan';
  const prompt = args[args.length - 1] || '';

  if (process.env.OPL_STUB_ARTIFACT_REL && !isPlanMode) {
    const target = path.join(process.cwd(), process.env.OPL_STUB_ARTIFACT_REL);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, process.env.OPL_STUB_ARTIFACT_CONTENT || '# Study Plan\n- Primary outcome: MACE\n');
    process.stdout.write(`${JSON.stringify({ type: 'artifact_observed', path: process.env.OPL_STUB_ARTIFACT_REL })}\n`);
  }

  process.stdout.write(`${JSON.stringify({ type: 'system', conversation_id: convId })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'tool_use', name: 'read_workspace', status: 'started' })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'tool_result', name: 'read_workspace' })}\n`);
  process.stdout.write(`${JSON.stringify({
    type: 'assistant',
    delta: `Agy stub (${isPlanMode ? 'plan' : 'exec'}) processed: ${prompt.slice(0, 100)}`,
  })}\n`);
  process.stdout.write(`${JSON.stringify({
    type: 'result',
    status: 'success',
    conversation_id: convId,
    result: `Agy stub (${isPlanMode ? 'plan' : 'exec'}) completed`,
    usage: { input_tokens: 320, output_tokens: 110, cached_tokens: 50 },
  })}\n`);
  process.exit(0);
}
