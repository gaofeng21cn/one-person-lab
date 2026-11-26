#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CORE_LINE_BUDGET = 3000;
const LEDGER_LINE_BUDGET = 1500;
const PYTHON_CLIENT_LINE_BUDGET = 1500;

const ALLOWED_INTERNAL_DEPS = {
  core: [],
  ledger: ['core'],
  workspace: ['core', 'ledger'],
  connect: ['core', 'ledger'],
  pack: ['core', 'connect', 'ledger'],
  runway: ['core', 'workspace', 'connect', 'pack', 'ledger'],
  daemon: ['core', 'ledger', 'workspace', 'connect', 'pack', 'runway', 'mcp-app-shared'],
  'mcp-app-shared': ['core'],
};

const FORBIDDEN_CORE_PACKAGE_PREFIXES = [
  '@opl/',
  '@temporalio/',
  '@deepseek-ai/cordis',
];

const CORE_FORBIDDEN_TOKEN_RULES = [
  {
    rule: 'core-forbidden-brand',
    label: 'OPL product/brand name',
    regex: /\bopl[-_\s]?(?:pack|connect|runway|workspace|ledger|foundry|atlas|stagecraft|charter|console|flow|cloud)\b/gi,
  },
  {
    rule: 'core-forbidden-brand-name',
    label: 'OPL/Aion product name',
    regex: /\b(?:one[\s_-]?person[\s_-]?lab|aionui|aioncore)\b/gi,
  },
  {
    rule: 'core-forbidden-engine-codex',
    label: 'codex engine reference',
    regex: /codex/gi,
  },
  {
    rule: 'core-forbidden-engine-antigravity',
    label: 'antigravity engine reference',
    regex: /antigravity/gi,
  },
  {
    rule: 'core-forbidden-engine-agy',
    label: 'agy engine reference',
    regex: /(?:^|[^A-Za-z])(?:[Aa]gy|AGY)(?=$|[^a-z])/g,
  },
  {
    rule: 'core-forbidden-engine-agy-camel',
    label: 'agy camelCase reference',
    regex: /[a-z](?:Agy|AGY)(?=$|[^a-z])/g,
  },
  {
    rule: 'core-forbidden-engine-temporal',
    label: 'temporal engine reference',
    regex: /temporal/gi,
  },
  {
    rule: 'core-forbidden-domain-pkg',
    label: 'domain package identifier',
    regex: /\b(?:med[-_]?autoscience|med[-_]?autogrant|redcube[-_]?ai|opl[-_]?bookforge|opl[-_]?capital[-_]?compass|opl[-_]?relay|opl[-_]?persona|opl[-_]?channel[-_]?weixin|opl[-_]?foundry|opl[-_]?meta[-_]?agent|autoscience|autogrant|redcube|bookforge|weixin)\b/gi,
  },
  {
    rule: 'core-forbidden-domain-abbr',
    label: 'uppercase domain package abbreviation',
    regex: /\b(?:MAS|MAG|RCA|OBF|OCC)\b/g,
  },
  {
    rule: 'core-forbidden-domain-abbr-quoted',
    label: 'quoted domain package abbreviation',
    regex: /['"`](?:mas|mag|rca|obf|occ)['"`]/gi,
  },
];

const SOURCE_FILE_RE = /\.(?:ts|mts|cts|js|mjs|cjs)$/;
const SQL_STMT_RE = /\b(?:SELECT\b[\s\S]*?\bFROM\b|WITH\b[\s\S]*?\bSELECT\b|INSERT(?:\s+OR\s+\w+)?\s+INTO\b|REPLACE\s+INTO\b|ATTACH\s+(?:DATABASE\s+)?(?=['"`?@:$A-Za-z_])[\s\S]*?\bAS\b|UPDATE\s+[A-Za-z_][A-Za-z0-9_]*\s+SET\b|DELETE\s+FROM\b|CREATE\s+(?:TABLE|INDEX|TRIGGER|VIEW)\b|ALTER\s+TABLE\b|DROP\s+(?:TABLE|INDEX|TRIGGER|VIEW)\b|PRAGMA\s+[A-Za-z_]|BEGIN\s+(?:IMMEDIATE|EXCLUSIVE|DEFERRED)\b|SAVEPOINT\s+[A-Za-z_]|RELEASE\s+SAVEPOINT\b|ROLLBACK\s+TO\s+SAVEPOINT\b)/i;

function walkFiles(dirPath, options = {}) {
  const skipDirs = new Set(options.skipDirs ?? ['node_modules', 'dist', '.git']);
  const results = [];
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      results.push(...walkFiles(fullPath, options));
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.tsbuildinfo')) continue;
      results.push(fullPath);
    }
  }
  return results;
}

function countPhysicalLines(text) {
  if (text.length === 0) return 0;
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.length;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'throw',
  'case',
  'in',
  'instanceof',
  'typeof',
  'void',
  'delete',
  'await',
  'yield',
  'else',
  'of',
  'new',
  'export',
  'default',
]);

const CONTROL_FLOW_PAREN_KEYWORDS = new Set([
  'if',
  'while',
  'for',
  'with',
  'catch',
]);

const VALID_REGEX_FLAGS_RE = /^[dgimsuvy]*$/;
const REGEX_CONTINUATION_KEYWORDS = new Set(['instanceof', 'in', 'as', 'satisfies']);

function isControlFlowParenOpen(prevToken, prevPrevToken) {
  if (!prevToken || prevToken.type !== 'ident') return false;
  if (prevToken.value === 'await' && prevPrevToken?.type === 'ident' && prevPrevToken.value === 'for') {
    return true;
  }
  if (!CONTROL_FLOW_PAREN_KEYWORDS.has(prevToken.value)) return false;
  if (prevPrevToken?.type === 'punct' && prevPrevToken.value === '.') return false;
  return true;
}

function tryReadRegexAfterNewline(source, startIndex) {
  if (source[startIndex] !== '/') return null;
  const nextCh = source[startIndex + 1] ?? '';
  if (nextCh === '/' || nextCh === '*' || nextCh === '\n' || nextCh === '\r' || nextCh === '') {
    return null;
  }
  let i = startIndex + 1;
  let inClass = false;
  let closed = false;
  while (i < source.length) {
    const rc = source[i];
    if (rc === '\\') {
      if (i + 1 >= source.length || source[i + 1] === '\n' || source[i + 1] === '\r') {
        return null;
      }
      i += 2;
      continue;
    }
    if (rc === '[') {
      inClass = true;
    } else if (rc === ']') {
      inClass = false;
    } else if (rc === '/' && !inClass) {
      i += 1;
      closed = true;
      break;
    } else if (rc === '\n' || rc === '\r') {
      return null;
    }
    i += 1;
  }
  if (!closed) return null;

  const flagStart = i;
  while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) {
    i += 1;
  }
  const flags = source.slice(flagStart, i);
  if (!VALID_REGEX_FLAGS_RE.test(flags)) return null;

  let after = i;
  while (after < source.length && (source[after] === ' ' || source[after] === '\t')) {
    after += 1;
  }
  if (after >= source.length) return i;
  const ach = source[after];
  const anext = source[after + 1] ?? '';
  if (ach === '\n' || ach === '\r') return i;
  if (ach === '/' && (anext === '/' || anext === '*')) return i;
  if ('.;,)]}?:&|=!+-*%<>^'.includes(ach)) return i;
  if (/[A-Za-z_$]/.test(ach)) {
    let kwEnd = after;
    while (kwEnd < source.length && /[A-Za-z0-9_$]/.test(source[kwEnd])) kwEnd += 1;
    const kw = source.slice(after, kwEnd);
    if (REGEX_CONTINUATION_KEYWORDS.has(kw)) return i;
  }
  return null;
}

