import { runCli } from './main.ts';

function flushStream(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    if (!stream || stream.destroyed || !stream.writable) {
      resolve();
      return;
    }
    const onError = () => {
      stream.off('error', onError);
      resolve();
    };
    stream.once('error', onError);
    stream.write('', () => {
      stream.off('error', onError);
      resolve();
    });
  });
}

const code = await runCli(process.argv.slice(2));
await Promise.all([flushStream(process.stdout), flushStream(process.stderr)]);
process.exit(code);
