use serde::Serialize;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const PROTOCOL_VERSION: &str = "opl_native_helper.v1";
const CRATE_NAME: &str = env!("CARGO_PKG_NAME");
const CRATE_VERSION: &str = env!("CARGO_PKG_VERSION");
const SOURCE_OF_TRUTH_RULE: &str =
    "native helpers index local file surfaces but never replace domain-owned durable truth";
const DEFAULT_MAX_FILES: usize = 10_000;
const DEFAULT_MAX_JSON_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Serialize)]
struct HelperError {
    code: String,
    message: String,
}

impl HelperError {
    fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Serialize)]
struct HelperResponse {
    protocol_version: &'static str,
    helper_id: String,
    helper_version: &'static str,
    binary_version: &'static str,
    crate_name: &'static str,
    crate_version: &'static str,
    ok: bool,
    request_id: Option<String>,
    result: Option<Value>,
    errors: Vec<HelperError>,
}

impl HelperResponse {
    fn ok(helper_id: &str, request_id: Option<String>, result: Value) -> Self {
        Self {
            protocol_version: PROTOCOL_VERSION,
            helper_id: helper_id.to_string(),
            helper_version: CRATE_VERSION,
            binary_version: CRATE_VERSION,
            crate_name: CRATE_NAME,
            crate_version: CRATE_VERSION,
            ok: true,
            request_id,
            result: Some(result),
            errors: Vec::new(),
        }
    }

    fn error(helper_id: &str, request_id: Option<String>, error: HelperError) -> Self {
        Self {
            protocol_version: PROTOCOL_VERSION,
            helper_id: helper_id.to_string(),
            helper_version: CRATE_VERSION,
            binary_version: CRATE_VERSION,
            crate_name: CRATE_NAME,
            crate_version: CRATE_VERSION,
            ok: false,
            request_id,
            result: None,
            errors: vec![error],
        }
    }
}

#[derive(Clone, Debug, Serialize)]
struct FileEntry {
    path: String,
    relative_path: String,
    bytes: u64,
    modified_unix_ms: Option<u128>,
}

#[derive(Clone, Debug, Serialize)]
struct JsonValidationEntry {
    path: String,
    relative_path: String,
    valid: bool,
    skipped: bool,
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    skip_reason: Option<String>,
}

#[derive(Clone, Debug)]
struct ScanLimits {
    max_files: usize,
}

#[derive(Clone, Debug)]
struct ScanReport {
    files: Vec<FileEntry>,
    truncated: bool,
    max_files: usize,
}

pub fn run_stdio(helper_id: &str) {
    let mut input = String::new();
    let read_result = io::stdin().read_to_string(&mut input);
    let response = match read_result {
        Ok(_) => run_helper(helper_id, &input),
        Err(error) => HelperResponse::error(
            helper_id,
            None,
            HelperError::new("stdin_read_failed", error.to_string()),
        ),
    };

    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &response).expect("failed to serialize helper response");
    stdout
        .write_all(b"\n")
        .expect("failed to write helper response");
}

fn run_helper(helper_id: &str, input: &str) -> HelperResponse {
    let request = match parse_request(input) {
        Ok(value) => value,
        Err(error) => return HelperResponse::error(helper_id, None, error),
    };
    let request_id = optional_string(&request, "request_id");

    match helper_id {
        "opl-sysprobe" => HelperResponse::ok(helper_id, request_id, build_sysprobe()),
        "opl-doctor-native" => HelperResponse::ok(helper_id, request_id, build_doctor_snapshot()),
        "opl-runtime-watch" => match build_runtime_watch(&request) {
            Ok(result) => HelperResponse::ok(helper_id, request_id, result),
            Err(error) => HelperResponse::error(helper_id, request_id, error),
        },
        "opl-artifact-indexer" => match build_artifact_index(&request) {
            Ok(result) => HelperResponse::ok(helper_id, request_id, result),
            Err(error) => HelperResponse::error(helper_id, request_id, error),
        },
        "opl-state-indexer" => match build_state_index(&request) {
            Ok(result) => HelperResponse::ok(helper_id, request_id, result),
            Err(error) => HelperResponse::error(helper_id, request_id, error),
        },
        _ => HelperResponse::error(
            helper_id,
            request_id,
            HelperError::new("unknown_helper", format!("unknown helper_id: {helper_id}")),
        ),
    }
}