function canPrecedeRegex(prevToken) {
  if (!prevToken) return true;
  if (prevToken.type === 'ident') return REGEX_PRECEDING_KEYWORDS.has(prevToken.value);
  if (prevToken.type === 'punct') {
    if (prevToken.value === ')') return Boolean(prevToken.closesControlFlow);
    return prevToken.value !== ']' && prevToken.value !== '++' && prevToken.value !== '--';
  }
  return false;
}

function readQuotedString(source, startIndex, quoteChar) {
  let value = '';
  let i = startIndex + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      const next = source[i + 1] ?? '';
      if (next !== '\n') value += next;
      i += 2;
      continue;
    }
    if (ch === quoteChar) {
      i += 1;
      break;
    }
    value += ch;
    i += 1;
  }
  return { value, nextIndex: i };
}

function tokenizeTsForImports(source) {
  const tokens = [];
  const cursor = { i: 0, line: 1 };

  const advanceTo = (targetIndex) => {
    while (cursor.i < targetIndex && cursor.i < source.length) {
      if (source.charCodeAt(cursor.i) === 10) cursor.line += 1;
      cursor.i += 1;
    }
  };

  const advanceBy = (count) => {
    advanceTo(Math.min(source.length, cursor.i + count));
  };

  const lexTemplateLiteral = () => {
    const startLine = cursor.line;
    advanceBy(1);
    let body = '';
    let hasExpr = false;
    while (cursor.i < source.length) {
      const cur = source[cursor.i];
      const nxt = source[cursor.i + 1] ?? '';
      if (cur === '\\') {
        if (nxt !== '\n') body += nxt;
        advanceBy(2);
        continue;
      }
      if (cur === '$' && nxt === '{') {
        if (!hasExpr) {
          hasExpr = true;
          tokens.push({ type: 'template_head', value: body, line: startLine });
        }
        tokens.push({ type: 'punct', value: '${', line: cursor.line });
        advanceBy(2);
        lexTsRegion(true);
        tokens.push({ type: 'punct', value: '}', line: cursor.line });
        continue;
      }
      if (cur === '`') {
        advanceBy(1);
        break;
      }
      body += cur;
      advanceBy(1);
    }
    if (!hasExpr) {
      tokens.push({ type: 'template_no_sub', value: body, line: startLine });
    } else {
      tokens.push({ type: 'template_tail', value: '', line: cursor.line });
    }
  };

  const lexTsRegion = (stopAtClosingBrace) => {
    let braceDepth = stopAtClosingBrace ? 1 : 0;
    let prevSigToken = null;
    let prevPrevSigToken = null;
    let sawNewlineSincePrevToken = false;
    const parenStack = [];
    const recordSigToken = (tok) => {
      prevPrevSigToken = prevSigToken;
      prevSigToken = tok;
      sawNewlineSincePrevToken = false;
    };

    while (cursor.i < source.length) {
      const ch = source[cursor.i];
      const next = source[cursor.i + 1] ?? '';

      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\f' || ch === '\v') {
        if (ch === '\n' || ch === '\r') sawNewlineSincePrevToken = true;
        advanceBy(1);
        continue;
      }

      // Line comment
      if (ch === '/' && next === '/') {
        advanceBy(2);
        while (cursor.i < source.length && source[cursor.i] !== '\n') {
          advanceBy(1);
        }
        continue;
      }

      // Block comment
      if (ch === '/' && next === '*') {
        const commentStartLine = cursor.line;
        advanceBy(2);
        while (cursor.i < source.length && !(source[cursor.i] === '*' && source[cursor.i + 1] === '/')) {
          advanceBy(1);
        }
        if (cursor.i < source.length) advanceBy(2);
        if (cursor.line > commentStartLine) sawNewlineSincePrevToken = true;
        continue;
      }

      // Regex literal (standard position or ASI newline regex literal)
      let asiRegexEnd = null;
      if (
        ch === '/'
        && (
          canPrecedeRegex(prevSigToken)
          || (sawNewlineSincePrevToken && (asiRegexEnd = tryReadRegexAfterNewline(source, cursor.i)) !== null)
        )
      ) {
        const startLine = cursor.line;
        const nextIdx = asiRegexEnd !== null ? asiRegexEnd : skipRegexLiteral(source, cursor.i);
        advanceTo(nextIdx);
        const tok = { type: 'regex', value: '', line: startLine };
        tokens.push(tok);
        recordSigToken(tok);
        continue;
      }

      // Single/double quoted strings
      if (ch === '\'' || ch === '"') {
        const startLine = cursor.line;
        const { value, nextIndex } = readQuotedString(source, cursor.i, ch);
        advanceTo(nextIndex);
        const tok = { type: 'string', value, line: startLine };
        tokens.push(tok);
        recordSigToken(tok);
        continue;
      }

      // Template literal
      if (ch === '`') {
        lexTemplateLiteral();
        recordSigToken(tokens[tokens.length - 1] ?? null);
        continue;
      }

      if (stopAtClosingBrace) {
        if (ch === '{') {
          braceDepth += 1;
          const tok = { type: 'punct', value: '{', line: cursor.line };
          tokens.push(tok);
          recordSigToken(tok);
          advanceBy(1);
          continue;
        }
        if (ch === '}') {
          braceDepth -= 1;
          if (braceDepth === 0) {
            advanceBy(1);
            return;
          }
          const tok = { type: 'punct', value: '}', line: cursor.line };
          tokens.push(tok);
          recordSigToken(tok);
          advanceBy(1);
          continue;
        }
      }

      // Identifiers
      if (/[A-Za-z_$]/.test(ch)) {
        const startLine = cursor.line;
        const start = cursor.i;
        while (cursor.i < source.length && /[A-Za-z0-9_$]/.test(source[cursor.i])) advanceBy(1);
        const tok = { type: 'ident', value: source.slice(start, cursor.i), line: startLine };
        tokens.push(tok);
        recordSigToken(tok);
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        const startLine = cursor.line;
        const start = cursor.i;
        while (cursor.i < source.length && /[0-9A-Za-z_.]/.test(source[cursor.i])) advanceBy(1);
        const tok = { type: 'number', value: source.slice(start, cursor.i), line: startLine };
        tokens.push(tok);
        recordSigToken(tok);
        continue;
      }

      // Multi-char punctuators
      if ((ch === '+' && next === '+') || (ch === '-' && next === '-') || (ch === '=' && next === '>')) {
        const tok = { type: 'punct', value: ch + next, line: cursor.line };
        tokens.push(tok);
        recordSigToken(tok);
        advanceBy(2);
        continue;
      }

      if (ch === '(') {
        parenStack.push(isControlFlowParenOpen(prevSigToken, prevPrevSigToken));
        const tok = { type: 'punct', value: '(', line: cursor.line };
        tokens.push(tok);
        recordSigToken(tok);
        advanceBy(1);
        continue;
      }

      if (ch === ')') {
        const closesControlFlow = parenStack.length > 0 ? parenStack.pop() : false;
        const tok = { type: 'punct', value: ')', line: cursor.line, closesControlFlow };
        tokens.push(tok);
        recordSigToken(tok);
        advanceBy(1);
        continue;
      }

      const tok = { type: 'punct', value: ch, line: cursor.line };
      tokens.push(tok);
      recordSigToken(tok);
      advanceBy(1);
    }
  };

  lexTsRegion(false);
  return tokens;
}

