#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { readJsonFile } from './script-json-boundary.mjs';
import { parseRequiredValueOptions } from './required-value-options.mjs';

const CANONICAL_PACKAGE_IDS = ['mas', 'mag', 'rca', 'oma', 'obf', 'mas-scholar-skills', 'opl-flow'];
const PACKAGE_WORKFLOW_TRIGGER_POLICY = 'release_gate_workflow_call_or_manual_dispatch';
const PACKAGE_REMOTE_PUBLISH_STATUS = 'publication_workflow_configured_pending_remote_verification';
const PACKAGE_WORKFLOW_PATH = '.github/workflows/packages.yml';
const PACKAGE_RELEASE_CALLER_WORKFLOW_PATH = '.github/workflows/release-package-channel.yml';
const PACKAGE_DAILY_WORKFLOW_PATH = '.github/workflows/daily-package-channel.yml';

function parseCliOptions(argv) {
  const parsed = { manifest: null, promotionTarget: 'candidate' };
  parseRequiredValueOptions(argv, {
    '--manifest': (value) => {
      parsed.manifest = path.resolve(value);
    },
    '--promotion-target': (value) => {
      parsed.promotionTarget = value.trim();
    },
  });
  if (!parsed.manifest) {
    throw new Error('Usage: package-release-discipline.mjs --manifest <opl-release-manifest.json>');
  }
  if (!['candidate', 'latest-stable'].includes(parsed.promotionTarget)) {
    throw new Error(`Invalid Package promotion target: ${parsed.promotionTarget}`);
  }
  return parsed;
}

function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

