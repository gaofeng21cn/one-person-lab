from __future__ import annotations

import subprocess
import sys
from pathlib import Path
import shutil
import tempfile
import unittest
import json


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "verify_shared_foundation_boundary.py"


class VerifySharedFoundationBoundaryTest(unittest.TestCase):
    def test_verifier_script_passes_current_repo(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--repo-root", str(REPO_ROOT)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout:\n{result.stdout}\n\nstderr:\n{result.stderr}",
        )
        self.assertIn("shared-foundation boundary verification OK", result.stdout)

    def test_verifier_fails_when_public_surface_index_mentions_g4_candidate_as_current(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            temp_root = Path(tmpdir)
            for relative_path in [
                "contracts/opl-gateway/acceptance-matrix.json",
                "contracts/opl-gateway/public-surface-index.json",
                "contracts/opl-gateway/surface-lifecycle-map.json",
                "contracts/opl-gateway/surface-review-matrix.json",
                "docs/operating-model.md",
                "docs/operating-model.zh-CN.md",
                "docs/shared-foundation.md",
                "docs/shared-foundation.zh-CN.md",
                "docs/shared-foundation-ownership.md",
                "docs/shared-foundation-ownership.zh-CN.md",
            ]:
                source = REPO_ROOT / relative_path
                destination = temp_root / relative_path
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)

            index_path = temp_root / "contracts/opl-gateway/public-surface-index.json"
            index_doc = json.loads(index_path.read_text())
            index_doc["surfaces"][0]["notes"].append("shared asset index")
            index_path.write_text(json.dumps(index_doc, indent=2) + "\n")

            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--repo-root", str(temp_root)],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
            )

            self.assertNotEqual(result.returncode, 0, msg=result.stdout)
            self.assertIn("shared asset index", result.stderr)


if __name__ == "__main__":
    unittest.main()
