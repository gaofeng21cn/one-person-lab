import { parseArgs as parseNodeArgs } from 'node:util';

export function parseRequiredValueOptions(argv, handlers) {
  const options = Object.fromEntries(
    Object.keys(handlers).map((flag) => [
      flag.replace(/^--/, ''),
      {
        type: 'string',
      },
    ]),
  );
  const { values } = parseNodeArgs({
    args: argv,
    options,
    strict: true,
    allowPositionals: false,
  });

  for (const [name, value] of Object.entries(values)) {
    const handler = handlers[`--${name}`];
    if (typeof handler === 'function' && typeof value === 'string') {
      handler(value);
    }
  }
}