function workflowInputBlocks(source, inputName) {
  const pattern = new RegExp(`^      ${inputName}:\\n((?:^        [^\\n]*\\n?)*)`, 'gm');
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function isRequiredStringInput(block) {
  return /^        required: true$/m.test(block)
    && /^        type: string$/m.test(block)
    && !/^        default:/m.test(block);
}

function isSha256(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function isDigest(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isGitSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function isSemVer(value) {
  return typeof value === 'string'
    && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
}

function validatePackageArtifact(packageId, entry, member, failures) {
  assertCondition(entry?.package_id === packageId, `${packageId}: package identity drifted`, failures);
  assertCondition(isSemVer(entry?.package_version), `${packageId}: Package version must be SemVer`, failures);
  assertCondition(entry?.module_id === undefined, `${packageId}: module_id must not be a Package identity field`, failures);
  assertCondition(entry?.repo_name === undefined && entry?.repo_url === undefined, `${packageId}: repo locators must be nested under carrier_locator`, failures);
  assertCondition(entry?.carrier_locator?.carrier_kind === 'opl_managed_module_source', `${packageId}: explicit carrier locator missing`, failures);
  assertCondition(typeof entry?.carrier_locator?.module_id === 'string', `${packageId}: carrier module locator missing`, failures);
  assertCondition(typeof entry?.package_manifest_ref === 'string' && entry.package_manifest_ref.includes(`/packages/${packageId}.json`), `${packageId}: canonical Package manifest ref drifted`, failures);
  assertCondition(typeof entry?.artifact === 'string' && entry.artifact.includes(`one-person-lab-packages/${packageId}:${entry.package_version}`), `${packageId}: canonical OCI ref drifted`, failures);
  assertCondition(entry?.current_install_update_source === 'package_channel', `${packageId}: install/update source must be the Package channel`, failures);
  assertCondition(entry?.package_consumption_status === 'consumed_by_package_channel_installs', `${packageId}: Package consumption status drifted`, failures);
  assertCondition(entry?.remote_publish_status === PACKAGE_REMOTE_PUBLISH_STATUS
    || entry?.remote_publish_status === 'verified_reused_immutable_artifact'
    || entry?.remote_publish_status === 'verified_published_immutable', `${packageId}: remote publication status must remain evidence-based`, failures);
  assertCondition(entry?.release_discipline?.package_truth_owner === entry?.carrier_locator?.repo_name, `${packageId}: Package truth owner must match its owner repo carrier`, failures);
  for (const gate of [
    'sha256_recorded',
    'channel_manifest_written',
    'ghcr_package_artifact_published',
    'immutable_version_remote_digest_preflight',
    'repository_source_association_verified',
    'anonymous_digest_pull_verified',
  ]) {
    assertCondition(entry?.release_discipline?.required_gates?.includes(gate), `${packageId}: missing release gate ${gate}`, failures);
  }
  assertCondition(entry?.install_strategy === 'extract_to_managed_package_root', `${packageId}: Package install strategy uses retired module vocabulary`, failures);
  assertCondition(entry?.homebrew_formula === undefined && entry?.homebrew_cask === undefined, `${packageId}: Packages must not declare Homebrew Formulae or Casks`, failures);
  assertCondition(member?.package_id === packageId, `${packageId}: Release Set member identity drifted`, failures);
  assertCondition(member?.package_version === entry?.package_version, `${packageId}: Release Set SemVer differs from Package artifact`, failures);
  assertCondition(member?.owner_source_commit === entry?.owner_source_commit, `${packageId}: Release Set owner commit differs from Package artifact`, failures);
  assertCondition(member?.oci_artifact_ref === entry?.artifact, `${packageId}: Release Set OCI ref differs from Package artifact`, failures);
  if (entry?.source_archive) {
    assertCondition(isSha256(entry.source_archive.sha256), `${packageId}: source archive SHA-256 is invalid`, failures);
    assertCondition(Number.isFinite(entry.source_archive.size) && entry.source_archive.size > 0, `${packageId}: source archive size is invalid`, failures);
    assertCondition(isGitSha(entry?.source_git?.head_sha), `${packageId}: owner source commit is invalid`, failures);
    assertCondition(entry.owner_source_commit === entry.source_git.head_sha, `${packageId}: owner commit and archived source commit differ`, failures);
  }
}

function validateFrameworkCore(entry, base, failures) {
  assertCondition(isSemVer(entry?.version) && !String(entry?.version).includes('-'), 'framework_core: Base version must be stable SemVer', failures);
  assertCondition(base?.component_id === 'opl-base' && base?.version === entry?.version, 'framework_core: Base BOM identity/version drifted', failures);
  assertCondition(base?.artifact_ref === entry?.artifact, 'framework_core: Base BOM artifact ref drifted', failures);
  assertCondition(entry?.homebrew_formula?.surface_kind === 'opl_homebrew_formula_projection.v1', 'framework_core: Homebrew projection surface kind is invalid', failures);
  assertCondition(entry?.homebrew_formula?.formula_name === 'opl', 'framework_core: Homebrew Formula name must be opl', failures);
  assertCondition(entry?.homebrew_formula?.package_name === 'opl', 'framework_core: Homebrew package name must be opl', failures);
  assertCondition(entry?.homebrew_formula?.carrier_scope === 'framework_core_only', 'framework_core: Homebrew projection must remain Base-only', failures);
  assertCondition(entry?.homebrew_formula?.source_head === entry?.source_git?.head_sha, 'framework_core: Homebrew source head must match source_git', failures);
  assertCondition(entry?.homebrew_formula?.archive_url === `https://github.com/gaofeng21cn/one-person-lab/archive/${entry?.source_git?.head_sha}.tar.gz`, 'framework_core: Homebrew archive URL must be immutable', failures);
  assertCondition(entry?.homebrew_formula?.sha256_source === 'tap_sync_download_and_hash', 'framework_core: Homebrew SHA-256 owner drifted', failures);
}

function validateManifest(manifest, promotionTarget = 'candidate') {
  const failures = [];
  const automation = manifest.release_automation;
  const generation = manifest.release_set_generation;
  const releaseSet = manifest.release_set;
  const packageArtifacts = manifest.packages?.package_artifacts ?? {};
  const packageIds = Object.keys(packageArtifacts).sort();

  assertCondition(/^\d{2}\.\d{1,2}\.\d{1,2}(?:-r[1-9]\d*)?$/.test(generation ?? ''), 'Release Set generation must use YY.M.D or YY.M.D-rN', failures);
  assertCondition(manifest.opl_version === undefined, 'Release Set generation must not be exposed as opl_version', failures);
  assertCondition(releaseSet?.surface_kind === 'opl_release_set.v2', 'Release Set v2 surface kind is missing', failures);
  assertCondition(releaseSet?.generation === generation, 'Release Set generation fields disagree', failures);
  assertCondition(releaseSet?.generation_scheme === 'calver_yy.m.d_optional_revision', 'Release Set generation scheme drifted', failures);
  assertCondition(releaseSet?.catalog_carrier_is_package_identity === false, 'Catalog carrier must not become an eighth Package identity', failures);
  assertCondition(releaseSet?.owner_cohort_lock?.surface_kind === 'opl_package_owner_cohort_lock.v1', 'Release Set must bind an owner cohort lock', failures);
  assertCondition(releaseSet?.owner_cohort_lock?.ref === 'owner-cohort-lock.json', 'Owner cohort lock ref drifted', failures);
  assertCondition(isDigest(releaseSet?.owner_cohort_lock?.digest), 'Owner cohort lock digest is invalid', failures);
  assertCondition(JSON.stringify([...(releaseSet?.owner_cohort_lock?.package_ids ?? [])].sort()) === JSON.stringify([...CANONICAL_PACKAGE_IDS].sort()), 'Owner cohort lock must bind the canonical seven', failures);
  assertCondition(typeof releaseSet?.catalog_carrier === 'string' && releaseSet.catalog_carrier.includes(`one-person-lab-manifest:${generation}`), 'Release Set catalog carrier ref drifted', failures);
  assertCondition(releaseSet?.promotion_evidence_status === 'requires_remote_tag_readback', 'Release Set must not pre-claim channel promotion', failures);
  assertCondition(JSON.stringify(packageIds) === JSON.stringify([...CANONICAL_PACKAGE_IDS].sort()), 'Package artifact ids must be the canonical seven', failures);
  assertCondition(releaseSet?.component_count === CANONICAL_PACKAGE_IDS.length + 2, 'Release Set BOM must contain Base, App, and seven Packages', failures);
  assertCondition(JSON.stringify(Object.keys(releaseSet?.components?.packages?.members ?? {}).sort()) === JSON.stringify([...CANONICAL_PACKAGE_IDS].sort()), 'Release Set Package collection must contain the canonical seven', failures);
  assertCondition(releaseSet?.components?.packages?.package_count === CANONICAL_PACKAGE_IDS.length, 'Release Set Package count must be seven', failures);
  assertCondition(releaseSet?.components?.app?.component_id === 'opl-app', 'Release Set App component is missing', failures);
  assertCondition(/^\d{2}\.\d{1,2}\.\d{1,2}$/.test(releaseSet?.components?.app?.version ?? ''), 'Release Set App version must be CalVer', failures);
  assertCondition(isGitSha(releaseSet?.components?.app?.source_commit), 'Release Set App source commit is invalid', failures);
  assertCondition(isDigest(releaseSet?.components?.app?.artifact_digest), 'Release Set App artifact digest is invalid', failures);
  assertCondition(promotionTarget !== 'latest-stable' || releaseSet?.components?.app?.release_status === 'published', 'Stable Release Set requires a published App release', failures);
  assertCondition(releaseSet?.update_decision?.release_set_revision_affects_component_update === false, 'Release Set revision must not force component updates', failures);
  assertCondition(releaseSet?.channel_pointer_policy?.promotion_mode === 'retag_exact_immutable_release_set_digest', 'Stable promotion must reuse the immutable BOM digest', failures);
  assertCondition(manifest.package_install_update_source === 'package_channel', 'Package install/update source must be package_channel', failures);
  assertCondition(manifest.module_install_update_source === undefined, 'module_install_update_source is retired', failures);
  assertCondition(manifest.developer_module_source_override === undefined, 'developer_module_source_override is retired', failures);
  assertCondition(manifest.developer_package_source_override?.carrier_env === 'OPL_MODULE_SOURCE_MODE=git_checkout', 'Developer Mode carrier override must remain explicit', failures);
  assertCondition(manifest.package_consumption_status === 'ordinary_app_users_consume_managed_ghcr_packages', 'Package consumption status drifted', failures);

  assertCondition(automation?.workflow_trigger_policy === PACKAGE_WORKFLOW_TRIGGER_POLICY, 'Package workflow trigger policy drifted', failures);
  assertCondition(automation?.remote_publish_status === PACKAGE_REMOTE_PUBLISH_STATUS, 'Release automation must not pre-claim publication', failures);
  assertCondition(automation?.release_manifest_package?.publication_status === 'publication_workflow_configured', 'Catalog carrier must not pre-claim publication', failures);
  assertCondition(JSON.stringify(automation?.channel_manifest?.moving_tags) === JSON.stringify(['candidate', 'latest-stable']), 'Moving tags must be candidate and latest-stable only', failures);
  assertCondition(automation?.channel_manifest?.ghcr_ref?.includes('<release_set_generation>'), 'Catalog carrier must use Release Set generation', failures);
  assertCondition(automation?.artifact_build?.required_input === 'release_set_generation', 'Artifact build input must be Release Set generation', failures);
  assertCondition(automation?.daily_package_channel?.generation_template === '<utc_yy.m.d[-rN_auto]>', 'Daily generation template drifted', failures);
  assertCondition(automation?.daily_package_channel?.force_publish_input === 'force_publish', 'Daily force repair input drifted', failures);
  assertCondition(automation?.cleanup?.protected_tags?.includes('candidate') && automation?.cleanup?.protected_tags?.includes('latest-stable'), 'Cleanup must protect both moving tags', failures);

  for (const packageId of CANONICAL_PACKAGE_IDS) {
    validatePackageArtifact(packageId, packageArtifacts[packageId], releaseSet?.components?.packages?.members?.[packageId], failures);
    if (promotionTarget === 'latest-stable') {
      assertCondition(!String(packageArtifacts[packageId]?.package_version ?? '').includes('-'), `${packageId}: latest-stable cannot select a prerelease Package`, failures);
    }
  }
  assertCondition(packageArtifacts['mas-scholar-skills']?.scope === 'framework_capability_package', 'MAS Scholar Skills role drifted', failures);
  assertCondition(packageArtifacts['opl-flow']?.scope === 'runtime_dependency', 'OPL Flow workflow-profile role drifted', failures);
  assertCondition(packageArtifacts['opl-flow']?.codex_standalone_distribution === null, 'OPL Flow must not be projected as a standalone Agent package', failures);
  validateFrameworkCore(manifest.packages?.framework_core, releaseSet?.components?.base, failures);

  const nativeHelper = manifest.packages?.native_helper;
  assertCondition(nativeHelper?.channel_status === 'active_ghcr_oci_prebuild', 'native helper channel status drifted', failures);
  assertCondition(nativeHelper?.retention_policy?.protected_tags?.includes('latest'), 'native helper uses its separate prebuild latest tag', failures);
  assertCondition(nativeHelper?.retention_policy?.execution_mode === 'dry_run_first_explicit_execute_required', 'native helper cleanup must remain dry-run first', failures);
  assertCondition(!Object.hasOwn(manifest.packages ?? {}, 'webui_docker_image'), 'Framework manifest must not carry App-owned WebUI coordinates', failures);
  return failures;
}

function validateWorkflow(manifest, manifestPath, failures) {
  const packageRoot = path.dirname(manifestPath);
  const workflowPath = path.resolve(packageRoot, manifest.release_automation?.artifact_build?.workflow ?? PACKAGE_WORKFLOW_PATH);
  const releasePath = path.resolve(packageRoot, PACKAGE_RELEASE_CALLER_WORKFLOW_PATH);
  const dailyPath = path.resolve(packageRoot, PACKAGE_DAILY_WORKFLOW_PATH);
  const source = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
  const releaseSource = fs.existsSync(releasePath) ? fs.readFileSync(releasePath, 'utf8') : '';
  const dailySource = fs.existsSync(dailyPath) ? fs.readFileSync(dailyPath, 'utf8') : '';

  assertCondition(!/\n\s*push:\n/.test(source), 'package workflow must not restore tag-push publishing', failures);
  assertCondition(!/docker\/build-push-action|one-person-lab-webui|webui-image:/.test(source), 'Package workflow must not publish App WebUI', failures);
  assertCondition(!/one-person-lab-modules/.test(source), 'Package workflow must not publish retired module namespaces', failures);
  assertCondition(/workflow_dispatch:/.test(source) && /workflow_call:/.test(source), 'Package workflow must keep manual and reusable release-gated triggers', failures);
  const packageFrameworkCommitInputs = workflowInputBlocks(source, 'expected_framework_source_commit');
  assertCondition(packageFrameworkCommitInputs.length === 2
    && packageFrameworkCommitInputs.every(isRequiredStringInput), 'Package workflow must require one non-default Framework source commit for both dispatch and workflow_call', failures);
  assertCondition(source.includes('ref: ${{ github.sha }}')
    && source.includes('path: .release-harness')
    && source.includes('ref: ${{ inputs.expected_framework_source_commit }}')
    && source.includes('path: .framework-source')
    && source.includes('EXPECTED_FRAMEWORK_SOURCE_COMMIT: ${{ inputs.expected_framework_source_commit }}')
    && source.includes('[[ "$expected" =~ ^[0-9a-f]{40}$ ]]')
    && source.includes('[ "$harness_head" != "$GITHUB_SHA" ]')
    && source.includes('[ "$source_head" != "$expected" ]')
    && !source.includes('[ "$GITHUB_SHA" != "$expected" ]'), 'Package workflow must load the exact frozen Framework source while allowing a newer workflow harness', failures);
  const packageHarnessCheckoutIndex = source.indexOf('- name: Checkout exact release harness');
  const packageSourceCheckoutIndex = source.indexOf('- name: Checkout frozen Framework source');
  const packageSourceGateIndex = source.indexOf('- name: Verify exact release roots');
  const packageResolutionIndex = source.indexOf('- name: Resolve Release Set generation');
  assertCondition(packageHarnessCheckoutIndex >= 0
    && packageHarnessCheckoutIndex < packageSourceCheckoutIndex
    && packageSourceCheckoutIndex < packageSourceGateIndex
    && packageSourceGateIndex < packageResolutionIndex, 'Package Framework source gate must run immediately after checkout and before build or publication work', failures);
  const releaseHarnessScripts = [
    'resolve-opl-app-component.mjs',
    'package-archives.mjs',
    'package-channel-daily-check.mjs',
    'package-release-discipline.mjs',
    'oci-publication-preflight.mjs',
    'preflight-package-publication-set.mjs',
    'finalize-package-channel-digests.mjs',
    'generate-release-supply-chain.mjs',
    'write-release-promotion-receipt.mjs',
  ];
  assertCondition(releaseHarnessScripts.every((script) => source.includes(`$OPL_RELEASE_HARNESS_ROOT/scripts/${script}`))
    && source.includes('--framework-source-root "$OPL_FRAMEWORK_SOURCE_ROOT"')
    && source.match(/npm ci --ignore-scripts/g)?.length === 2
    && !/\bnode(?:\s+--experimental-strip-types)?\s+scripts\//.test(source)
    && !/npm run packages:(?:manifest|daily-check|release-discipline)/.test(source), 'Candidate publication must run every release control helper from the exact harness root and reserve the frozen root for Base source', failures);
  assertCondition(/concurrency:[\s\S]*opl-package-publication-/.test(source) && /cancel-in-progress:\s*false/.test(source), 'Package publication must be serialized without cancellation', failures);
  assertCondition(/release_set_generation:/.test(source) && !/\n\s+opl_version:/.test(source), 'Package workflow input must be Release Set generation', failures);
  assertCondition(/oci-publication-preflight\.mjs/.test(source), 'Package workflow must run OCI immutable preflight', failures);
  assertCondition(/preflight-package-publication-set\.mjs/.test(source)
    && source.indexOf('preflight-package-publication-set.mjs') < source.indexOf('oras push --format json'), 'Complete immutable publication-set preflight must run before the first OCI push', failures);
  assertCondition(/preflight-package-publication-set\.mjs[\s\S]*--changed-packages-json "\$OPL_CHANGED_PACKAGES_JSON"/.test(source)
    && /--digest-only --verify-only --expected-digest "\$digest" --anonymous/.test(source), 'Unchanged Packages must reuse the exact previous stable digest without rebuilding historical OCI layers', failures);
  assertCondition(/existing_identical_reuse|\.action.*reuse|= reuse/.test(source), 'Package workflow must reuse identical immutable tags', failures);
  assertCondition(/org\.opencontainers\.image\.source/.test(source), 'OCI artifacts must declare repository source association', failures);
  assertCondition(/visibility" -f visibility=public|visibility=public/.test(source), 'Package workflow must enforce public GHCR visibility', failures);
  assertCondition(/--anonymous/.test(source), 'Package workflow must verify anonymous pull access', failures);
  assertCondition(/--expected-digest/.test(source), 'Package workflow must verify exact digest readback', failures);
  assertCondition(/finalize-package-channel-digests\.mjs[\s\S]*--check/.test(source), 'Package workflow must verify a complete Release Set BOM', failures);
  assertCondition(/owner-cohort-lock\.json/.test(source) && /owner_cohort_artifact_name/.test(source), 'Package workflow must consume a frozen owner cohort lock', failures);
  assertCondition(/generate-release-supply-chain\.mjs/.test(source)
    && /sha256sum --check SHA256SUMS/.test(source), 'Package workflow must generate supply-chain evidence and verify exact Release Set file checksums', failures);
  assertCondition(/sigstore\/cosign-installer@[0-9a-f]{40}/.test(source)
    && /cosign attest[\s\S]*--type slsaprovenance1/.test(source)
    && /cosign attest[\s\S]*--type spdxjson/.test(source)
    && source.match(/cosign verify-attestation/g)?.length === 2
    && /cosign login ghcr\.io/.test(source), 'Package workflow must publish and verify keyless SLSA and SPDX attestations directly in GHCR', failures);
  assertCondition(!/actions\/attest@/.test(source)
    && !/attestations:\s*write/.test(source), 'Package workflow must not depend on the GitHub repository Attestations API', failures);
  assertCondition(/write-release-promotion-receipt\.mjs/.test(source), 'Candidate publication must emit a machine-readable promotion receipt', failures);
  assertCondition(/release_set_generation:\s*\$\{\{ steps\.release\.outputs\.release_set_generation \}\}/.test(source)
    && /opl-release-set-\$\{\{ needs\.package-release-set\.outputs\.release_set_generation \}\}/.test(source), 'Downstream publication jobs must consume the normalized Release Set generation', failures);
  assertCondition(/publish-candidate-receipt:[\s\S]*needs:\s*\[package-release-set, attest-oci-components\][\s\S]*Upload candidate promotion receipt/.test(source), 'Candidate receipt must remain hidden until every OCI attestation succeeds', failures);
  assertCondition(/package-manifest\.json/.test(source) && !/agent-package-manifest\.json/.test(source), 'OCI Package layers must use the generic package manifest filename', failures);
  assertCondition(/generation_ref="\$\{carrier\}:\$\{OPL_RELEASE_SET_GENERATION\}"/.test(source), 'Catalog carrier must use immutable Release Set generation', failures);
  assertCondition(/oras tag .* candidate/.test(source) && !/oras tag .* latest-stable/.test(source), 'Package build workflow must publish candidate only', failures);
  assertCondition(!/:latest(?:["'\s]|$)/m.test(source), 'Package workflow must not publish or consume bare latest', failures);

  assertCondition(!/\n\s*release:\s*\n/.test(releaseSource), 'Stable promotion must not have a second GitHub Release event writer', failures);
  assertCondition(/workflow_dispatch:/.test(releaseSource), 'Stable promotion must retain an explicit dispatch owner surface', failures);
  const releaseFrameworkCommitInputs = workflowInputBlocks(releaseSource, 'expected_framework_source_commit');
  assertCondition(releaseFrameworkCommitInputs.length === 1
    && releaseFrameworkCommitInputs.every(isRequiredStringInput), 'Release promotion must require one non-default Framework source commit', failures);
  assertCondition(/expected_framework_source_commit:\s*\$\{\{ inputs\.expected_framework_source_commit \}\}/.test(releaseSource), 'Candidate caller must pass the exact Framework source commit into packages.yml', failures);
  assertCondition(releaseSource.includes('EXPECTED_FRAMEWORK_SOURCE_COMMIT: ${{ inputs.expected_framework_source_commit }}')
    && releaseSource.includes('[[ "$expected" =~ ^[0-9a-f]{40}$ ]]')
    && releaseSource.includes(".release_set.components.base.source_commit")
    && !releaseSource.includes('[ "$GITHUB_SHA" != "$expected" ]'), 'Stable promotion must validate the exact frozen Framework component without conflating it with the workflow harness', failures);
  const releaseCheckoutIndex = releaseSource.indexOf('- name: Checkout OPL');
  const releaseSourceGateIndex = releaseSource.indexOf('- name: Validate frozen Framework source input');
  const releaseSetupIndex = releaseSource.indexOf('- name: Setup Node.js');
  assertCondition(releaseCheckoutIndex >= 0
    && releaseCheckoutIndex < releaseSourceGateIndex
    && releaseSourceGateIndex < releaseSetupIndex, 'Stable Framework source gate must run immediately after checkout and before retag work', failures);
  assertCondition(/release_set_generation:/.test(releaseSource) && /promote-exact-release-set:/.test(releaseSource), 'Release caller must promote an explicit immutable generation', failures);
  assertCondition(/oras pull "\$\{carrier\}@\$\{carrier_digest\}"/.test(releaseSource), 'Stable promotion must pull the exact immutable catalog digest', failures);
  assertCondition(/components\.packages\.members/.test(releaseSource) && /components\.base\.artifact_digest/.test(releaseSource), 'Stable promotion must retag exact Package and Base digests', failures);
  assertCondition(/expected_carrier_digest/.test(releaseSource) && /promotion_request_id/.test(releaseSource), 'Stable promotion must bind the App saga request and candidate digest', failures);
  assertCondition(/write-release-promotion-receipt\.mjs/.test(releaseSource), 'Stable promotion must publish a machine-readable receipt', failures);
  assertCondition(/schedule:[\s\S]*cron:/.test(dailySource), 'Daily Package workflow must remain scheduled', failures);
  assertCondition(/concurrency:[\s\S]*group:\s*opl-daily-package-channel-\$\{\{ github\.repository_owner \}\}[\s\S]*cancel-in-progress:\s*false/.test(dailySource), 'Daily Package workflow must serialize Release Set generation allocation', failures);
  assertCondition(/release_set_generation:/.test(dailySource) && /--release-set-generation/.test(dailySource), 'Daily workflow must use Release Set generation vocabulary', failures);
  assertCondition(/oras repo tags/.test(dailySource) && /release-set-generation\.mjs/.test(dailySource), 'Daily workflow must allocate a new immutable same-day revision', failures);
  assertCondition(!/if ! oras repo tags/.test(dailySource), 'Daily Release Set generation must fail closed when tag readback fails', failures);
  assertCondition(/OPL_PACKAGE_RELEASE_GATE:\s*daily_package_channel_detection/.test(dailySource), 'Daily detection build must carry an explicit candidate-only release gate', failures);
  assertCondition(/--owner-cohort-mode\s+framework-projection/.test(dailySource), 'Daily detection must freeze Framework-selected owner commits instead of unrelated owner HEADs', failures);
  assertCondition(/one-person-lab-manifest:latest-stable/.test(dailySource), 'Daily workflow must compare with latest-stable', failures);
  for (const [label, workflowSource] of [['Package', source], ['Daily', dailySource]]) {
    assertCondition(
      workflowSource.includes('gh release view "v$previous_app_version"')
        && workflowSource.includes("jq -e '.isDraft == false and .isPrerelease == false and .publishedAt != null'")
        && workflowSource.includes('Previous latest-stable App release v$previous_app_version is unavailable or no longer stable'),
      `${label} workflow must recover when the previous stable App release is unavailable`,
      failures,
    );
  }
  assertCondition(
    /owner_manifest=""[\s\S]*gh release download[\s\S]*app_commit=""[\s\S]*if \[ -n "\$owner_manifest" \]; then[\s\S]*jq -r \.source_commit "\$owner_manifest"[\s\S]*if \[ -z "\$app_commit" \]; then[\s\S]*gh api "repos\/gaofeng21cn\/one-person-lab-app\/commits\/v\$app_version"/.test(dailySource),
    'Daily App resolution must prefer the published owner component manifest and use tag readback only as fallback',
    failures,
  );
  assertCondition(/force_publish[\s\S]*publish_required=true/.test(dailySource), 'force_publish must be consumed as an explicit Release Set repair', failures);
  assertCondition(/publish_required == 'true'/.test(dailySource), 'Daily workflow must skip publication when unchanged', failures);
  assertCondition(/promotion_target:\s*candidate/.test(dailySource), 'Daily workflow may promote candidate only', failures);
  assertCondition(/owner_cohort_artifact_name/.test(dailySource), 'Daily detection must pass the frozen owner cohort into publication', failures);
  assertCondition(/app_version:\s*\$\{\{ steps\.app\.outputs\.app_version \}\}/.test(dailySource)
    && /app_version:\s*\$\{\{ needs\.detect-package-channel-change\.outputs\.app_version \}\}/.test(dailySource), 'Daily publication must bind the exact App version selected during detection', failures);
  assertCondition(/expected_framework_source_commit:\s*\$\{\{ github\.sha \}\}/.test(dailySource), 'Daily publication must bind packages.yml to its exact Framework workflow commit', failures);
  assertCondition(!/:latest(?:["'\s]|$)/m.test(dailySource), 'Daily Package workflow must not use bare latest', failures);
}

function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const manifest = readJsonFile(options.manifest);
  const failures = validateManifest(manifest, options.promotionTarget);
  validateWorkflow(manifest, options.manifest, failures);
  if (failures.length > 0) {
    console.error(JSON.stringify({ status: 'failed', manifest: options.manifest, failures }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    status: 'passed',
    manifest: options.manifest,
    release_set_generation: manifest.release_set_generation,
    package_ids: CANONICAL_PACKAGE_IDS,
    release_automation: manifest.release_automation,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
