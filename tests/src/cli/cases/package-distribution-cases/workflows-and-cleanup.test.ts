import {
  assert,
  canonicalAgentPackageId,
  createGitModuleRemoteFixture,
  execFileSync,
  fs,
  normalizeFirstPartyAgentPackageManifest,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  test,
} from './helpers.ts';
import {
  compareReleaseSetGenerations,
  nextReleaseSetGeneration,
  parseReleaseSetGeneration,
} from '../../../../../scripts/release-set-generation.mjs';
import { getOplPackageSpecs } from '../../../../../src/modules/connect/package-distribution.ts';

test('framework packages workflow is release-gated and manually repairable without WebUI publishing', () => {
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/packages.yml'), 'utf8');
  const releaseCallerWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/release-package-channel.yml'), 'utf8');
  const dailyPackageWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/daily-package-channel.yml'), 'utf8');
  const packageStableWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/publish-package.yml'), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /workflow_call:/);
  const packageFrameworkCommitInputs = [...workflow.matchAll(/^      expected_framework_source_commit:\n((?:^        [^\n]*\n?)*)/gm)];
  assert.equal(packageFrameworkCommitInputs.length, 2);
  for (const [, block] of packageFrameworkCommitInputs) {
    assert.match(block, /^        required: true$/m);
    assert.match(block, /^        type: string$/m);
    assert.doesNotMatch(block, /^        default:/m);
  }
  const releaseFrameworkCommitInputs = [...releaseCallerWorkflow.matchAll(/^      expected_framework_source_commit:\n((?:^        [^\n]*\n?)*)/gm)];
  assert.equal(releaseFrameworkCommitInputs.length, 1);
  assert.match(releaseFrameworkCommitInputs[0][1], /^        required: true$/m);
  assert.match(releaseFrameworkCommitInputs[0][1], /^        type: string$/m);
  assert.doesNotMatch(releaseFrameworkCommitInputs[0][1], /^        default:/m);
  assert.match(workflow, /EXPECTED_FRAMEWORK_SOURCE_COMMIT: \$\{\{ inputs\.expected_framework_source_commit \}\}/);
  assert.match(releaseCallerWorkflow, /EXPECTED_FRAMEWORK_SOURCE_COMMIT: \$\{\{ inputs\.expected_framework_source_commit \}\}/);
  for (const source of [workflow, releaseCallerWorkflow]) {
    assert.match(source, /\[\[ "\$expected" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
    assert.doesNotMatch(source, /\[ "\$GITHUB_SHA" != "\$expected" \]/);
    assert.doesNotMatch(source, /\[ -z "\$expected" \]/);
  }
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}\s+path: \.release-harness/);
  assert.match(workflow, /ref: \$\{\{ inputs\.expected_framework_source_commit \}\}\s+path: \.framework-source/);
  assert.match(workflow, /\[ "\$harness_head" != "\$GITHUB_SHA" \]/);
  assert.match(workflow, /\[ "\$source_head" != "\$expected" \]/);
  assert.ok(workflow.indexOf('Checkout exact release harness') < workflow.indexOf('Checkout frozen Framework source'));
  assert.ok(workflow.indexOf('Checkout frozen Framework source') < workflow.indexOf('Verify exact release roots'));
  assert.ok(workflow.indexOf('Verify exact release roots') < workflow.indexOf('Resolve Release Set generation'));
  assert.ok(releaseCallerWorkflow.indexOf('Checkout OPL') < releaseCallerWorkflow.indexOf('Validate frozen Framework source input'));
  assert.ok(releaseCallerWorkflow.indexOf('Validate frozen Framework source input') < releaseCallerWorkflow.indexOf('Setup Node.js'));
  assert.match(releaseCallerWorkflow, /\.release_set\.components\.base\.source_commit/);
  assert.match(releaseCallerWorkflow, /expected_framework_source_commit:\s*\$\{\{ inputs\.expected_framework_source_commit \}\}/);
  assert.doesNotMatch(dailyPackageWorkflow, /expected_framework_source_commit:\s*\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /release_gate:\s*\n\s*description:/);
  assert.match(workflow, /release_set_generation:/);
  assert.match(workflow, /generation="\$\{generation#v\}"/);
  assert.match(workflow, /id:\s*release/);
  assert.match(workflow, /release_set_generation:\s*\$\{\{ steps\.release\.outputs\.release_set_generation \}\}/);
  assert.doesNotMatch(releaseCallerWorkflow, /\n\s*release:\s*\n/);
  assert.match(releaseCallerWorkflow, /workflow_dispatch:/);
  assert.match(releaseCallerWorkflow, /uses:\s+\.\/\.github\/workflows\/packages\.yml/);
  assert.match(releaseCallerWorkflow, /promote-exact-release-set:/);
  assert.match(releaseCallerWorkflow, /oras pull "\$\{carrier\}@\$\{carrier_digest\}"/);
  assert.match(releaseCallerWorkflow, /OPL_PACKAGE_PROMOTION_TARGET=latest-stable/);
  assert.match(releaseCallerWorkflow, /components\.packages\.members/);
  assert.match(releaseCallerWorkflow, /components\.base\.artifact_digest/);
  assert.match(releaseCallerWorkflow, /expected_carrier_digest/);
  assert.doesNotMatch(releaseCallerWorkflow, /workflow_run:/);
  assert.match(releaseCallerWorkflow, /resolve-auto-promotion:[\s\S]*needs: \[publish-candidate\]/);
  assert.match(releaseCallerWorkflow, /needs\.publish-candidate\.result == 'success'/);
  assert.match(releaseCallerWorkflow, /gh api --paginate --slurp/);
  assert.match(releaseCallerWorkflow, /SOURCE_HEAD_SHA/);
  assert.match(releaseCallerWorkflow, /exactly one attested candidate receipt artifact/);
  assert.match(releaseCallerWorkflow, /environment: release-stable/);
  assert.match(releaseCallerWorkflow, /Verify protected Stable environment/);
  assert.match(releaseCallerWorkflow, /release-stable must exist before dispatch/);
  assert.match(releaseCallerWorkflow, /protection_rules \| length/);
  assert.match(releaseCallerWorkflow, /deployment-branch-policies\?per_page=100/);
  assert.match(releaseCallerWorkflow, /no protection rule or exact allowed branch policy/);
  assert.match(releaseCallerWorkflow, /\.app\.carriers \| type == "array" and length > 0/);
  assert.match(releaseCallerWorkflow, /\.components\.packages \| type == "object" and length > 0/);
  assert.doesNotMatch(releaseCallerWorkflow, /"mag", "mas", "mas-scholar-skills", "obf", "oma", "opl-flow", "rca"/);
  for (const inputName of ['frozen_base_release_set_generation', 'frozen_base_release_set_digest']) {
    const packageInputs = [...workflow.matchAll(new RegExp(`^      ${inputName}:\\n((?:^        [^\\n]*\\n?)*)`, 'gm'))];
    assert.equal(packageInputs.length, 2);
    for (const [, block] of packageInputs) assert.match(block, /^        required: true$/m);
    const promotionInputs = [...releaseCallerWorkflow.matchAll(new RegExp(`^      ${inputName}:\\n((?:^        [^\\n]*\\n?)*)`, 'gm'))];
    assert.equal(promotionInputs.length, 1);
    assert.match(promotionInputs[0][1], /^        required: true$/m);
  }
  assert.match(releaseCallerWorkflow, /promotion_request_id/);
  assert.match(releaseCallerWorkflow, /write-release-promotion-receipt\.mjs/);
  const releaseCallerHeader = releaseCallerWorkflow.slice(0, releaseCallerWorkflow.indexOf('\njobs:'));
  const exactPromotionJob = releaseCallerWorkflow.slice(
    releaseCallerWorkflow.indexOf('\n  promote-exact-release-set:'),
  );
  assert.doesNotMatch(releaseCallerHeader, /\nconcurrency:/);
  assert.match(
    exactPromotionJob,
    /concurrency:\s*\n\s*group: opl-release-set-snapshot-\$\{\{ github\.repository_owner \}\}\s*\n\s*cancel-in-progress: false/,
  );
  assert.doesNotMatch(workflow, /\n  push:\n/);
  assert.doesNotMatch(workflow, /webui-image:/);
  assert.match(workflow, /concurrency:[\s\S]*opl-package-publication-/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /oci-publication-preflight\.mjs/);
  assert.match(workflow, /org\.opencontainers\.image\.source/);
  assert.match(workflow, /visibility=public/);
  const publicPackageGates = [...workflow.matchAll(/ensure_public_package\(\) \{([\s\S]*?)\n          \}/g)]
    .map((match) => match[1]);
  assert.equal(publicPackageGates.length, 2);
  for (const gate of publicPackageGates) {
    assert.match(gate, /for attempt in \{1\.\.24\}/);
    assert.ok(gate.indexOf('readback="$(gh api') < gate.indexOf('gh api --method PATCH'));
    assert.doesNotMatch(gate, /visibility=public[^\n]*\n\s*&& readback=/);
    assert.match(gate, /visibility=public >\/dev\/null 2>&1 \|\| true/);
  }
  assert.match(workflow, /--anonymous/);
  assert.match(workflow, /--expected-digest/);
  assert.doesNotMatch(workflow, /one-person-lab-manifest:latest-stable/);
  assert.match(workflow, /oras pull "\$\{carrier\}@\$\{base_digest\}"/);
  assert.match(workflow, /generation_digest=.*oras manifest fetch --descriptor "\$\{carrier\}:\$\{base_generation\}"/);
  assert.match(workflow, /OPL_PREVIOUS_PACKAGE_MANIFEST/);
  assert.match(workflow, /args\+=\(--previous-manifest "\$OPL_PREVIOUS_PACKAGE_MANIFEST"\)/);
  assert.doesNotMatch(workflow, /gh release list --repo gaofeng21cn\/one-person-lab-app/);
  assert.doesNotMatch(workflow, /resolving the latest published stable App release/);
  assert.match(workflow, /app_version="\$\(jq -r '\.release_set\.components\.app\.version'/);
  assert.ok(workflow.indexOf('Bind frozen base Release Set') < workflow.indexOf('Build Package archives and Release Set manifests'));
  assert.ok(workflow.indexOf('Verify exact release roots') < workflow.indexOf('Resolve immutable OPL App component'));
  assert.match(workflow, /OPL_RELEASE_HARNESS_ROOT: \$\{\{ github\.workspace \}\}\/\.release-harness/);
  assert.match(workflow, /OPL_FRAMEWORK_SOURCE_ROOT: \$\{\{ github\.workspace \}\}\/\.framework-source/);
  assert.equal(workflow.match(/run: npm ci --ignore-scripts/g)?.length, 2);
  assert.doesNotMatch(workflow, /run: npm ci\s*$/m);
  assert.match(workflow, /node "\$OPL_RELEASE_HARNESS_ROOT\/scripts\/resolve-opl-app-component\.mjs"/);
  assert.match(workflow, /--framework-source-root "\$OPL_FRAMEWORK_SOURCE_ROOT"/);
  for (const script of [
    'resolve-opl-app-component.mjs',
    'package-archives.mjs',
    'package-channel-daily-check.mjs',
    'package-release-discipline.mjs',
    'oci-publication-preflight.mjs',
    'preflight-package-publication-set.mjs',
    'finalize-package-channel-digests.mjs',
    'generate-release-supply-chain.mjs',
    'write-release-promotion-receipt.mjs',
  ]) {
    assert.match(workflow, new RegExp(`\\$OPL_RELEASE_HARNESS_ROOT/scripts/${script.replaceAll('.', '\\.')}`));
  }
  assert.doesNotMatch(workflow, /\bnode(?:\s+--experimental-strip-types)?\s+scripts\//);
  assert.doesNotMatch(workflow, /npm run packages:(?:manifest|daily-check|release-discipline)/);
  assert.match(workflow, /app_commit="\$\{\{ inputs\.expected_app_source_commit \}\}"/);
  assert.match(workflow, /if \[ -z "\$app_commit" \] && \[ -n "\$owner_manifest" \]; then\s+app_commit="\$\(jq -r \.source_commit "\$owner_manifest"\)"/);
  assert.match(workflow, /if \[ -z "\$app_commit" \]; then\s+app_commit="\$\(gh api "repos\/gaofeng21cn\/one-person-lab-app\/commits\/v\$app_version" --jq \.sha\)"/);
  assert.match(workflow, /one-person-lab-packages/);
  assert.doesNotMatch(workflow, /one-person-lab-modules/);
  assert.match(workflow, /one-person-lab-framework/);
  assert.match(workflow, /carrier="ghcr\.io\/\$\{OPL_PACKAGES_OWNER\}\/one-person-lab-manifest"/);
  assert.match(workflow, /generation_ref="\$\{carrier\}:\$\{OPL_RELEASE_SET_GENERATION\}"/);
  assert.match(workflow, /package-manifest\.json/);
  assert.doesNotMatch(workflow, /agent-package-manifest\.json/);
  assert.match(workflow, /oras tag .* candidate/);
  assert.doesNotMatch(workflow, /oras tag .* latest-stable/);
  assert.match(releaseCallerWorkflow, /oras tag .* latest-stable/);
  assert.match(releaseCallerWorkflow, /promote_channel_ref\(\)/);
  assert.match(releaseCallerWorkflow, /assert_channel_cas_eligible\(\)/);
  assert.match(releaseCallerWorkflow, /opl-stable-promotion-plan\.tsv/);
  assert.match(releaseCallerWorkflow, /Stable channel conflict/);
  assert.match(releaseCallerWorkflow, /if ! oras tag "\$\{ref\}@\$\{target_digest\}" latest-stable/);
  assert.match(releaseCallerWorkflow, /Reconciled an unknown tag result/);
  assert.match(releaseCallerWorkflow, /not the exact target after bounded readback/);
  assert.match(releaseCallerWorkflow, /group:\s*opl-release-set-snapshot-\$\{\{ github\.repository_owner \}\}/);
  assert.match(releaseCallerWorkflow, /oras manifest fetch --descriptor "\$\{image\}@\$\{digest\}"/);
  assert.match(releaseCallerWorkflow, /oras manifest fetch --descriptor "\$\{base_image\}@\$\{base_digest\}"/);
  assert.match(
    releaseCallerWorkflow,
    /printf '%s\\t%s\\t%s\\n' "\$carrier" "\$base_carrier_digest" "\$carrier_digest" >> "\$promotion_plan"/,
  );
  assert.match(releaseCallerWorkflow, /\[ "\$\(wc -l < "\$promotion_plan" \| tr -d ' '\)" -eq 1 \]/);
  assert.doesNotMatch(releaseCallerWorkflow, /printf '%s\\t%s\\t%s\\n' "\$(?:image|base_image)"/);
  assert.doesNotMatch(releaseCallerWorkflow, /verify_public_digest "\$\{(?:image|base_image)\}:latest-stable"/);
  assert.match(
    releaseCallerWorkflow,
    /verify_public_digest "ghcr\.io\/\$\{owner\}\/one-person-lab-packages\/\$\{package_id\}@\$\{digest\}"/,
  );
  assert.match(releaseCallerWorkflow, /verify_public_digest "\$\{base_image\}@\$\{base_digest\}"/);
  assert.ok(
    releaseCallerWorkflow.indexOf('assert_channel_cas_eligible "$ref"')
      < releaseCallerWorkflow.indexOf('promote_channel_ref "$ref"'),
  );
  assert.match(packageStableWorkflow, /group:\s*opl-package-publication-\$\{\{ inputs\.package_id \}\}/);
  assert.match(packageStableWorkflow, /environment:\s*release-stable/);
  assert.match(packageStableWorkflow, /oras tag "\$\{PACKAGE_IMAGE\}@\$\{digest\}" latest-stable/);
  assert.match(
    packageStableWorkflow,
    /--ref "\$LATEST_STABLE_REF"[\s\S]*--verify-only --expected-digest "\$digest" --anonymous/,
  );
  assert.doesNotMatch(workflow, /oras tag .*\slatest\s*$/m);
  assert.match(workflow, /changed_packages_json/);
  assert.match(workflow, /Resolve changed Package publication plan/);
  assert.match(workflow, /OPL_CHANGED_PACKAGES_JSON/);
  assert.match(workflow, /--component-id opl-base/);
  assert.match(workflow, /oras push .*--format json/s);
  assert.ok(
    workflow.indexOf('Preflight complete immutable publication set')
      < workflow.indexOf('Publish immutable Packages and finalize complete BOM'),
  );
  assert.match(workflow, /--report dist\/opl-packages\/package-publication-preflight-report\.json/);
  assert.match(workflow, /preflight-package-publication-set\.mjs[\s\S]*--changed-packages-json "\$OPL_CHANGED_PACKAGES_JSON"/);
  assert.match(workflow, /--digest-only --verify-only --expected-digest "\$digest" --anonymous/);
  assert.match(workflow, /finalize-package-channel-digests\.mjs/);
  assert.match(workflow, /owner-cohort-lock\.json/);
  assert.match(workflow, /owner_cohort_artifact_name/);
  assert.match(
    workflow,
    /lock="\$OPL_RELEASE_HARNESS_ROOT\/release\/cohorts\/\$OPL_RELEASE_SET_GENERATION\/owner-cohort-lock\.json"/,
  );
  assert.match(workflow, /Release Set \$OPL_RELEASE_SET_GENERATION has no frozen owner cohort lock/);
  assert.doesNotMatch(workflow, /- name: Bind frozen owner cohort\n\s+if:/);
  assert.match(workflow, /generate-release-supply-chain\.mjs/);
  assert.match(workflow, /sha256sum --check SHA256SUMS/);
  assert.match(workflow, /sigstore\/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6/);
  assert.match(workflow, /cosign-release:\s*v3\.1\.1/);
  assert.equal(workflow.match(/cosign attest/g)?.length, 2);
  assert.equal(workflow.match(/cosign verify-attestation/g)?.length, 2);
  assert.match(workflow, /--type slsaprovenance1/);
  assert.match(workflow, /--type spdxjson/);
  assert.match(workflow, /cosign login ghcr\.io/);
  assert.match(workflow, /certificate-oidc-issuer https:\/\/token\.actions\.githubusercontent\.com/);
  assert.match(workflow, /max-parallel:\s*3/);
  assert.doesNotMatch(workflow, /actions\/attest@/);
  assert.doesNotMatch(workflow, /create-storage-record:/);
  assert.doesNotMatch(workflow, /attestations:\s*write/);
  assert.doesNotMatch(workflow, /subject-path:/);
  assert.match(workflow, /write-release-promotion-receipt\.mjs/);
  assert.match(workflow, /name:\s*opl-release-set-\$\{\{ needs\.package-release-set\.outputs\.release_set_generation \}\}/);
  assert.match(workflow, /publish-candidate-receipt:[\s\S]*needs:\s*\[package-release-set, attest-oci-components\]/);
  assert.equal(workflow.match(/Upload candidate promotion receipt/g)?.length, 1);
  assert.ok(workflow.indexOf('attest-oci-components:') < workflow.indexOf('Upload candidate promotion receipt'));
  assert.ok(workflow.indexOf('finalize-package-channel-digests.mjs') < workflow.indexOf('generation_ref="${carrier}:${OPL_RELEASE_SET_GENERATION}"'));
  assert.doesNotMatch(workflow, /docker\/build-push-action/);
  assert.doesNotMatch(workflow, /one-person-lab-webui/);
  assert.match(workflow, /Upload prepared Package artifacts/);
  assert.match(dailyPackageWorkflow, /schedule:/);
  assert.match(dailyPackageWorkflow, /cron:/);
  assert.match(dailyPackageWorkflow, /group: opl-daily-package-channel-\$\{\{ github\.repository_owner \}\}/);
  assert.match(dailyPackageWorkflow, /cancel-in-progress: false/);
  assert.match(dailyPackageWorkflow, /base="\$\(date -u \+'%y\.%-m\.%-d'\)"/);
  assert.match(dailyPackageWorkflow, /oras repo tags/);
  assert.doesNotMatch(dailyPackageWorkflow, /if ! oras repo tags "ghcr\.io\/\$\{\{ github\.repository_owner \}\}\/one-person-lab-manifest"/);
  assert.match(dailyPackageWorkflow, /release-set-generation\.mjs/);
  assert.match(dailyPackageWorkflow, /workflow_dispatch:/);
  assert.match(dailyPackageWorkflow, /force_publish:/);
  assert.match(dailyPackageWorkflow, /force_publish[\s\S]*publish_required=true/);
  assert.doesNotMatch(dailyPackageWorkflow, /npm run packages:manifest/);
  assert.match(dailyPackageWorkflow, /OPL_PACKAGE_RELEASE_GATE:\s*daily_package_channel_detection/);
  assert.match(dailyPackageWorkflow, /--projection-root \./);
  assert.doesNotMatch(dailyPackageWorkflow, /--owner-cohort-mode/);
  assert.doesNotMatch(dailyPackageWorkflow, /gh release (?:list|view|download) --repo gaofeng21cn\/one-person-lab-app/);
  assert.match(dailyPackageWorkflow, /npm run packages:daily-check/);
  assert.doesNotMatch(dailyPackageWorkflow, /--fallback-stage candidate_manifest_build/);
  assert.doesNotMatch(dailyPackageWorkflow, /candidate_built=false/);
  assert.doesNotMatch(dailyPackageWorkflow, /retained_previous_stable/);
  assert.match(dailyPackageWorkflow, /\$\{carrier\}:latest-stable/);
  assert.match(dailyPackageWorkflow, /oras pull "\$\{carrier\}@\$\{frozen_digest\}"/);
  assert.match(dailyPackageWorkflow, /frozen_base_release_set_generation/);
  assert.match(dailyPackageWorkflow, /frozen_base_release_set_digest/);
  assert.match(dailyPackageWorkflow, /bootstrap is forbidden on an availability error/);
  assert.match(dailyPackageWorkflow, /latest-stable exists but its exact digest could not be resolved/);
  assert.match(dailyPackageWorkflow, /release_manifests\[@\]/);
  assert.match(dailyPackageWorkflow, /\.release_set\.bom_status == "complete"/);
  assert.doesNotMatch(dailyPackageWorkflow, /Previous latest-stable App release/);
  assert.doesNotMatch(dailyPackageWorkflow, /app_version=/);
  assert.ok(dailyPackageWorkflow.indexOf('Fetch current latest-stable Release Set manifest') < dailyPackageWorkflow.indexOf('Build Package projection fingerprint'));
  assert.match(dailyPackageWorkflow, /args\+=\(--current-manifest "\$\{\{ steps\.current\.outputs\.current_manifest \}\}"\)/);
  assert.doesNotMatch(dailyPackageWorkflow, /uses:\s+\.\/\.github\/workflows\/packages\.yml/);
  assert.match(dailyPackageWorkflow, /Package publication scope:.*packages_only/);
  assert.match(dailyPackageWorkflow, /non_package_changed_components_json/);
  assert.match(dailyPackageWorkflow, /publish_required="\$\(jq -r \.publish_required/);
  assert.doesNotMatch(dailyPackageWorkflow, /publish_required == 'true'/);
  assert.doesNotMatch(dailyPackageWorkflow, /publish_required="true"/);
  assert.match(dailyPackageWorkflow, /changed_packages_json:/);
  assert.match(dailyPackageWorkflow, /owner_cohort_artifact_name:/);
  assert.doesNotMatch(dailyPackageWorkflow, /app_version:/);
  assert.doesNotMatch(dailyPackageWorkflow, /promotion_target:\s*candidate/);
  assert.doesNotMatch(dailyPackageWorkflow, /\n\s*push:\n/);
  assert.doesNotMatch(dailyPackageWorkflow, /one-person-lab-webui/);
});

test('single-Package publication is protected, selector-bound, and readback-only after unknown results', () => {
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/publish-package.yml'), 'utf8');
  const publisherPackageIds = ['mas', 'mag', 'rca', 'oma', 'obf', 'mas-scholar-skills', 'opl-flow'];
  const packageSpecs = getOplPackageSpecs();

  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.doesNotMatch(workflow, /^\s+(?:workflow_call|workflow_run|schedule):$/m);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /^    environment: release-stable$/m);
  assert.match(workflow, /^    permissions:\n      contents: read\n      packages: write$/m);
  assert.deepEqual(packageSpecs.map((spec) => spec.package_id), publisherPackageIds);
  assert.match(workflow, new RegExp(`options: \\[${publisherPackageIds.join(', ')}\\]`));
  for (const spec of packageSpecs) {
    const manifest = parseJsonText(
      fs.readFileSync(path.join(repoRoot, spec.package_manifest_ref), 'utf8'),
    ) as Record<string, unknown>;
    assert.equal(manifest.package_id, spec.package_id);
    assert.equal(manifest.source_repo, spec.repo_url);
  }
  assert.doesNotMatch(workflow, /case "\$PACKAGE_ID" in/);
  assert.match(workflow, /source_repo="\$\(jq -er \.source_repo "\$manifest"\)"/);
  assert.match(workflow, /\^https:\/\/github\\\.com\/\(\[\^\/\]\+\)\/\(\[\^\/\]\+\)\\\.git\$/);
  for (const ownerRepo of [
    'gaofeng21cn/med-autoscience',
    'gaofeng21cn/med-autogrant',
    'gaofeng21cn/mas-scholar-skills',
    'gaofeng21cn/opl-flow',
    'gaofeng21cn/opl-meta-agent',
    'gaofeng21cn/opl-bookforge',
    'gaofeng21cn/redcube-ai',
  ]) {
    assert.doesNotMatch(workflow, new RegExp(ownerRepo));
  }
  assert.match(workflow, /group: opl-package-publication-\$\{\{ inputs\.package_id \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(workflow, /\[ "\$GITHUB_SHA" = "\$EXPECTED_FRAMEWORK_SOURCE_COMMIT" \]/);
  assert.match(workflow, /scripts\/package-source-projection-gate\.mjs/);
  assert.match(workflow, /scripts\/oci-publication-preflight\.mjs/);
  assert.ok(workflow.indexOf('immutable_preflight=') < workflow.indexOf('oras push --format json'));
  assert.ok(workflow.indexOf('first_stable_digest=') < workflow.indexOf('second_stable_digest='));
  assert.ok(workflow.indexOf('second_stable_digest=') < workflow.indexOf('oras tag '));
  assert.match(workflow, /immutable_result="reconciled_after_unknown"/);
  assert.match(workflow, /stable_result="reconciled_after_unknown"/);
  assert.match(workflow, /registry_atomic_cas_claim:false/);
  assert.match(workflow, /--expected-digest "\$digest" --anonymous/g);
  assert.doesNotMatch(workflow, /one-person-lab-manifest|opl update apply|opl packages update/);
  assert.doesNotMatch(workflow, /release-set|opl-app|opl-base/i);
});

test('daily Release Set generation allocates the next immutable same-day revision', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-set-generation-'));
  const tags = path.join(root, 'tags.txt');
  fs.writeFileSync(tags, ['26.7.12', '26.7.12-r2', 'candidate', '26.7.12-r4', '26.7.11'].join('\n'));
  const next = execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/release-set-generation.mjs'),
    '--base', '26.7.12',
    '--existing-tags-file', tags,
  ], { encoding: 'utf8' }).trim();
  assert.equal(next, '26.7.12-r5');

  fs.writeFileSync(tags, 'candidate\nlatest-stable\n');
  const first = execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/release-set-generation.mjs'),
    '--base', '26.7.13',
    '--existing-tags-file', tags,
  ], { encoding: 'utf8' }).trim();
  assert.equal(first, '26.7.13');

  assert.equal(nextReleaseSetGeneration('26.7.18', ['26.7.18-r8', '26.7.18-r9']), '26.7.18-r10');
  assert.equal(compareReleaseSetGenerations('26.7.18-r10', '26.7.18-r9'), 1);
  assert.equal(compareReleaseSetGenerations('26.7.18-r11', '26.7.18-r10'), 1);
  assert.equal(compareReleaseSetGenerations('26.7.19', '26.7.18-r999'), 1);
  assert.equal(compareReleaseSetGenerations('v26.7.18-r10', '26.7.18-r10'), 0);
  assert.equal(parseReleaseSetGeneration('26.7.18-r10').revision, 10n);
  assert.throws(() => compareReleaseSetGenerations('26.7.18-rx', '26.7.18-r9'));
});

function writeDailyCatalogFixture(root: string, name: string, packages: Record<string, { version: string; digest: string; commit?: string }>) {
  const target = path.join(root, name);
  const packageCatalog = Object.fromEntries(Object.entries(packages).map(([packageId, entry]) => [packageId, {
    package_id: packageId,
    selected_version: entry.version,
    versions: [{
      package_version: entry.version,
      selection_status: 'selected_for_release_set',
      package_content_digest: entry.digest,
      owner_source_commit: entry.commit ?? null,
    }],
  }]));
  const componentIds = ['opl-base', 'opl-app', ...Object.keys(packages)];
  fs.writeFileSync(target, `${JSON.stringify({
    release_set_generation: '26.7.12',
    release_set: {
      surface_kind: 'opl_release_set.v2',
      generation: '26.7.12',
      component_count: componentIds.length,
      component_ids: componentIds,
      components: {},
    },
    packages: { package_catalog: packageCatalog },
  }, null, 2)}\n`);
  return target;
}

test('daily package detector publishes only version-bumped changed packages and rejects same-version content drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-daily-package-catalog-'));
  const current = writeDailyCatalogFixture(root, 'current.json', {
    mas: { version: '0.1.0-alpha.4', digest: `sha256:${'1'.repeat(64)}` },
    mag: { version: '0.1.0', digest: `sha256:${'2'.repeat(64)}` },
  });
  const unchanged = writeDailyCatalogFixture(root, 'unchanged.json', {
    mas: { version: '0.1.0-alpha.4', digest: `sha256:${'1'.repeat(64)}` },
    mag: { version: '0.1.0', digest: `sha256:${'2'.repeat(64)}` },
  });
  const unchangedOutput = parseJsonText(execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-channel-daily-check.mjs'),
    '--candidate-manifest', unchanged,
    '--current-manifest', current,
    '--release-set-generation', '26.7.12',
  ], { encoding: 'utf8' })) as Record<string, any>;
  assert.equal(unchangedOutput.publish_required, false);
  assert.deepEqual(unchangedOutput.changed_packages, []);

  const commitOnlyCurrent = writeDailyCatalogFixture(root, 'commit-only-current.json', {
    mas: { version: '0.1.0', digest: `sha256:${'1'.repeat(64)}`, commit: 'a'.repeat(40) },
  });
  const commitOnlyCandidate = writeDailyCatalogFixture(root, 'commit-only-candidate.json', {
    mas: { version: '0.1.0', digest: `sha256:${'1'.repeat(64)}`, commit: 'b'.repeat(40) },
  });
  const commitOnlyOutput = parseJsonText(execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-channel-daily-check.mjs'),
    '--candidate-manifest', commitOnlyCandidate,
    '--current-manifest', commitOnlyCurrent,
    '--release-set-generation', '26.7.12-r2',
  ], { encoding: 'utf8' })) as Record<string, any>;
  assert.equal(commitOnlyOutput.publish_required, false);
  assert.deepEqual(commitOnlyOutput.changed_packages, []);

  const baseCommitCurrent = writeDailyCatalogFixture(root, 'base-commit-current.json', {
    mas: { version: '0.1.0', digest: `sha256:${'1'.repeat(64)}` },
  });
  const baseCommitCandidate = writeDailyCatalogFixture(root, 'base-commit-candidate.json', {
    mas: { version: '0.1.0', digest: `sha256:${'1'.repeat(64)}` },
  });
  for (const [filePath, sourceCommit] of [[baseCommitCurrent, 'c'.repeat(40)], [baseCommitCandidate, 'd'.repeat(40)]]) {
    const payload = parseJsonText(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
    payload.release_set = {
      ...payload.release_set,
      components: {
        base: { version: '0.2.2', source_commit: sourceCommit },
        app: { version: '26.7.13', source_commit: 'e'.repeat(40), artifact_digest: `sha256:${'4'.repeat(64)}` },
      },
    };
    payload.packages.framework_core = {
      version: '0.2.2',
      source_git: { head_sha: sourceCommit },
      source_archive: { sha256: '5'.repeat(64) },
    };
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  const baseCommitOnlyOutput = parseJsonText(execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-channel-daily-check.mjs'),
    '--candidate-manifest', baseCommitCandidate,
    '--current-manifest', baseCommitCurrent,
    '--release-set-generation', '26.7.12-r3',
  ], { encoding: 'utf8' })) as Record<string, any>;
  assert.equal(baseCommitOnlyOutput.publish_required, false);
  assert.deepEqual(baseCommitOnlyOutput.changed_components, []);
  assert.deepEqual(baseCommitOnlyOutput.non_package_changed_components, []);

  const bumped = writeDailyCatalogFixture(root, 'bumped.json', {
    mas: { version: '0.1.0', digest: `sha256:${'3'.repeat(64)}` },
    mag: { version: '0.1.0', digest: `sha256:${'2'.repeat(64)}` },
  });
  const bumpedOutput = parseJsonText(execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-channel-daily-check.mjs'),
    '--candidate-manifest', bumped,
    '--current-manifest', current,
    '--release-set-generation', '26.7.12',
  ], { encoding: 'utf8' })) as Record<string, any>;
  assert.equal(bumpedOutput.publish_required, true);
  assert.deepEqual(bumpedOutput.changed_packages, ['mas']);
  assert.equal(bumpedOutput.changed_packages_json, '["mas"]');

  const unbumped = writeDailyCatalogFixture(root, 'unbumped.json', {
    mas: { version: '0.1.0-alpha.4', digest: `sha256:${'3'.repeat(64)}` },
    mag: { version: '0.1.0', digest: `sha256:${'2'.repeat(64)}` },
  });
  const unbumpedOutput = parseJsonText(execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-channel-daily-check.mjs'),
    '--candidate-manifest', unbumped,
    '--current-manifest', current,
    '--release-set-generation', '26.7.12',
  ], { encoding: 'utf8' })) as Record<string, any>;
  assert.equal(unbumpedOutput.status, 'retained_previous_stable');
  assert.equal(unbumpedOutput.publish_required, false);
  assert.deepEqual(unbumpedOutput.changed_packages, []);
  assert.deepEqual(unbumpedOutput.observed_changed_packages, ['mas']);
  assert.deepEqual(unbumpedOutput.fallback.blocking_components, ['mas']);
});

