import { assert, fs, parseJsonText, path, repoRoot, test } from '../helpers.ts';

const pluginRoot = path.join(repoRoot, 'plugins', 'opl-foundation-skills');
const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');

const expectedSkills = [
  {
    id: 'opl-runway-compute-operator',
    tokens: [
      'Runway / Connect as the programmatic authority',
      'provider ready',
      'runtime ready',
      'handoff/receipt briefing',
    ],
  },
  {
    id: 'opl-runway-recovery-playbook-writer',
    tokens: [
      'failed Runway path',
      'recovery_playbook',
      'Runway/Connect/provider readback',
      'no provider/runtime/readiness claim',
    ],
  },
  {
    id: 'opl-stagecraft-stage-designer',
    tokens: [
      'Stagecraft contract',
      'AI strategy',
      'handoff_lower_bound',
      'authority_boundary',
    ],
  },
  {
    id: 'opl-stage-quality-gate-critic',
    tokens: [
      'stage quality gate',
      'evidence lower bound',
      'recommended_gate_delta',
      'no quality verdict',
    ],
  },
  {
    id: 'opl-connect-source-and-skill-router',
    tokens: [
      'single_skill_sync',
      'refs_only_review',
      'no_authority_flags',
      'Do not full-install external skill libraries',
    ],
  },
  {
    id: 'opl-connect-connector-receipt-auditor',
    tokens: [
      'connector receipt candidate',
      'failed-provider records',
      'receipt_evidence_gap',
      'no connector/domain/readiness claim',
    ],
  },
  {
    id: 'opl-foundry-agent-improver',
    tokens: [
      'Foundry Lab as the owner',
      'skill_prompt_defect',
      'promotion, rollback, or hold recommendation',
      'no-authority caveat',
    ],
  },
  {
    id: 'opl-foundry-promotion-reviewer',
    tokens: [
      'promotion candidate',
      'operational confidence',
      'promotion_recommendation',
      'no promotion mutation',
    ],
  },
  {
    id: 'opl-workspace-handoff-writer',
    tokens: [
      'OPL Workspace and the owning program surface',
      'missing_input_route_back',
      'handoff packet',
      'Do not invent, mutate, normalize, or relocate source/artifact truth',
    ],
  },
  {
    id: 'opl-workspace-source-readiness-auditor',
    tokens: [
      'source material is ready',
      'ambiguous_locator',
      'artifact_unit_gap',
      'no source readiness claim',
    ],
  },
  {
    id: 'opl-ledger-evidence-curator',
    tokens: [
      'append-only ledger',
      'evidence sufficiency',
      'evidence_gap',
      'non-authoritative evidence brief',
    ],
  },
  {
    id: 'opl-console-operator-copilot',
    tokens: [
      'current_owner_delta',
      'action_catalog',
      'forbidden_claim_review',
      'Do not execute actions',
    ],
  },
  {
    id: 'opl-pack-capability-reviewer',
    tokens: [
      'pack compiler, schema, validator',
      'capability ABI',
      'professional method',
      'generated or hosted surface',
    ],
  },
  {
    id: 'opl-pack-admission-reviewer',
    tokens: [
      'pack admission candidate',
      'authority ABI',
      'admission_recommendation',
      'no registry mutation',
    ],
  },
  {
    id: 'opl-atlas-capability-router',
    tokens: [
      'catalog registry, lifecycle index, and refs graph',
      'capability_route',
      'catalog ambiguity',
      'refs-only route packet',
    ],
  },
  {
    id: 'opl-charter-authority-reviewer',
    tokens: [
      'authority-boundary defects',
      'no owner receipts',
      'no typed blockers',
      'no readiness claims',
    ],
  },
  {
    id: 'opl-completion-audit-writer',
    tokens: [
      'Plan Completion Audit',
      'done',
      'partial',
      'forbidden_claims',
    ],
  },
  {
    id: 'opl-incident-root-cause-triager',
    tokens: [
      'L0_symptom',
      'L3_owner_repair_path',
      'root_cause_class',
      'blocker_to_owner_map',
    ],
  },
  {
    id: 'opl-eval-harness-designer',
    tokens: [
      'Foundry Lab evaluation harness',
      'task_cases',
      'scorecard',
      'promotion_or_hold_evidence',
    ],
  },
  {
    id: 'opl-domain-progress-transition-reviewer',
    tokens: [
      'DomainProgressTransitionRuntime',
      'transition_recommendation',
      'route-back',
      'no domain progress claim',
    ],
  },
  {
    id: 'opl-owner-evidence-intake-reviewer',
    tokens: [
      'owner_evidence_intake',
      'observed refs',
      'evidence_intake_gap',
      'no owner acceptance claim',
    ],
  },
  {
    id: 'opl-source-module-boundary-reviewer',
    tokens: [
      'source-module boundary',
      'public entrypoint',
      'forbidden_dependency',
      'no source-module mutation',
    ],
  },
  {
    id: 'opl-memory-artifact-lifecycle-curator',
    tokens: [
      'memory/artifact lifecycle',
      'refs-only lifecycle brief',
      'artifact body',
      'no memory or artifact authority',
    ],
  },
  {
    id: 'opl-agent-package-trust-reviewer',
    tokens: [
      'agent package trust',
      'manifest digest',
      'trust_risk',
      'no install-ready claim',
    ],
  },
  {
    id: 'opl-external-runtime-provider-fit-reviewer',
    tokens: [
      'external runtime provider fit',
      'sandbox substrate',
      'provider_fit',
      'no provider readiness claim',
    ],
  },
  {
    id: 'opl-brand-l5-evidence-reviewer',
    tokens: [
      'Brand L5 evidence packet',
      'l5_evidence_gap',
      'no Brand L5 claim',
      'no credential or endpoint lifecycle',
    ],
  },
  {
    id: 'opl-app-release-evidence-reviewer',
    tokens: [
      'App release evidence',
      'release cohort refs',
      'release_evidence_gap',
      'no App release-ready claim',
    ],
  },
  {
    id: 'opl-runtime-soak-and-recovery-auditor',
    tokens: [
      'runtime soak evidence',
      'provider observations',
      'soak_evidence_gap',
      'no runtime queue writes',
    ],
  },
  {
    id: 'opl-native-helper-diagnostics-reviewer',
    tokens: [
      'native helper diagnostics',
      'helper envelopes',
      'native_helper_envelope_gap',
      'no native-helper health claim',
    ],
  },
  {
    id: 'opl-user-workbench-action-reviewer',
    tokens: [
      'user workbench action candidates',
      'action_catalog_gap',
      'safe_to_present',
      'no action execution claim',
    ],
  },
] as const;

