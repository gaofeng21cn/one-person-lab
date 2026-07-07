#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOplWhitepaper } from './opl-whitepaper-builder.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

buildOplWhitepaper({
  repoRoot,
  sourceMarkdown: 'docs/whitepapers/opl-whitepaper.md',
  outputName: 'opl-whitepaper',
  status: 'opl_whitepaper_ready',
  owner: 'One Person Lab',
  coverLine: 'OPL Framework / One Person Lab App / OPL Cloud / Foundry Agents',
  headerTitle: 'OPL Whitepaper',
  minSections: 6,
  minPdfPages: 8,
  requiredSections: [
    '## 定位摘要',
    '## 为什么用户可以相信 OPL 专业',
    '## 结语',
  ],
  requiredTerms: [
    'One Person Lab 白皮书',
    'OPL Framework',
    'OPL Cloud',
    'OPL Charter',
    'OPL Pack',
    'OPL Stagecraft',
    'AI-first',
    '交付即推进',
    '目标先于路径',
    '真相归主',
    '抓大放小',
    'Med Auto Science',
    'Med Auto Grant',
    'Foundry Agents',
    '为什么用户可以相信 OPL 专业',
    '结语',
  ],
});
