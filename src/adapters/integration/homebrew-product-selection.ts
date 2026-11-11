import brandProfile from '../../../contracts/opl-framework/brand-system-profile.json' with { type: 'json' };

type SourceItem = {
  item_id: string; name: string; kind: string; product_id?: string;
  homebrew_installed?: boolean; installed_build_kind?: string | null;
};
type CarrierPolicy = {
  kind: string; package_ref: string; release_channel?: string;
  installation_variant?: string; recommended?: boolean;
};

/** Product defaults are publisher declarations; the renderer never ranks names or versions. */
export function selectHomebrewProductTargets<T extends SourceItem>(items: T[]) {
  const declared = items.map(item => {
    const carriers = brandProfile.product_cognition_layers.flatMap(product =>
      'native_carriers' in product ? product.native_carriers as CarrierPolicy[] : []);
    const policy = carriers.find(carrier => carrier.kind === `homebrew_${item.kind}` && carrier.package_ref === item.name);
    return { ...item, release_channel: policy?.release_channel ?? 'stable',
      installation_variant: policy?.installation_variant ?? 'default',
      publisher_recommended: policy?.recommended === true };
  });
  return declared.map(item => {
    const group = declared.filter(candidate => (candidate.product_id ?? candidate.item_id) === (item.product_id ?? item.item_id));
    const receipts = group.filter(candidate => candidate.homebrew_installed === true && candidate.installed_build_kind !== 'local-development');
    const defaults = group.filter(candidate => candidate.publisher_recommended);
    const recommended = defaults.length === 1 ? defaults[0] : group.length === 1 ? group[0] : null;
    const selected = receipts.length === 1 ? receipts[0] : recommended;
    return { ...item, recommended_for_product: item.item_id === recommended?.item_id,
      selected_for_product: item.item_id === selected?.item_id,
      selection_basis: receipts.length === 1 ? 'installed_receipt' as const
        : defaults.length === 1 ? 'publisher_default' as const
          : group.length === 1 ? 'only_source' as const : 'unresolved' as const };
  });
}
