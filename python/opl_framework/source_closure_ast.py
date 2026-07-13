#!/usr/bin/env python3
"""Emit a body-free Python call graph for the OPL source-closure gate."""

from __future__ import annotations

import ast
import json
from pathlib import Path
import sys
import tomllib
from typing import Any


def module_name(relative_path: str) -> str:
    path = relative_path.replace("\\", "/")
    parts = path.removesuffix(".py").split("/")
    for marker in ("src", "python"):
        if marker in parts:
            parts = parts[parts.index(marker) + 1 :]
            break
    else:
        for marker in ("packages", "apps"):
            if marker in parts and "src" in parts:
                parts = parts[parts.index("src") + 1 :]
                break
    if parts and parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def literal_arguments(node: ast.Call) -> list[str]:
    values: list[str] = []
    for argument in node.args:
        if isinstance(argument, ast.Constant) and isinstance(argument.value, (str, int, float, bool)):
            values.append(str(argument.value))
        elif (
            isinstance(argument, (ast.List, ast.Tuple))
            and argument.elts
            and isinstance(argument.elts[0], ast.Constant)
            and isinstance(argument.elts[0].value, str)
        ):
            values.append(argument.elts[0].value)
        else:
            values.append("<dynamic>")
    for keyword in node.keywords:
        if isinstance(keyword.value, ast.Constant) and isinstance(keyword.value.value, (str, int, float, bool)):
            values.append(f"{keyword.arg}={keyword.value.value}")
        else:
            values.append(f"{keyword.arg}=<dynamic>")
    return values


def argument_expressions(node: ast.Call) -> list[str]:
    values = [expression_text(argument) for argument in node.args]
    values.extend(
        f"{keyword.arg}={expression_text(keyword.value)}" for keyword in node.keywords
    )
    return values


def expression_text(node: ast.AST) -> str:
    try:
        return ast.unparse(node)
    except Exception:
        return type(node).__name__


