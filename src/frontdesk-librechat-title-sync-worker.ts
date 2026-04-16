async function writeAndExit(stream: NodeJS.WriteStream, content: string, code: number) {
  await new Promise<void>((resolve, reject) => {
    stream.write(content, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  process.exit(code);
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`limit must be a positive integer, got: ${value}`);
  }

  return parsed;
}

function readLimitFromArgv(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--limit') {
      return parsePositiveInteger(argv[index + 1], 3);
    }
  }

  return 3;
}

async function main() {
  const [{ readFrontDeskLibreChatTitleSyncConfig, syncFrontDeskLibreChatConversationTitles }] = await Promise.all([
    import('./frontdesk-librechat-title-sync.ts'),
  ]);

  const limit = readLimitFromArgv(process.argv.slice(2));
  const config = readFrontDeskLibreChatTitleSyncConfig();
  const summary = await syncFrontDeskLibreChatConversationTitles(config, { limit });
  await writeAndExit(process.stdout, `${JSON.stringify(summary)}\n`, 0);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown LibreChat title sync worker failure.';
  void writeAndExit(process.stderr, `${message}\n`, 1).catch(() => {
    process.exit(1);
  });
});
