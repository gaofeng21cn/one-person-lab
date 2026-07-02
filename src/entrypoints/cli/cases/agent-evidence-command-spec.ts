import {
  parseExternalEvidenceApplyArgs,
  runExternalEvidenceApply,
} from '../../../modules/ledger/external-evidence-ledger.ts';
import type { CommandSpec } from '../modules/support.ts';

export const agentsEvidenceApplySpec: CommandSpec = {
  usage: 'opl agents evidence apply --domain <domain> --request-id <id> [--mode record|verify] [--request-pack-id <id>] [--source-ref <ref>] [--evidence-ref <ref>] [--domain-receipt-ref <ref>] [--typed-blocker-ref <ref>] [--no-regression-ref <ref>] [--release-dist-ref <ref>] [--direct-hosted-parity-ref <ref>] [--owner-chain-ref <ref>] [--memory-writeback-receipt-ref <ref>] [--artifact-mutation-receipt-ref <ref>] [--package-lifecycle-receipt-ref <ref>] [--lifecycle-receipt-ref <ref>] [--restore-proof-ref <ref>] [--receipt-semantics <domain_owned_receipt_ref|domain_owned_typed_blocker_ref>] [--receipt-ref <ref>]',
  summary:
    'Record or verify OPL-owned refs-only external evidence receipts for domain-declared evidence requests without reading domain bodies.',
  examples: [
    'opl agents evidence apply --domain med-autogrant --request-id mag-hosted-caller-proof --evidence-ref mag://receipts/hosted-caller/latest.json',
    'opl agents evidence apply --domain med-autogrant --request-id mag-hosted-caller-proof --mode verify',
  ],
  group: 'domain',
  handler: (args) => runExternalEvidenceApply(parseExternalEvidenceApplyArgs(args)),
};