fn parse_request(input: &str) -> Result<Value, HelperError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(Value::Object(Map::new()));
    }
    let value: Value = serde_json::from_str(trimmed)
        .map_err(|error| HelperError::new("invalid_json", error.to_string()))?;
    if !value.is_object() {
        return Err(HelperError::new(
            "invalid_request_shape",
            "native helper input must be a JSON object",
        ));
    }
    Ok(value)
}

fn build_sysprobe() -> Value {
    json!({
        "surface_kind": "native_system_probe",
        "source_of_truth_rule": SOURCE_OF_TRUTH_RULE,
        "os": env::consts::OS,
        "arch": env::consts::ARCH,
        "current_dir": env::current_dir().ok().map(path_to_string),
        "path_entries": env::var_os("PATH")
            .map(|value| env::split_paths(&value).map(path_to_string).collect::<Vec<_>>())
            .unwrap_or_default(),
        "toolchain": {
            "rust_helper": true,
            "crate_name": CRATE_NAME,
            "crate_version": CRATE_VERSION,
            "binary_version": CRATE_VERSION
        }
    })
}

fn build_doctor_snapshot() -> Value {
    json!({
        "surface_kind": "native_doctor_snapshot",
        "source_of_truth_rule": SOURCE_OF_TRUTH_RULE,
        "system_probe": build_sysprobe(),
        "checks": [
            {
                "check_id": "json_stdio_protocol",
                "status": "ok",
                "detail": "helper accepted JSON input and emitted a single JSON response"
            }
        ]
    })
}

fn build_artifact_index(request: &Value) -> Result<Value, HelperError> {
    let workspace_root = required_path(request, "workspace_root")?;
    let max_depth = optional_u64(request, "max_depth").unwrap_or(8) as usize;
    let limits = scan_limits(request)?;
    let artifact_roots = path_list(request, "artifact_roots").unwrap_or_else(|| {
        vec![
            workspace_root.join("artifacts"),
            workspace_root.join("manuscript"),
        ]
    });
    let extensions = string_list(request, "artifact_extensions").unwrap_or_else(|| {
        vec![
            "json".to_string(),
            "md".to_string(),
            "txt".to_string(),
            "pdf".to_string(),
            "docx".to_string(),
            "pptx".to_string(),
            "xlsx".to_string(),
            "html".to_string(),
        ]
    });

    let mut report = ScanReport::new(&limits);
    for root in artifact_roots {
        scan_files(
            &root,
            &workspace_root,
            max_depth,
            &|path| extension_matches(path, &extensions),
            &limits,
            &mut report,
        )?;
    }
    report
        .files
        .sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(json!({
        "surface_kind": "native_artifact_manifest",
        "source_of_truth_rule": SOURCE_OF_TRUTH_RULE,
        "workspace_root": path_to_string(workspace_root),
        "summary": {
            "total_files_count": report.files.len(),
            "total_bytes": report.files.iter().map(|entry| entry.bytes).sum::<u64>(),
            "truncated": report.truncated,
            "max_files": report.max_files
        },
        "files": report.files
    }))
}

fn build_state_index(request: &Value) -> Result<Value, HelperError> {
    let workspace_roots = path_list(request, "workspace_roots")
        .or_else(|| {
            required_path(request, "workspace_root")
                .ok()
                .map(|root| vec![root])
        })
        .ok_or_else(|| {
            HelperError::new(
                "missing_workspace_roots",
                "workspace_roots[] or workspace_root is required",
            )
        })?;
    let max_depth = optional_u64(request, "max_depth").unwrap_or(8) as usize;
    let limits = scan_limits(request)?;
    let max_json_bytes = optional_limit_u64(request, "max_json_bytes", DEFAULT_MAX_JSON_BYTES)?;

    let mut root_entries = Vec::new();
    let mut json_entries = Vec::new();
    for root in workspace_roots {
        let mut report = ScanReport::new(&limits);
        scan_files(
            &root,
            &root,
            max_depth,
            &|path| path.is_file(),
            &limits,
            &mut report,
        )?;
        report
            .files
            .sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
        for file in report
            .files
            .iter()
            .filter(|entry| entry.path.ends_with(".json"))
        {
            json_entries.push(validate_json_file(file, max_json_bytes));
        }
        root_entries.push(json!({
            "root": path_to_string(root),
            "file_count": report.files.len(),
            "total_bytes": report.files.iter().map(|entry| entry.bytes).sum::<u64>(),
            "truncated": report.truncated,
            "max_files": report.max_files
        }));
    }

    let invalid_json_count = json_entries
        .iter()
        .filter(|entry| !entry.valid && !entry.skipped)
        .count();
    let skipped_json_count = json_entries.iter().filter(|entry| entry.skipped).count();
    Ok(json!({
        "surface_kind": "native_state_index",
        "source_of_truth_rule": SOURCE_OF_TRUTH_RULE,
        "roots": root_entries,
        "json_validation": {
            "surface_kind": "large_json_validation_index",
            "checked_files_count": json_entries.len(),
            "invalid_files_count": invalid_json_count,
            "skipped_files_count": skipped_json_count,
            "max_json_bytes": max_json_bytes,
            "files": json_entries
        }
    }))
}

