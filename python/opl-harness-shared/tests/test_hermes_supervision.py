from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from opl_harness_shared.hermes_supervision import (
    ensure_script_file,
    job_drift,
    load_jobs,
    matching_jobs,
    render_supervision_script,
    select_primary_job,
)


class HermesSupervisionTest(unittest.TestCase):
    def test_render_supervision_script_embeds_command(self) -> None:
        rendered = render_supervision_script(["watch-runtime", "--max-ticks", "1"])
        self.assertIn("watch-runtime", rendered)
        self.assertIn('"returncode"', rendered)

    def test_job_matching_and_drift_use_name_and_script_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            hermes_home_root = Path(tmp_dir)
            jobs_file = hermes_home_root / "cron" / "jobs.json"
            jobs_file.parent.mkdir(parents=True, exist_ok=True)
            jobs_file.write_text(
                json.dumps(
                    [
                        {
                            "id": "job-001",
                            "name": "family-supervision",
                            "prompt": "silent",
                            "deliver": "local",
                            "script": "family/watch.py",
                            "schedule": {"kind": "interval", "minutes": 5},
                            "enabled": True,
                            "state": "scheduled",
                            "created_at": "2026-04-17T10:00:00Z",
                        }
                    ]
                ),
                encoding="utf-8",
            )
            matches = matching_jobs(
                hermes_home_root=hermes_home_root,
                job_name="family-supervision",
                script_relpath="family/watch.py",
            )
            primary, duplicates = select_primary_job(matches)
            self.assertEqual(len(matches), 1)
            self.assertEqual(primary["id"], "job-001")
            self.assertEqual(duplicates, [])
            self.assertEqual(
                job_drift(
                    hermes_home_root=hermes_home_root,
                    job=primary,
                    job_name="family-supervision",
                    silent_prompt="silent",
                    script_relpath="family/watch.py",
                    interval_seconds=300,
                ),
                [],
            )

    def test_ensure_script_file_materializes_executable_script(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            hermes_home_root = Path(tmp_dir)
            script = ensure_script_file(
                hermes_home_root=hermes_home_root,
                script_relpath="family/watch.py",
                command=["watch-runtime", "--max-ticks", "1"],
            )
            self.assertTrue(script.is_file())
            self.assertIn("watch-runtime", script.read_text(encoding="utf-8"))

    def test_load_jobs_returns_empty_list_for_missing_or_invalid_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            hermes_home_root = Path(tmp_dir)
            self.assertEqual(load_jobs(hermes_home_root=hermes_home_root), [])
            jobs_file = hermes_home_root / "cron" / "jobs.json"
            jobs_file.parent.mkdir(parents=True, exist_ok=True)
            jobs_file.write_text("{invalid", encoding="utf-8")
            self.assertEqual(load_jobs(hermes_home_root=hermes_home_root), [])


if __name__ == "__main__":
    unittest.main()
