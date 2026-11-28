"""Locate official Catalog Package inputs and source roots."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from .common import ReleaseError, safe_path


CATALOG_REPOSITORY = 'gaofeng21cn/opl-catalog'
CATEGORIES = ('agents', 'applications', 'extensions', 'channels', 'dependencies')


def package_source_roots(manifest, allowlist):
    declared = manifest.get('source_root')
    if declared is not None:
        roots = (declared,)
    else:
        carrier = allowlist.get('source_root', '.')
        roots = ('.',) if carrier == '.' else (carrier, '.')
    for root in roots:
        if root != '.' and (not isinstance(root, str) or re.match(r'^[A-Za-z]:', root)
                            or '\\' in root or '\0' in root
                            or any(part in ('', '.', '..') for part in root.split('/'))):
            raise ReleaseError('Package source_root must be a safe owner-relative path')
    return roots


def catalog_root_from(args):
    root = getattr(args, 'catalog_root', None) or os.getenv('OPL_CATALOG_ROOT')
    return Path(root).resolve() if root else None


class PackageProjection:
    def __init__(self, framework, catalog):
        if not catalog:
            raise ReleaseError('v2 Package publication requires the official Catalog')
        self.framework = Path(framework)
        self.catalog = Path(catalog)
        self.root = self.catalog
        self.packages = self.catalog / 'packages'
        self.allowlists = self.catalog / 'allowlists'

    def manifest_paths(self):
        return sorted(
            path
            for category in CATEGORIES
            for path in (self.packages / category).glob('*.json')
        )

    def admitted_package_specs(self):
        specs = []
        for path in self.manifest_paths():
            manifest = json.loads(path.read_text())
            if manifest.get('publication_channel_admission') in ('retired', 'development_only'):
                continue
            carrier = (manifest.get('codex_surface') or {}).get('configured_codex_plugin_carrier') or {}
            publication_ref = carrier.get('publication_ref')
            if not isinstance(publication_ref, str) or not publication_ref:
                continue
            specs.append({
                'package_id': manifest['package_id'],
                'visibility': manifest.get('visibility', 'public'),
                'manifest_path': path,
                'manifest': manifest,
                'publication_ref': publication_ref,
            })
        return specs

    def manifest(self, package_id):
        if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*', package_id):
            raise ReleaseError('Invalid Package id')
        matches = [path for path in self.manifest_paths() if path.name == f'{package_id}.json']
        if len(matches) != 1:
            raise ReleaseError(f'Catalog must declare one Package manifest for {package_id}')
        return matches[0]

    def allowlist(self, package_id):
        return self.allowlists / f'{package_id}.json'

    def v2_payload(self, manifest):
        facet = manifest.get('v2_release')
        if not isinstance(facet, dict) or not facet.get('payload_manifest_ref'):
            raise ReleaseError('Package manifest must declare v2_release metadata')
        return safe_path(self.packages, facet['payload_manifest_ref'])

    def changed_files(self, package_id):
        return [
            self.manifest(package_id),
            self.allowlist(package_id),
            *sorted((self.packages / 'payloads').glob(f'{package_id}-*.json')),
            self.catalog / 'catalog-index.json',
        ]
