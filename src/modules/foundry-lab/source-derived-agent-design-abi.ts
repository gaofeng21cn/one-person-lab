export const SOURCE_DERIVED_AGENT_DESIGN_TYPED_OBJECTS = {
  reference_design_packet: {
    surface_kind: 'opl_foundry_reference_design_packet',
    version: 'opl.foundry.reference-design-packet.v1',
    identity_ref_field: 'packet_ref',
  },
  transfer_map: {
    surface_kind: 'opl_foundry_transfer_map',
    version: 'opl.foundry.transfer-map.v1',
    identity_ref_field: 'transfer_map_ref',
  },
  agent_pack_plan: {
    surface_kind: 'opl_foundry_agent_pack_plan',
    version: 'opl.foundry.agent-pack-plan.v1',
    identity_ref_field: 'plan_ref',
  },
  design_admission_receipt: {
    surface_kind: 'opl_foundry_design_admission_receipt',
    version: 'opl.foundry.design-admission-receipt.v1',
    identity_ref_field: 'receipt_ref',
  },
  build_receipt: {
    surface_kind: 'opl_foundry_agent_build_receipt',
    version: 'opl.foundry.agent-build-receipt.v1',
    identity_ref_field: 'receipt_ref',
  },
} as const;
