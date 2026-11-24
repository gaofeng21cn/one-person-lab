import { trackedCarrierBlobPaths } from '../src/authority/packages/carrier-projection.ts';

export function packageCarrierSourcePaths({ allowlist, sourceCommit, readGit }) {
  const projectionRef = allowlist.carrier_projection_ref;
  if (projectionRef === undefined) return null;
  if (projectionRef !== 'contracts/carrier_projection.json') {
    throw new Error('The carrier projection must use the canonical owner contract path.');
  }

  const records = readGit(['ls-tree', '-r', '--full-tree', '-z', sourceCommit]).toString('utf8');
  const trackedPaths = new Set();
  for (const entry of records.split('\0').filter(Boolean)) {
    const separator = entry.indexOf('\t');
    if (separator < 0) throw new Error('Git returned an invalid source tree record.');
    trackedPaths.add(entry.slice(separator + 1));
  }
  // Previously published commits can predate the opt-in contract.
  if (!trackedPaths.has(projectionRef)) return null;
  const projection = JSON.parse(readGit(['show', `${sourceCommit}:${projectionRef}`]).toString('utf8'));
  return trackedCarrierBlobPaths({
    projection,
    projectionRef,
    carrierRoot: allowlist.source_root,
    trackedPaths,
    carrierPaths: allowlist.paths,
  });
}
