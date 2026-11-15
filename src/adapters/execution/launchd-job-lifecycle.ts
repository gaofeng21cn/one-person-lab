type LaunchctlReadback = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
};

/** A successful bootout acknowledges the request; launchd may still be draining the job. */
export async function waitForLaunchdJobUnload(input: {
  target: string;
  runLaunchctl: (args: string[]) => LaunchctlReadback;
  timeoutMs?: number;
  pollMs?: number;
  monotonicNowMs?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}) {
  const now = input.monotonicNowMs ?? (() => performance.now());
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + (input.timeoutMs ?? 5_000);
  while (true) {
    const observation = input.runLaunchctl(['print', input.target]);
    if (!observation.ok) {
      // Keep transport or permission failures distinct from the native absent-job response.
      return observation.status === 113 || /could not find service/i.test(observation.stderr);
    }
    if (now() >= deadline) return false;
    await sleep(Math.min(input.pollMs ?? 100, Math.max(0, deadline - now())));
  }
}
