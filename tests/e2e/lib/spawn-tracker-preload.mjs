import { ChildProcess } from "node:child_process";
import fs from "node:fs";

const INSTALLED_SYM = Symbol.for("opl.e2e.spawnTrackerInstalled");

if (!ChildProcess.prototype[INSTALLED_SYM]) {
  Object.defineProperty(ChildProcess.prototype, INSTALLED_SYM, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  const origSpawn = ChildProcess.prototype.spawn;
  ChildProcess.prototype.spawn = function trackedSpawn(...args) {
    const ret = origSpawn.apply(this, args);
    const pid = this?.pid;
    const logPath = process.env.OPL_E2E_SPAWN_LOG;
    if (logPath && Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
      const opts = args[0] && typeof args[0] === "object" ? args[0] : {};
      try {
        fs.appendFileSync(
          logPath,
          JSON.stringify({
            pid,
            ppid: process.pid,
            detached: Boolean(opts.detached),
            file: typeof opts.file === "string" ? opts.file : "",
          }) + "\n",
          "utf8"
        );
      } catch {
        // Ignore logging errors to avoid interfering with test child behavior
      }
    }
    return ret;
  };
}
