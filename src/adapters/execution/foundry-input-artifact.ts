import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

// CAS storage is run-independent; provider transport belongs to one canonical work item.
export function writeFoundryInputArtifact(input: {
  transportRoot: string;
  bytes: Buffer;
  extension: 'blob' | 'json';
}) {
  const root = path.resolve(input.transportRoot);
  if (fs.realpathSync.native(root) !== root || !fs.lstatSync(root).isDirectory()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Foundry input transport root must be canonical and physical.');
  }
  const directory = path.join(root, 'provider-inputs');
  fs.mkdirSync(directory, { recursive: true });
  if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()
    || fs.realpathSync.native(directory) !== directory) {
    throw new FrameworkContractError('contract_shape_invalid', 'Foundry input artifact directory must be physical.');
  }
  const sha256 = crypto.createHash('sha256').update(input.bytes).digest('hex');
  const file = path.join(directory, `${sha256}.${input.extension}`);
  if (!fs.existsSync(file)) {
    try {
      fs.writeFileSync(file, input.bytes, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync.native(file) !== file
    || !fs.readFileSync(file).equals(input.bytes)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Foundry input artifact content address is occupied by invalid bytes.');
  }
  return { ref: pathToFileURL(file).href, sha256 };
}