fn build_runtime_watch(request: &Value) -> Result<Value, HelperError> {
    let watch_roots = path_list(request, "watch_roots")
        .or_else(|| {
            required_path(request, "workspace_root")
                .ok()
                .map(|root| vec![root])
        })
        .ok_or_else(|| {
            HelperError::new(
                "missing_watch_roots",
                "watch_roots[] or workspace_root is required",
            )
        })?;
    let max_depth = optional_u64(request, "max_depth").unwrap_or(6) as usize;
    let limits = scan_limits(request)?;
    let mut roots = Vec::new();
    for root in watch_roots {
        let mut report = ScanReport::new(&limits);
        scan_files(
            &root,
            &root,
            max_depth,
            &|path| path.is_file(),
            &limits,
            &mut report,
        )?;
        let fingerprint = stable_file_fingerprint(&report.files);
        roots.push(json!({
            "root": path_to_string(root),
            "file_count": report.files.len(),
            "truncated": report.truncated,
            "max_files": report.max_files,
            "fingerprint": fingerprint
        }));
    }

    Ok(json!({
        "surface_kind": "runtime_health_snapshot_index",
        "source_of_truth_rule": SOURCE_OF_TRUTH_RULE,
        "mode": "snapshot",
        "roots": roots
    }))
}

fn scan_files(
    root: &Path,
    base: &Path,
    max_depth: usize,
    accepts: &dyn Fn(&Path) -> bool,
    limits: &ScanLimits,
    report: &mut ScanReport,
) -> Result<(), HelperError> {
    if !root.exists() {
        return Ok(());
    }
    scan_files_inner(root, base, max_depth, 0, accepts, limits, report)
}

fn scan_files_inner(
    root: &Path,
    base: &Path,
    max_depth: usize,
    depth: usize,
    accepts: &dyn Fn(&Path) -> bool,
    limits: &ScanLimits,
    report: &mut ScanReport,
) -> Result<(), HelperError> {
    if report.truncated {
        return Ok(());
    }
    if depth > max_depth {
        return Ok(());
    }

    let metadata = fs::symlink_metadata(root).map_err(|error| {
        HelperError::new(
            "metadata_failed",
            format!("{}: {error}", path_to_string(root)),
        )
    })?;
    if metadata.is_file() {
        if accepts(root) {
            if report.files.len() >= limits.max_files {
                report.truncated = true;
                return Ok(());
            }
            report.files.push(file_entry(root, base, &metadata));
        }
        return Ok(());
    }
    if !metadata.is_dir() {
        return Ok(());
    }

    let mut entries = fs::read_dir(root).map_err(|error| {
        HelperError::new(
            "read_dir_failed",
            format!("{}: {error}", path_to_string(root)),
        )
    })?;
    let mut paths = Vec::new();
    for entry_result in entries.by_ref() {
        let entry = entry_result
            .map_err(|error| HelperError::new("read_dir_entry_failed", error.to_string()))?;
        paths.push(entry.path());
    }
    paths.sort();
    for path in paths {
        if should_skip_dir(&path) {
            continue;
        }
        scan_files_inner(&path, base, max_depth, depth + 1, accepts, limits, report)?;
        if report.truncated {
            return Ok(());
        }
    }
    Ok(())
}

fn file_entry(path: &Path, base: &Path, metadata: &fs::Metadata) -> FileEntry {
    FileEntry {
        path: path_to_string(path),
        relative_path: path
            .strip_prefix(base)
            .ok()
            .map(path_to_string)
            .unwrap_or_else(|| path_to_string(path)),
        bytes: metadata.len(),
        modified_unix_ms: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis()),
    }
}

