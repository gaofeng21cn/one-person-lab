import { execFileSync } from 'node:child_process';

import { assert, createGitModuleRemoteFixture, fs, os, parseJsonText, path, repoRoot, runCli, test } from '../../helpers.ts';
import { canonicalAgentPackageId } from '../../../../../src/modules/connect/agent-package-identity.ts';
import { normalizeFirstPartyAgentPackageManifest } from '../../../../../src/modules/connect/agent-package-manifests.ts';


export { assert, canonicalAgentPackageId, createGitModuleRemoteFixture, execFileSync, fs, normalizeFirstPartyAgentPackageManifest, os, parseJsonText, path, repoRoot, runCli, test };
