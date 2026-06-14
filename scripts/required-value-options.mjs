export function parseRequiredValueOptions(argv, handlers) {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${token}`);
    }
    const handler = Object.hasOwn(handlers, token) ? handlers[token] : null;
    if (typeof handler !== 'function') {
      throw new Error(`Unknown argument: ${token}`);
    }
    handler(value);
    index += 1;
  }
}
