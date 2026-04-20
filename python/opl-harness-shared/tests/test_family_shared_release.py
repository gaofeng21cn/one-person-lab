from __future__ import annotations

import json
from pathlib import Path

from opl_harness_shared import family_shared_release as module


RELEASED_OWNER_COMMIT = "e92fc99b52a8eae0dffa9859d35164acfb69b858"
STALE_OWNER_COMMIT = "6a6823dba7f95de5ae3aafc477167bccb07de74c"


def write(file_path: Path, content: str) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")


def test_load_shared_owner_release_contract_reads_explicit_owner_repo_root(tmp_path: Path) -> None:
    owner_repo_root = tmp_path / "one-person-lab"
    write(
        owner_repo_root / "contracts" / "family-release" / "shared-owner-release.json",
        json.dumps(
            {
                "contract_kind": "family_shared_owner_release.v1",
                "owner_repo": "one-person-lab",
                "owner_commit": RELEASED_OWNER_COMMIT,
                "consumers": [
                    {
                        "repo_id": "medautoscience",
                        "repo_dir": "med-autoscience",
                        "verify_command": "scripts/verify.sh family",
                        "targets": [
                            {"file": "pyproject.toml", "kind": "python_dependency"},
                            {"file": "uv.lock", "kind": "python_lock"},
                        ],
                    }
                ],
            }
        ),
    )

    contract = module.load_shared_owner_release_contract(owner_repo_root=owner_repo_root)

    assert contract["owner_commit"] == RELEASED_OWNER_COMMIT
    assert contract["consumers"][0]["repo_id"] == "medautoscience"
    assert contract["consumers"][0]["verify_command"] == "scripts/verify.sh family"


def test_inspect_family_shared_consumer_alignment_reports_stale_and_aligned_python_pins(tmp_path: Path) -> None:
    owner_repo_root = tmp_path / "one-person-lab"
    repo_root = tmp_path / "med-autoscience"
    write(
        owner_repo_root / "contracts" / "family-release" / "shared-owner-release.json",
        json.dumps(
            {
                "contract_kind": "family_shared_owner_release.v1",
                "owner_repo": "one-person-lab",
                "owner_commit": RELEASED_OWNER_COMMIT,
                "consumers": [
                    {
                        "repo_id": "medautoscience",
                        "repo_dir": "med-autoscience",
                        "verify_command": "scripts/verify.sh family",
                        "targets": [
                            {"file": "pyproject.toml", "kind": "python_dependency"},
                            {"file": "uv.lock", "kind": "python_lock"},
                        ],
                    }
                ],
            }
        ),
    )
    write(
        repo_root / "pyproject.toml",
        (
            "[project]\n"
            f'dependencies = ["opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@{STALE_OWNER_COMMIT}#subdirectory=python/opl-harness-shared"]\n'
        ),
    )
    write(
        repo_root / "uv.lock",
        (
            'source = { git = "https://github.com/gaofeng21cn/one-person-lab.git?subdirectory=python%2Fopl-harness-shared'
            f'&rev={RELEASED_OWNER_COMMIT}#{RELEASED_OWNER_COMMIT}" }}\n'
        ),
    )

    contract = module.load_shared_owner_release_contract(owner_repo_root=owner_repo_root)
    stale = module.inspect_family_shared_consumer_alignment(
        contract=contract,
        consumer_repo_id="medautoscience",
        repo_root=repo_root,
    )

    write(
        repo_root / "pyproject.toml",
        (
            "[project]\n"
            f'dependencies = ["opl-harness-shared @ git+https://github.com/gaofeng21cn/one-person-lab.git@{RELEASED_OWNER_COMMIT}#subdirectory=python/opl-harness-shared"]\n'
        ),
    )
    aligned = module.inspect_family_shared_consumer_alignment(
        contract=contract,
        consumer_repo_id="medautoscience",
        repo_root=repo_root,
    )

    assert stale["status"] == "stale"
    assert stale["findings"][0]["status"] == "stale_pin"
    assert aligned["status"] == "aligned"
    assert aligned["findings"][0]["pins"] == [RELEASED_OWNER_COMMIT]


def test_inspect_current_repo_family_shared_alignment_resolves_owner_repo(tmp_path: Path) -> None:
    owner_repo_root = tmp_path / "one-person-lab"
    repo_root = tmp_path / "redcube-ai"
    write(
        owner_repo_root / "contracts" / "family-release" / "shared-owner-release.json",
        json.dumps(
            {
                "contract_kind": "family_shared_owner_release.v1",
                "owner_repo": "one-person-lab",
                "owner_commit": RELEASED_OWNER_COMMIT,
                "consumers": [
                    {
                        "repo_id": "redcube",
                        "repo_dir": "redcube-ai",
                        "verify_command": "scripts/verify.sh family",
                        "targets": [
                            {"file": "packages/redcube-gateway/package.json", "kind": "js_dependency"},
                            {"file": "package-lock.json", "kind": "js_lock"},
                        ],
                    }
                ],
            }
        ),
    )
    write(
        repo_root / "packages" / "redcube-gateway" / "package.json",
        json.dumps(
            {
                "dependencies": {
                    "opl-gateway-shared": f"git+https://github.com/gaofeng21cn/one-person-lab.git#{RELEASED_OWNER_COMMIT}"
                }
            }
        ),
    )
    write(
        repo_root / "package-lock.json",
        json.dumps(
            {
                "packages": {
                    "packages/redcube-gateway": {
                        "dependencies": {
                            "opl-gateway-shared": f"git+https://github.com/gaofeng21cn/one-person-lab.git#{RELEASED_OWNER_COMMIT}"
                        }
                    }
                }
            }
        ),
    )

    inspection = module.inspect_current_repo_family_shared_alignment(
        repo_root=repo_root,
        consumer_repo_id="redcube",
        owner_repo_root=owner_repo_root,
    )

    assert inspection["status"] == "aligned"
    assert inspection["owner_commit"] == RELEASED_OWNER_COMMIT
    assert inspection["findings"][0]["status"] == "aligned"
    assert inspection["verify_command"] == "scripts/verify.sh family"
