import {
  assert,
  runCliFailure,
  test,
} from '../helpers.ts';

const removedProductApiCommands = [
  {
    args: ['web'],
    command: 'web',
  },
  {
    args: [['mcp', 'stdio'].join('-')],
    command: ['mcp', 'stdio'].join('-'),
  },
];

for (const { args, command } of removedProductApiCommands) {
  test(`opl ${command} is removed and fails closed`, () => {
    const { status, payload } = runCliFailure(args);

    assert.equal(status, 2);
    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'unknown_command');
    assert.equal(payload.error.details.command, command);
  });
}
