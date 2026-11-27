import fs from 'node:fs';
import path from 'node:path';
import {
  CODEX_PLUGIN_NAME_RE,
  KEBAB_ID_RE,
  SCOPED_ID_RE,
  SEMVER_RE,
  SHA256_DIGEST_RE,
  computeReleaseLock,
  isDshEntrySafePath,
  isRecord,
  isSafeRelativePosixPath,
  normalizeRelativePosixPath,
  resolveSafePath,
} from './canonical.mjs';

const INTENTS = new Set(['agent', 'app', 'extension', 'channel']);
const MATURITIES = new Set(['prototype', 'preview', 'stable']);
const WORKSPACE_ACCESS = new Set(['none', 'read', 'read_write']);
const KNOWLEDGE_SCOPES = new Set(['personal_profile', 'long_term_topic', 'project_local']);
const KNOWLEDGE_ACCESS = new Set(['read', 'propose_writeback']);
const NETWORK_MODES = new Set(['none', 'outbound_api', 'local_loopback', 'remote_tunnel']);
const EXECUTION_MODES = new Set(['in_process', 'local_subprocess', 'sandbox_iframe', 'declarative_only']);
const CAP_RISKS = new Set(['read', 'local_write', 'external_write']);
const DECLARATIVE_VIEW_TYPES = new Set([
  'channel_access',
  'service_status',
  'activity_log',
  'list_detail',
  'approval_diff',
  'remote_companion_access',
]);
const DECLARATIVE_VIEW_SLOTS = new Set([
  'settings.section',
  'runtime.detail',
  'composer.palette',
  'workbench.panel',
]);
const SETTINGS_DESTINATIONS = new Set([
  'models',
  'resources',
  'workspace',
  'capabilities',
  'services',
  'preferences',
]);
const DSH_CLIENT_SLOTS = new Set([
  'main',
  'sidebar.panellist',
  'settings.group.models',
  'settings.group.resources',
  'settings.group.workspace',
  'settings.group.capabilities',
  'settings.group.services',
  'settings.group.preferences',
]);
const RESERVED_SETTINGS_IDS = new Set([
  'overview',
  'models',
  'resources',
  'workspace',
  'capabilities',
  'services',
  'preferences',
  'settings',
  'updates',
  'software-center',
]);
const RESERVED_CLI_NAMESPACES = new Set(['daemon', 'workspace', 'pack', 'connect', 'runway', 'ledger']);

function isNonEmptyString(value, maxLen = 2000) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLen;
}

function isReservedSettingsId(id) {
  const lower = String(id).trim().toLowerCase();
  return RESERVED_SETTINGS_IDS.has(lower) || lower.startsWith('app.settings.') || lower.startsWith('settings.top.');
}

function checkUnknownKeys(obj, allowed, pathPrefix, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      errors.push({ code: 'UNKNOWN_KEY', path: `${pathPrefix}.${key}`, message: `Unexpected property '${key}'.` });
    }
  }
}

function validateI18nText(val, pathPrefix, errors) {
  if (!isRecord(val)) {
    errors.push({ code: 'INVALID_I18N_TEXT', path: pathPrefix, message: 'Expected bilingual I18nText object.' });
    return false;
  }
  checkUnknownKeys(val, new Set(['zh-CN', 'en-US']), pathPrefix, errors);
  if (!isNonEmptyString(val['zh-CN'], 2000)) {
    errors.push({ code: 'INVALID_I18N_TEXT', path: `${pathPrefix}.zh-CN`, message: 'Expected non-empty zh-CN text.' });
  }
  if (!isNonEmptyString(val['en-US'], 2000)) {
    errors.push({ code: 'INVALID_I18N_TEXT', path: `${pathPrefix}.en-US`, message: 'Expected non-empty en-US text.' });
  }
  return true;
}

