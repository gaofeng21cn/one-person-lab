import {
  assert,
  fs,
  path,
  test,
  canonicalJsonBytes,
  digest,
  temporaryRoot,
  writeLifecycleContracts,
  writeLifecycleWorkspace,
  writeNativeCarrierDescriptor,
  nativeManagedCheckout,
  applyDomainArtifactCasMaterialization,
  runStandardAgentAction,
  runStandardAgentQualificationProvisioning,
  inspectStandardAgentActionRunBinding,
} from './shared.ts';

test('internal-only lifecycle authority action rejects external invocation before reservation', async () => {
  const fixtureRoot = temporaryRoot('opl-lifecycle-internal-only-');
  const checkoutRoot = path.join(fixtureRoot, 'checkout');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  let handlerCalls = 0;
  try {
    process.env.OPL_STATE_DIR = path.join(fixtureRoot, 'state');
    fs.mkdirSync(checkoutRoot, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    writeLifecycleContracts(checkoutRoot);
    writeNativeCarrierDescriptor(checkoutRoot);
    writeLifecycleWorkspace(workspaceRoot);
    await assert.rejects(runStandardAgentAction({
      domainId: 'mas',
      actionId: 'reactivate_study',
      workspaceRoot,
      payload: {
        study_id: 'study-001',
        internal_standard_agent_action_invocation: true,
      },
      runId: 'external-internal-only',
    }, {
      resolveManagedCheckout: async () => ({
        ...nativeManagedCheckout(checkoutRoot, workspaceRoot),
      }) as never,
      runHandler: (() => {
        handlerCalls += 1;
        throw new Error('internal handler must not run');
      }) as never,
    }), (error: any) => {
      assert.equal(error.details?.failure_code,
        'standard_agent_internal_action_external_invocation_forbidden');
      return true;
    });
    assert.equal(handlerCalls, 0);
    assert.equal(inspectStandardAgentActionRunBinding({
      workspaceRoot,
      runId: 'external-internal-only',
    }), null);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

for (const customIdentity of [false, true]) {
test(`trusted qualification provisioning materializes owner bytes and replays with ${customIdentity ? 'custom' : 'MAS'} identity`, async () => {
  const fixtureRoot = temporaryRoot('opl-qualification-provisioning-');
  const checkoutRoot = path.join(fixtureRoot, 'checkout');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  let handlerCalls = 0;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    fs.mkdirSync(checkoutRoot, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    writeLifecycleContracts(checkoutRoot);
    writeNativeCarrierDescriptor(checkoutRoot);
    const idField = customIdentity ? 'case_id' : 'study_id';
    const rootField = customIdentity ? 'case_root' : 'canonical_study_root';
    const identityField = customIdentity ? 'case_identity' : 'study_identity';
    const rootDirectory = customIdentity ? 'cases' : 'studies';
    const lifecycleSuffix = customIdentity ? 'state/current.json' : 'control/lifecycle.json';
    const receiptSuffix = customIdentity ? 'receipts/provision.json' : 'artifacts/controller/qualification/provisioning-receipt.json';
    if (customIdentity) {
      const profilePath = path.join(checkoutRoot, 'contracts', 'qualification-provisioning.json');
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      profile.host_validation_profile.identity_output_field = identityField;
      profile.host_validation_profile.work_item_id_field = idField;
      profile.host_validation_profile.work_item_root_field = rootField;
      profile.workspace_binding.work_item_root_template = `${rootDirectory}/{${idField}}`;
      profile.workspace_binding.lifecycle_target_template = `${rootDirectory}/{${idField}}/${lifecycleSuffix}`;
      profile.workspace_binding.receipt_target_template = `${rootDirectory}/{${idField}}/${receiptSuffix}`;
      const profileBytes = canonicalJsonBytes(profile);
      fs.writeFileSync(profilePath, profileBytes);
      const catalogPath = path.join(checkoutRoot, 'contracts', 'action_catalog.json');
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      catalog.actions.find((action: { action_id: string }) => action.action_id === profile.action_id)
        .authority_boundary.qualification_provisioning_contract.sha256 = digest(profileBytes);
      fs.writeFileSync(catalogPath, JSON.stringify(catalog));
    }
    const canonicalWorkspaceRoot = fs.realpathSync.native(workspaceRoot);
    const issuedAt = '2026-07-22T00:00:00.000Z';
    const authorityRecord = {
      surface_kind: 'mas_qualification_work_item_provisioning_authority',
      schema_version: 1,
      authority_ref: 'mas-qualification-authority:fixture',
      domain_owner: 'MedAutoScience',
      domain_id: 'medautoscience',
      canonical_workspace_root: canonicalWorkspaceRoot,
      qualification_scope: 'standard_agent_full_vm_qualification',
      issued_at: issuedAt,
      single_use: true,
      qualification_only: true,
      provisions_work_item: true,
      authorizes_stage_body: false,
      authorizes_business_action: false,
      authorizes_publication: false,
      authorizes_submission: false,
      provider_completion_is_domain_completion: false,
    };
    const authorityBytes = canonicalJsonBytes(authorityRecord);
    const authoritySha256 = digest(authorityBytes);
    const studyId = `qualification-${authoritySha256}`;
    const studyRoot = `${rootDirectory}/${studyId}`;
    const lifecycleRelativePath = `${studyRoot}/${lifecycleSuffix}`;
    const receiptRelativePath = `${studyRoot}/${receiptSuffix}`;
    const workspaceIndexBytes = canonicalJsonBytes({ studies: [{ study_id: studyId, status: 'qualification_only' }] });
    const lifecycleBytes = canonicalJsonBytes({
      study_id: studyId,
      lifecycle_state: 'active',
      lifecycle_generation: 1,
      business_status: 'qualification_only',
      qualification_only: true,
      stage_body_authorized: false,
    });
    const receiptFingerprint = 'b'.repeat(64);
    const receipt = {
      surface_kind: 'mas_qualification_work_item_provisioning_receipt',
      schema_version: 1,
      domain_owner: 'MedAutoScience',
      domain_id: 'medautoscience',
      canonical_workspace_root: canonicalWorkspaceRoot,
      [idField]: studyId,
      [rootField]: studyRoot,
      lifecycle_state: 'active',
      lifecycle_generation: 1,
      qualification_scope: 'standard_agent_full_vm_qualification',
      qualification_authority_ref: authorityRecord.authority_ref,
      qualification_authority_sha256: authoritySha256,
      qualification_authority_byte_size: authorityBytes.byteLength,
      handler_call_ref: 'mas-handler-call:fixture',
      owner_ledger_ref: 'mas-owner-ledger:fixture',
      workspace_index_ref: 'workspace_index.json',
      workspace_index_before_sha256: null,
      workspace_index_after_sha256: `sha256:${digest(workspaceIndexBytes)}`,
      lifecycle_relative_path: lifecycleRelativePath,
      lifecycle_sha256: `sha256:${digest(lifecycleBytes)}`,
      receipt_relative_path: receiptRelativePath,
      issued_at: issuedAt,
      single_use: true,
      qualification_only: true,
      stage_body_authorized: false,
      business_action_authorized: false,
      publication_authorized: false,
      submission_authorized: false,
      requires_opl_cas_materialization_receipt: true,
      materialization_semantics: 'journaled_all_or_rollback',
      provider_completion_is_domain_completion: false,
      receipt_ref: `mas-qualification-work-item-provisioning:${receiptFingerprint}`,
      receipt_fingerprint: `sha256:${receiptFingerprint}`,
    };
    const replacements = [
      { relative: 'workspace_index.json', bytes: workspaceIndexBytes },
      { relative: lifecycleRelativePath, bytes: lifecycleBytes },
      { relative: receiptRelativePath, bytes: canonicalJsonBytes(receipt) },
    ];
    const operations = replacements.map(({ relative, bytes }) => ({
      target_relative_path: relative,
      precondition: { kind: 'absent' },
      replacement_bytes_base64: bytes.toString('base64'),
      replacement_sha256: digest(bytes),
      replacement_byte_size: bytes.byteLength,
    }));
    const absentPaths = operations.map((operation) => operation.target_relative_path).sort();
    const operationsSha256 = digest(canonicalJsonBytes(operations));
    const materializationScopeSha256 = digest(canonicalJsonBytes({
      operations,
      absent_relative_path_preconditions: absentPaths,
    }));
    const requestId = `mas-qualification-provisioning-cas-request:${'c'.repeat(64)}`;
    const authorizationRef = `mas-qualification-work-item-cas-authorization:${'d'.repeat(64)}`;
    const output = {
      surface_kind: 'mas_qualification_work_item_provisioning_authority_result',
      schema_version: 1,
      status: 'authorized',
      [identityField]: { [idField]: studyId, [rootField]: studyRoot },
      provisioning_receipt: receipt,
      provisioning_receipt_content_binding: {
        surface_kind: 'mas_qualification_work_item_provisioning_receipt_content_binding',
        schema_version: 1,
        receipt_ref: receipt.receipt_ref,
        target_relative_path: receiptRelativePath,
        sha256: digest(canonicalJsonBytes(receipt)),
        byte_size: canonicalJsonBytes(receipt).byteLength,
      },
      mas_qualification_work_item_cas_mutation_authorization: {
        surface_kind: 'mas_qualification_work_item_cas_mutation_authorization',
        version: 'mas-qualification-work-item-cas-mutation-authorization.v1',
        authorized: true,
        authorization_ref: authorizationRef,
        capability_id: 'opl_domain_artifact_cas_materialization.v1',
        request_id: requestId,
        domain_id: 'medautoscience',
        operations_sha256: operationsSha256,
        materialization_scope_sha256: materializationScopeSha256,
        absent_relative_path_preconditions: absentPaths,
        authority_receipt_ref: receipt.receipt_ref,
        satisfied_gate_ids: [],
      },
      opl_host_materialization_request: {
        surface_kind: 'opl_domain_artifact_cas_materialization_request',
        version: 'opl-domain-artifact-cas-materialization.v1',
        capability_id: 'opl_domain_artifact_cas_materialization.v1',
        request_id: requestId,
        domain_id: 'medautoscience',
        authorization_ref: authorizationRef,
        operations_sha256: operationsSha256,
        materialization_scope_sha256: materializationScopeSha256,
        absent_relative_path_preconditions: absentPaths,
        operations,
      },
      typed_blocker: null,
      error: null,
    };
    let handlerOutput = output;
    let materializationCalls = 0;
    const dependencies = {
      resolveManagedCheckout: async () => ({
        ...nativeManagedCheckout(checkoutRoot, workspaceRoot),
      }) as never,
      runHandler: (() => {
        handlerCalls += 1;
        return {
          runtime_kind: 'python_audit_hook',
          sandbox_kind: 'macos_sandbox_exec',
          exit_code: 0,
          timed_out: false,
          stdout_bytes: canonicalJsonBytes(handlerOutput),
          stderr: '',
          output: handlerOutput,
        };
      }) as never,
      applyDomainArtifactCas: ((...args: Parameters<typeof applyDomainArtifactCasMaterialization>) => {
        materializationCalls += 1;
        return applyDomainArtifactCasMaterialization(...args);
      }) as never,
      recordLedger: ((input: Record<string, unknown>) => ({
        ledger_entry: { run_id: input.runId, status: input.status },
        recorded_event: { event_type: 'standard_agent_action_run_recorded' },
      })) as never,
    };
    const input = {
      domainId: 'mas',
      actionId: 'qualification_work_item_provisioning_authority_evaluate',
      workspaceRoot,
      payload: {
        surface_kind: 'mas_qualification_work_item_provisioning_authority_request',
        schema_version: 1,
        authority_context: {},
        qualification_authority: {
          authority_sha256: authoritySha256,
          authority_bytes_base64: authorityBytes.toString('base64'),
          authority_byte_size: authorityBytes.byteLength,
          record: authorityRecord,
        },
        current_workspace_index: {},
      },
      runId: 'qualification-provisioning-fixture',
    };

    const tamperCases: Array<{
      label: string;
      schemaFailure?: boolean;
      mutate: (candidate: typeof output) => void;
    }> = [
      {
        label: 'stage authorization',
        mutate: (candidate) => { candidate.provisioning_receipt.stage_body_authorized = true; },
      },
      {
        label: 'authorization surface',
        schemaFailure: true,
        mutate: (candidate) => { delete (candidate.mas_qualification_work_item_cas_mutation_authorization as any).surface_kind; },
      },
      {
        label: 'authorization version',
        schemaFailure: true,
        mutate: (candidate) => { delete (candidate.mas_qualification_work_item_cas_mutation_authorization as any).version; },
      },
      {
        label: 'owner lifecycle state',
        schemaFailure: true,
        mutate: (candidate) => { candidate.provisioning_receipt.lifecycle_state = 'archived'; },
      },
      {
        label: 'operation count',
        mutate: (candidate) => { candidate.opl_host_materialization_request.operations.pop(); },
      },
      {
        label: 'operation path',
        mutate: (candidate) => {
          candidate.opl_host_materialization_request.operations[1]!.target_relative_path =
            `${studyRoot}/control/not-lifecycle.json`;
        },
      },
    ];
    for (const [index, tamper] of tamperCases.entries()) {
      handlerOutput = structuredClone(output);
      tamper.mutate(handlerOutput);
      await assert.rejects(
        runStandardAgentQualificationProvisioning({
          ...input,
          runId: `qualification-provisioning-tamper-${index}`,
        }, dependencies),
        (error: any) => tamper.schemaFailure
          ? error.code === 'contract_shape_invalid' && error.details?.schema_ref === 'contracts/qualification-provisioning-output.schema.json'
          : error.details?.failure_code === 'qualification_provisioning_contract_mismatch',
        tamper.label,
      );
      assert.equal(materializationCalls, 0, tamper.label);
      for (const replacement of replacements) {
        assert.equal(fs.existsSync(path.join(canonicalWorkspaceRoot, replacement.relative)), false, tamper.label);
      }
    }
    handlerOutput = output;

    const ownerContractPath = path.join(checkoutRoot, 'contracts', 'qualification-provisioning.json');
    const ownerContractBytes = fs.readFileSync(ownerContractPath);
    const changedContract = JSON.parse(ownerContractBytes.toString('utf8'));
    changedContract.workspace_binding.lifecycle_target_template = 'unbound/{study_id}.json';
    fs.writeFileSync(ownerContractPath, JSON.stringify(changedContract));
    await assert.rejects(
      runStandardAgentQualificationProvisioning({ ...input, runId: 'qualification-owner-digest-mismatch' }, dependencies),
      (error: any) => error.details?.failure_code === 'qualification_provisioning_contract_mismatch',
    );
    assert.equal(handlerCalls, tamperCases.length);
    assert.equal(materializationCalls, 0);
    fs.writeFileSync(ownerContractPath, ownerContractBytes);

    const first = await runStandardAgentQualificationProvisioning(input, dependencies);
    const replay = await runStandardAgentQualificationProvisioning(input, dependencies);
    const firstRun = first.standard_agent_action_run;
    const replayRun = replay.standard_agent_action_run;
    assert.ok('result' in firstRun);
    assert.ok('host_materialization' in firstRun);
    assert.ok('host_materialization' in replayRun);
    const firstResult = firstRun.result as Record<string, Record<string, string>>;
    const firstMaterialization = firstRun.host_materialization as { receipt_path: string } | null;
    const replayMaterialization = replayRun.host_materialization as { receipt_path: string } | null;
    assert.ok(firstMaterialization);
    assert.ok(replayMaterialization);
    assert.equal(firstResult[identityField]![idField], studyId);
    assert.equal(firstMaterialization.receipt_path, replayMaterialization.receipt_path);
    assert.equal(handlerCalls, tamperCases.length + 1);
    assert.equal(materializationCalls, 2);
    for (const replacement of replacements) {
      assert.equal(
        fs.readFileSync(path.join(canonicalWorkspaceRoot, replacement.relative)).equals(replacement.bytes),
        true,
      );
    }

    const catalogFile = path.join(checkoutRoot, 'contracts', 'action_catalog.json');
    const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
    const action = catalog.actions.find((candidate: Record<string, unknown>) => (
      candidate.action_id === input.actionId
    ));
    action.authority_boundary.host_materialization_contract.receipt_output_field = 'wrong_receipt';
    fs.writeFileSync(catalogFile, JSON.stringify(catalog));
    await assert.rejects(
      runStandardAgentQualificationProvisioning({ ...input, runId: 'qualification-contract-mismatch' }, dependencies),
      (error: any) => error.details?.failure_code === 'qualification_provisioning_contract_mismatch',
    );
    assert.equal(handlerCalls, tamperCases.length + 1);
    assert.equal(materializationCalls, 2);
    assert.equal(inspectStandardAgentActionRunBinding({
      workspaceRoot,
      runId: 'qualification-contract-mismatch',
    }), null);

    const runStateRoot = path.join(canonicalWorkspaceRoot, 'control', 'opl', 'action_run_state', input.runId);
    const planPath = path.join(runStateRoot, 'plan.json');
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    const frozenAction = plan.catalog.actions.find((candidate: { action_id: string }) => candidate.action_id === input.actionId);
    delete frozenAction.authority_boundary.qualification_provisioning_contract;
    const bindingPath = path.join(runStateRoot, 'binding.json');
    const binding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'));
    binding.hosted_runtime_binding.action_contracts_sha256 = `sha256:${digest(canonicalJsonBytes({
      action_catalog: plan.catalog, handler_registry: plan.handler_registry,
    }))}`;
    binding.hosted_runtime_binding_ref = `opl://hosted-agent-runtime-binding/sha256/${digest(canonicalJsonBytes(binding.hosted_runtime_binding))}`;
    plan.hosted_runtime_binding_ref = binding.hosted_runtime_binding_ref;
    const legacyPlanBytes = canonicalJsonBytes(plan);
    fs.writeFileSync(planPath, legacyPlanBytes);
    binding.plan_sha256 = digest(legacyPlanBytes);
    binding.plan_byte_size = legacyPlanBytes.byteLength;
    fs.writeFileSync(bindingPath, canonicalJsonBytes(binding));
    const completionPath = path.join(runStateRoot, 'completion.json');
    const completion = JSON.parse(fs.readFileSync(completionPath, 'utf8'));
    completion.hosted_runtime_binding_ref = binding.hosted_runtime_binding_ref;
    fs.writeFileSync(completionPath, canonicalJsonBytes(completion));
    const casReceipt = JSON.parse(fs.readFileSync(firstMaterialization.receipt_path, 'utf8'));
    casReceipt.domain_authority_result.hosted_runtime_binding_ref = binding.hosted_runtime_binding_ref;
    fs.writeFileSync(firstMaterialization.receipt_path, canonicalJsonBytes(casReceipt));
    fs.rmSync(checkoutRoot, { recursive: true, force: true });

    const snapshot = () => [stateRoot, canonicalWorkspaceRoot].flatMap((root) => (
      fs.readdirSync(root, { recursive: true, encoding: 'utf8' }).sort().map((relative) => {
        const file = path.join(root, relative);
        const stat = fs.statSync(file);
        return [file, stat.mtimeMs, stat.isFile() ? digest(fs.readFileSync(file)) : null];
      })
    ));
    const beforeLegacyReplay = snapshot();
    const legacyReplay = await runStandardAgentQualificationProvisioning(input, dependencies);
    assert.ok('result' in legacyReplay.standard_agent_action_run);
    assert.deepEqual(legacyReplay.standard_agent_action_run.result, firstResult);
    assert.deepEqual(snapshot(), beforeLegacyReplay, 'completed legacy replay must only read existing CAS state');
    assert.equal(handlerCalls, tamperCases.length + 1);

    fs.unlinkSync(firstMaterialization.receipt_path);
    const beforeMissingReceiptReplay = snapshot();
    await assert.rejects(
      runStandardAgentQualificationProvisioning(input, dependencies),
      /existing settled CAS receipt/,
    );
    assert.deepEqual(snapshot(), beforeMissingReceiptReplay, 'missing receipt must not recreate CAS state or artifacts');
    assert.equal(handlerCalls, tamperCases.length + 1);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
}
