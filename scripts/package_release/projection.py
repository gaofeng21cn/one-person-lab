"""Locate the existing Package inputs in Catalog or a legacy Framework checkout."""
from __future__ import annotations

import os
import re
from pathlib import Path

from .common import ReleaseError, safe_path


CATALOG_REPOSITORY = 'gaofeng21cn/opl-catalog'
CATEGORIES = ('agents', 'applications', 'extensions', 'channels', 'dependencies')


def catalog_root_from(args):
    root = getattr(args, 'catalog_root', None) or os.getenv('OPL_CATALOG_ROOT')
    return Path(root).resolve() if root else None


class PackageProjection:
    def __init__(self, framework, catalog=None):
        self.catalog = catalog
        self.root = catalog or framework
        self.packages = catalog / 'packages' if catalog else framework / 'contracts/opl-framework/packages'
        self.allowlists = catalog / 'allowlists' if catalog else framework / 'contracts/opl-framework/package-payload-allowlists'

    def manifest_paths(self):
        directories = [self.packages / category for category in CATEGORIES] if self.catalog else [self.packages]
        return sorted(path for directory in directories for path in directory.glob('*.json'))

    def manifest(self, package_id):
        if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*', package_id):
            raise ReleaseError('Invalid Package id')
        if not self.catalog:
            return self.packages / f'{package_id}.json'
        matches = [path for path in self.manifest_paths() if path.name == f'{package_id}.json']
        if len(matches) != 1:
            raise ReleaseError(f'Catalog must declare one Package manifest for {package_id}')
        return matches[0]

    def allowlist(self, package_id):
        return self.allowlists / f'{package_id}.json'

    def payload(self, manifest):
        return safe_path(self.packages, manifest['codex_surface']['plugin_payload_manifest_url'])

    def v2_payload(self, manifest):
        return safe_path(self.packages, manifest['v2_release']['payload_manifest_ref'])

    def changed_files(self, package_id):
        files = [self.manifest(package_id), self.allowlist(package_id),
                 *sorted((self.packages / 'payloads').glob(f'{package_id}-*.json'))]
        if self.catalog:
            files.append(self.catalog / 'catalog-index.json')
        return files
