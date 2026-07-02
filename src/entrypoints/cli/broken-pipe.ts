import type { EventEmitter } from 'node:events';

type PipeLikeStream = EventEmitter & {
  destroy?: () => unknown;
};

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as NodeJS.ErrnoException).code)
    : null;
}

function isBrokenPipeError(error: unknown) {
  return errorCode(error) === 'EPIPE';
}

function installBrokenPipeExitHandler(
  stream: PipeLikeStream,
  exit: (code: number) => never | void = process.exit,
) {
  stream.on('error', (error: unknown) => {
    if (!isBrokenPipeError(error)) {
      throw error;
    }
    stream.destroy?.();
    exit(0);
  });
}

export function installCliBrokenPipeExitHandlers() {
  installBrokenPipeExitHandler(process.stdout);
  installBrokenPipeExitHandler(process.stderr);
}