function checkRegularFile(rootDir, relPath, pathPrefix, errors) {
  if (!isSafeRelativePosixPath(relPath)) {
    errors.push({ code: 'UNSAFE_PATH', path: pathPrefix, message: `Unsafe relative POSIX path '${relPath}'.` });
    return null;
  }
  try {
    const resolved = resolveSafePath(rootDir, relPath, { allowSymlinks: false });
    if (!fs.statSync(resolved).isFile()) {
      errors.push({ code: 'MISSING_FILE', path: pathPrefix, message: `Expected regular file at '${relPath}'.` });
      return null;
    }
    return resolved;
  } catch (err) {
    errors.push({ code: 'MISSING_FILE', path: pathPrefix, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function validateEntrypoint(rootDir, ep, pathPrefix, errors) {
  if (!isRecord(ep)) {
    errors.push({ code: 'INVALID_ENTRYPOINT', path: pathPrefix, message: 'Expected entrypoint object.' });
    return;
  }
  if (ep.kind === 'esm_module') {
    checkUnknownKeys(ep, new Set(['kind', 'module', 'export']), pathPrefix, errors);
    if (!isNonEmptyString(ep.export, 128)) {
      errors.push({ code: 'INVALID_ENTRYPOINT', path: `${pathPrefix}.export`, message: 'Expected export symbol name.' });
    }
    if (typeof ep.module !== 'string') {
      errors.push({ code: 'INVALID_ENTRYPOINT', path: `${pathPrefix}.module`, message: 'Expected module path.' });
    } else {
      checkRegularFile(rootDir, ep.module, `${pathPrefix}.module`, errors);
    }
  } else if (ep.kind === 'cli') {
    checkUnknownKeys(ep, new Set(['kind', 'argv', 'transport']), pathPrefix, errors);
    if (!Array.isArray(ep.argv) || ep.argv.length === 0 || ep.argv.some((a) => typeof a !== 'string' || a.length === 0)) {
      errors.push({ code: 'INVALID_ENTRYPOINT', path: `${pathPrefix}.argv`, message: 'Expected non-empty argv string array.' });
    } else {
      for (let i = 0; i < ep.argv.length; i += 1) {
        const arg = ep.argv[i];
        if (arg.startsWith('./') || arg.startsWith('../')) {
          checkRegularFile(rootDir, arg, `${pathPrefix}.argv[${i}]`, errors);
        }
      }
    }
    if (ep.transport !== undefined && ep.transport !== 'stdin_json_stdout_json' && ep.transport !== 'argv_json') {
      errors.push({ code: 'INVALID_ENTRYPOINT', path: `${pathPrefix}.transport`, message: 'Invalid CLI transport.' });
    }
  } else {
    errors.push({
      code: 'INVALID_ENTRYPOINT',
      path: `${pathPrefix}.kind`,
      message: "Entrypoint kind must be 'esm_module' or 'cli'.",
    });
  }
}

export function validateEvalSuite(suite, pathPrefix = 'eval_suite') {
  const errors = [];
  if (!isRecord(suite)) {
    errors.push({ code: 'INVALID_EVAL_SUITE', path: pathPrefix, message: 'Eval suite must be a JSON object.' });
    return errors;
  }
  if (!Array.isArray(suite.public_cases) || suite.public_cases.length === 0) {
    errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.public_cases`, message: 'Expected non-empty public_cases array.' });
  } else {
    const ids = new Set();
    for (let i = 0; i < suite.public_cases.length; i += 1) {
      const c = suite.public_cases[i];
      if (!isRecord(c) || !isNonEmptyString(c.case_id, 128)) {
        errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.public_cases[${i}]`, message: 'Each public case requires case_id.' });
        continue;
      }
      if (ids.has(c.case_id)) {
        errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.public_cases[${i}].case_id`, message: `Duplicate case_id '${c.case_id}'.` });
      }
      ids.add(c.case_id);
      if (typeof c.weight !== 'number' || !Number.isFinite(c.weight) || c.weight <= 0) {
        errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.public_cases[${i}].weight`, message: 'Public case weight must be > 0.' });
      }
    }
  }
  if (!Array.isArray(suite.protected_requirements)) {
    errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.protected_requirements`, message: 'Expected protected_requirements array.' });
  }
  if (!Array.isArray(suite.gates) || suite.gates.length === 0) {
    errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.gates`, message: 'Expected non-empty gates array.' });
  } else {
    for (let i = 0; i < suite.gates.length; i += 1) {
      const g = suite.gates[i];
      if (!isRecord(g) || !isNonEmptyString(g.gate_id, 128)) {
        errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.gates[${i}]`, message: 'Gate requires gate_id.' });
        continue;
      }
      if (!['score', 'protected_pass_rate'].includes(g.metric)) {
        errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.gates[${i}].metric`, message: `Unsupported gate metric '${String(g.metric)}'.` });
      }
      if (!['gte', 'lte', 'eq'].includes(g.operator)) {
        errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.gates[${i}].operator`, message: `Unsupported gate operator '${String(g.operator)}'.` });
      }
      if (typeof g.threshold !== 'number' || !Number.isFinite(g.threshold)) {
        errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.gates[${i}].threshold`, message: 'Gate threshold must be finite number.' });
      }
    }
  }
  if (!isRecord(suite.baseline_comparison) || typeof suite.baseline_comparison.required !== 'boolean' || typeof suite.baseline_comparison.regression_tolerance !== 'number') {
    errors.push({ code: 'INVALID_EVAL_SUITE', path: `${pathPrefix}.baseline_comparison`, message: 'baseline_comparison requires boolean required and numeric regression_tolerance.' });
  }
  return errors;
}

