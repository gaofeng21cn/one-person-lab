import {
  assert,
  runCliFailure,
  test,
} from '../helpers.ts';

const retiredProductApiCommands = [
  {
    args: ['web'],
    command: 'web',
    replacement: /OPL GUI \/ AionUI WebUI path/,
  },
  {
    args: ['mcp-stdio'],
    command: 'mcp-stdio',
    replacement: /OPL GUI \/ AionUI WebUI path/,
  },
];

for (const { args, command, replacement } of retiredProductApiCommands) {
  test(`opl ${command} is a retired Product API surface and fails closed`, () => {
    const { status, payload } = runCliFailure(args);

    assert.equal(status, 2);
    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'cli_usage_error');
    assert.equal(payload.error.details.command, command);
    assert.equal(payload.error.details.retired, true);
    assert.match(payload.error.message, new RegExp(`Command "${command}" has been retired`));
    assert.match(payload.error.message, replacement);
  });
}
