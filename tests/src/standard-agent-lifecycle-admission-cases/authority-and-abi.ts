import {
  assert,
  fs,
  path,
  test,
  fileURLToPath,
  digest,
  temporaryRoot,
  writeLifecycleContracts,
  writeLifecycleWorkspace,
  reactivationAdmission,
  prepareCanonicalLifecycleAuthorityPayload,
  standardAgentLifecycleAdmissionContract,
  prepareStandardAgentLifecycleReactivation,
  loadCanonicalMasAuthorityRequest,
  runStandardAgentHandlerSandbox,
} from './shared.ts';
import { parseStandardAgentLifecycleAdmission } from '../../../src/adapters/execution/standard-agent-domain-lifecycle-admission.ts';

test('reactivation reason is selected by the domain contract', () => {
  const fixtureRoot = temporaryRoot('opl-lifecycle-reason-');
  try {
    const admission = reactivationAdmission(writeLifecycleWorkspace(fixtureRoot));
    admission.reactivation_request.reason_code = 'domain_specific_reactivation';
    const parsed = parseStandardAgentLifecycleAdmission(admission, 'domain_specific_reactivation');
    assert.equal(parsed.mode, 'reactivation_request');
    if (parsed.mode !== 'reactivation_request') throw new Error('Expected a reactivation request.');
    assert.equal(parsed.reactivationRequest.reason_code, 'domain_specific_reactivation');
    assert.throws(
      () => parseStandardAgentLifecycleAdmission(admission, 'reviewer_revision_reactivation'),
      /does not match the owner contract/,
    );
    assert.throws(() => parseStandardAgentLifecycleAdmission(admission), /does not match the owner contract/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('lifecycle reactivation authority context keeps profile only in the top-level profile input', () => {
  const prepared = prepareCanonicalLifecycleAuthorityPayload();
  try {
    const authority = prepared.handlerPayload.authority_context as Record<string, unknown>;
    assert.deepEqual(Object.keys(authority).sort(), [
      'admission_scope_id',
      'handler_call_ref',
      'original_admission_request_ref',
      'original_admission_request_sha256',
      'original_invocation_sha256',
      'owner_ledger_ref',
      'requested_action_id',
      'requested_run_id',
    ]);
    assert.equal(Object.hasOwn(authority, 'profile_ref'), false);
    assert.equal(
      (prepared.handlerPayload.profile as Record<string, unknown>).profile_ref,
      prepared.refs.profile.ref,
    );
  } finally {
    fs.rmSync(prepared.fixtureRoot, { recursive: true, force: true });
  }
});
test('lifecycle reactivation injects every declared exact JSON byte binding and preserves legacy contracts', () => {
  const prepared = prepareCanonicalLifecycleAuthorityPayload();
  try {
    const assertExactBinding = (
      value: Record<string, unknown>,
      fields: { bytes: string; size: string; sha256: string; record: string },
    ) => {
      const bytes = Buffer.from(String(value[fields.bytes]), 'base64');
      assert.equal(value[fields.size], bytes.byteLength);
      assert.equal(value[fields.sha256], digest(bytes));
      assert.deepEqual(JSON.parse(bytes.toString('utf8')), value[fields.record]);
    };
    assertExactBinding(prepared.handlerPayload.user_authority as Record<string, unknown>, {
      bytes: 'authority_bytes_base64', size: 'authority_byte_size',
      sha256: 'authority_sha256', record: 'record',
    });
    assertExactBinding(prepared.handlerPayload.reviewer_revision_intake as Record<string, unknown>, {
      bytes: 'intake_bytes_base64', size: 'intake_byte_size',
      sha256: 'intake_sha256', record: 'record',
    });
    assertExactBinding(prepared.handlerPayload.current_lifecycle as Record<string, unknown>, {
      bytes: 'lifecycle_bytes_base64', size: 'lifecycle_byte_size',
      sha256: 'lifecycle_sha256', record: 'record',
    });
    const inventory = prepared.handlerPayload.projection_inventory as Record<string, any>;
    assert.equal(inventory.targets.length, 2);
    for (const target of inventory.targets as Record<string, unknown>[]) {
      assertExactBinding(target, {
        bytes: 'bytes_base64', size: 'byte_size', sha256: 'sha256', record: 'record',
      });
      assert.equal(
        Buffer.from(String(target.bytes_base64), 'base64').equals(
          fs.readFileSync(fileURLToPath(String(target.ref))),
        ),
        true,
      );
    }

    const catalog = JSON.parse(fs.readFileSync(path.join(
      prepared.fixtureRoot,
      'checkout',
      'contracts',
      'action_catalog.json',
    ), 'utf8'));
    const legacyAction = structuredClone(catalog.actions[0]);
    delete legacyAction.authority_boundary.lifecycle_admission_contract.exact_byte_binding_fields;
    delete legacyAction.authority_boundary.lifecycle_admission_contract.reactivation_reason_code;
    assert.equal(standardAgentLifecycleAdmissionContract(legacyAction)?.exact_byte_binding_fields, null);
    assert.equal(
      standardAgentLifecycleAdmissionContract(legacyAction)?.reactivation_reason_code,
      'reviewer_revision_reactivation',
    );

    const malformedAction = structuredClone(catalog.actions[0]);
    delete malformedAction.authority_boundary.lifecycle_admission_contract
      .exact_byte_binding_fields.projection_target.record;
    assert.throws(
      () => standardAgentLifecycleAdmissionContract(malformedAction),
      /exact_byte_binding_fields\.projection_target.*invalid exact shape/i,
    );
    const collidingAction = structuredClone(catalog.actions[0]);
    collidingAction.authority_boundary.lifecycle_admission_contract
      .exact_byte_binding_fields.user_authority.record = 'authority_sha256';
    assert.throws(
      () => standardAgentLifecycleAdmissionContract(collidingAction),
      /field names must be unique/i,
    );
  } finally {
    fs.rmSync(prepared.fixtureRoot, { recursive: true, force: true });
  }
});

test('lifecycle reactivation rejects duplicate-key invalid-UTF-8 and non-finite exact JSON sources', () => {
  const cases = [
    Buffer.from('{"study_id":"study-001","study_id":"study-001"}', 'utf8'),
    Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]),
    Buffer.from('{"overflow":1e400}', 'utf8'),
  ];
  for (const bytes of cases) {
    const fixtureRoot = temporaryRoot('opl-lifecycle-strict-json-');
    const checkoutRoot = path.join(fixtureRoot, 'checkout');
    const workspaceRoot = path.join(fixtureRoot, 'workspace');
    try {
      fs.mkdirSync(checkoutRoot, { recursive: true });
      fs.mkdirSync(workspaceRoot, { recursive: true });
      writeLifecycleContracts(checkoutRoot);
      const refs = writeLifecycleWorkspace(workspaceRoot);
      fs.writeFileSync(fileURLToPath(refs.userAuthority.ref), bytes);
      refs.userAuthority.sha256 = digest(bytes);
      const catalog = JSON.parse(fs.readFileSync(
        path.join(checkoutRoot, 'contracts', 'action_catalog.json'),
        'utf8',
      ));
      assert.throws(() => prepareStandardAgentLifecycleReactivation({
        action: { ...catalog.actions[0], action_id: 'review_and_quality_gate' },
        payload: {
          study_id: 'study-001',
          lifecycle_admission: reactivationAdmission(refs),
        },
        checkoutRoot,
        workspaceRoot,
        domainId: 'mas',
        runId: 'strict-json-rejection',
        originalInvocationSha256: 'a'.repeat(64),
      }), /strict UTF-8 JSON without duplicate keys/i);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
});

test('real MAS lifecycle authority accepts the exact OPL authority context ABI', {
  skip: process.env.OPL_REAL_MAS_ABI_SMOKE !== '1',
}, () => {
  const masRepo = process.env.OPL_REAL_MAS_REPO ?? '/Users/gaofeng/workspace/med-autoscience';
  assert.equal(fs.existsSync(masRepo), true, `MAS checkout is missing: ${masRepo}`);
  const prepared = prepareCanonicalLifecycleAuthorityPayload();
  try {
    const authority = prepared.handlerPayload.authority_context as Record<string, unknown>;
    const schema = JSON.parse(fs.readFileSync(path.join(
      masRepo,
      'contracts',
      'schemas',
      'v2',
      'mas-study-lifecycle-reactivation-authority.input.schema.json',
    ), 'utf8'));
    assert.deepEqual(
      Object.keys(authority).sort(),
      Object.keys(schema.$defs.authority_context.properties).sort(),
    );

    const request = loadCanonicalMasAuthorityRequest(masRepo);
    const intake = request.reviewer_revision_intake as Record<string, unknown>;
    const intakeRecord = intake.record as Record<string, unknown>;
    const firstOwningStageId = intakeRecord.first_owning_stage_id;
    assert.equal(typeof firstOwningStageId, 'string');
    request.authority_context = {
      ...authority,
      requested_action_id: firstOwningStageId,
    };
    const sandboxCheckout = path.join(prepared.fixtureRoot, 'sandbox-checkout');
    fs.mkdirSync(path.join(sandboxCheckout, 'src'), { recursive: true });
    fs.mkdirSync(path.join(sandboxCheckout, 'python'), { recursive: true });
    fs.cpSync(
      path.join(masRepo, 'src', 'med_autoscience'),
      path.join(sandboxCheckout, 'src', 'med_autoscience'),
      { recursive: true },
    );
    fs.cpSync(
      path.join(process.cwd(), 'python', 'opl_framework'),
      path.join(sandboxCheckout, 'python', 'opl_framework'),
      { recursive: true },
    );
    const sandboxRequest: Parameters<typeof runStandardAgentHandlerSandbox>[0] & {
      workspaceRoot: string;
      workspaceReadRoot: string;
    } = {
      checkoutRoot: sandboxCheckout,
      workspaceRoot: fs.realpathSync.native(masRepo),
      workspaceReadRoot: fs.realpathSync.native(masRepo),
      binding: {
        kind: 'python_callable',
        module: 'med_autoscience.authority_handlers.study_lifecycle_reactivation',
        callable: 'evaluate_study_lifecycle_reactivation_authority',
      },
      request,
    };
    const receipt = runStandardAgentHandlerSandbox(sandboxRequest);
    const output = receipt.output as Record<string, unknown>;
    assert.notEqual(output.status, 'invalid_host_input', JSON.stringify(output.error));
    assert.equal(output.status, 'authorized');
  } finally {
    fs.rmSync(prepared.fixtureRoot, { recursive: true, force: true });
  }
});