def dotted_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = dotted_name(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr
    return None


def resolve_relative_module(current: str, imported: str | None, level: int) -> str:
    parts = current.split(".")
    base = parts[:-level] if level > 0 else []
    if imported:
        base.extend(imported.split("."))
    return ".".join(part for part in base if part)


def pyproject_scripts(repo_dir: Path) -> dict[str, str]:
    path = repo_dir / "pyproject.toml"
    if not path.is_file():
        return {}
    with path.open("rb") as stream:
        document = tomllib.load(stream)
    scripts: dict[str, str] = {}
    project = document.get("project")
    if isinstance(project, dict) and isinstance(project.get("scripts"), dict):
        scripts.update({str(key): str(value) for key, value in project["scripts"].items()})
    tool = document.get("tool")
    poetry = tool.get("poetry") if isinstance(tool, dict) else None
    if isinstance(poetry, dict) and isinstance(poetry.get("scripts"), dict):
        scripts.update({str(key): str(value) for key, value in poetry["scripts"].items()})
    return scripts


class FileAnalyzer(ast.NodeVisitor):
    def __init__(
        self,
        relative_path: str,
        module: str,
        tree: ast.Module,
        module_files: dict[str, str],
        known_symbols: set[str],
    ) -> None:
        self.relative_path = relative_path
        self.module = module
        self.tree = tree
        self.module_files = module_files
        self.known_symbols = known_symbols
        self.current_symbol = f"{relative_path}#<module>"
        self.current_class: str | None = None
        self.import_aliases: dict[str, tuple[str, str | None]] = {}
        self.symbols: list[dict[str, Any]] = []
        self.call_edges: list[dict[str, Any]] = []
        self.unresolved_edges: list[dict[str, Any]] = []
        self.observed_calls: list[dict[str, Any]] = []

    def add_symbol(self, name: str, line: int) -> str:
        symbol_id = f"{self.relative_path}#{name}"
        self.symbols.append(
            {
                "symbol_id": symbol_id,
                "language": "python",
                "file": self.relative_path,
                "module_name": self.module,
                "symbol": name,
                "line": line,
            }
        )
        return symbol_id

    def visit_Module(self, node: ast.Module) -> Any:
        self.add_symbol("<module>", 1)
        return self.generic_visit(node)

    def visit_Import(self, node: ast.Import) -> Any:
        for alias in node.names:
            local = alias.asname or alias.name.split(".")[0]
            self.import_aliases[local] = (alias.name, None)
            target_file = self.module_files.get(alias.name)
            if target_file:
                self.call_edges.append(
                    {
                        "from_symbol": self.current_symbol,
                        "to_symbol": f"{target_file}#<module>",
                        "file": self.relative_path,
                        "line": node.lineno,
                        "edge_kind": "static_import",
                    }
                )

    def visit_ImportFrom(self, node: ast.ImportFrom) -> Any:
        target_module = resolve_relative_module(self.module, node.module, node.level)
        for alias in node.names:
            local = alias.asname or alias.name
            self.import_aliases[local] = (target_module, alias.name)
        target_file = self.module_files.get(target_module)
        if target_file:
            self.call_edges.append(
                {
                    "from_symbol": self.current_symbol,
                    "to_symbol": f"{target_file}#<module>",
                    "file": self.relative_path,
                    "line": node.lineno,
                    "edge_kind": "static_import",
                }
            )
        elif node.level > 0:
            self.unresolved_edges.append(
                {
                    "from_symbol": self.current_symbol,
                    "file": self.relative_path,
                    "line": node.lineno,
                    "reason": "relative_import_unresolved",
                    "expression": expression_text(node),
                    "sensitive": True,
                }
            )

    def visit_ClassDef(self, node: ast.ClassDef) -> Any:
        previous = self.current_class
        self.current_class = node.name
        self.generic_visit(node)
        self.current_class = previous

    def _visit_function(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> Any:
        name = f"{self.current_class}.{node.name}" if self.current_class else node.name
        previous = self.current_symbol
        self.current_symbol = self.add_symbol(name, node.lineno)
        self.generic_visit(node)
        self.current_symbol = previous

    def visit_FunctionDef(self, node: ast.FunctionDef) -> Any:
        return self._visit_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> Any:
        return self._visit_function(node)

    def resolve_call_target(self, node: ast.Call) -> str | None:
        callee = dotted_name(node.func)
        if not callee:
            return None
        pieces = callee.split(".")
        if len(pieces) == 1:
            imported = self.import_aliases.get(pieces[0])
            if imported:
                target_module, imported_name = imported
                target_file = self.module_files.get(target_module)
                if target_file and imported_name:
                    candidate = f"{target_file}#{imported_name}"
                    return candidate if candidate in self.known_symbols else None
            candidate = f"{self.relative_path}#{pieces[0]}"
            return candidate if candidate in self.known_symbols else None
        if pieces[0] in ("self", "cls") and self.current_class:
            candidate = f"{self.relative_path}#{self.current_class}.{pieces[-1]}"
            return candidate if candidate in self.known_symbols else None
        imported = self.import_aliases.get(pieces[0])
        if imported:
            target_module, imported_name = imported
            target_file = self.module_files.get(target_module)
            target_name = ".".join([part for part in (imported_name, *pieces[1:]) if part])
            candidate = f"{target_file}#{target_name}" if target_file else None
            if candidate in self.known_symbols:
                return candidate
        candidate = f"{self.relative_path}#{'.'.join(pieces)}"
        return candidate if candidate in self.known_symbols else None

    def canonical_callee(self, node: ast.AST) -> str:
        callee = dotted_name(node) or expression_text(node)
        pieces = callee.split(".")
        imported = self.import_aliases.get(pieces[0])
        if not imported:
            return callee
        target_module, imported_name = imported
        suffix = [part for part in (imported_name, *pieces[1:]) if part]
        return ".".join([target_module, *suffix])

    def visit_Call(self, node: ast.Call) -> Any:
        callee = self.canonical_callee(node.func)
        self.observed_calls.append(
            {
                "symbol_id": self.current_symbol,
                "file": self.relative_path,
                "line": node.lineno,
                "callee": callee,
                "source_text": expression_text(node),
                "literal_arguments": literal_arguments(node),
                "argument_expressions": argument_expressions(node),
            }
        )
        target = self.resolve_call_target(node)
        if target:
            self.call_edges.append(
                {
                    "from_symbol": self.current_symbol,
                    "to_symbol": target,
                    "file": self.relative_path,
                    "line": node.lineno,
                    "edge_kind": "call",
                }
            )
        dynamic_names = {"__import__", "eval", "exec", "getattr", "importlib.import_module"}
        if callee in dynamic_names or isinstance(node.func, ast.Subscript):
            self.unresolved_edges.append(
                {
                    "from_symbol": self.current_symbol,
                    "file": self.relative_path,
                    "line": node.lineno,
                    "reason": "dynamic_dispatch_or_import",
                    "expression": expression_text(node),
                    "sensitive": True,
                }
            )
        self.generic_visit(node)


def collect_declared_symbols(relative_path: str, tree: ast.Module) -> set[str]:
    symbols = {f"{relative_path}#<module>"}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            symbols.add(f"{relative_path}#{node.name}")
        if isinstance(node, ast.ClassDef):
            for child in node.body:
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    symbols.add(f"{relative_path}#{node.name}.{child.name}")
    return symbols


def main() -> int:
    request = json.load(sys.stdin)
    repo_dir = Path(request["repo_dir"]).resolve()
    relative_files = [str(item) for item in request.get("files", [])]
    parsed: dict[str, ast.Module] = {}
    diagnostics: list[str] = []
    scan_complete = True
    for relative_path in relative_files:
        try:
            source = (repo_dir / relative_path).read_text(encoding="utf-8")
            parsed[relative_path] = ast.parse(source, filename=relative_path)
        except (OSError, SyntaxError, UnicodeError) as error:
            scan_complete = False
            diagnostics.append(f"python_parse_error:{relative_path}:{error}")

    module_files = {module_name(path): path for path in parsed}
    known_symbols = set().union(
        *(collect_declared_symbols(path, tree) for path, tree in parsed.items())
    ) if parsed else set()
    symbols: list[dict[str, Any]] = []
    call_edges: list[dict[str, Any]] = []
    unresolved_edges: list[dict[str, Any]] = []
    observed_calls: list[dict[str, Any]] = []
    for relative_path, tree in parsed.items():
        analyzer = FileAnalyzer(
            relative_path,
            module_name(relative_path),
            tree,
            module_files,
            known_symbols,
        )
        analyzer.visit(tree)
        symbols.extend(analyzer.symbols)
        call_edges.extend(analyzer.call_edges)
        unresolved_edges.extend(analyzer.unresolved_edges)
        observed_calls.extend(analyzer.observed_calls)

    result = {
        "scan_complete": scan_complete,
        "symbols": symbols,
        "call_edges": call_edges,
        "unresolved_edges": unresolved_edges,
        "observed_calls": observed_calls,
        "diagnostics": diagnostics,
        "pyproject_scripts": pyproject_scripts(repo_dir),
    }
    json.dump(result, sys.stdout, sort_keys=True, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
