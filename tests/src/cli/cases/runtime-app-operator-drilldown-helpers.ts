import { fs, path } from '../helpers.ts';
import { writeFakeOmaGeneratedSurfacePack } from '../../cli-codex-default-shell-helpers.ts';

function writeJson(file: string, payload: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function buildOmaScaleoutTarget(domainId: string, receiptKind: 'owner_receipt' | 'typed_blocker') {
  return {
    domain_id: domainId,
    target_agent_owner_receipt_refs: receiptKind === 'owner_receipt'
      ? [`owner-receipt:oma-fixture/${domainId}`]
      : [],
    typed_blocker_refs: receiptKind === 'typed_blocker'
      ? [`typed-blocker:oma-fixture/${domainId}`]
      : [],
    foundry_evidence_refs: [`foundry-evidence:oma-fixture/${domainId}`],
    no_forbidden_write_proof_refs: [`no-forbidden-write:oma-fixture/${domainId}`],
    cleanup_closeout_refs: [`cleanup:oma-fixture/${domainId}`],
    failure_evidence_refs: [`failure-evidence:oma-fixture/${domainId}`],
    root_cause_refs: [`root-cause:oma-fixture/${domainId}`],
    targeted_fix_refs: [`targeted-fix:oma-fixture/${domainId}`],
    predicted_impact_refs: [`predicted-impact:oma-fixture/${domainId}`],
    next_run_falsification_refs: [`next-run-falsification:oma-fixture/${domainId}`],
  };
}

export function createOmaContractFixture(
  fixtureRoot: string,
) {
  const repoDir = path.join(fixtureRoot, 'opl-meta-agent');
  const contractsDir = path.join(repoDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
  writeFakeOmaGeneratedSurfacePack(repoDir);
  writeJson(path.join(contractsDir, 'opl_domain_manifest_registration.json'), {
    surface_kind: 'opl_domain_manifest_registration',
    owner: 'opl-meta-agent',
    registry_owner: 'one-person-lab',
    domain_id: 'opl-meta-agent',
    domain_manifest: {
      domain_label: 'OPL Meta Agent',
      domain_descriptor_ref: 'contracts/domain_descriptor.json',
      stage_control_plane_ref: 'contracts/stage_control_plane.json',
      action_catalog_ref: 'contracts/action_catalog.json',
      pack_compiler_input_ref: 'contracts/pack_compiler_input.json',
      generated_surface_handoff_ref: 'contracts/generated_surface_handoff.json',
    },
    discovery_receipt: {
      status: 'ready_for_opl_registry_consumption',
      receipt_ref: 'discovery-receipt:opl-meta-agent/test-fixture',
    },
  });
  writeJson(path.join(contractsDir, 'app_workbench_projection.json'), {
    surface_kind: 'opl_app_workbench_projection_contract',
    domain_id: 'opl-meta-agent',
    workbench_sections: [
      { section_id: 'target_brief', projection_fields: ['domain_descriptor_ref'], write_boundary: 'display_refs_only' },
      { section_id: 'candidate_package', projection_fields: ['candidate_agent_package_ref'], write_boundary: 'display_refs_only' },
      { section_id: 'foundry_evaluation_results', projection_fields: ['scaleout_evidence_ref'], write_boundary: 'display_refs_only' },
      { section_id: 'developer_work_order', projection_fields: ['developer_patch_work_order_ref'], write_boundary: 'display_refs_only' },
      { section_id: 'mechanism_patch_proposal', projection_fields: ['mechanism_patch_proposal_ref'], write_boundary: 'display_refs_only' },
      { section_id: 'scaleout_evidence', projection_fields: ['real_target_agent_scaleout_evidence_ref'], write_boundary: 'display_refs_only' },
      {
        section_id: 'trajectory_learning',
        projection_fields: [
          'trajectory_learning_contract_ref',
          'failure_evidence_ref',
          'root_cause_ref',
          'targeted_fix_ref',
          'predicted_impact_ref',
          'next_run_falsification_ref',
          'owner_receipt_or_typed_blocker_ref',
          'foundry_re_evaluation_ref',
          'patch_absorption_ref',
        ],
        write_boundary: 'display_refs_only',
      },
    ],
    source_refs: {
      trajectory_learning_contract_ref: 'contracts/trajectory_learning_contract.json',
    },
    drilldown_readiness_receipt: {
      status: 'ready_for_app_consumption_refs_only',
      live_rendering_status: 'not_claimed_by_contract',
      receipt_ref: 'oma-app-operator:fixture/ready',
      receipt_ref_fields: [
        'developer_patch_work_order_owner_receipt_ref',
        'trajectory_atomization_receipt_ref',
      ],
      blocker_ref_fields: [
        'owner_review_receipt_or_typed_blocker_ref',
      ],
    },
  });
  writeJson(path.join(contractsDir, 'real_target_agent_scaleout_evidence.json'), {
    surface_kind: 'real_target_agent_scaleout_evidence_contract',
    domain_id: 'opl-meta-agent',
    evidence_status: 'multi_target_scaleout_closed_by_refs_only_receipts',
    multi_target_scaleout_closeout: {
      status: 'closed_by_two_real_target_refs_only_receipts',
      target_agents: [
        buildOmaScaleoutTarget('med-autoscience', 'owner_receipt'),
        buildOmaScaleoutTarget('med-autogrant', 'typed_blocker'),
      ],
    },
  });
  return repoDir;
}

export function createFamilyWorkspaceFixture(
  fixtureRoot: string,
) {
  for (const [project, domain_id, domain_label] of [
    ['med-autoscience', 'med-autoscience', 'MedAutoScience'],
    ['med-autogrant', 'med-autogrant', 'MedAutoGrant'],
    ['redcube-ai', 'redcube_ai', 'RedCube AI'],
  ]) {
    fs.mkdirSync(path.join(fixtureRoot, project, 'contracts'), { recursive: true });
    writeJson(path.join(fixtureRoot, project, 'contracts', 'domain_descriptor.json'), {
      surface_kind: 'family_domain_descriptor',
      domain_id,
      domain_label,
    });
  }
  const omaRepoDir = createOmaContractFixture(fixtureRoot);
  return { workspaceRoot: fixtureRoot, omaRepoDir };
}
