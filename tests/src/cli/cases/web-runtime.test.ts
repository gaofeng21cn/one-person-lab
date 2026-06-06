import {
  assert,
  runCliFailure,
  test,
} from '../helpers.ts';

const removedProductApiCommands = [
  {
    args: ['web'],
    command: 'web',
    errorCode: 'unknown_command',
  },
  {
    args: [['mcp', 'stdio'].join('-')],
    command: ['mcp', 'stdio'].join('-'),
    errorCode: 'unknown_command',
  },
];

for (const { args, command, errorCode } of removedProductApiCommands) {
  test(`opl ${command} is retired from active Product API commands and fails closed`, () => {
    const { status, payload } = runCliFailure(args);

    assert.equal(status, 2);
    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, errorCode);
    assert.equal(payload.error.details.command, command);
    assert.equal('retired' in payload.error.details, false);
    assert.equal('commands' in payload.error.details, false);
  });
}
