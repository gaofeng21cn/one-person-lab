"""Read Package channel fingerprints without treating permission denial as absence."""
from __future__ import annotations
import json
import hashlib
import urllib.error
import urllib.parse
import urllib.request
from .common import ReleaseError, gh, request_id, slug, version_tuple


def public_channel(package_id, owner):
    repo = f'{owner}/one-person-lab-packages/{package_id}'
    url = 'https://ghcr.io/token?' + urllib.parse.urlencode({'service': 'ghcr.io', 'scope': f'repository:{repo}:pull'})
    def get(address, headers=None):
        with urllib.request.urlopen(urllib.request.Request(address, headers=headers or {}), timeout=30) as response:
            return response.headers, response.read()
    try:
        _, token = get(url)
        headers = {'Authorization': 'Bearer ' + json.loads(token)['token'],
                   'Accept': 'application/vnd.oci.image.manifest.v1+json'}
        metadata, body = get(f'https://ghcr.io/v2/{repo}/manifests/latest-stable', headers)
        if metadata['Docker-Content-Digest'] != 'sha256:' + hashlib.sha256(body).hexdigest():
            raise ReleaseError('Registry manifest digest differs')
        manifest = json.loads(body)
        layers = [x for x in manifest['layers'] if x['mediaType'] == 'application/vnd.onepersonlab.package.payload.v1+json']
        if len(layers) != 1:
            raise ReleaseError('Expected one Package payload layer')
        _, body = get(f"https://ghcr.io/v2/{repo}/blobs/{layers[0]['digest']}", headers)
        if len(body) != layers[0]['size'] or layers[0]['digest'] != 'sha256:' + hashlib.sha256(body).hexdigest():
            raise ReleaseError('Registry payload digest differs')
        payload = json.loads(body)
        if payload['package_id'] != package_id:
            raise ReleaseError('Registry Package identity mismatch')
        version_tuple(payload['package_version'])
        return {'status': 'present', 'digest': metadata['Docker-Content-Digest'],
                'fingerprint': {'package_version': payload['package_version'],
                                'package_content_digest': payload['content_lock']['digest'],
                                'owner_source_commit': payload['source_commit']}}
    except urllib.error.HTTPError as exc:
        # Only the authenticated public registry's explicit name/manifest absence is absence.
        detail = exc.read().decode()
        try:
            codes = {x['code'] for x in json.loads(detail).get('errors', [])}
        except ValueError:
            codes = set()
        if exc.code == 404 and codes.intersection({'NAME_UNKNOWN', 'MANIFEST_UNKNOWN'}):
            return {'status': 'absent', 'digest': None, 'fingerprint': None}
        raise ReleaseError(f'Public registry read failed (HTTP {exc.code}); absence is unverified') from exc


def publication_entry(package_id, manifest, fingerprint, predecessor, framework_commit):
    owner = slug(manifest['source_repo'])
    repository = gh(f'repos/{owner}')
    private = manifest.get('visibility', 'public') == 'authorized_only'
    if repository['private'] and not private:
        raise ReleaseError('Private source is registered for public archive publication')
    version = fingerprint['package_version']
    # Repository accessibility was established separately, so a tag 404 is no longer a masked repository denial.
    try:
        ref = gh(f'repos/{owner}/git/ref/tags/v{version}')['object']
    except ReleaseError as exc:
        raise ReleaseError('Owner version tag is missing or cannot be verified') from exc
    if ref['type'] != 'tag':
        raise ReleaseError('Owner version tag must be annotated')
    tagged = gh(f"repos/{owner}/git/tags/{ref['sha']}")['object']
    if tagged['type'] != 'commit' or tagged['sha'] != fingerprint['owner_source_commit']:
        raise ReleaseError('Owner version tag selects different source bytes')
    return {'package_id': package_id, 'owner_repository': owner, 'visibility': 'authorized_only' if private else 'public',
            'owner_tag': f'v{version}', 'owner_tag_status': 'ready',
            'expected_package_version': version,
            'expected_owner_source_commit': fingerprint['owner_source_commit'],
            'expected_framework_source_commit': framework_commit,
            'expected_latest_stable_predecessor': predecessor,
            'publication_request_id': request_id(package_id, version, fingerprint['owner_source_commit'])}
