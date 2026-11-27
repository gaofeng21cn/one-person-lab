"""Prepare an exact v2 Package release in the existing Catalog."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

from .common import ReleaseError, run, safe_path, version_tuple, write
from .projection import PackageProjection


def build_v2_candidate(controller, owner_root, package_id, version, source_commit):
    with tempfile.TemporaryDirectory(prefix='opl-v2-candidate-') as temporary:
        built = run([
            'node', '--conditions=opl-source', '--experimental-strip-types',
            'scripts/prepare-v2-package-publication.mjs',
            '--owner-root', owner_root, '--package-id', package_id, '--package-version', version,
            '--source-commit', source_commit, '--output-directory', temporary,
        ], cwd=controller)
        candidate = json.loads(built.stdout)
        candidate.pop('archive_path', None)
        return candidate


def _sha256(body):
    return 'sha256:' + hashlib.sha256(body).hexdigest()


def _payload(candidate, manifest, package_id, version, source_commit):
    lock = candidate['lock']
    if (candidate['package_format'], candidate['package_id'], candidate['package_version'],
            candidate['source_commit']) != ('v2', package_id, version, source_commit):
        raise ReleaseError('Built v2 Package does not match the selected release identity')
    if (lock['package_id'], lock['version'], lock['git_commit'], lock['digest'], lock['file_count']) != (
            package_id, version, source_commit, candidate['content_digest'], candidate['file_count']):
        raise ReleaseError('Built v2 Package lock does not match the release metadata')
    for field in ('archive_sha256', 'content_digest'):
        if not re.fullmatch(r'sha256:[0-9a-f]{64}', candidate[field]):
            raise ReleaseError(f'Built v2 Package has an invalid {field}')
    distribution = candidate['manifest'].get('distribution') or {}
    if distribution.get('visibility', manifest.get('visibility', 'public')) != manifest.get('visibility', 'public'):
        raise ReleaseError('Built v2 Package visibility does not match the Catalog admission')
    return {
        'package_format': 'v2',
        'package_id': package_id,
        'package_version': version,
        'source_commit': source_commit,
        'source_repo': manifest['source_repo'],
        'source_root': '.',
        'archive_sha256': candidate['archive_sha256'],
        'file_count': lock['file_count'],
        'content_lock': {key: lock[key] for key in ('algorithm', 'canonicalization', 'digest')},
    }


def _replace_file(path, data, *, immutable=False):
    with tempfile.TemporaryDirectory(dir=path.parent, prefix=f'.{path.name}.') as temporary:
        staged = Path(temporary) / path.name
        staged.write_bytes(data)
        staged.chmod(0o644)
        if immutable:
            try:
                os.link(staged, path)
                return True
            except FileExistsError:
                if path.is_symlink() or not path.is_file() or path.read_bytes() != data:
                    raise ReleaseError('Same-version immutable v2 Package payload bytes differ')
                return False
        os.replace(staged, path)
    return True


def prepare_v2_projection(controller, catalog_paths, owner_root, package_id, version, source_commit,
                          candidate=None):
    if not catalog_paths.catalog:
        raise ReleaseError('v2 Package publication requires the official Catalog')
    manifest_path = catalog_paths.manifest(package_id)
    original_manifest = manifest_path.read_bytes()
    manifest = json.loads(original_manifest)
    if version_tuple(version) <= version_tuple(manifest['version']):
        raise ReleaseError('v2 Package version must advance beyond the compatible legacy version')
    current = manifest.get('v2_release')
    if current and version_tuple(version) < version_tuple(current['version']):
        raise ReleaseError('v2 Package version cannot regress the Catalog selection')
    if not re.fullmatch(r'[0-9a-f]{40}', source_commit):
        raise ReleaseError('v2 Package publication requires an exact owner commit')
    if candidate is None:
        candidate = build_v2_candidate(controller, owner_root, package_id, version, source_commit)
    payload = _payload(candidate, manifest, package_id, version, source_commit)
    payload_ref = f'payloads/{package_id}-{version}.json'
    payload_path = safe_path(catalog_paths.packages, payload_ref)
    index_path = catalog_paths.catalog / 'catalog-index.json'
    original_index = index_path.read_bytes()

    with tempfile.TemporaryDirectory(prefix='opl-v2-catalog-') as temporary:
        stage = Path(temporary)
        for directory in (catalog_paths.packages, catalog_paths.allowlists):
            shutil.copytree(directory, stage / directory.name)
        shutil.copyfile(catalog_paths.catalog / 'public-listings.json', stage / 'public-listings.json')
        staged_payload = stage / payload_path.relative_to(catalog_paths.root)
        write(staged_payload, payload)
        payload_bytes = staged_payload.read_bytes()
        payload_sha256 = _sha256(payload_bytes)
        release = {
            'version': version,
            'source_commit': source_commit,
            'payload_manifest_ref': payload_ref,
            'payload_sha256': payload_sha256,
        }
        if current and current['version'] == version and any(
            current.get(key) != value for key, value in release.items()
        ):
            raise ReleaseError('Same-version immutable v2 Package payload bytes differ')
        icon_ref = candidate['manifest']['identity'].get('icon')
        if icon_ref and manifest.get('visibility', 'public') == 'public':
            release['icon_ref'] = icon_ref
        manifest['v2_release'] = release
        staged_manifest = stage / manifest_path.relative_to(catalog_paths.root)
        write(staged_manifest, manifest)
        manifest_bytes = staged_manifest.read_bytes()
        index_bytes = run([
            'node', '--input-type=module', '-e',
            "import { buildCatalogIndex, canonicalJson } from './scripts/build-index.mjs';"
            "process.stdout.write(canonicalJson(buildCatalogIndex(process.argv[1]).index));",
            stage,
        ], cwd=catalog_paths.catalog).stdout.encode('utf8')

    if manifest_path.read_bytes() != original_manifest or index_path.read_bytes() != original_index:
        raise ReleaseError('Catalog changed during v2 Package projection preparation')
    created_payload = _replace_file(payload_path, payload_bytes, immutable=True)
    try:
        if manifest_bytes != original_manifest:
            _replace_file(manifest_path, manifest_bytes)
        if index_bytes != original_index:
            _replace_file(index_path, index_bytes)
    except Exception:
        if manifest_path.read_bytes() == manifest_bytes and manifest_bytes != original_manifest:
            _replace_file(manifest_path, original_manifest)
        if created_payload:
            payload_path.unlink()
        raise
    return {
        'action': 'prepare',
        'status': 'projection_ready',
        'package_id': package_id,
        'version': version,
        'owner_source_commit': source_commit,
        'payload_sha256': payload_sha256,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--framework-root', type=Path, required=True)
    parser.add_argument('--catalog-root', type=Path, required=True)
    parser.add_argument('--owner-root', type=Path, required=True)
    parser.add_argument('--package-id', required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--source-commit', required=True)
    args = parser.parse_args()
    controller = args.framework_root.resolve()
    paths = PackageProjection(controller, args.catalog_root.resolve())
    print(json.dumps(prepare_v2_projection(
        controller, paths, args.owner_root.resolve(), args.package_id, args.version, args.source_commit,
    )))


if __name__ == '__main__':
    main()
