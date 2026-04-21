import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AcpBridgePayloadError,
  translateArtifactsPayload,
  translateProgressPayload,
  translateSessionCreatePayload,
  translateSessionLogsPayload,
  translateSessionResumePayload,
} from '../../src/opl-acp-bridge.ts';

test('translateSessionCreatePayload 提取 session seed 与 task acceptance', () => {
  const view = translateSessionCreatePayload({
    version: 'g2',
    session_create: {
      surface_id: 'opl_session_create',
      request_mode: 'submitted',
      payload: {
        product_entry: {
          entry_surface: 'opl_session_api',
          mode: 'ask',
          routing: {
            status: 'resolved',
          },
          handoff_prompt_preview: 'Focus on runtime bridge foundation.',
          seed: {
            session_id: 'sess-seed-1',
          },
          task: {
            task_id: 'task-001',
            status: 'accepted',
            stage: 'queued',
            summary: '请求已受理，准备提交给 Hermes。',
            executor_backend: 'hermes',
            session_id: null,
          },
        },
      },
    },
  });

  assert.equal(view.surface_id, 'opl_session_create');
  assert.equal(view.request_mode, 'submitted');
  assert.equal(view.session_id, 'sess-seed-1');
  assert.equal(view.task_acceptance?.task_id, 'task-001');
  assert.equal(view.task_acceptance?.status, 'accepted');
});

test('translateSessionResumePayload 提取 resume 视图', () => {
  const view = translateSessionResumePayload({
    version: 'g2',
    session_resume: {
      surface_id: 'opl_session_resume',
      resume: {
        command_preview: ['hermes', '--resume', 'sess-r-1'],
        session_id: 'sess-r-1',
        output: 'resume output',
        exit_code: 0,
      },
    },
  });

  assert.equal(view.surface_id, 'opl_session_resume');
  assert.equal(view.session_id, 'sess-r-1');
  assert.equal(view.output, 'resume output');
  assert.deepEqual(view.command_preview, ['hermes', '--resume', 'sess-r-1']);
});

test('translateSessionLogsPayload 与 translateProgressPayload 提取 update/event 视图', () => {
  const logsView = translateSessionLogsPayload({
    version: 'g2',
    session_logs: {
      surface_id: 'opl_session_logs',
      session_id: 'sess-log-1',
      raw_output: 'latest log line',
    },
  });
  assert.equal(logsView.source, 'session_logs');
  assert.equal(logsView.surface_id, 'opl_session_logs');
  assert.equal(logsView.raw_output, 'latest log line');

  const progressView = translateProgressPayload({
    version: 'g2',
    progress: {
      surface_id: 'opl_progress',
      session_id: 'sess-progress-1',
      headline: '论文主体内容已经完成',
      latest_update: '2026-04-21 10:00 UTC',
      next_step: '核对 submission package',
      status_summary: '进入投稿打包收口',
      task: {
        task_id: 'task-p-1',
        status: 'running',
        stage: 'running',
        summary: '正在运行',
        executor_backend: 'codex',
        session_id: 'sess-progress-1',
      },
    },
  });
  assert.equal(progressView.source, 'progress');
  assert.equal(progressView.headline, '论文主体内容已经完成');
  assert.equal(progressView.summary, '进入投稿打包收口');
  assert.equal(progressView.task_acceptance?.task_id, 'task-p-1');
});

test('translateArtifactsPayload 提取 artifact summary 视图', () => {
  const view = translateArtifactsPayload({
    version: 'g2',
    artifacts: {
      surface_id: 'opl_artifacts',
      session_id: 'sess-artifact-1',
      workspace_path: '/tmp/opl',
      progress_headline: '当前进入投稿打包收口',
      summary: {
        deliverable_files_count: 1,
        supporting_files_count: 1,
        total_files_count: 2,
      },
      deliverable_files: [
        {
          file_id: 'manuscript',
          title: 'Main Manuscript',
          path: '/tmp/opl/manuscript.md',
        },
      ],
      supporting_files: [
        {
          file_id: 'fig1',
          title: 'Figure 1',
          path: '/tmp/opl/fig1.png',
        },
      ],
    },
  });

  assert.equal(view.surface_id, 'opl_artifacts');
  assert.equal(view.summary.total_files_count, 2);
  assert.equal(view.files.length, 2);
  assert.equal(view.files[0]?.role, 'deliverable');
  assert.equal(view.files[1]?.role, 'supporting');
});

test('invalid payload fail-closed: session_create 缺失关键字段时抛错', () => {
  assert.throws(
    () => translateSessionCreatePayload({ version: 'g2', session_create: { surface_id: 'opl_session_create' } }),
    (error: unknown) => {
      assert.ok(error instanceof AcpBridgePayloadError);
      assert.match((error as Error).message, /session_create\.payload/);
      return true;
    },
  );
});