function isStringLikeToken(tok) {
  return tok && (tok.type === 'string' || tok.type === 'template_no_sub');
}

function extractModuleImportsAndDynamics(sourceText) {
  const tokens = tokenizeTsForImports(sourceText);
  const specifiers = [];
  const dynamicImports = [];

  for (let k = 0; k < tokens.length; k += 1) {
    const tok = tokens[k];
    const prev = k > 0 ? tokens[k - 1] : null;
    const next = k + 1 < tokens.length ? tokens[k + 1] : null;
    const isMemberAccess = prev && prev.type === 'punct' && prev.value === '.';
    if (isMemberAccess) continue;

    // Dynamic import(...) or require(...)
    if (
      (tok.type === 'ident' && (tok.value === 'import' || tok.value === 'require'))
      && next
      && next.type === 'punct'
      && next.value === '('
    ) {
      if (tok.value === 'require' && prev && prev.type === 'ident' && prev.value === 'function') {
        continue;
      }
      // Find matching ')' and inspect first argument tokens
      let parenDepth = 1;
      let j = k + 2;
      const firstArgTokens = [];
      let inFirstArg = true;
      while (j < tokens.length && parenDepth > 0) {
        const t = tokens[j];
        if (t.type === 'punct' && t.value === '(') parenDepth += 1;
        else if (t.type === 'punct' && t.value === ')') {
          parenDepth -= 1;
          if (parenDepth === 0) break;
        } else if (parenDepth === 1 && t.type === 'punct' && t.value === ',') {
          inFirstArg = false;
        }
        if (inFirstArg) firstArgTokens.push(t);
        j += 1;
      }
      const afterClose = j + 1 < tokens.length ? tokens[j + 1] : null;
      if (
        tok.value === 'require'
        && afterClose
        && afterClose.type === 'punct'
        && (afterClose.value === '{' || afterClose.value === ':')
      ) {
        continue;
      }
      if (firstArgTokens.length === 1 && isStringLikeToken(firstArgTokens[0])) {
        specifiers.push({ specifier: firstArgTokens[0].value, line: firstArgTokens[0].line });
      } else {
        dynamicImports.push({
          kind: tok.value,
          line: tok.line,
          expr: firstArgTokens.map((t) => t.value).join(' ').trim(),
        });
      }
      continue;
    }

    // Static import ...
    if (tok.type === 'ident' && tok.value === 'import') {
      if (next && next.type === 'punct' && next.value === '.') continue; // import.meta
      if (isStringLikeToken(next)) {
        specifiers.push({ specifier: next.value, line: next.line });
        continue;
      }
      let braceDepth = 0;
      for (let j = k + 1; j < tokens.length; j += 1) {
        const t = tokens[j];
        if (t.type === 'punct' && t.value === '{') braceDepth += 1;
        else if (t.type === 'punct' && t.value === '}') braceDepth = Math.max(0, braceDepth - 1);
        else if (braceDepth === 0 && t.type === 'punct' && t.value === ';') break;
        else if (braceDepth === 0 && j > k + 1 && t.type === 'ident' && (t.value === 'import' || t.value === 'export')) {
          break;
        } else if (braceDepth === 0 && t.type === 'ident' && t.value === 'from') {
          const specTok = tokens[j + 1];
          if (isStringLikeToken(specTok)) {
            specifiers.push({ specifier: specTok.value, line: specTok.line });
          }
          break;
        }
      }
      continue;
    }

    // Static export ... from '...'
    if (tok.type === 'ident' && tok.value === 'export') {
      let idx = k + 1;
      if (tokens[idx]?.type === 'ident' && tokens[idx].value === 'type') idx += 1;
      const startTok = tokens[idx];
      if (!startTok) continue;
      const isReexportStart =
        (startTok.type === 'punct' && (startTok.value === '*' || startTok.value === '{'));
      if (!isReexportStart) continue;
      let braceDepth = 0;
      for (let j = idx; j < tokens.length; j += 1) {
        const t = tokens[j];
        if (t.type === 'punct' && t.value === '{') braceDepth += 1;
        else if (t.type === 'punct' && t.value === '}') braceDepth = Math.max(0, braceDepth - 1);
        else if (braceDepth === 0 && t.type === 'punct' && t.value === ';') break;
        else if (braceDepth === 0 && t.type === 'ident' && t.value === 'from') {
          const specTok = tokens[j + 1];
          if (isStringLikeToken(specTok)) {
            specifiers.push({ specifier: specTok.value, line: specTok.line });
          }
          break;
        }
      }
    }
  }

  return { specifiers, dynamicImports };
}