export function validatePackage(targetDir) {
  const errors = [];
  const warnings = [];
  const checks = [];

  if (!targetDir || typeof targetDir !== 'string') {
    return {
      ok: false,
      exit_code: 2,
      dir: null,
      package_id: null,
      intent: null,
      version: null,
      errors: [{ code: 'INVALID_INPUT', path: 'dir', message: 'Target package directory is required.' }],
      warnings,
      checks,
    };
  }

  const absDir = path.resolve(targetDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return {
      ok: false,
      exit_code: 2,
      dir: absDir,
      package_id: null,
      intent: null,
      version: null,
      errors: [{ code: 'DIR_NOT_FOUND', path: 'dir', message: `Directory does not exist: ${absDir}` }],
      warnings,
      checks,
    };
  }

  const manifestPath = path.join(absDir, 'opl-package.json');
  const manifestLstat = fs.lstatSync(manifestPath, { throwIfNoEntry: false });
  if (!manifestLstat) {
    return {
      ok: false,
      exit_code: 2,
      dir: absDir,
      package_id: null,
      intent: null,
      version: null,
      errors: [{ code: 'MISSING_MANIFEST', path: 'opl-package.json', message: `Missing opl-package.json in ${absDir}` }],
      warnings,
      checks,
    };
  }
  if (manifestLstat.isSymbolicLink()) {
    return {
      ok: false,
      exit_code: 2,
      dir: absDir,
      package_id: null,
      intent: null,
      version: null,
      errors: [{ code: 'SYMLINK_FORBIDDEN', path: 'opl-package.json', message: 'Symlink not allowed at opl-package.json.' }],
      warnings,
      checks,
    };
  }
  if (!manifestLstat.isFile()) {
    return {
      ok: false,
      exit_code: 2,
      dir: absDir,
      package_id: null,
      intent: null,
      version: null,
      errors: [{ code: 'INVALID_MANIFEST', path: 'opl-package.json', message: 'opl-package.json must be a regular file.' }],
      warnings,
      checks,
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      exit_code: 2,
      dir: absDir,
      package_id: null,
      intent: null,
      version: null,
      errors: [{ code: 'INVALID_JSON', path: 'opl-package.json', message: err instanceof Error ? err.message : String(err) }],
      warnings,
      checks,
    };
  }

  if (!isRecord(manifest)) {
    errors.push({ code: 'INVALID_MANIFEST', path: '$', message: 'Manifest root must be a JSON object.' });
    return { ok: false, exit_code: 2, dir: absDir, package_id: null, intent: null, version: null, errors, warnings, checks };
  }

  checkUnknownKeys(
    manifest,
    new Set(['schema_version', 'identity', 'dependencies', 'permissions', 'provides', 'ui', 'distribution', 'host_hints']),
    '$',
    errors,
  );

  if (manifest.schema_version !== 'opl.package.v2') {
    errors.push({ code: 'INVALID_SCHEMA_VERSION', path: 'schema_version', message: "schema_version must equal 'opl.package.v2'." });
  } else {
    checks.push('schema_version_v2');
  }

  const idObj = manifest.identity;
  let packageId = null;
  let intent = null;
  let version = null;

  if (!isRecord(idObj)) {
    errors.push({ code: 'INVALID_IDENTITY', path: 'identity', message: 'identity object is required.' });
  } else {
    checkUnknownKeys(
      idObj,
      new Set([
        'id', 'version', 'intent', 'name', 'summary', 'description', 'publisher',
        'license', 'icon', 'repository', 'homepage', 'maturity', 'keywords',
        'routing_summary', 'default_prompts', 'home_shortcuts',
      ]),
      'identity',
      errors,
    );
    if (typeof idObj.id !== 'string' || !KEBAB_ID_RE.test(idObj.id) || idObj.id.length > 128) {
      errors.push({ code: 'INVALID_ID', path: 'identity.id', message: 'identity.id must be lowercase kebab-case.' });
    } else {
      packageId = idObj.id;
    }
    if (typeof idObj.version !== 'string' || !SEMVER_RE.test(idObj.version)) {
      errors.push({ code: 'INVALID_VERSION', path: 'identity.version', message: 'identity.version must be valid SemVer 2.0.0.' });
    } else {
      version = idObj.version;
    }
    if (!INTENTS.has(idObj.intent)) {
      errors.push({ code: 'INVALID_INTENT', path: 'identity.intent', message: "identity.intent must be 'agent', 'app', 'extension', or 'channel'." });
    } else {
      intent = idObj.intent;
    }
    validateI18nText(idObj.name, 'identity.name', errors);
    validateI18nText(idObj.summary, 'identity.summary', errors);
    if (idObj.description !== undefined) validateI18nText(idObj.description, 'identity.description', errors);
    if (idObj.routing_summary !== undefined) validateI18nText(idObj.routing_summary, 'identity.routing_summary', errors);
    if (!isNonEmptyString(idObj.publisher, 128)) {
      errors.push({ code: 'INVALID_PUBLISHER', path: 'identity.publisher', message: 'identity.publisher is required.' });
    }
    if (idObj.maturity !== undefined && !MATURITIES.has(idObj.maturity)) {
      errors.push({ code: 'INVALID_MATURITY', path: 'identity.maturity', message: 'Invalid maturity level.' });
    }
    if (idObj.icon !== undefined) {
      checkRegularFile(absDir, idObj.icon, 'identity.icon', errors);
    }
    if (idObj.home_shortcuts !== undefined) {
      if (!Array.isArray(idObj.home_shortcuts) || idObj.home_shortcuts.length > 20) {
        errors.push({ code: 'INVALID_SHORTCUTS', path: 'identity.home_shortcuts', message: 'home_shortcuts must be array <= 20.' });
      } else {
        const seen = new Set();
        idObj.home_shortcuts.forEach((sc, idx) => {
          if (!isRecord(sc) || typeof sc.id !== 'string' || !SCOPED_ID_RE.test(sc.id)) {
            errors.push({ code: 'INVALID_SHORTCUT', path: `identity.home_shortcuts[${idx}].id`, message: 'Invalid shortcut id.' });
          } else if (seen.has(sc.id)) {
            errors.push({ code: 'DUPLICATE_ID', path: `identity.home_shortcuts[${idx}].id`, message: `Duplicate shortcut id '${sc.id}'.` });
          } else {
            seen.add(sc.id);
          }
          validateI18nText(sc?.label, `identity.home_shortcuts[${idx}].label`, errors);
        });
      }
    }
    checks.push('identity');
  }

  if (manifest.dependencies !== undefined) {
    if (!isRecord(manifest.dependencies)) {
      errors.push({ code: 'INVALID_DEPENDENCIES', path: 'dependencies', message: 'dependencies must be an object.' });
    } else {
      checkUnknownKeys(manifest.dependencies, new Set(['opl_base', 'packages', 'runtimes']), 'dependencies', errors);
      if (Array.isArray(manifest.dependencies.packages)) {
        const seen = new Set();
        manifest.dependencies.packages.forEach((dep, idx) => {
          if (!isRecord(dep) || typeof dep.id !== 'string' || !KEBAB_ID_RE.test(dep.id)) {
            errors.push({ code: 'INVALID_DEPENDENCY', path: `dependencies.packages[${idx}].id`, message: 'Invalid package dependency id.' });
          } else if (seen.has(dep.id)) {
            errors.push({ code: 'DUPLICATE_ID', path: `dependencies.packages[${idx}].id`, message: `Duplicate dependency '${dep.id}'.` });
          } else {
            seen.add(dep.id);
          }
        });
      }
    }
  }

  if (manifest.permissions !== undefined) {
    if (!isRecord(manifest.permissions)) {
      errors.push({ code: 'INVALID_PERMISSIONS', path: 'permissions', message: 'permissions must be an object.' });
    } else {
      checkUnknownKeys(manifest.permissions, new Set(['workspace', 'knowledge', 'connections', 'network', 'execution_mode']), 'permissions', errors);
      if (manifest.permissions.workspace !== undefined) {
        if (!isRecord(manifest.permissions.workspace) || !WORKSPACE_ACCESS.has(manifest.permissions.workspace.access)) {
          errors.push({ code: 'INVALID_PERMISSIONS', path: 'permissions.workspace.access', message: 'Invalid workspace access.' });
        }
        if (manifest.permissions.workspace?.reason !== undefined) {
          validateI18nText(manifest.permissions.workspace.reason, 'permissions.workspace.reason', errors);
        }
      }
      if (Array.isArray(manifest.permissions.knowledge)) {
        manifest.permissions.knowledge.forEach((k, idx) => {
          if (!isRecord(k) || !KNOWLEDGE_SCOPES.has(k.scope) || !KNOWLEDGE_ACCESS.has(k.access)) {
            errors.push({ code: 'INVALID_PERMISSIONS', path: `permissions.knowledge[${idx}]`, message: 'Invalid knowledge permission.' });
          }
          validateI18nText(k?.reason, `permissions.knowledge[${idx}].reason`, errors);
        });
      }
      if (Array.isArray(manifest.permissions.connections)) {
        manifest.permissions.connections.forEach((c, idx) => {
          if (!isRecord(c)) {
            errors.push({ code: 'INVALID_PERMISSIONS', path: `permissions.connections[${idx}]`, message: 'Connection permission must be object.' });
            return;
          }
          if ('capability_risk' in c && !CAP_RISKS.has(c.capability_risk)) {
            errors.push({ code: 'INVALID_PERMISSIONS', path: `permissions.connections[${idx}].capability_risk`, message: 'Invalid capability_risk.' });
          }
        });
      }
      if (manifest.permissions.network !== undefined && !NETWORK_MODES.has(manifest.permissions.network)) {
        errors.push({ code: 'INVALID_PERMISSIONS', path: 'permissions.network', message: 'Invalid network permission.' });
      }
      if (manifest.permissions.execution_mode !== undefined && !EXECUTION_MODES.has(manifest.permissions.execution_mode)) {
        errors.push({ code: 'INVALID_PERMISSIONS', path: 'permissions.execution_mode', message: 'Invalid execution_mode.' });
      }
    }
  }

  const mcpServerIds = new Set();
  const provides = manifest.provides;
  if (provides !== undefined) {
    if (!isRecord(provides)) {
      errors.push({ code: 'INVALID_PROVIDES', path: 'provides', message: 'provides must be an object.' });
    } else {
      checkUnknownKeys(
        provides,
        new Set([
          'agent', 'cli_bin', 'skills', 'mcp_servers', 'connection_providers',
          'channels', 'remote_companion_connectors', 'executors', 'cli_extensions', 'contribution_handler',
        ]),
        'provides',
        errors,
      );

      if (provides.agent !== undefined) {
        if (!isRecord(provides.agent)) {
          errors.push({ code: 'INVALID_AGENT_PROVIDES', path: 'provides.agent', message: 'provides.agent must be an object.' });
        } else {
          checkUnknownKeys(provides.agent, new Set(['stages_ref', 'authority_entrypoint']), 'provides.agent', errors);
          if (provides.agent.stages_ref !== undefined) {
            const stagesFile = checkRegularFile(absDir, provides.agent.stages_ref, 'provides.agent.stages_ref', errors);
            if (stagesFile) {
              try {
                const parsedStages = JSON.parse(fs.readFileSync(stagesFile, 'utf8'));
                const list = Array.isArray(parsedStages) ? parsedStages : parsedStages?.stages;
                if (!Array.isArray(list) || list.length === 0) {
                  errors.push({ code: 'INVALID_STAGES_REF', path: 'provides.agent.stages_ref', message: 'stages_ref must contain non-empty stage array.' });
                } else {
                  list.forEach((st, idx) => {
                    const sid = typeof st === 'string' ? st.trim() : (st?.stage_id || st?.id || '').trim();
                    if (!sid) {
                      errors.push({ code: 'INVALID_STAGES_REF', path: `provides.agent.stages_ref[${idx}]`, message: 'Stage entry requires stage_id.' });
                    }
                  });
                }
              } catch (err) {
                errors.push({ code: 'INVALID_STAGES_REF', path: 'provides.agent.stages_ref', message: err instanceof Error ? err.message : String(err) });
              }
            }
          }
          if (provides.agent.authority_entrypoint !== undefined) {
            validateEntrypoint(absDir, provides.agent.authority_entrypoint, 'provides.agent.authority_entrypoint', errors);
          }
        }
      }

      if (Array.isArray(provides.cli_bin)) {
        const seen = new Set();
        provides.cli_bin.forEach((b, idx) => {
          if (!isRecord(b) || typeof b.name !== 'string' || !KEBAB_ID_RE.test(b.name)) {
            errors.push({ code: 'INVALID_CLI_BIN', path: `provides.cli_bin[${idx}].name`, message: 'Invalid cli_bin name.' });
          } else if (seen.has(b.name)) {
            errors.push({ code: 'DUPLICATE_ID', path: `provides.cli_bin[${idx}].name`, message: `Duplicate cli_bin '${b.name}'.` });
          } else {
            seen.add(b.name);
          }
          if (typeof b?.path !== 'string') {
            errors.push({ code: 'INVALID_CLI_BIN', path: `provides.cli_bin[${idx}].path`, message: 'Missing cli_bin path.' });
          } else {
            checkRegularFile(absDir, b.path, `provides.cli_bin[${idx}].path`, errors);
          }
        });
      }

      if (Array.isArray(provides.skills)) {
        const seen = new Set();
        provides.skills.forEach((sk, idx) => {
          if (!isRecord(sk) || typeof sk.id !== 'string' || !SCOPED_ID_RE.test(sk.id)) {
            errors.push({ code: 'INVALID_SKILL', path: `provides.skills[${idx}].id`, message: 'Invalid skill id.' });
          } else if (seen.has(sk.id)) {
            errors.push({ code: 'DUPLICATE_ID', path: `provides.skills[${idx}].id`, message: `Duplicate skill id '${sk.id}'.` });
          } else {
            seen.add(sk.id);
          }
          if (typeof sk?.path !== 'string' || !isSafeRelativePosixPath(sk.path)) {
            errors.push({ code: 'INVALID_SKILL', path: `provides.skills[${idx}].path`, message: 'Invalid skill directory path.' });
          } else {
            try {
              const dirResolved = resolveSafePath(absDir, sk.path, { allowSymlinks: false });
              if (!fs.statSync(dirResolved).isDirectory()) {
                errors.push({ code: 'INVALID_SKILL', path: `provides.skills[${idx}].path`, message: 'Skill path must be a directory.' });
              } else {
                const clean = normalizeRelativePosixPath(sk.path);
                checkRegularFile(absDir, `${clean}/SKILL.md`, `provides.skills[${idx}].path`, errors);
              }
            } catch (err) {
              errors.push({ code: 'MISSING_FILE', path: `provides.skills[${idx}].path`, message: err instanceof Error ? err.message : String(err) });
            }
          }
        });
      }

      if (Array.isArray(provides.mcp_servers)) {
        provides.mcp_servers.forEach((srv, idx) => {
          if (!isRecord(srv) || typeof srv.id !== 'string' || !SCOPED_ID_RE.test(srv.id)) {
            errors.push({ code: 'INVALID_MCP_SERVER', path: `provides.mcp_servers[${idx}].id`, message: 'Invalid mcp_server id.' });
          } else if (mcpServerIds.has(srv.id)) {
            errors.push({ code: 'DUPLICATE_ID', path: `provides.mcp_servers[${idx}].id`, message: `Duplicate mcp_server '${srv.id}'.` });
          } else {
            mcpServerIds.add(srv.id);
          }
          if (srv?.transport === 'stdio') {
            if (!isNonEmptyString(srv.command, 512)) {
              errors.push({ code: 'INVALID_MCP_SERVER', path: `provides.mcp_servers[${idx}].command`, message: "stdio MCP server requires 'command'." });
            } else if (srv.command.startsWith('./') || srv.command.startsWith('../')) {
              checkRegularFile(absDir, srv.command, `provides.mcp_servers[${idx}].command`, errors);
            }
            if (Array.isArray(srv.args)) {
              srv.args.forEach((a, aIdx) => {
                if (typeof a === 'string' && (a.startsWith('./') || a.startsWith('../'))) {
                  checkRegularFile(absDir, a, `provides.mcp_servers[${idx}].args[${aIdx}]`, errors);
                }
              });
            }
          } else if (srv?.transport === 'streamable_http') {
            if (!isNonEmptyString(srv.url, 1024)) {
              errors.push({ code: 'INVALID_MCP_SERVER', path: `provides.mcp_servers[${idx}].url`, message: "streamable_http MCP server requires 'url'." });
            }
          } else {
            errors.push({ code: 'INVALID_MCP_SERVER', path: `provides.mcp_servers[${idx}].transport`, message: 'Invalid MCP transport.' });
          }
        });
      }

      for (const group of ['connection_providers', 'channels', 'remote_companion_connectors', 'executors']) {
        if (Array.isArray(provides[group])) {
          provides[group].forEach((item, idx) => {
            validateEntrypoint(absDir, item?.entrypoint, `provides.${group}[${idx}].entrypoint`, errors);
          });
        }
      }

      if (Array.isArray(provides.cli_extensions)) {
        const seenNs = new Set();
        provides.cli_extensions.forEach((ext, idx) => {
          if (!isRecord(ext) || typeof ext.namespace !== 'string' || !KEBAB_ID_RE.test(ext.namespace)) {
            errors.push({ code: 'INVALID_CLI_EXTENSION', path: `provides.cli_extensions[${idx}].namespace`, message: 'Invalid cli_extension namespace.' });
          } else if (RESERVED_CLI_NAMESPACES.has(ext.namespace)) {
            errors.push({ code: 'RESERVED_NAMESPACE', path: `provides.cli_extensions[${idx}].namespace`, message: `Namespace '${ext.namespace}' collides with core CLI.` });
          } else if (seenNs.has(ext.namespace)) {
            errors.push({ code: 'DUPLICATE_ID', path: `provides.cli_extensions[${idx}].namespace`, message: `Duplicate namespace '${ext.namespace}'.` });
          } else {
            seenNs.add(ext.namespace);
          }
          validateEntrypoint(absDir, ext?.entrypoint, `provides.cli_extensions[${idx}].entrypoint`, errors);
        });
      }

      if (provides.contribution_handler !== undefined) {
        validateEntrypoint(absDir, provides.contribution_handler, 'provides.contribution_handler', errors);
      }
      checks.push('provides_paths');
    }
  }

  if (manifest.ui !== undefined) {
    if (!isRecord(manifest.ui)) {
      errors.push({ code: 'INVALID_UI', path: 'ui', message: 'ui must be an object.' });
    } else {
      checkUnknownKeys(manifest.ui, new Set(['declarative', 'dsh_client', 'mcp_apps']), 'ui', errors);
      const decl = manifest.ui.declarative;
      if (decl !== undefined) {
        if (!isRecord(decl)) {
          errors.push({ code: 'INVALID_UI', path: 'ui.declarative', message: 'ui.declarative must be an object.' });
        } else {
          const views = Array.isArray(decl.views) ? decl.views : [];
          const forms = Array.isArray(decl.settings_forms) ? decl.settings_forms : [];
          const nav = Array.isArray(decl.navigation) ? decl.navigation : [];
          const viewMap = new Map();
          views.forEach((v, idx) => {
            if (!isRecord(v) || typeof v.id !== 'string' || !SCOPED_ID_RE.test(v.id)) {
              errors.push({ code: 'INVALID_UI', path: `ui.declarative.views[${idx}].id`, message: 'Invalid declarative view id.' });
              return;
            }
            if (viewMap.has(v.id)) {
              errors.push({ code: 'DUPLICATE_ID', path: `ui.declarative.views[${idx}].id`, message: `Duplicate view id '${v.id}'.` });
            }
            viewMap.set(v.id, v);
            if (!DECLARATIVE_VIEW_TYPES.has(v.view_type)) {
              errors.push({ code: 'INVALID_UI', path: `ui.declarative.views[${idx}].view_type`, message: 'Invalid declarative view_type.' });
            }
            if (!DECLARATIVE_VIEW_SLOTS.has(v.slot)) {
              errors.push({ code: 'INVALID_UI', path: `ui.declarative.views[${idx}].slot`, message: 'Invalid declarative slot.' });
            }
            if (v.slot === 'settings.section' && !SETTINGS_DESTINATIONS.has(v.settings_destination)) {
              errors.push({ code: 'INVALID_UI', path: `ui.declarative.views[${idx}].settings_destination`, message: 'settings.section requires valid settings_destination.' });
            }
            if (v.slot !== 'settings.section' && v.settings_destination !== undefined) {
              errors.push({ code: 'INVALID_UI', path: `ui.declarative.views[${idx}].settings_destination`, message: 'Only settings.section may set settings_destination.' });
            }
            validateI18nText(v.title, `ui.declarative.views[${idx}].title`, errors);
          });
          forms.forEach((f, idx) => {
            if (!isRecord(f) || typeof f.id !== 'string' || !SCOPED_ID_RE.test(f.id)) {
              errors.push({ code: 'INVALID_UI', path: `ui.declarative.settings_forms[${idx}].id`, message: 'Invalid settings_form id.' });
            } else if (viewMap.has(f.id)) {
              errors.push({ code: 'DUPLICATE_ID', path: `ui.declarative.settings_forms[${idx}].id`, message: `settings_form id '${f.id}' collides with view id.` });
            }
            if (!SETTINGS_DESTINATIONS.has(f?.destination)) {
              errors.push({ code: 'INVALID_UI', path: `ui.declarative.settings_forms[${idx}].destination`, message: 'Invalid settings_form destination.' });
            }
          });
          nav.forEach((n, idx) => {
            if (!isRecord(n) || typeof n.id !== 'string' || !SCOPED_ID_RE.test(n.id)) {
              errors.push({ code: 'INVALID_UI', path: `ui.declarative.navigation[${idx}].id`, message: 'Invalid navigation id.' });
              return;
            }
            if (isReservedSettingsId(n.id) || isReservedSettingsId(n.view_id)) {
              errors.push({ code: 'RESERVED_SETTINGS_ID', path: `ui.declarative.navigation[${idx}]`, message: 'Navigation collides with reserved App settings id.' });
            }
            const targetView = viewMap.get(n.view_id);
            if (!targetView) {
              errors.push({ code: 'MISSING_VIEW', path: `ui.declarative.navigation[${idx}].view_id`, message: `Unknown view_id '${n.view_id}'.` });
            } else if (targetView.slot === 'settings.section') {
              errors.push({ code: 'INVALID_UI', path: `ui.declarative.navigation[${idx}].view_id`, message: 'Navigation cannot target settings.section view.' });
            }
          });
          if ((views.length > 0 || forms.length > 0) && !provides?.contribution_handler) {
            errors.push({
              code: 'MISSING_CONTRIBUTION_HANDLER',
              path: 'provides.contribution_handler',
              message: 'provides.contribution_handler is required when ui.declarative.views or settings_forms are declared.',
            });
          }
        }
      }
      if (manifest.ui.dsh_client !== undefined) {
        const dsh = manifest.ui.dsh_client;
        if (!isRecord(dsh) || !isDshEntrySafePath(dsh.client_entry)) {
          errors.push({ code: 'INVALID_DSH_CLIENT', path: 'ui.dsh_client.client_entry', message: 'Invalid or vendor/ client_entry path.' });
        } else {
          checkRegularFile(absDir, dsh.client_entry, 'ui.dsh_client.client_entry', errors);
        }
        if (dsh?.host_entry !== undefined) {
          if (!isDshEntrySafePath(dsh.host_entry)) {
            errors.push({ code: 'INVALID_DSH_CLIENT', path: 'ui.dsh_client.host_entry', message: 'Invalid or vendor/ host_entry path.' });
          } else {
            checkRegularFile(absDir, dsh.host_entry, 'ui.dsh_client.host_entry', errors);
          }
        }
        if (!Array.isArray(dsh?.slots) || dsh.slots.length === 0 || dsh.slots.some((s) => !DSH_CLIENT_SLOTS.has(s))) {
          errors.push({ code: 'INVALID_DSH_CLIENT', path: 'ui.dsh_client.slots', message: 'Invalid dsh_client slots.' });
        }
      }
      if (Array.isArray(manifest.ui.mcp_apps)) {
        manifest.ui.mcp_apps.forEach((app, idx) => {
          if (!isRecord(app) || typeof app.mcp_server_id !== 'string' || !mcpServerIds.has(app.mcp_server_id)) {
            errors.push({ code: 'MISSING_MCP_SERVER', path: `ui.mcp_apps[${idx}].mcp_server_id`, message: 'mcp_server_id must exist in provides.mcp_servers.' });
          }
        });
      }
      checks.push('ui_cross_references');
    }
  }

  if (manifest.host_hints?.codex?.plugin_name !== undefined && !CODEX_PLUGIN_NAME_RE.test(manifest.host_hints.codex.plugin_name)) {
    errors.push({ code: 'INVALID_HOST_HINTS', path: 'host_hints.codex.plugin_name', message: 'Unsafe codex plugin_name.' });
  }

  // Forbidden plugins/<name>/ source mirror check (consistent with DaemonRuntime.assertNoPluginsMirrorDir)
  if (packageId) {
    const pluginName = manifest.host_hints?.codex?.plugin_name || packageId;
    for (const candidate of new Set([pluginName, packageId])) {
      const mirrorDir = path.join(absDir, 'plugins', candidate);
      if (fs.existsSync(mirrorDir)) {
        errors.push({
          code: 'FORBIDDEN_PLUGINS_MIRROR',
          path: `plugins/${candidate}`,
          message: `Forbidden plugins/${candidate}/ source mirror directory found; migrate and clean before release.`,
        });
      }
    }
    checks.push('no_plugins_mirror');
  }

  // Optional eval/suite.json check
  const evalSuitePath = path.join(absDir, 'eval', 'suite.json');
  if (fs.existsSync(evalSuitePath)) {
    try {
      const suite = JSON.parse(fs.readFileSync(evalSuitePath, 'utf8'));
      errors.push(...validateEvalSuite(suite, 'eval/suite.json'));
      checks.push('eval_suite');
    } catch (err) {
      errors.push({ code: 'INVALID_EVAL_SUITE', path: 'eval/suite.json', message: err instanceof Error ? err.message : String(err) });
    }
  }

  // Whole-tree symlink rejection (excluding top-level .git, arbitrary-depth cache/dep dirs, and .DS_Store)
  const realRoot = fs.realpathSync(absDir);
  function scanTreeForSymlinks(curDir, relPrefix, isTopLevel) {
    const names = fs.readdirSync(curDir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      if (name === '.DS_Store' || name === 'opl-release.lock.json') continue;
      if (isTopLevel && name === '.git') continue;
      const abs = path.join(curDir, name);
      const rel = relPrefix ? `${relPrefix}/${name}` : name;
      const lst = fs.lstatSync(abs);
      if (lst.isSymbolicLink()) {
        errors.push({
          code: 'SYMLINK_FORBIDDEN',
          path: rel,
          message: `Symlink '${rel}' is forbidden inside package directory.`,
        });
        continue;
      }
      if (lst.isDirectory()) {
        if (
          name === 'node_modules' ||
          name === '.codegraph' ||
          name === '.tsbuildinfo' ||
          name === '__pycache__' ||
          name === '.pytest_cache' ||
          name === '.ruff_cache' ||
          name === '.venv'
        ) {
          continue;
        }
        scanTreeForSymlinks(abs, rel, false);
      } else if (!lst.isFile()) {
        errors.push({
          code: 'UNSUPPORTED_FILE_TYPE',
          path: rel,
          message: `Unsupported special file '${rel}' inside package directory.`,
        });
      }
    }
  }
  scanTreeForSymlinks(realRoot, '', true);
  checks.push('no_symlinks');

  // Optional opl-release.lock.json verification
  const lockPath = path.join(absDir, 'opl-release.lock.json');
  const lockLstat = fs.lstatSync(lockPath, { throwIfNoEntry: false });
  if (lockLstat) {
    if (lockLstat.isSymbolicLink()) {
      errors.push({ code: 'SYMLINK_FORBIDDEN', path: 'opl-release.lock.json', message: 'opl-release.lock.json cannot be a symlink.' });
    } else if (!lockLstat.isFile()) {
      errors.push({ code: 'INVALID_RELEASE_LOCK', path: 'opl-release.lock.json', message: 'opl-release.lock.json must be a regular file.' });
    } else {
      try {
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        if (
          lock.schema_version !== 'opl.release.lock.v2'
          || lock.algorithm !== 'sha256'
          || lock.canonicalization !== 'ordered_path_length_file_length_bytes'
          || !SHA256_DIGEST_RE.test(String(lock.digest ?? ''))
        ) {
          errors.push({ code: 'INVALID_RELEASE_LOCK', path: 'opl-release.lock.json', message: 'Invalid opl-release.lock.json header.' });
        } else if (
          (packageId && lock.package_id !== packageId)
          || (version && lock.version !== version)
        ) {
          errors.push({
            code: 'RELEASE_LOCK_MISMATCH',
            path: 'opl-release.lock.json',
            message: `Release lock identity (${String(lock.package_id)}@${String(lock.version)}) does not match manifest (${String(packageId)}@${String(version)}).`,
          });
        } else {
          const computed = computeReleaseLock(absDir);
          const pathsMatch = Array.isArray(lock.paths)
            && lock.paths.length === computed.paths.length
            && lock.paths.every((p, idx) => p === computed.paths[idx]);
          if (computed.digest !== lock.digest || computed.file_count !== lock.file_count || !pathsMatch) {
            errors.push({
              code: 'RELEASE_LOCK_MISMATCH',
              path: 'opl-release.lock.json',
              message: `Release lock digest mismatch: expected ${lock.digest}, computed ${computed.digest}.`,
            });
          } else {
            checks.push('release_lock_verified');
          }
        }
      } catch (err) {
        errors.push({ code: 'INVALID_RELEASE_LOCK', path: 'opl-release.lock.json', message: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  if (intent === 'agent' && !provides?.agent?.stages_ref) {
    warnings.push('Agent package does not declare provides.agent.stages_ref.');
  }

  const ok = errors.length === 0;
  return {
    ok,
    exit_code: ok ? 0 : 2,
    dir: absDir,
    package_id: packageId,
    intent,
    version,
    errors,
    warnings,
    checks,
  };
}
