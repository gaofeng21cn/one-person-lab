from __future__ import annotations

import json
from pathlib import Path
import subprocess

from opl_framework.package_content_lock import content_digest, content_lock


def test_content_lock_keeps_order_utf8_lengths_and_binary_bytes(tmp_path: Path) -> None:
    files = {"é/空.txt": b"\x00\xff\n", "empty.bin": b""}
    for relative, body in files.items():
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(body)
    expected = "sha256:ba09899733fa71fc6a3e72f4edf1ca987e1f07b7ed15d62df492752c22d504a6"
    assert content_lock(tmp_path, list(files)) == {
        "algorithm": "sha256",
        "canonicalization": "ordered_path_length_file_length_bytes",
        "paths": list(files),
        "digest": expected,
    }
    assert content_digest(reversed(files), files.__getitem__) == (
        "sha256:02fa9fdd428485b80fe93d118c578c032af7c8577d65258b5c58cf2402aa637d"
    )
    assert content_digest([], files.__getitem__) == (
        "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        ["node", "--input-type=module", "-e", """
import { packageContentDigest } from './src/kernel/package-content-lock.ts';
const files = new Map([['é/空.txt', Buffer.from([0, 255, 10])], ['empty.bin', Buffer.alloc(0)]]);
console.log(JSON.stringify(packageContentDigest([...files.keys()], (path) => files.get(path))));
"""],
        cwd=root, capture_output=True, text=True, check=True,
    )
    assert json.loads(result.stdout) == expected
