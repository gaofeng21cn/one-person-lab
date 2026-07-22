import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  captureWorkItemRootIdentity,
  readStableWorkItemFile,
  WorkItemFileBoundaryError,
} from '../../src/modules/workspace/work-item-file-boundary.ts';
import { runWithWorkItemFileBoundaryInterlock } from './work-item-file-boundary-test-support.ts';

function fixture() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-item-file-boundary-'));
  const studyOneRoot = path.join(workspaceRoot, 'studies', 'study-001');
  const studyTwoRoot = path.join(workspaceRoot, 'studies', 'study-002');
  fs.mkdirSync(studyOneRoot, { recursive: true });
  fs.mkdirSync(studyTwoRoot, { recursive: true });
  const studyOneFile = path.join(studyOneRoot, 'artifact.txt');
  const studyTwoFile = path.join(studyTwoRoot, 'artifact.txt');
  fs.writeFileSync(studyOneFile, 'study one bytes\n');
  fs.writeFileSync(studyTwoFile, 'study two bytes\n');
  const rootIdentity = captureWorkItemRootIdentity({
    workspaceRoot,
    canonicalWorkItemRoot: studyOneRoot,
  });
  return { workspaceRoot, studyOneRoot, studyTwoRoot, studyOneFile, studyTwoFile, rootIdentity };
}

test('descriptor boundary rejects an interleaved cross-Study root swap', async () => {
  const value = fixture();
  try {
    await assert.rejects(() => runWithWorkItemFileBoundaryInterlock({
      temporaryRoot: value.workspaceRoot,
      point: 'after_root_open',
      mutation: {
        kind: 'swap_directories',
        first_path: value.studyOneRoot,
        second_path: value.studyTwoRoot,
        temporary_path: path.join(value.workspaceRoot, 'studies', '.swap'),
      },
      invoke: () => readStableWorkItemFile({
        workspaceRoot: value.workspaceRoot,
        canonicalWorkItemRoot: value.studyOneRoot,
        expectedRootIdentity: value.rootIdentity,
        filePath: value.studyOneFile,
        ref: value.studyOneFile,
      }),
    }), (error: unknown) => error instanceof WorkItemFileBoundaryError
      && error.failureCode === 'work_item_file_boundary_root_drift');
  } finally {
    fs.rmSync(value.workspaceRoot, { recursive: true, force: true });
  }
});

test('descriptor boundary rejects static and read-time hard links', async () => {
  const staticValue = fixture();
  try {
    fs.rmSync(staticValue.studyOneFile);
    fs.linkSync(staticValue.studyTwoFile, staticValue.studyOneFile);
    assert.throws(() => readStableWorkItemFile({
      workspaceRoot: staticValue.workspaceRoot,
      canonicalWorkItemRoot: staticValue.studyOneRoot,
      expectedRootIdentity: staticValue.rootIdentity,
      filePath: staticValue.studyOneFile,
      ref: staticValue.studyOneFile,
    }), (error: unknown) => error instanceof WorkItemFileBoundaryError
      && error.failureCode === 'work_item_file_boundary_ref_hard_link');
  } finally {
    fs.rmSync(staticValue.workspaceRoot, { recursive: true, force: true });
  }

  const dynamicValue = fixture();
  try {
    await assert.rejects(() => runWithWorkItemFileBoundaryInterlock({
      temporaryRoot: dynamicValue.workspaceRoot,
      point: 'after_file_open',
      mutation: {
        kind: 'add_hard_link',
        source_path: dynamicValue.studyOneFile,
        link_path: path.join(dynamicValue.studyTwoRoot, 'linked-study-one.txt'),
      },
      invoke: () => readStableWorkItemFile({
        workspaceRoot: dynamicValue.workspaceRoot,
        canonicalWorkItemRoot: dynamicValue.studyOneRoot,
        expectedRootIdentity: dynamicValue.rootIdentity,
        filePath: dynamicValue.studyOneFile,
        ref: dynamicValue.studyOneFile,
      }),
    }), (error: unknown) => error instanceof WorkItemFileBoundaryError
      && error.failureCode === 'work_item_file_boundary_ref_hard_link');
  } finally {
    fs.rmSync(dynamicValue.workspaceRoot, { recursive: true, force: true });
  }
});

test('descriptor boundary rejects in-place growth and pathname replacement', async () => {
  const growthValue = fixture();
  try {
    await assert.rejects(() => runWithWorkItemFileBoundaryInterlock({
      temporaryRoot: growthValue.workspaceRoot,
      point: 'after_file_open',
      mutation: { kind: 'append_file', file_path: growthValue.studyOneFile, bytes: 'changed\n' },
      invoke: () => readStableWorkItemFile({
        workspaceRoot: growthValue.workspaceRoot,
        canonicalWorkItemRoot: growthValue.studyOneRoot,
        expectedRootIdentity: growthValue.rootIdentity,
        filePath: growthValue.studyOneFile,
        ref: growthValue.studyOneFile,
      }),
    }), (error: unknown) => error instanceof WorkItemFileBoundaryError
      && error.failureCode === 'work_item_file_boundary_ref_drift');
  } finally {
    fs.rmSync(growthValue.workspaceRoot, { recursive: true, force: true });
  }

  const replacementValue = fixture();
  const replacementPath = path.join(replacementValue.studyOneRoot, 'replacement.txt');
  const displacedPath = path.join(replacementValue.studyOneRoot, 'displaced.txt');
  fs.writeFileSync(replacementPath, 'replacement bytes\n');
  try {
    await assert.rejects(() => runWithWorkItemFileBoundaryInterlock({
      temporaryRoot: replacementValue.workspaceRoot,
      point: 'after_file_open',
      mutation: {
        kind: 'replace_file',
        file_path: replacementValue.studyOneFile,
        displaced_path: displacedPath,
        replacement_path: replacementPath,
      },
      invoke: () => readStableWorkItemFile({
        workspaceRoot: replacementValue.workspaceRoot,
        canonicalWorkItemRoot: replacementValue.studyOneRoot,
        expectedRootIdentity: replacementValue.rootIdentity,
        filePath: replacementValue.studyOneFile,
        ref: replacementValue.studyOneFile,
      }),
    }), (error: unknown) => error instanceof WorkItemFileBoundaryError
      && error.failureCode === 'work_item_file_boundary_ref_drift');
  } finally {
    fs.rmSync(replacementValue.workspaceRoot, { recursive: true, force: true });
  }
});