function stripSqlCommentsPreservingLines(sqlText) {
  let out = '';
  let i = 0;
  let state = 'sql';
  while (i < sqlText.length) {
    const ch = sqlText[i];
    const next = sqlText[i + 1] ?? '';
    if (state === 'sql') {
      if (ch === '-' && next === '-') {
        state = 'line_comment';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block_comment';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '\'') {
        state = 'sq_string';
        out += ch;
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
    } else if (state === 'line_comment') {
      if (ch === '\n') {
        state = 'sql';
        out += '\n';
      } else {
        out += ' ';
      }
      i += 1;
    } else if (state === 'block_comment') {
      if (ch === '*' && next === '/') {
        state = 'sql';
        out += '  ';
        i += 2;
      } else {
        out += ch === '\n' ? '\n' : ' ';
        i += 1;
      }
    } else if (state === 'sq_string') {
      out += ch;
      if (ch === '\'' && next === '\'') {
        out += next;
        i += 2;
        continue;
      }
      if (ch === '\'') {
        state = 'sql';
      }
      i += 1;
    }
  }
  return out;
}

function skipRegexLiteral(source, startIndex) {
  let i = startIndex + 1;
  let inClass = false;
  while (i < source.length) {
    const rc = source[i];
    if (rc === '\\') {
      i += 2;
      continue;
    }
    if (rc === '[') {
      inClass = true;
    } else if (rc === ']') {
      inClass = false;
    } else if (rc === '/' && !inClass) {
      i += 1;
      while (i < source.length && /[a-z]/i.test(source[i])) i += 1;
      return i;
    } else if (rc === '\n') {
      return i;
    }
    i += 1;
  }
  return i;
}

function scanTemplateLiteralForSql(source, startIndex, literals) {
  const startLine = lineNumberAt(source, startIndex);
  let i = startIndex + 1;
  let content = '';
  while (i < source.length) {
    const cur = source[i];
    const next = source[i + 1] ?? '';
    if (cur === '\\') {
      if (next !== '\n') content += next;
      i += 2;
      continue;
    }
    if (cur === '$' && next === '{') {
      content += ' __EXPR__ ';
      i = scanTsRegionForSql(source, i + 2, literals, true);
      continue;
    }
    if (cur === '`') {
      i += 1;
      break;
    }
    content += cur;
    i += 1;
  }
  literals.push({ content, line: startLine });
  return i;
}

function scanTsRegionForSql(source, startIndex, literals, stopAtClosingBrace) {
  let i = startIndex;
  let braceDepth = stopAtClosingBrace ? 1 : 0;
  let prevSigToken = null;
  let prevPrevSigToken = null;
  let sawNewlineSincePrevToken = false;
  const parenStack = [];
  const recordSigToken = (tok) => {
    prevPrevSigToken = prevSigToken;
    prevSigToken = tok;
    sawNewlineSincePrevToken = false;
  };

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1] ?? '';

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\f' || ch === '\v') {
      if (ch === '\n' || ch === '\r') sawNewlineSincePrevToken = true;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n' || source[i] === '\r') sawNewlineSincePrevToken = true;
        i += 1;
      }
      if (i < source.length) i += 2;
      continue;
    }

    let asiRegexEnd = null;
    if (
      ch === '/'
      && (
        canPrecedeRegex(prevSigToken)
        || (sawNewlineSincePrevToken && (asiRegexEnd = tryReadRegexAfterNewline(source, i)) !== null)
      )
    ) {
      i = asiRegexEnd !== null ? asiRegexEnd : skipRegexLiteral(source, i);
      recordSigToken({ type: 'other', value: '' });
      continue;
    }

    if (ch === '\'' || ch === '"') {
      const start = i;
      const { value, nextIndex } = readQuotedString(source, i, ch);
      literals.push({ content: value, line: lineNumberAt(source, start) });
      i = nextIndex;
      recordSigToken({ type: 'other', value: '' });
      continue;
    }

    if (ch === '`') {
      i = scanTemplateLiteralForSql(source, i, literals);
      recordSigToken({ type: 'other', value: '' });
      continue;
    }

    if (stopAtClosingBrace) {
      if (ch === '{') {
        braceDepth += 1;
        recordSigToken({ type: 'punct', value: '{' });
        i += 1;
        continue;
      }
      if (ch === '}') {
        braceDepth -= 1;
        i += 1;
        if (braceDepth === 0) return i;
        recordSigToken({ type: 'punct', value: '}' });
        continue;
      }
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) i += 1;
      recordSigToken({ type: 'ident', value: source.slice(start, i) });
      continue;
    }

    if (/[0-9]/.test(ch)) {
      while (i < source.length && /[0-9A-Za-z_.]/.test(source[i])) i += 1;
      recordSigToken({ type: 'other', value: '' });
      continue;
    }

    if ((ch === '+' && next === '+') || (ch === '-' && next === '-') || (ch === '=' && next === '>')) {
      recordSigToken({ type: 'punct', value: ch + next });
      i += 2;
      continue;
    }

    if (ch === '(') {
      parenStack.push(isControlFlowParenOpen(prevSigToken, prevPrevSigToken));
      recordSigToken({ type: 'punct', value: '(' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      const closesControlFlow = parenStack.length > 0 ? parenStack.pop() : false;
      recordSigToken({ type: 'punct', value: ')', closesControlFlow });
      i += 1;
      continue;
    }

    recordSigToken({ type: 'punct', value: ch });
    i += 1;
  }

  return i;
}

function extractTsStringAndTemplateBodies(sourceText) {
  const literals = [];
  scanTsRegionForSql(sourceText, 0, literals, false);
  return literals;
}

