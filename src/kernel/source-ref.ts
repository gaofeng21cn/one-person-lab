export type SourceRef = {
  ref_kind: string;
  ref: string;
  role: string;
  label?: string;
};

export function uniqueByRef<T extends SourceRef>(refs: readonly T[]) {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.ref_kind}:${ref.ref}:${ref.role}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function sourceRef(ref: string, role: string, label?: string): SourceRef {
  return {
    ref_kind: 'json_pointer',
    ref,
    role,
    label,
  };
}

export function fileSourceRef(ref: string, role: string, label?: string): SourceRef {
  return {
    ref_kind: 'file',
    ref,
    role,
    label,
  };
}
