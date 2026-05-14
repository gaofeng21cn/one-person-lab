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
    retired: false,
  },
  {
    args: [['mcp', 'stdio'].join('-')],
    command: ['mcp', 'stdio'].join('-'),
    errorCode: 'unknown_command',
    retired: false,
  },
];

for (const { args, command, errorCode, retired } of removedProductApiCommands) {
  test(`opl ${command} is removed and fails closed`, () => {
    const { status, payload } = runCliFailure(args);

    assert.equal(status, 2);
    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, errorCode);
    assert.equal(payload.error.details.command, command);
    assert.equal(Boolean(payload.error.details.retired), retired);
  });
}