function readJson(pathname: string) {
  return parseJsonText(fs.readFileSync(pathname, 'utf8')) as any;
}

function readSkill(skillId: string) {
  return fs.readFileSync(path.join(pluginRoot, 'skills', skillId, 'SKILL.md'), 'utf8');
}

function frontmatter(contents: string) {
  const match = contents.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md must contain YAML frontmatter');
  return match[1];
}

function assertContains(contents: string, token: string) {
  assert.equal(contents.includes(token), true, `Expected contents to include ${token}`);
}

test('OPL Foundation Skills plugin manifest exposes a source-only support skill pack', () => {
  const manifest = readJson(manifestPath);

  assert.equal(manifest.name, 'opl-foundation-skills');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.author.name, 'One Person Lab');
  assert.equal(manifest.interface.displayName, 'OPL Foundation Skills');
  assert.equal(manifest.interface.category, 'Productivity');
  assert.equal(manifest.interface.capabilities.includes('Skill'), true);
  assert.equal(manifest.interface.defaultPrompt.length <= 3, true);
  assert.equal(
    manifest.interface.defaultPrompt.every((prompt: string) => prompt.length <= 128),
    true,
  );

  for (const skill of expectedSkills) {
    assert.equal(
      fs.existsSync(path.join(pluginRoot, 'skills', skill.id, 'SKILL.md')),
      true,
      `${skill.id} must be materialized as source-only SKILL.md`,
    );
  }
});

test('OPL Foundation Skills frontmatters are discoverable by Codex', () => {
  for (const skill of expectedSkills) {
    const metadata = frontmatter(readSkill(skill.id));
    assert.match(metadata, new RegExp(`^name:\\s+${skill.id}$`, 'm'));
    assert.match(metadata, /^description:\s+.*OPL .+/m);
    assert.match(metadata, /Use when|Use for|Design OPL/m);
  }
});

test('OPL Foundation Skills preserve no-authority boundaries while covering AI-first support work', () => {
  for (const skill of expectedSkills) {
    const contents = readSkill(skill.id);
    for (const token of skill.tokens) {
      assertContains(contents, token);
    }
    for (const token of [
      'owner receipts',
      'typed blockers',
      'readiness',
    ]) {
      assertContains(contents, token);
    }
  }
});