function writeFakeGh(tempRoot: string, packageVersions: Record<string, unknown[]>, missingPackages = new Set<string>()) {
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const ghPath = path.join(binDir, 'gh');
  fs.writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const { parse: parseJsonText } = JSON;
function decodePackageFromPath(raw) {
  const match = String(raw).match(/\\/packages\\/container\\/([^/]+)\\/versions/);
  return match ? decodeURIComponent(match[1]) : '';
}
if (args[0] === 'api' && args.includes('--jq')) {
  const packageName = decodePackageFromPath(args.find((arg) => String(arg).includes('/packages/container/')));
  const missing = new Set(parseJsonText(process.env.FAKE_MISSING_PACKAGES_JSON || '[]'));
  if (missing.has(packageName)) process.exit(1);
  const versions = parseJsonText(process.env.FAKE_PACKAGE_VERSIONS_JSON || '{}')[packageName] || [];
  for (const version of versions) {
    process.stdout.write(JSON.stringify(version));
    process.stdout.write('\\n');
  }
  process.exit(0);
}
if (args[0] === 'api' && args.includes('-X') && args.includes('DELETE')) {
  fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
  process.exit(0);
}
console.error('unexpected gh args: ' + JSON.stringify(args));
process.exit(2);
`,
    'utf8',
  );
  fs.chmodSync(ghPath, 0o755);
  return {
    binDir,
    env: {
      FAKE_PACKAGE_VERSIONS_JSON: JSON.stringify(packageVersions),
      FAKE_MISSING_PACKAGES_JSON: JSON.stringify([...missingPackages]),
    },
  };
}

test('GHCR package cleanup dry-runs active native helper and active package-channel packages', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ghcr-cleanup-'));
  const packageVersions = {
    'one-person-lab-native-helper': [
      { id: 1, updated_at: '2026-06-01T00:00:00Z', metadata: { container: { tags: ['darwin-arm64-0.1.0'] } } },
      { id: 2, updated_at: '2026-05-31T00:00:00Z', metadata: { container: { tags: ['linux-x64-0.1.0'] } } },
      { id: 3, updated_at: '2026-05-30T00:00:00Z', metadata: { container: { tags: ['windows-x64-0.1.0'] } } },
      { id: 4, updated_at: '2026-05-20T00:00:00Z', metadata: { container: { tags: ['old-0.0.9'] } } },
      { id: 5, updated_at: '2026-05-19T00:00:00Z', metadata: { container: { tags: ['latest'] } } },
    ],
    'one-person-lab-packages/mas': [
      { id: 11, updated_at: '2026-05-06T00:00:00Z', metadata: { container: { tags: ['26.5.6'] } } },
      { id: 12, updated_at: '2026-05-02T00:00:00Z', metadata: { container: { tags: ['26.5.2-a'] } } },
      { id: 13, updated_at: '2026-05-01T00:00:00Z', metadata: { container: { tags: ['26.5.1'] } } },
      { id: 14, updated_at: '2026-04-30T00:00:00Z', metadata: { container: { tags: ['26.4.30', 'manual-keep'] } } },
      { id: 15, updated_at: '2026-04-29T00:00:00Z', metadata: { container: { tags: ['latest-stable'] } } },
    ],
    'one-person-lab-modules/med-autoscience': [
      { id: 16, updated_at: '2026-04-01T00:00:00Z', metadata: { container: { tags: ['26.4.1'] } } },
    ],
    'one-person-lab-modules/med-autogrant': [],
    'one-person-lab-modules/redcube-ai': [],
    'one-person-lab-manifest': [
      { id: 21, updated_at: '2026-05-06T00:00:00Z', metadata: { container: { tags: ['26.5.6'] } } },
      { id: 22, updated_at: '2026-05-02T00:00:00Z', metadata: { container: { tags: ['26.5.2-a'] } } },
      { id: 23, updated_at: '2026-05-01T00:00:00Z', metadata: { container: { tags: ['26.5.1'] } } },
      { id: 24, updated_at: '2026-04-30T00:00:00Z', metadata: { container: { tags: ['26.4.30'] } } },
    ],
    'one-person-lab-framework': [
      { id: 31, updated_at: '2026-05-06T00:00:00Z', metadata: { container: { tags: ['26.5.6'] } } },
      { id: 32, updated_at: '2026-05-02T00:00:00Z', metadata: { container: { tags: ['26.5.2-a'] } } },
      { id: 33, updated_at: '2026-05-01T00:00:00Z', metadata: { container: { tags: ['26.5.1'] } } },
      { id: 34, updated_at: '2026-04-30T00:00:00Z', metadata: { container: { tags: ['26.4.30'] } } },
    ],
  };
  const { binDir, env } = writeFakeGh(tempRoot, packageVersions, new Set(['one-person-lab-packages/oma']));
  const summaryPath = path.join(tempRoot, 'summary.json');
  const logPath = path.join(tempRoot, 'gh.log');

  const result = execFileSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/cleanup-ghcr-package-versions.mjs',
    '--owner',
    'owner',
    '--summary-path',
    summaryPath,
    '--protected-tag',
    'manual-keep',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_LOG: logPath,
    },
  });

  const summary = parseJsonText(fs.readFileSync(summaryPath, 'utf8')) as any;
  assert.match(result, /opl_framework_ghcr_package_cleanup\.v1/);
  assert.equal(summary.status, 'dry_run');
  assert.deepEqual(summary.extra_protected_tags, ['manual-keep']);
  assert.equal(fs.existsSync(logPath), false);
  const nativeHelper = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-native-helper');
  assert.deepEqual(nativeHelper.protected_version_ids, [1, 2, 3, 5]);
  assert.deepEqual(nativeHelper.candidates.map((candidate: { id: number }) => candidate.id), [4]);
  const mas = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-packages/mas');
  assert.equal(mas.package_kind, 'active_package');
  assert.equal(mas.lifecycle_status, 'active_release_channel');
  assert.deepEqual(mas.protected_version_ids, [11, 12, 13, 14, 15]);
  assert.deepEqual(mas.candidates.map((candidate: { id: number }) => candidate.id), []);
  const legacyMas = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-modules/med-autoscience');
  assert.equal(legacyMas.package_kind, 'legacy_module_namespace_tombstone');
  assert.equal(legacyMas.status, 'legacy_namespace_detected');
  assert.deepEqual(legacyMas.candidates, []);
  const manifest = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-manifest');
  assert.equal(manifest.package_kind, 'active_channel_manifest');
  assert.equal(manifest.lifecycle_status, 'active_release_channel');
  const frameworkCore = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-framework');
  assert.equal(frameworkCore.package_kind, 'framework_core');
  assert.equal(frameworkCore.lifecycle_status, 'active_release_channel');
  assert.deepEqual(frameworkCore.candidates.map((candidate: { id: number }) => candidate.id), [34]);
  const missing = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-packages/oma');
  assert.equal(missing.status, 'not_found_or_unreadable');
});

test('release discipline fails closed when workflow restores tag-push or WebUI publishing', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-discipline-root-'));
  const workflowPath = path.join(tempRoot, '.github', 'workflows', 'packages.yml');
  const manifestPath = path.join(tempRoot, 'opl-release-manifest.json');
  const manifest = (runCli(['connect', 'packages', 'manifest'], {
    OPL_RELEASE_VERSION: '26.4.35',
    OPL_PACKAGES_OWNER: 'gaofeng21cn',
  }) as { packages_manifest: unknown }).packages_manifest;

  fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    workflowPath,
    [
      'name: Publish OPL Packages',
      'on:',
      '  workflow_dispatch:',
      '  workflow_call:',
      '    inputs:',
      '      release_set_generation:',
      '        required: true',
      '        type: string',
      '      release_gate:',
      '        required: true',
      '        type: string',
      '  push:',
      '    tags:',
      "      - 'v*'",
      'jobs:',
      '  module-packages:',
      '    steps:',
      '      - run: oras push "ghcr.io/example/one-person-lab-manifest:${OPL_RELEASE_SET_GENERATION}"',
      '  webui-image:',
      '    steps:',
      '      - uses: docker/build-push-action@v6',
      '        with:',
      '          tags: ghcr.io/example/one-person-lab-webui:latest',
      '',
    ].join('\n'),
    'utf8',
  );

  assert.throws(
    () => execFileSync(process.execPath, [
      path.join(repoRoot, 'scripts/package-release-discipline.mjs'),
      '--manifest',
      manifestPath,
    ], {
      cwd: tempRoot,
      encoding: 'utf8',
    }),
    /package workflow must not restore tag-push publishing/,
  );
});