function isInsideDir(parentDir, targetPath) {
  const rel = path.relative(parentDir, targetPath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function checkCorePackage(rootDir, violations) {
  const coreDir = path.join(rootDir, 'packages', 'core');
  const coreSrcDir = path.join(coreDir, 'src');
  if (!fs.existsSync(coreSrcDir)) {
    violations.push({
      rule: 'core-src-missing',
      file: 'packages/core/src',
      line: 1,
      message: 'packages/core/src directory is missing.',
    });
    return { coreLineCount: 0, coreFilesChecked: 0 };
  }

  const srcFiles = walkFiles(coreSrcDir).filter((f) => SOURCE_FILE_RE.test(f));
  if (srcFiles.length === 0) {
    violations.push({
      rule: 'core-src-empty',
      file: 'packages/core/src',
      line: 1,
      message: 'packages/core/src contains no source files.',
    });
    return { coreLineCount: 0, coreFilesChecked: 0 };
  }

  let coreLineCount = 0;
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    coreLineCount += countPhysicalLines(content);
  }
  if (coreLineCount >= CORE_LINE_BUDGET) {
    violations.push({
      rule: 'core-line-budget',
      file: 'packages/core/src',
      line: 1,
      message: `packages/core/src line count (${coreLineCount}) must be < ${CORE_LINE_BUDGET}.`,
    });
  }

  const corePkgJsonPath = path.join(coreDir, 'package.json');
  if (fs.existsSync(corePkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(corePkgJsonPath, 'utf8'));
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        const deps = pkgJson[field];
        if (deps && typeof deps === 'object' && Object.keys(deps).length > 0) {
          for (const depName of Object.keys(deps)) {
            violations.push({
              rule: 'core-zero-dependencies',
              file: 'packages/core/package.json',
              line: 1,
              message: `packages/core must have zero npm dependencies, found "${depName}" in ${field}.`,
            });
          }
        }
      }
    } catch (error) {
      violations.push({
        rule: 'core-package-json-invalid',
        file: 'packages/core/package.json',
        line: 1,
        message: `Invalid JSON in packages/core/package.json: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const allNonDistCoreFiles = walkFiles(coreDir);
  for (const file of allNonDistCoreFiles) {
    const relFile = path.relative(rootDir, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    for (const tokenRule of CORE_FORBIDDEN_TOKEN_RULES) {
      tokenRule.regex.lastIndex = 0;
      let match;
      while ((match = tokenRule.regex.exec(text)) !== null) {
        violations.push({
          rule: tokenRule.rule,
          file: relFile,
          line: lineNumberAt(text, match.index),
          message: `Forbidden ${tokenRule.label} "${match[0]}" found inside packages/core.`,
        });
      }
    }
  }

  return { coreLineCount, coreFilesChecked: allNonDistCoreFiles.length };
}

function checkLedgerPackage(rootDir, violations, { requireLedger = false } = {}) {
  const ledgerSrcDir = path.join(rootDir, 'packages', 'ledger', 'src');
  if (!fs.existsSync(ledgerSrcDir)) {
    if (requireLedger) {
      violations.push({
        rule: 'ledger-src-missing',
        file: 'packages/ledger/src',
        line: 1,
        message: 'packages/ledger/src directory is missing.',
      });
    }
    return { ledgerLineCount: 0, ledgerFilesChecked: 0 };
  }

  const srcFiles = walkFiles(ledgerSrcDir).filter((f) => SOURCE_FILE_RE.test(f));
  let ledgerLineCount = 0;
  for (const file of srcFiles) {
    ledgerLineCount += countPhysicalLines(fs.readFileSync(file, 'utf8'));
  }

  if (requireLedger && ledgerLineCount === 0) {
    violations.push({
      rule: 'ledger-src-empty',
      file: 'packages/ledger/src',
      line: 1,
      message: 'packages/ledger/src contains no source files.',
    });
  }
  if (ledgerLineCount > LEDGER_LINE_BUDGET) {
    violations.push({
      rule: 'ledger-line-budget',
      file: 'packages/ledger/src',
      line: 1,
      message: `packages/ledger/src line count (${ledgerLineCount}) must be <= ${LEDGER_LINE_BUDGET}.`,
    });
  }

  return { ledgerLineCount, ledgerFilesChecked: srcFiles.length };
}

function collectTemporalDepsInPkgJson(pkgJson) {
  const hits = [];
  if (!pkgJson || typeof pkgJson !== 'object') return hits;
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides', 'resolutions']) {
    const map = pkgJson[field];
    if (!map || typeof map !== 'object') continue;
    for (const key of Object.keys(map)) {
      if (key.startsWith('@temporalio/') || key === 'temporalio') {
        hits.push(`${field}.${key}`);
      }
    }
  }
  return hits;
}

function checkStrictM4RepoInvariants(rootDir, violations) {
  // 1. sdks/python-client (< 1,500 lines, pure Python stdlib)
  const pyDir = path.join(rootDir, 'sdks', 'python-client');
  let pythonLineCount = 0;
  if (!fs.existsSync(pyDir)) {
    violations.push({
      rule: 'python-client-missing',
      file: 'sdks/python-client',
      line: 1,
      message: 'sdks/python-client directory is missing.',
    });
  } else {
    const pyFiles = walkFiles(pyDir, {
      skipDirs: new Set(['__pycache__', '.venv', 'venv', '.git', 'node_modules', 'tests', '.pytest_cache', 'dist', 'build']),
    }).filter((full) => {
      const name = path.basename(full);
      if (!name.endsWith('.py')) return false;
      const rel = path.relative(pyDir, full).split(path.sep).join('/');
      return !rel.startsWith('tests/') && !/^test_.*\.py$/.test(name) && !/_test\.py$/.test(name);
    });

    if (pyFiles.length === 0) {
      violations.push({
        rule: 'python-client-empty',
        file: 'sdks/python-client',
        line: 1,
        message: 'sdks/python-client contains no non-test .py source files.',
      });
    } else {
      for (const f of pyFiles) {
        pythonLineCount += countPhysicalLines(fs.readFileSync(f, 'utf8'));
      }
      if (pythonLineCount <= 0 || pythonLineCount >= PYTHON_CLIENT_LINE_BUDGET) {
        violations.push({
          rule: 'python-line-budget',
          file: 'sdks/python-client',
          line: 1,
          message: `sdks/python-client line count (${pythonLineCount}) must be in (0, ${PYTHON_CLIENT_LINE_BUDGET}).`,
        });
      }

      const astChecker = [
        'import ast, json, pathlib, sys',
        'root = pathlib.Path(sys.argv[1]).resolve()',
        'files = [pathlib.Path(p).resolve() for p in sys.argv[2:]]',
        'local_mods = set()',
        "for base in [root, root / 'src']:",
        '    if base.is_dir():',
        '        for ent in base.iterdir():',
        "            if ent.is_file() and ent.suffix == '.py':",
        '                local_mods.add(ent.stem)',
        "            elif ent.is_dir() and (ent / '__init__.py').is_file():",
        '                local_mods.add(ent.name)',
        "allowed = set(sys.stdlib_module_names) | set(sys.builtin_module_names) | local_mods | {'__future__'}",
        'errors, non_stdlib = [], []',
        'for f in files:',
        '    try:',
        "        tree = ast.parse(f.read_text(encoding='utf-8'), filename=str(f))",
        '    except SyntaxError as exc:',
        "        errors.append({'file': str(f), 'line': exc.lineno or 1, 'message': f'SyntaxError: {exc.msg}'})",
        '        continue',
        '    for node in ast.walk(tree):',
        '        if isinstance(node, ast.Import):',
        '            for alias in node.names:',
        "                top = alias.name.split('.')[0]",
        '                if top not in allowed:',
        "                    non_stdlib.append({'file': str(f), 'line': node.lineno, 'raw': alias.name})",
        '        elif isinstance(node, ast.ImportFrom):',
        '            if node.level and node.level > 0:',
        '                continue',
        '            if node.module:',
        "                top = node.module.split('.')[0]",
        '                if top not in allowed:',
        "                    non_stdlib.append({'file': str(f), 'line': node.lineno, 'raw': node.module})",
        "print(json.dumps({'errors': errors, 'non_stdlib': non_stdlib}))",
      ].join('\n');

      const pyRes = spawnSync('python3', ['-B', '-c', astChecker, pyDir, ...pyFiles], {
        encoding: 'utf8',
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      });
      if (pyRes.status !== 0) {
        violations.push({
          rule: 'python-ast-check-failed',
          file: 'sdks/python-client',
          line: 1,
          message: `Python AST stdlib check failed: ${pyRes.stderr || pyRes.stdout}`,
        });
      } else {
        const parsed = JSON.parse(pyRes.stdout || '{}');
        for (const err of parsed.errors || []) {
          violations.push({
            rule: 'python-syntax-error',
            file: path.relative(rootDir, err.file).split(path.sep).join('/'),
            line: err.line || 1,
            message: err.message,
          });
        }
        for (const item of parsed.non_stdlib || []) {
          violations.push({
            rule: 'python-non-stdlib-import',
            file: path.relative(rootDir, item.file).split(path.sep).join('/'),
            line: item.line || 1,
            message: `Non-stdlib Python import "${item.raw}" is forbidden in sdks/python-client.`,
          });
        }
      }
    }

    const pyprojectPath = path.join(pyDir, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      const pyprojectText = fs.readFileSync(pyprojectPath, 'utf8');
      const depsMatch = pyprojectText.match(/^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m);
      if (depsMatch && depsMatch[1].trim().length > 0) {
        violations.push({
          rule: 'python-runtime-dependencies-forbidden',
          file: 'sdks/python-client/pyproject.toml',
          line: 1,
          message: 'sdks/python-client/pyproject.toml must declare dependencies = [] (pure stdlib).',
        });
      }
    }
  }

  // 2. Temporal elimination across package manifests, lockfile, vendor, and files (excl. tests/e2e/)
  const rootPkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(rootPkgPath)) {
    try {
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
      for (const hit of collectTemporalDepsInPkgJson(rootPkg)) {
        violations.push({
          rule: 'temporal-root-dependency',
          file: 'package.json',
          line: 1,
          message: `Root package.json contains forbidden Temporal dependency: ${hit}`,
        });
      }
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        const map = rootPkg[field];
        if (!map || typeof map !== 'object') continue;
        for (const key of Object.keys(map)) {
          if (key === 'opl-flow' || key === '@opl/flow' || key.endsWith('/opl-flow')) {
            violations.push({
              rule: 'opl-flow-circular-ref',
              file: 'package.json',
              line: 1,
              message: `Forbidden opl-flow circular reference in package.json: ${field}.${key}`,
            });
          }
          if (key === '@deepseek-ai/cordis') {
            violations.push({
              rule: 'forbidden-legacy-dependency',
              file: 'package.json',
              line: 1,
              message: `Forbidden legacy dependency "${key}" in package.json (${field}).`,
            });
          }
        }
      }
      if (rootPkg.scripts && typeof rootPkg.scripts === 'object') {
        for (const [k, v] of Object.entries(rootPkg.scripts)) {
          if (typeof v === 'string' && /\bopl-flow\b/.test(v)) {
            violations.push({
              rule: 'opl-flow-circular-ref',
              file: 'package.json',
              line: 1,
              message: `Forbidden opl-flow reference in package.json scripts.${k}`,
            });
          }
        }
      }
      if (Array.isArray(rootPkg.files)) {
        for (const entry of rootPkg.files) {
          if (typeof entry === 'string' && /\bopl-flow\b/.test(entry)) {
            violations.push({
              rule: 'opl-flow-circular-ref',
              file: 'package.json',
              line: 1,
              message: `Forbidden opl-flow reference in package.json files: ${entry}`,
            });
          }
        }
      }
    } catch {
      // handled elsewhere if malformed
    }
  }

  const rootLockPath = path.join(rootDir, 'package-lock.json');
  if (fs.existsSync(rootLockPath)) {
    try {
      const lockJson = JSON.parse(fs.readFileSync(rootLockPath, 'utf8'));
      if (lockJson.packages && typeof lockJson.packages === 'object') {
        for (const [pkgPath, entry] of Object.entries(lockJson.packages)) {
          if (pkgPath.includes('@temporalio/')) {
            violations.push({
              rule: 'temporal-lock-dependency',
              file: 'package-lock.json',
              line: 1,
              message: `package-lock.json contains forbidden Temporal entry: ${pkgPath}`,
            });
          }
          for (const hit of collectTemporalDepsInPkgJson(entry)) {
            violations.push({
              rule: 'temporal-lock-dependency',
              file: 'package-lock.json',
              line: 1,
              message: `package-lock.json (${pkgPath}) contains forbidden Temporal dependency: ${hit}`,
            });
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  if (fs.existsSync(path.join(rootDir, 'vendor', 'temporal'))) {
    violations.push({
      rule: 'temporal-vendor-dir',
      file: 'vendor/temporal',
      line: 1,
      message: 'Forbidden vendor/temporal directory remains.',
    });
  }

  for (const sub of ['src', 'packages', 'contracts', 'scripts', 'docs', 'tests']) {
    const absSub = path.join(rootDir, sub);
    if (!fs.existsSync(absSub)) continue;
    for (const full of walkFiles(absSub)) {
      const rel = path.relative(rootDir, full).split(path.sep).join('/');
      if (rel.startsWith('tests/e2e/')) continue;
      if (/temporal/i.test(path.basename(full))) {
        violations.push({
          rule: 'temporal-file-present',
          file: rel,
          line: 1,
          message: `Forbidden Temporal file remains in repo: ${rel}`,
        });
      }
    }
  }

  // 3. Legacy demolition (CLI aliases, src/entrypoints/cli, python/opl_framework, brand-*.json, agent-*.json, static packages)
  for (const forbiddenDir of ['src/entrypoints/cli', 'python/opl_framework', 'plugins/opl-foundation-skills']) {
    if (fs.existsSync(path.join(rootDir, forbiddenDir))) {
      violations.push({
        rule: 'legacy-dir-present',
        file: forbiddenDir,
        line: 1,
        message: `Forbidden legacy directory remains: ${forbiddenDir}`,
      });
    }
  }

  const oplContractsDir = path.join(rootDir, 'contracts', 'opl-framework');
  if (fs.existsSync(oplContractsDir)) {
    for (const ent of fs.readdirSync(oplContractsDir, { withFileTypes: true })) {
      if (ent.isFile() && /^brand-.*\.json$/i.test(ent.name)) {
        violations.push({
          rule: 'legacy-brand-json',
          file: `contracts/opl-framework/${ent.name}`,
          line: 1,
          message: `Forbidden legacy brand governance JSON remains: contracts/opl-framework/${ent.name}`,
        });
      }
      if (ent.isFile() && /^agent-.*\.json$/i.test(ent.name)) {
        violations.push({
          rule: 'static-agent-list',
          file: `contracts/opl-framework/${ent.name}`,
          line: 1,
          message: `Forbidden static agent JSON remains: contracts/opl-framework/${ent.name}`,
        });
      }
    }
    const staticPkgsDir = path.join(oplContractsDir, 'packages');
    if (fs.existsSync(staticPkgsDir)) {
      for (const f of walkFiles(staticPkgsDir).filter((p) => p.endsWith('.json'))) {
        const rel = path.relative(rootDir, f).split(path.sep).join('/');
        violations.push({
          rule: 'static-package-list',
          file: rel,
          line: 1,
          message: `Forbidden static package JSON remains: ${rel}`,
        });
      }
    }
  }

  const rootBinPath = path.join(rootDir, 'bin', 'opl');
  if (fs.existsSync(rootBinPath)) {
    const binText = fs.readFileSync(rootBinPath, 'utf8');
    if (/src\/entrypoints\/cli|run_codex|\bcodex\b/i.test(binText)) {
      violations.push({
        rule: 'legacy-root-bin-fallback',
        file: 'bin/opl',
        line: 1,
        message: 'bin/opl still contains legacy src/entrypoints/cli or codex fallback.',
      });
    }
  }

  return { pythonLineCount };
}

function checkPackagesDagAndImports(rootDir, violations) {
  const packagesDir = path.join(rootDir, 'packages');
  if (!fs.existsSync(packagesDir)) return { packagesChecked: [], dagEdges: [] };

  const legacySrcDir = path.join(rootDir, 'src');
  const extensionsDir = path.join(rootDir, 'extensions');
  const packageEntries = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const packagesChecked = [];
  const dagEdges = [];
  const graph = new Map();

  for (const entry of packageEntries) {
    const pkgName = entry.name;
    packagesChecked.push(pkgName);
    const pkgDir = path.join(packagesDir, pkgName);
    const allowedDeps = ALLOWED_INTERNAL_DEPS[pkgName];
    const edges = new Set();
    graph.set(pkgName, edges);

    if (!allowedDeps) {
      violations.push({
        rule: 'unknown-v2-package',
        file: `packages/${pkgName}`,
        line: 1,
        message: `Package "${pkgName}" is not registered in ALLOWED_INTERNAL_DEPS DAG.`,
      });
      continue;
    }

    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
          const deps = pkgJson[field];
          if (!deps || typeof deps !== 'object') continue;
          for (const [depName, spec] of Object.entries(deps)) {
            if (depName.startsWith('@temporalio/') || depName === '@deepseek-ai/cordis') {
              violations.push({
                rule: 'forbidden-legacy-dependency',
                file: `packages/${pkgName}/package.json`,
                line: 1,
                message: `Forbidden legacy dependency "${depName}" in ${field}.`,
              });
            }
            if (depName.startsWith('@opl/')) {
              const targetPkg = depName.slice('@opl/'.length);
              edges.add(targetPkg);
              if (!allowedDeps.includes(targetPkg)) {
                violations.push({
                  rule: 'dag-violation-package-json',
                  file: `packages/${pkgName}/package.json`,
                  line: 1,
                  message: `Package "@opl/${pkgName}" may not depend on "@opl/${targetPkg}" (allowed: [${allowedDeps.join(', ')}]).`,
                });
              }
            }
            if (typeof spec === 'string' && spec.startsWith('file:')) {
              const resolvedTarget = path.resolve(pkgDir, spec.slice('file:'.length));
              if (!isInsideDir(pkgDir, resolvedTarget)) {
                violations.push({
                  rule: 'escaping-file-dependency',
                  file: `packages/${pkgName}/package.json`,
                  line: 1,
                  message: `file: dependency "${depName}": "${spec}" escapes packages/${pkgName}.`,
                });
              }
            }
          }
        }
      } catch (error) {
        violations.push({
          rule: 'invalid-package-json',
          file: `packages/${pkgName}/package.json`,
          line: 1,
          message: `Invalid package.json: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    const pkgSrcDir = path.join(pkgDir, 'src');
    const pkgTestsDir = path.join(pkgDir, 'tests');
    const allowedGuardScriptPath = path.join(rootDir, 'scripts', 'check-v2-import-guard.mjs');
    const scanGroups = [
      { isInPkgSrc: true, files: walkFiles(pkgSrcDir).filter((f) => SOURCE_FILE_RE.test(f)) },
      { isInPkgSrc: false, files: walkFiles(pkgTestsDir).filter((f) => SOURCE_FILE_RE.test(f)) },
    ];

    for (const group of scanGroups) {
      const isInPkgSrc = group.isInPkgSrc;
      for (const file of group.files) {
        const relFile = path.relative(rootDir, file).split(path.sep).join('/');
        const content = fs.readFileSync(file, 'utf8');
        const { specifiers: specs, dynamicImports } = extractModuleImportsAndDynamics(content);

        if (isInPkgSrc) {
          let allowedPluginLoadCount = 0;
          for (const dyn of dynamicImports) {
            const isAllowedPluginLoad =
              pkgName === 'core'
              && relFile === 'packages/core/src/plugin-loader.ts'
              && dyn.kind === 'import'
              && dyn.expr === 'specifier'
              && allowedPluginLoadCount === 0;
            if (isAllowedPluginLoad) {
              allowedPluginLoadCount += 1;
              continue;
            }
            violations.push({
              rule: pkgName === 'core' ? 'core-dynamic-import-forbidden' : 'dynamic-import-forbidden',
              file: relFile,
              line: dyn.line,
              message: `packages/${pkgName}/src cannot use non-literal dynamic ${dyn.kind}(${dyn.expr || '...'}).`,
            });
          }
        }

        for (const { specifier, line } of specs) {
          if (pkgName === 'core') {
            for (const prefix of FORBIDDEN_CORE_PACKAGE_PREFIXES) {
              if (specifier === prefix || specifier.startsWith(prefix)) {
                violations.push({
                  rule: 'core-forbidden-import',
                  file: relFile,
                  line,
                  message: `packages/core cannot import "${specifier}".`,
                });
              }
            }
          } else if (specifier.startsWith('@temporalio/') || specifier === '@deepseek-ai/cordis') {
            violations.push({
              rule: 'forbidden-legacy-import',
              file: relFile,
              line,
              message: `packages/${pkgName} cannot import legacy dependency "${specifier}".`,
            });
          }

          if (specifier.startsWith('@opl/')) {
            const targetPkg = specifier.slice('@opl/'.length).split('/')[0];
            if (isInPkgSrc) edges.add(targetPkg);
            const selfTestAllowed = !isInPkgSrc && pkgName !== 'core' && targetPkg === pkgName;
            if (!selfTestAllowed && !allowedDeps.includes(targetPkg)) {
              violations.push({
                rule: 'dag-violation-import',
                file: relFile,
                line,
                message: `packages/${pkgName} cannot import "@opl/${targetPkg}" (allowed: [${allowedDeps.join(', ')}]).`,
              });
            }
          }

          if (specifier.startsWith('.')) {
            const resolved = path.resolve(path.dirname(file), specifier);
            if (!isInPkgSrc && resolved === allowedGuardScriptPath) {
              continue;
            }
            if (isInsideDir(legacySrcDir, resolved)) {
              violations.push({
                rule: 'legacy-src-import',
                file: relFile,
                line,
                message: `packages/${pkgName} cannot import legacy src/ path "${specifier}".`,
              });
            } else if (isInsideDir(extensionsDir, resolved)) {
              violations.push({
                rule: 'extensions-import-forbidden',
                file: relFile,
                line,
                message: `packages/${pkgName} cannot import extensions/ path "${specifier}".`,
              });
            } else if (isInPkgSrc && pkgName === 'core' && !isInsideDir(pkgSrcDir, resolved)) {
              violations.push({
                rule: 'core-escaping-relative-import',
                file: relFile,
                line,
                message: `packages/core/src relative import "${specifier}" escapes packages/core/src.`,
              });
            } else if (!isInsideDir(pkgDir, resolved)) {
              if (isInsideDir(packagesDir, resolved)) {
                const targetPkg = path.relative(packagesDir, resolved).split(path.sep)[0];
                if (isInPkgSrc) edges.add(targetPkg);
                if (!allowedDeps.includes(targetPkg)) {
                  violations.push({
                    rule: 'dag-violation-relative-import',
                    file: relFile,
                    line,
                    message: `packages/${pkgName} relative import "${specifier}" targets disallowed package "${targetPkg}".`,
                  });
                }
              } else {
                violations.push({
                  rule: 'escaping-relative-import',
                  file: relFile,
                  line,
                  message: `Relative import "${specifier}" escapes packages/${pkgName}.`,
                });
              }
            }
          } else if (
            specifier.includes('packages/')
            || specifier.includes('extensions/')
            || /(?:^|\/)src\//.test(specifier)
          ) {
            violations.push({
              rule: 'forbidden-path-specifier',
              file: relFile,
              line,
              message: `Forbidden direct workspace path import "${specifier}".`,
            });
          }
        }
      }
    }

    for (const target of [...edges].sort()) {
      dagEdges.push(`${pkgName} -> ${target}`);
    }
  }

  // Cycle check across packages/*
  const visitState = new Map();
  const stack = [];
  function dfs(node) {
    visitState.set(node, 'visiting');
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      if (visitState.get(dep) === 'visiting') {
        const cycle = [...stack.slice(stack.indexOf(dep)), dep].join(' -> ');
        violations.push({
          rule: 'package-dag-cycle',
          file: `packages/${node}`,
          line: 1,
          message: `Package dependency cycle detected: ${cycle}`,
        });
      } else if (!visitState.has(dep) && graph.has(dep)) {
        dfs(dep);
      }
    }
    stack.pop();
    visitState.set(node, 'visited');
  }
  for (const pkgName of packagesChecked) {
    if (!visitState.has(pkgName)) dfs(pkgName);
  }

  return { packagesChecked, dagEdges };
}

function checkDqs0SqlLiterals(rootDir, violations, packagesChecked) {
  let sqlFilesChecked = 0;
  for (const pkgName of packagesChecked) {
    const pkgDir = path.join(rootDir, 'packages', pkgName);
    if (!fs.existsSync(pkgDir)) continue;
    const files = walkFiles(pkgDir);
    for (const file of files) {
      const relFile = path.relative(rootDir, file).split(path.sep).join('/');
      if (file.endsWith('.sql')) {
        sqlFilesChecked += 1;
        const raw = fs.readFileSync(file, 'utf8');
        const cleaned = stripSqlCommentsPreservingLines(raw);
        const dqIdx = cleaned.indexOf('"');
        if (dqIdx !== -1) {
          violations.push({
            rule: 'dqs0-sql-double-quote',
            file: relFile,
            line: lineNumberAt(cleaned, dqIdx),
            message: 'SQL file contains double-quoted literal/identifier; DQS=0 requires single-quoted string literals only.',
          });
        }
      } else if (SOURCE_FILE_RE.test(file) && isInsideDir(path.join(pkgDir, 'src'), file)) {
        const raw = fs.readFileSync(file, 'utf8');
        const literals = extractTsStringAndTemplateBodies(raw);
        for (const lit of literals) {
          if (!SQL_STMT_RE.test(lit.content)) continue;
          sqlFilesChecked += 1;
          const cleanedSql = stripSqlCommentsPreservingLines(lit.content);
          if (cleanedSql.includes('"')) {
            violations.push({
              rule: 'dqs0-ts-sql-double-quote',
              file: relFile,
              line: lit.line,
              message: 'TypeScript SQL literal contains double quotes; DQS=0 requires single-quoted SQL string literals only.',
            });
          }
        }
      }
    }
  }
  return { sqlFilesChecked };
}

export function runV2ImportGuard(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const strictM4 = options.strictM4 === true;
  const violations = [];
  const coreStats = checkCorePackage(rootDir, violations);
  const ledgerStats = checkLedgerPackage(rootDir, violations, { requireLedger: strictM4 });
  const dagStats = checkPackagesDagAndImports(rootDir, violations);
  const sqlStats = checkDqs0SqlLiterals(rootDir, violations, dagStats.packagesChecked);
  const m4Stats = strictM4 ? checkStrictM4RepoInvariants(rootDir, violations) : { pythonLineCount: 0 };

  return {
    ok: violations.length === 0,
    strictM4,
    rootDir,
    coreLineCount: coreStats.coreLineCount,
    coreLineBudget: CORE_LINE_BUDGET,
    coreFilesChecked: coreStats.coreFilesChecked,
    ledgerLineCount: ledgerStats.ledgerLineCount,
    ledgerLineBudget: LEDGER_LINE_BUDGET,
    pythonLineCount: m4Stats.pythonLineCount,
    pythonLineBudget: PYTHON_CLIENT_LINE_BUDGET,
    packagesChecked: dagStats.packagesChecked,
    dagEdges: dagStats.dagEdges,
    sqlLiteralsChecked: sqlStats.sqlFilesChecked,
    violations,
  };
}

function parseCliArgs(argv) {
  let json = false;
  let strictM4 = false;
  let rootDir = process.cwd();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      json = true;
    } else if (arg === '--strict-m4') {
      strictM4 = true;
    } else if (arg === '--root' && i + 1 < argv.length) {
      rootDir = argv[i + 1];
      i += 1;
    }
  }
  return { json, strictM4, rootDir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { json, strictM4, rootDir } = parseCliArgs(process.argv.slice(2));
  const report = runV2ImportGuard({ rootDir, strictM4 });
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const status = report.ok ? 'PASS' : 'FAIL';
    const m4Suffix = strictM4
      ? ` | ledger=${report.ledgerLineCount}/${report.ledgerLineBudget}L | python=${report.pythonLineCount}/${report.pythonLineBudget}L`
      : '';
    process.stdout.write(
      `[v2:guard] ${status} | core=${report.coreLineCount}/${report.coreLineBudget}L (${report.coreFilesChecked} files)${m4Suffix} | packages=[${report.packagesChecked.join(', ')}] | dag=[${report.dagEdges.join(', ')}] | violations=${report.violations.length}\n`,
    );
    for (const v of report.violations) {
      process.stderr.write(`  - [${v.rule}] ${v.file}:${v.line} ${v.message}\n`);
    }
  }
  process.exit(report.ok ? 0 : 1);
}