fn validate_json_file(file: &FileEntry, max_json_bytes: u64) -> JsonValidationEntry {
    if file.bytes > max_json_bytes {
        return JsonValidationEntry {
            path: file.path.clone(),
            relative_path: file.relative_path.clone(),
            valid: false,
            skipped: true,
            error: None,
            skip_reason: Some(format!("file exceeds max_json_bytes ({max_json_bytes})")),
        };
    }

    match fs::read_to_string(&file.path) {
        Ok(content) => match serde_json::from_str::<Value>(&content) {
            Ok(_) => JsonValidationEntry {
                path: file.path.clone(),
                relative_path: file.relative_path.clone(),
                valid: true,
                skipped: false,
                error: None,
                skip_reason: None,
            },
            Err(error) => JsonValidationEntry {
                path: file.path.clone(),
                relative_path: file.relative_path.clone(),
                valid: false,
                skipped: false,
                error: Some(error.to_string()),
                skip_reason: None,
            },
        },
        Err(error) => JsonValidationEntry {
            path: file.path.clone(),
            relative_path: file.relative_path.clone(),
            valid: false,
            skipped: false,
            error: Some(error.to_string()),
            skip_reason: None,
        },
    }
}

fn stable_file_fingerprint(files: &[FileEntry]) -> String {
    let mut normalized = BTreeMap::new();
    for file in files {
        normalized.insert(
            file.relative_path.clone(),
            (file.bytes, file.modified_unix_ms),
        );
    }
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    normalized.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn should_skip_dir(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    matches!(
        path.file_name().and_then(|value| value.to_str()),
        Some(".git" | ".venv" | "node_modules" | "target" | ".worktrees")
    )
}

fn extension_matches(path: &Path, extensions: &[String]) -> bool {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };
    extensions
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(extension))
}

fn required_path(request: &Value, key: &str) -> Result<PathBuf, HelperError> {
    optional_string(request, key)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| HelperError::new(format!("missing_{key}"), format!("{key} is required")))
}

