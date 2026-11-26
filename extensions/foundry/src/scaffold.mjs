import fs from 'node:fs';
import path from 'node:path';
import { KEBAB_ID_RE, SEMVER_RE } from './canonical.mjs';

const VALID_INTENTS = new Set(['agent', 'app', 'extension', 'channel']);

function toTitleCase(id) {
  return id
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function initPackage(options = {}) {
  const dir = typeof options.dir === 'string' ? options.dir.trim() : '';
  if (!dir) {
    return {
      ok: false,
      exit_code: 2,
      error: { code: 'INVALID_INPUT', message: 'Target directory is required: opl foundry init <dir> --id <id>' },
    };
  }

  const absDir = path.resolve(dir);
  const id = typeof options.id === 'string' && options.id.trim()
    ? options.id.trim()
    : path.basename(absDir);

  if (!KEBAB_ID_RE.test(id)) {
    return {
      ok: false,
      exit_code: 2,
      error: { code: 'INVALID_ID', message: `Package id '${id}' must be lowercase kebab-case.` },
    };
  }

  const intent = typeof options.intent === 'string' && options.intent.trim()
    ? options.intent.trim()
    : 'agent';
  if (!VALID_INTENTS.has(intent)) {
    return {
      ok: false,
      exit_code: 2,
      error: { code: 'INVALID_INTENT', message: `Unsupported intent '${intent}'. Use agent|app|extension|channel.` },
    };
  }

  const version = typeof options.version === 'string' && options.version.trim()
    ? options.version.trim()
    : '0.1.0';
  if (!SEMVER_RE.test(version)) {
    return {
      ok: false,
      exit_code: 2,
      error: { code: 'INVALID_VERSION', message: `Version '${version}' must be valid SemVer 2.0.0.` },
    };
  }

  const publisher = typeof options.publisher === 'string' && options.publisher.trim()
    ? options.publisher.trim()
    : 'one-person-lab';
  const title = toTitleCase(id);
  const nameEn = typeof options.nameEn === 'string' && options.nameEn.trim() ? options.nameEn.trim() : title;
  const nameZh = typeof options.nameZh === 'string' && options.nameZh.trim() ? options.nameZh.trim() : title;
  const summaryEn = typeof options.summaryEn === 'string' && options.summaryEn.trim()
    ? options.summaryEn.trim()
    : `OPL ${intent} package ${id}.`;
  const summaryZh = typeof options.summaryZh === 'string' && options.summaryZh.trim()
    ? options.summaryZh.trim()
    : `OPL ${intent} 包 ${id}。`;
  const force = Boolean(options.force);

  const manifestPath = path.join(absDir, 'opl-package.json');
  if (fs.existsSync(manifestPath) && !force) {
    return {
      ok: false,
      exit_code: 2,
      error: { code: 'ALREADY_EXISTS', message: `Manifest already exists at ${manifestPath}; pass --force to overwrite.` },
    };
  }

  const skillDir = path.join(absDir, 'skills', id);
  fs.mkdirSync(skillDir, { recursive: true });

  const manifest = {
    schema_version: 'opl.package.v2',
    identity: {
      id,
      version,
      intent,
      name: {
        'zh-CN': nameZh,
        'en-US': nameEn,
      },
      summary: {
        'zh-CN': summaryZh,
        'en-US': summaryEn,
      },
      publisher,
      license: 'Apache-2.0',
      maturity: 'preview',
      keywords: ['opl', intent, id],
      default_prompts: [`Run ${nameEn} workflow cleanly.`],
    },
    dependencies: {
      opl_base: '^2.0.0',
    },
    permissions: {
      workspace: {
        access: intent === 'agent' ? 'read_write' : 'read',
        reason: {
          'zh-CN': '读写任务工作区上下文与交付产物',
          'en-US': 'Read and write task workspace context and deliverables',
        },
      },
      network: 'none',
      execution_mode: intent === 'extension' ? 'local_subprocess' : 'declarative_only',
    },
    provides: {
      ...(intent === 'agent' ? { agent: { stages_ref: './agent/stages.json' } } : {}),
      skills: [
        {
          id,
          path: `./skills/${id}`,
          exposure: 'default',
        },
      ],
    },
    host_hints: {
      codex: {
        sync_enabled: true,
        plugin_name: id,
        category: intent === 'agent' ? 'Research' : 'Developer Tools',
        capabilities: intent === 'agent' ? ['Read', 'Write'] : ['Read'],
      },
    },
  };

  const filesCreated = [];

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  filesCreated.push('opl-package.json');

  const readmePath = path.join(absDir, 'README.md');
  fs.writeFileSync(
    readmePath,
    `# ${nameEn} (\`${id}\`)\n\n${summaryEn}\n\n## Package Validation\n\n\`\`\`bash\nopl foundry validate .\nopl pack build .\n\`\`\`\n`,
    'utf8',
  );
  filesCreated.push('README.md');

  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(
    skillPath,
    `---\nname: ${id}\ndescription: ${summaryEn}\n---\n\n# ${nameEn}\n\nFollow refs-only workspace and ledger boundaries while executing ${id} tasks.\n`,
    'utf8',
  );
  filesCreated.push(`skills/${id}/SKILL.md`);

  if (intent === 'agent') {
    const agentDir = path.join(absDir, 'agent');
    const evalDir = path.join(absDir, 'eval');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(evalDir, { recursive: true });

    const stagesPath = path.join(agentDir, 'stages.json');
    fs.writeFileSync(
      stagesPath,
      `${JSON.stringify(
        [
          { stage_id: 'plan', executor: 'antigravity', model: 'gemini-4-neon-high', role: 'producer' },
          { stage_id: 'implement', executor: 'codex', model: 'gpt-5-codex', role: 'producer' },
        ],
        null,
        2,
      )}\n`,
      'utf8',
    );
    filesCreated.push('agent/stages.json');

    const suitePath = path.join(evalDir, 'suite.json');
    fs.writeFileSync(
      suitePath,
      `${JSON.stringify(
        {
          version: 'opl-eval-suite.v1',
          public_cases: [
            {
              case_id: 'manifest-conformance',
              kind: 'conformance',
              weight: 1.0,
              description: 'Verify opl.package.v2 manifest, skills, and stages_ref conformance.',
            },
            {
              case_id: 'stage-graph-declared',
              kind: 'stages_check',
              weight: 1.0,
              description: 'Verify declared stages_ref contains valid producer/reviewer stages.',
            },
          ],
          protected_requirements: [
            {
              category: 'safety_boundaries',
              minimum_case_count: 1,
            },
          ],
          gates: [
            { gate_id: 'min-score', metric: 'score', operator: 'gte', threshold: 0.8, required: true },
            { gate_id: 'protected-pass', metric: 'protected_pass_rate', operator: 'gte', threshold: 1.0, required: true },
          ],
          baseline_comparison: {
            required: true,
            regression_tolerance: 0.05,
          },
          cost_limits: { max_tokens: 100000 },
          latency_limits: { max_duration_ms: 60000 },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    filesCreated.push('eval/suite.json');
  }

  return {
    ok: true,
    exit_code: 0,
    dir: absDir,
    package_id: id,
    intent,
    version,
    files_created: filesCreated,
  };
}
