from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


class SchemaStore(Protocol):
    def load_json(self, file_name: str) -> dict[str, Any]: ...


@dataclass(frozen=True)
class SchemaValidationIssue:
    path: str
    message: str


def _join_path(base: str, child: str) -> str:
    return f"{base}.{child}" if base else child


class SchemaSubsetValidator:
    """Deterministic validator for the JSON Schema subset used by domain packs."""

    def __init__(self, store: SchemaStore) -> None:
        if not callable(getattr(store, "load_json", None)):
            raise ValueError("schema store must provide load_json(file_name)")
        self._store = store
        self._cache: dict[str, dict[str, Any]] = {}

    def validate(self, document: Any, schema_file: str) -> list[SchemaValidationIssue]:
        if not isinstance(schema_file, str) or not schema_file.strip():
            raise ValueError("schema_file must be a non-empty string")
        issues: list[SchemaValidationIssue] = []
        schema = self._load_schema(schema_file.strip())
        self._validate_node(document, schema, schema_file.strip(), "", issues)
        return issues

    def _load_schema(self, file_name: str) -> dict[str, Any]:
        if file_name not in self._cache:
            try:
                schema = self._store.load_json(file_name)
            except Exception as exc:
                raise ValueError(f"unable to load schema: {file_name}") from exc
            if not isinstance(schema, dict):
                raise ValueError(f"schema must be an object: {file_name}")
            self._cache[file_name] = schema
        return self._cache[file_name]

    def _resolve_ref(self, ref: object, base_file: str) -> tuple[dict[str, Any], str]:
        if not isinstance(ref, str) or not ref.strip():
            raise ValueError("schema $ref must be a non-empty string")
        file_name, separator, fragment = ref.partition("#")
        target_file = file_name or base_file
        schema = self._load_schema(target_file)
        if separator and fragment:
            schema = self._resolve_pointer(schema, fragment)
        return schema, target_file

    @staticmethod
    def _resolve_pointer(schema: dict[str, Any], fragment: str) -> dict[str, Any]:
        if fragment and not fragment.startswith("/"):
            raise ValueError(f"schema pointer must start with '/': #{fragment}")
        current: Any = schema
        for raw_part in fragment.removeprefix("/").split("/") if fragment else []:
            token = raw_part.replace("~1", "/").replace("~0", "~")
            if not isinstance(current, dict) or token not in current:
                raise ValueError(f"schema pointer does not exist: #{fragment}")
            current = current[token]
        if not isinstance(current, dict):
            raise ValueError(f"schema pointer must resolve to an object: #{fragment}")
        return current

    def _validate_node(
        self,
        value: Any,
        schema: dict[str, Any],
        base_file: str,
        path: str,
        issues: list[SchemaValidationIssue],
    ) -> None:
        if "$ref" in schema:
            resolved, resolved_file = self._resolve_ref(schema["$ref"], base_file)
            merged = {**resolved, **{key: item for key, item in schema.items() if key != "$ref"}}
            self._validate_node(value, merged, resolved_file, path, issues)
            return

        resolved_type = self._resolve_schema_type(value, schema, path, issues)
        if resolved_type == "object":
            self._validate_object(value, schema, base_file, path, issues)
        elif resolved_type == "array":
            self._validate_array(value, schema, base_file, path, issues)
        elif resolved_type in {"string", "integer", "number", "boolean", "null"}:
            self._validate_scalar(value, schema, resolved_type, path, issues)

        if "const" in schema and value != schema["const"]:
            issues.append(SchemaValidationIssue(path or "$", f"must equal {schema['const']!r}"))
        enum_values = schema.get("enum")
        if isinstance(enum_values, list) and value not in enum_values:
            issues.append(SchemaValidationIssue(path or "$", "value is not in the allowed enum"))

    def _validate_object(
        self,
        value: Any,
        schema: dict[str, Any],
        base_file: str,
        path: str,
        issues: list[SchemaValidationIssue],
    ) -> None:
        if not isinstance(value, dict):
            issues.append(SchemaValidationIssue(path or "$", "must be an object"))
            return
        properties = schema.get("properties", {})
        if not isinstance(properties, dict):
            raise ValueError("schema properties must be an object")
        required = schema.get("required", [])
        if not isinstance(required, list) or not all(isinstance(item, str) for item in required):
            raise ValueError("schema required must be a string list")
        for name in required:
            if name not in value:
                issues.append(SchemaValidationIssue(_join_path(path, name), "required field is missing"))
        if schema.get("additionalProperties") is False:
            for extra in value.keys() - properties.keys():
                issues.append(SchemaValidationIssue(_join_path(path, str(extra)), "field is not declared"))
        for name, child_schema in properties.items():
            if name in value:
                if not isinstance(child_schema, dict):
                    raise ValueError(f"schema property must be an object: {name}")
                self._validate_node(value[name], child_schema, base_file, _join_path(path, name), issues)

    def _validate_array(
        self,
        value: Any,
        schema: dict[str, Any],
        base_file: str,
        path: str,
        issues: list[SchemaValidationIssue],
    ) -> None:
        if not isinstance(value, list):
            issues.append(SchemaValidationIssue(path or "$", "must be an array"))
            return
        min_items = schema.get("minItems")
        if isinstance(min_items, int) and len(value) < min_items:
            issues.append(SchemaValidationIssue(path or "$", f"must contain at least {min_items} items"))
        item_schema = schema.get("items")
        if item_schema is not None and not isinstance(item_schema, dict):
            raise ValueError("schema items must be an object")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                item_path = f"{path}[{index}]" if path else f"[{index}]"
                self._validate_node(item, item_schema, base_file, item_path, issues)

    @staticmethod
    def _validate_scalar(
        value: Any,
        schema: dict[str, Any],
        resolved_type: str,
        path: str,
        issues: list[SchemaValidationIssue],
    ) -> None:
        issue_path = path or "$"
        if resolved_type == "string":
            if not isinstance(value, str):
                issues.append(SchemaValidationIssue(issue_path, "must be a string"))
                return
            min_length = schema.get("minLength")
            if isinstance(min_length, int) and len(value) < min_length:
                issues.append(SchemaValidationIssue(issue_path, f"must contain at least {min_length} characters"))
            if schema.get("format") == "date-time":
                try:
                    datetime.fromisoformat(value.replace("Z", "+00:00"))
                except ValueError:
                    issues.append(SchemaValidationIssue(issue_path, "must be a valid date-time"))
            return
        if resolved_type == "integer" and (isinstance(value, bool) or not isinstance(value, int)):
            issues.append(SchemaValidationIssue(issue_path, "must be an integer"))
            return
        if resolved_type == "number" and (isinstance(value, bool) or not isinstance(value, (int, float))):
            issues.append(SchemaValidationIssue(issue_path, "must be a number"))
            return
        if resolved_type == "boolean" and not isinstance(value, bool):
            issues.append(SchemaValidationIssue(issue_path, "must be a boolean"))
            return
        if resolved_type == "null" and value is not None:
            issues.append(SchemaValidationIssue(issue_path, "must be null"))
            return
        if resolved_type in {"integer", "number"} and isinstance(value, (int, float)) and not isinstance(value, bool):
            minimum = schema.get("minimum")
            maximum = schema.get("maximum")
            if isinstance(minimum, (int, float)) and value < minimum:
                issues.append(SchemaValidationIssue(issue_path, f"must be greater than or equal to {minimum}"))
            if isinstance(maximum, (int, float)) and value > maximum:
                issues.append(SchemaValidationIssue(issue_path, f"must be less than or equal to {maximum}"))

    @classmethod
    def _resolve_schema_type(
        cls,
        value: Any,
        schema: dict[str, Any],
        path: str,
        issues: list[SchemaValidationIssue],
    ) -> str | None:
        expected = schema.get("type")
        if expected is None:
            return None
        allowed = [expected] if isinstance(expected, str) else expected
        if not isinstance(allowed, list) or not allowed or not all(isinstance(item, str) for item in allowed):
            raise ValueError("schema type must be a string or non-empty string list")
        actual = cls._infer_json_type(value)
        if actual in allowed:
            return actual
        if actual == "integer" and "number" in allowed:
            return "number"
        issues.append(SchemaValidationIssue(path or "$", f"must be one of: {', '.join(allowed)}"))
        return None

    @staticmethod
    def _infer_json_type(value: Any) -> str | None:
        if value is None:
            return "null"
        if isinstance(value, dict):
            return "object"
        if isinstance(value, list):
            return "array"
        if isinstance(value, bool):
            return "boolean"
        if isinstance(value, int):
            return "integer"
        if isinstance(value, float):
            return "number"
        if isinstance(value, str):
            return "string"
        return None


__all__ = ["SchemaSubsetValidator", "SchemaValidationIssue"]
