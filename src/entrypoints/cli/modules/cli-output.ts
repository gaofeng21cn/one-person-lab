export function printJson(payload: unknown, stream: NodeJS.WriteStream = process.stdout) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}
