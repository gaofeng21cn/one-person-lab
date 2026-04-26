from __future__ import annotations

from pathlib import Path
import subprocess
import tempfile
import unittest

from opl_harness_shared.workspace_boundary import (
    WorkspaceScaffoldFile,
    materialize_directory_workspace,
    resolve_workspace_document_path,
)


class WorkspaceBoundaryTest(unittest.TestCase):
    def test_materialize_directory_workspace_creates_git_boundary_and_ignores_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            workspace_root = Path(tmp_dir) / "grant-workspace"

            result = materialize_directory_workspace(
                workspace_root=workspace_root,
                directories=("contracts", "runtime"),
                files=(
                    WorkspaceScaffoldFile("README.md", "# Workspace\n"),
                    WorkspaceScaffoldFile("workspace.json", '{"ok": true}\n'),
                ),
                gitignore_entries=("runtime/", "artifacts/tmp/"),
            )

            self.assertEqual(result["workspace_root"], str(workspace_root.resolve()))
            self.assertEqual(result["workspace_git"]["enabled"], True)
            self.assertEqual(result["workspace_git"]["initialized"], True)
            self.assertTrue((workspace_root / ".git").exists())
            self.assertTrue((workspace_root / "contracts").is_dir())
            self.assertEqual((workspace_root / "workspace.json").read_text(encoding="utf-8"), '{"ok": true}\n')

            runtime_probe = workspace_root / "runtime" / "probe.json"
            runtime_probe.write_text("{}", encoding="utf-8")
            check_ignore = subprocess.run(
                ["git", "check-ignore", str(runtime_probe.relative_to(workspace_root))],
                cwd=workspace_root,
                check=False,
                text=True,
                capture_output=True,
            )
            branch = subprocess.run(
                ["git", "branch", "--show-current"],
                cwd=workspace_root,
                check=True,
                text=True,
                capture_output=True,
            ).stdout.strip()
            relative_paths = subprocess.run(
                ["git", "config", "worktree.useRelativePaths"],
                cwd=workspace_root,
                check=True,
                text=True,
                capture_output=True,
            ).stdout.strip()

            self.assertEqual(check_ignore.returncode, 0)
            self.assertEqual(branch, "main")
            self.assertEqual(relative_paths, "true")

    def test_materialize_directory_workspace_merges_gitignore_without_overwriting_domain_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            workspace_root = Path(tmp_dir) / "grant-workspace"
            workspace_root.mkdir()
            (workspace_root / ".gitignore").write_text("local-only/\n", encoding="utf-8")
            (workspace_root / "README.md").write_text("# Local edit\n", encoding="utf-8")

            result = materialize_directory_workspace(
                workspace_root=workspace_root,
                files=(WorkspaceScaffoldFile("README.md", "# Generated\n"),),
                gitignore_entries=("runtime/", "local-only/"),
            )

            self.assertEqual((workspace_root / "README.md").read_text(encoding="utf-8"), "# Local edit\n")
            self.assertIn(str((workspace_root / "README.md").resolve()), result["skipped_files"])
            gitignore = (workspace_root / ".gitignore").read_text(encoding="utf-8")
            self.assertIn("local-only/", gitignore)
            self.assertIn("runtime/", gitignore)
            self.assertEqual(gitignore.count("local-only/"), 1)

    def test_resolve_workspace_document_path_accepts_directory_or_file_input(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            workspace_root = Path(tmp_dir) / "grant-workspace"
            workspace_root.mkdir()
            workspace_file = workspace_root / "workspace.json"
            workspace_file.write_text("{}", encoding="utf-8")

            self.assertEqual(resolve_workspace_document_path(workspace_root), workspace_file.resolve())
            self.assertEqual(resolve_workspace_document_path(workspace_file), workspace_file.resolve())


if __name__ == "__main__":
    unittest.main()
