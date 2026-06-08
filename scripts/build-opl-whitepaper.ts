#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type WhitepaperCard = {
  title: string;
  kicker?: string;
  body: string;
  bullets?: string[];
};

type WhitepaperSection = {
  id: string;
  title: string;
  lead?: string;
  paragraphs?: string[];
  bullets?: string[];
  cards?: WhitepaperCard[];
  diagram?: {
    title: string;
    lines: string[];
  };
};

type WhitepaperReference = {
  label: string;
  url: string;
  note: string;
};

type WhitepaperSource = {
  schema: string;
  id: string;
  title: string;
  short_title: string;
  subtitle: string;
  publication_date: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  audience: string;
  thesis: string;
  positioning: string[];
  sections: WhitepaperSection[];
  references: WhitepaperReference[];
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const whitepaperDir = path.join(repoRoot, 'docs', 'public', 'whitepaper');
const sourcePath = path.join(whitepaperDir, 'opl-whitepaper.source.json');
const markdownPath = path.join(whitepaperDir, 'opl-whitepaper.md');
const pdfPath = path.join(whitepaperDir, 'opl-whitepaper.pdf');
const verificationPath = path.join(whitepaperDir, 'opl-whitepaper-verification.json');
const tempDir = path.join(repoRoot, 'tmp', 'pdfs', 'opl-whitepaper');
const tempMarkdownPath = path.join(tempDir, 'opl-whitepaper.pandoc.md');
const tempHeaderPath = path.join(tempDir, 'opl-whitepaper-header.tex');

const forbiddenPatterns = [
  /sk-[A-Za-z0-9_-]+/,
  /OPENAI_API_KEY/,
  /CODEX_API_KEY/,
];

function run(command: string, args: string[], options: { cwd?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed: ${command} ${args.join(' ')}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function commandPath(command: string) {
  const result = spawnSync('which', [command], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function loadSource() {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as WhitepaperSource;
  assertSourceShape(source);
  return source;
}

function assertSourceShape(source: WhitepaperSource) {
  if (source.schema !== 'opl_whitepaper.v1') {
    throw new Error(`Unsupported whitepaper schema: ${source.schema}`);
  }
  if (!source.title || !source.subtitle || !source.thesis) {
    throw new Error('Whitepaper source must include title, subtitle, and thesis.');
  }
  if (!Array.isArray(source.positioning) || source.positioning.length < 3) {
    throw new Error('Whitepaper source must include at least three positioning bullets.');
  }
  if (!Array.isArray(source.sections) || source.sections.length < 6) {
    throw new Error('Whitepaper source must include at least six sections.');
  }
  const ids = new Set<string>();
  for (const section of source.sections) {
    if (!section.id || !section.title) {
      throw new Error(`Whitepaper section is missing id or title: ${JSON.stringify(section)}`);
    }
    if (ids.has(section.id)) throw new Error(`Duplicate whitepaper section id: ${section.id}`);
    ids.add(section.id);
  }
}

function scanTextForSecrets(text: string) {
  const hits = forbiddenPatterns.filter((pattern) => pattern.test(text)).map(String);
  if (hits.length > 0) {
    throw new Error(`Whitepaper text contains forbidden sensitive marker(s): ${hits.join(', ')}`);
  }
}

function mdEscape(value: string) {
  return value.replace(/\n{3,}/g, '\n\n');
}

function buildSection(section: WhitepaperSection) {
  const lines: string[] = [
    `## ${section.title}`,
    '',
  ];
  if (section.lead) lines.push(mdEscape(section.lead), '');
  for (const paragraph of section.paragraphs ?? []) {
    lines.push(mdEscape(paragraph), '');
  }
  if (section.diagram) {
    lines.push(`**${section.diagram.title}**`, '', '```text', ...section.diagram.lines, '```', '');
  }
  if (section.cards?.length) {
    for (const card of section.cards) {
      lines.push(`### ${card.title}`, '');
      if (card.kicker) lines.push(`**${card.kicker}**`, '');
      lines.push(mdEscape(card.body), '');
      for (const bullet of card.bullets ?? []) lines.push(`- ${bullet}`);
      lines.push('');
    }
  }
  if (section.bullets?.length) {
    for (const bullet of section.bullets) lines.push(`- ${bullet}`);
    lines.push('');
  }
  return lines.join('\n');
}

function buildMarkdown(source: WhitepaperSource) {
  const lines: string[] = [
    `# ${source.title}`,
    '',
    `> ${source.subtitle}`,
    '',
    `Owner: \`${source.owner}\``,
    `Purpose: \`${source.purpose}\``,
    `State: \`${source.state}\``,
    `Machine boundary: ${source.machine_boundary}`,
    `Publication date: \`${source.publication_date}\``,
    '',
    `适用对象：${source.audience}`,
    '',
    `核心判断：${source.thesis}`,
    '',
    '## 定位摘要',
    '',
  ];
  for (const item of source.positioning) lines.push(`- ${item}`);
  lines.push('');
  for (const section of source.sections) lines.push(buildSection(section));
  lines.push('## 参考与编制来源', '');
  for (const ref of source.references) {
    lines.push(`- [${ref.label}](${ref.url})：${ref.note}`);
  }
  lines.push('');
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

function stripRepositoryMetadata(markdown: string) {
  const metadataKeys = new Set(['Owner', 'Purpose', 'State', 'Machine boundary', 'Publication date']);
  return markdown
    .split(/\r?\n/)
    .filter((line) => {
      const match = /^([^:]+):\s+/.exec(line);
      return !match || !metadataKeys.has(match[1]);
    })
    .join('\n');
}

function buildPdfMarkdown(source: WhitepaperSource, markdown: string) {
  const cover = [
    '\\begin{titlepage}',
    '\\thispagestyle{empty}',
    '\\vspace*{26mm}',
    '{\\color{OPLTeal}\\Large One Person Lab\\par}',
    '\\vspace{18mm}',
    `{\\Huge\\bfseries ${source.title}\\par}`,
    '\\vspace{8mm}',
    `{\\LARGE ${source.subtitle}\\par}`,
    '\\vspace{18mm}',
    `{\\large ${source.thesis}\\par}`,
    '\\vspace{10mm}',
    '{\\large OPL Framework / One Person Lab App / Foundry Agents\\par}',
    '\\vfill',
    `{\\large ${source.publication_date}\\par}`,
    '\\vspace{4mm}',
    '{\\small Public whitepaper\\par}',
    '\\end{titlepage}',
    '\\newpage',
    '\\tableofcontents',
    '\\newpage',
    '',
  ].join('\n');
  const body = stripRepositoryMetadata(markdown)
    .replace(/^# .+\n\n> .+\n\n/, '')
    .replace(/^## /gm, '# ')
    .replace(/^### /gm, '## ');
  return `${cover}${body}`;
}

function buildHeader() {
  return String.raw`
\usepackage{xcolor}
\usepackage{fancyhdr}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{booktabs}
\usepackage{longtable}
\usepackage{array}
\definecolor{OPLTeal}{HTML}{0F766E}
\definecolor{OPLInk}{HTML}{101828}
\definecolor{OPLMuted}{HTML}{667085}
\definecolor{OPLLine}{HTML}{D0D5DD}
\setlength{\parindent}{0pt}
\setlength{\parskip}{6pt}
\setlist[itemize]{topsep=2pt,itemsep=2pt,leftmargin=18pt}
\titleformat{\section}{\Large\bfseries\color{OPLTeal}}{\thesection}{0.7em}{}
\titleformat{\subsection}{\large\bfseries\color{OPLInk}}{\thesubsection}{0.7em}{}
\titleformat{\subsubsection}{\normalsize\bfseries\color{OPLInk}}{\thesubsubsection}{0.7em}{}
\pagestyle{fancy}
\fancyhf{}
\lhead{\small\color{OPLMuted}One Person Lab}
\rhead{\small\color{OPLMuted}OPL Whitepaper}
\cfoot{\small\thepage}
\renewcommand{\headrulewidth}{0.3pt}
\renewcommand{\headrule}{\hbox to\headwidth{\color{OPLLine}\leaders\hrule height \headrulewidth\hfill}}
`;
}

function buildPdf(source: WhitepaperSource, markdown: string) {
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(tempHeaderPath, buildHeader(), 'utf8');
  fs.writeFileSync(tempMarkdownPath, buildPdfMarkdown(source, markdown), 'utf8');

  const font = process.env.OPL_WHITEPAPER_PDF_FONT || 'Noto Sans CJK SC';
  run('pandoc', [
    tempMarkdownPath,
    '--standalone',
    '--pdf-engine=xelatex',
    '--number-sections',
    '--metadata', `title-meta=${source.title}`,
    '--metadata', `author-meta=${source.owner}`,
    '--metadata', 'lang=zh-CN',
    '--include-in-header', tempHeaderPath,
    '-V', `mainfont=${font}`,
    '-V', `CJKmainfont=${font}`,
    '-V', 'geometry:margin=18mm',
    '-V', 'colorlinks=true',
    '-V', 'linkcolor=OPLTeal',
    '-V', 'urlcolor=OPLTeal',
    '-o', pdfPath,
  ]);
}

function renderPdf() {
  const renderDir = path.join(tempDir, 'rendered');
  fs.rmSync(renderDir, { recursive: true, force: true });
  fs.mkdirSync(renderDir, { recursive: true });
  run('pdftoppm', ['-png', '-r', '120', pdfPath, path.join(renderDir, 'page')]);
  const pages = fs.readdirSync(renderDir).filter((name) => name.endsWith('.png')).sort();
  return { renderDir, pages };
}

function parsePdfInfo() {
  const result = run('pdfinfo', [pdfPath]);
  const pages = Number(result.stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
  const size = result.stdout.match(/^Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/m);
  return {
    raw: result.stdout,
    pages,
    page_size_pts: {
      width: Number(size?.[1] ?? 0),
      height: Number(size?.[2] ?? 0),
    },
  };
}

function extractPdfText() {
  const result = run('pdftotext', [pdfPath, '-']);
  return result.stdout;
}

function relativeToRepo(filePath: string) {
  return path.relative(repoRoot, filePath);
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main() {
  fs.mkdirSync(whitepaperDir, { recursive: true });
  const source = loadSource();
  const markdown = buildMarkdown(source);
  scanTextForSecrets(JSON.stringify(source));
  scanTextForSecrets(markdown);
  fs.writeFileSync(markdownPath, markdown, 'utf8');
  buildPdf(source, markdown);

  const render = renderPdf();
  const info = parsePdfInfo();
  if (info.pages < 8) {
    throw new Error(`Expected whitepaper PDF to have at least 8 pages, got ${info.pages}.`);
  }
  if (info.page_size_pts.height <= info.page_size_pts.width) {
    throw new Error(`Expected portrait PDF, got ${info.page_size_pts.width}x${info.page_size_pts.height} pts.`);
  }
  const text = extractPdfText();
  const requiredTerms = [
    'One Person Lab 白皮书',
    'OPL Framework',
    'OPL Charter',
    'OPL Stagecraft',
    'MedAutoScience',
    'Foundry Agents',
    'npm run docs:whitepaper',
  ];
  const missingTerms = requiredTerms.filter((term) => !text.includes(term));
  if (missingTerms.length > 0) {
    throw new Error(`Generated PDF text is missing required terms: ${missingTerms.join(', ')}`);
  }

  const verification = {
    status: 'opl_whitepaper_ready',
    generated_at: new Date().toISOString(),
    source: relativeToRepo(sourcePath),
    generated_markdown: relativeToRepo(markdownPath),
    generated_pdf: relativeToRepo(pdfPath),
    temp_markdown: relativeToRepo(tempMarkdownPath),
    rendered_dir: relativeToRepo(render.renderDir),
    rendered_pages: render.pages.length,
    pdf_pages: info.pages,
    pdf_page_size_pts: info.page_size_pts,
    required_terms: requiredTerms,
    required_terms_status: 'present',
    tools: {
      pandoc: commandPath('pandoc'),
      xelatex: commandPath('xelatex'),
      pdftoppm: commandPath('pdftoppm'),
      pdfinfo: commandPath('pdfinfo'),
      pdftotext: commandPath('pdftotext'),
    },
    references: source.references,
  };
  writeJson(verificationPath, verification);
  console.log(JSON.stringify(verification, null, 2));
}

main();
