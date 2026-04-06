from __future__ import annotations

import subprocess
import sys
from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "verify_shared_foundation_boundary.py"


class VerifySharedFoundationBoundaryTest(unittest.TestCase):
    def test_verifier_script_passes_current_repo(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
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


if __name__ == "__main__":
    unittest.main()
