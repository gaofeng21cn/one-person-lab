export type CliOutputStream = Pick<NodeJS.WriteStream, 'write'>;

export function printJson(payload: unknown, stream: CliOutputStream = process.stdout) {
  stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}
