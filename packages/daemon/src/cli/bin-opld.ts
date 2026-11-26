import { runDaemonForeground } from '../daemon.ts';

const code = await runDaemonForeground();
process.exit(code);