fn path_list(request: &Value, key: &str) -> Option<Vec<PathBuf>> {
    let values = request.get(key)?.as_array()?;
    let paths = values
        .iter()
        .filter_map(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    if paths.is_empty() {
        None
    } else {
        Some(paths)
    }
}

fn string_list(request: &Value, key: &str) -> Option<Vec<String>> {
    let values = request.get(key)?.as_array()?;
    let strings = values
        .iter()
        .filter_map(|value| value.as_str())
        .map(|value| value.trim().trim_start_matches('.').to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if strings.is_empty() {
        None
    } else {
        Some(strings)
    }
}

fn optional_string(request: &Value, key: &str) -> Option<String> {
    request.get(key)?.as_str().map(|value| value.to_string())
}

fn optional_u64(request: &Value, key: &str) -> Option<u64> {
    request.get(key)?.as_u64()
}

fn scan_limits(request: &Value) -> Result<ScanLimits, HelperError> {
    Ok(ScanLimits {
        max_files: optional_limit_usize(request, "max_files", DEFAULT_MAX_FILES)?,
    })
}

fn optional_limit_usize(
    request: &Value,
    key: &str,
    default_value: usize,
) -> Result<usize, HelperError> {
    let Some(value) = optional_u64(request, key) else {
        return Ok(default_value);
    };
    if value == 0 {
        return Err(HelperError::new(
            "invalid_limit",
            format!("{key} must be greater than zero"),
        ));
    }
    usize::try_from(value).map_err(|_| {
        HelperError::new(
            "invalid_limit",
            format!("{key} is larger than this platform can scan safely"),
        )
    })
}

fn optional_limit_u64(request: &Value, key: &str, default_value: u64) -> Result<u64, HelperError> {
    let Some(value) = optional_u64(request, key) else {
        return Ok(default_value);
    };
    if value == 0 {
        return Err(HelperError::new(
            "invalid_limit",
            format!("{key} must be greater than zero"),
        ));
    }
    Ok(value)
}

impl ScanReport {
    fn new(limits: &ScanLimits) -> Self {
        Self {
            files: Vec::new(),
            truncated: false,
            max_files: limits.max_files,
        }
    }
}

fn path_to_string(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn artifact_indexer_reports_only_configured_artifact_files() {
        let root = unique_temp_root();
        fs::create_dir_all(root.join("artifacts")).unwrap();
        fs::write(root.join("artifacts").join("latest.json"), "{\"ok\":true}").unwrap();
        fs::write(root.join("artifacts").join("ignored.tmp"), "tmp").unwrap();

        let response = run_helper(
            "opl-artifact-indexer",
            &json!({
                "workspace_root": path_to_string(&root),
                "artifact_roots": [path_to_string(root.join("artifacts"))],
                "artifact_extensions": ["json"]
            })
            .to_string(),
        );

        assert!(response.ok);
        let result = response.result.unwrap();
        assert_eq!(result["surface_kind"], "native_artifact_manifest");
        assert_eq!(result["summary"]["total_files_count"], 1);
        assert_eq!(result["files"][0]["relative_path"], "artifacts/latest.json");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn state_indexer_validates_json_files() {
        let root = unique_temp_root();
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("valid.json"), "{\"ok\":true}").unwrap();
        fs::write(root.join("invalid.json"), "{").unwrap();

        let response = run_helper(
            "opl-state-indexer",
            &json!({
                "workspace_root": path_to_string(&root),
                "max_depth": 1
            })
            .to_string(),
        );

        assert!(response.ok);
        let result = response.result.unwrap();
        assert_eq!(result["surface_kind"], "native_state_index");
        assert_eq!(result["json_validation"]["checked_files_count"], 2);
        assert_eq!(result["json_validation"]["invalid_files_count"], 1);
        assert_eq!(result["json_validation"]["skipped_files_count"], 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn artifact_indexer_truncates_at_requested_file_limit() {
        let root = unique_temp_root();
        fs::create_dir_all(root.join("artifacts")).unwrap();
        fs::write(root.join("artifacts").join("a.json"), "{\"ok\":true}").unwrap();
        fs::write(root.join("artifacts").join("b.json"), "{\"ok\":true}").unwrap();

        let response = run_helper(
            "opl-artifact-indexer",
            &json!({
                "workspace_root": path_to_string(&root),
                "artifact_roots": [path_to_string(root.join("artifacts"))],
                "artifact_extensions": ["json"],
                "max_files": 1
            })
            .to_string(),
        );

        assert!(response.ok);
        let result = response.result.unwrap();
        assert_eq!(result["summary"]["total_files_count"], 1);
        assert_eq!(result["summary"]["truncated"], true);
        assert_eq!(result["summary"]["max_files"], 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn state_indexer_skips_json_files_above_validation_budget() {
        let root = unique_temp_root();
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("large.json"), "{\"payload\":\"abcdef\"}").unwrap();

        let response = run_helper(
            "opl-state-indexer",
            &json!({
                "workspace_root": path_to_string(&root),
                "max_depth": 1,
                "max_json_bytes": 4
            })
            .to_string(),
        );

        assert!(response.ok);
        let result = response.result.unwrap();
        assert_eq!(result["json_validation"]["checked_files_count"], 1);
        assert_eq!(result["json_validation"]["invalid_files_count"], 0);
        assert_eq!(result["json_validation"]["skipped_files_count"], 1);
        assert_eq!(result["json_validation"]["files"][0]["skipped"], true);
        assert_eq!(
            result["json_validation"]["files"][0]["skip_reason"],
            "file exceeds max_json_bytes (4)"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_json_input_returns_protocol_error() {
        let response = run_helper("opl-sysprobe", "{");
        assert!(!response.ok);
        assert_eq!(response.errors[0].code, "invalid_json");
    }

    #[test]
    fn helper_response_reports_crate_and_binary_versions() {
        let response = run_helper("opl-sysprobe", "{}");
        assert!(response.ok);
        assert_eq!(response.helper_version, env!("CARGO_PKG_VERSION"));
        assert_eq!(response.crate_name, env!("CARGO_PKG_NAME"));
        assert_eq!(response.crate_version, env!("CARGO_PKG_VERSION"));
        let result = response.result.unwrap();
        assert_eq!(result["toolchain"]["crate_name"], env!("CARGO_PKG_NAME"));
        assert_eq!(
            result["toolchain"]["crate_version"],
            env!("CARGO_PKG_VERSION")
        );
    }

    fn unique_temp_root() -> PathBuf {
        let mut path = env::temp_dir();
        path.push(format!(
            "opl-native-helper-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        path
    }
}
