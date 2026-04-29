import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { repoRoot } from './constants.ts';

async function readServerJsonBody(request: IncomingMessage) {
  return await new Promise<Record<string, unknown> | null>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      if (!body.trim()) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

export async function startFakeOplApiServer() {
  let activeWorkspacePath = repoRoot;
  const requests: Array<{
    method: string;
    path: string;
    query: Record<string, string>;
    body: Record<string, unknown> | null;
  }> = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse<IncomingMessage>) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const body = await readServerJsonBody(request);
    requests.push({
      method: request.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body,
    });

    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('connection', 'close');

    if (request.method === 'GET' && url.pathname === '/api/status/dashboard') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        dashboard: {
          workspace_path: url.searchParams.get('path'),
          sessions_limit: Number(url.searchParams.get('sessions_limit') ?? '0'),
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/projects') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        projects: [
          {
            project_id: 'medautoscience',
            label: 'Med Auto Science',
          },
        ],
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/status/runtime') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        runtime_status: {
          limit: Number(url.searchParams.get('limit') ?? '0'),
          runs: [],
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/opl/progress') {
      const taskId = url.searchParams.get('task_id');
      response.statusCode = 200;
      response.end(JSON.stringify({
        progress: {
          surface_id: 'opl_progress',
          session_id: taskId ? 'sess-frontdoor-001' : 'sess-progress',
          workspace_path: url.searchParams.get('workspace_path'),
          project_state: 'active_study',
          current_project: {
            project_id: 'medautoscience',
            label: 'med-autoscience',
            workspace_path: url.searchParams.get('workspace_path'),
          },
          headline: '004 论文当前仍在推进证据补强，需要继续补主图和投稿包可审计物。',
          latest_update: '论文主体内容已经完成，当前进入投稿打包收口。',
          next_step: '优先核对 submission package 与 studies 目录中的交付面是否一致。',
          status_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
          study: {
            study_id: '004-invasive-architecture',
            title: 'NF-PitNET invasive phenotype architecture with public-data anatomy and biology anchors',
            story_summary: '当前主线是首术 NF-PitNET 的侵袭表型 architecture：用本地队列重构侵袭、Knosp、视觉压迫与切除负担，并把公开 MRI / omics 作为 anatomy / biology anchors。',
            clinical_question: '首术 NF-PitNET 的侵袭表型如何同时连接影像、临床负担与分子层面的 anatomy / biology anchors。',
            current_stage: 'publication_supervision',
            current_stage_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
            paper_snapshot: {
              main_figure_count: 4,
              supplementary_figure_count: 2,
              main_table_count: 3,
              supplementary_table_count: 1,
              reference_count: 52,
              page_count: 28,
            },
            status_narration_contract: {
              schema_version: 1,
              contract_kind: 'ai_status_narration',
              contract_id: 'study-progress::004-invasive-architecture',
              surface_kind: 'study_progress',
              audience: 'human_user',
              milestone: {},
              stage: {
                current_stage: 'publication_supervision',
                recommended_next_stage: 'bundle_stage_ready',
                checkpoint_status: 'forward_progress',
              },
              readiness: {
                needs_physician_decision: false,
              },
              remaining_scope: {},
              current_blockers: [
                'submission package 仍需补更多主图后再建议用户审阅。',
              ],
              latest_update: '论文主体内容已经完成，当前进入投稿打包收口。',
              next_step: '优先核对 submission package 与 studies 目录中的交付面是否一致。',
              human_gate: {},
              facts: {
                study_id: '004-invasive-architecture',
              },
              narration_policy: {
                mode: 'ai_first',
                legacy_summary_role: 'fallback_only',
                style: 'plain_language',
                answer_checklist: ['current_stage', 'current_blockers', 'next_step'],
              },
            },
          },
          task_cards: {
            running: [
              {
                task_id: 'task-frontdoor-001',
                title: '刷新投稿包',
                status: 'running',
              },
            ],
            waiting: [],
            ready: [],
            delivered: [],
          },
          recent_activity: {
            session_id: 'sess-progress',
            last_active: '2m ago',
            source: 'cli',
            preview: 'study 004 progress refresh',
          },
          inspect_paths: [
            url.searchParams.get('workspace_path'),
            '/tmp/opl-activated-workspace/studies/004-invasive-architecture',
          ],
          attention_items: [
            'submission package 仍需补更多主图后再建议用户审阅。',
          ],
          configured_human_gates: [],
          recommended_commands: {
            progress: 'medautosci study-progress --study 004',
            resume: 'medautosci launch-study --study 004',
            start: null,
          },
          ...(taskId
            ? {
                task: {
                  task_id: taskId,
                  status: 'running',
                  stage: 'writing',
                  summary: '正在补图和整理投稿包',
                  recent_output: '主图更新完成，正在刷新审计目录',
                  session_id: 'sess-frontdoor-001',
                },
              }
            : {}),
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/opl/sessions') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        sessions: {
          surface_id: 'opl_sessions',
          summary: {
            requested_limit: Number(url.searchParams.get('limit') ?? '0'),
            source_filter: url.searchParams.get('source'),
            listed_sessions_count: 1,
            ledger_sessions_count: 1,
            ledger_entry_count: 1,
          },
          items: [
            {
              session_id: 'sess-frontdoor-001',
              source: 'opl-product-entry',
              preview: 'Resume 004 paper progression',
              last_active: '1m ago',
            },
          ],
          raw_output: 'sess-frontdoor-001 opl-product-entry Resume 004 paper progression',
          ledger: {
            surface_id: 'opl_managed_session_ledger',
            sessions: [
              {
                session_id: 'sess-frontdoor-001',
                resource_totals: {
                  latest_sample_status: 'captured',
                },
              },
            ],
            summary: {
              entry_count: 1,
            },
          },
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/opl/sessions/logs') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        session_logs: {
          surface_id: 'opl_session_logs',
          mode: 'logs',
          log_name: url.searchParams.get('log_name'),
          lines: Number(url.searchParams.get('lines') ?? '0'),
          session_id: url.searchParams.get('session_id'),
          raw_output: 'runtime heartbeat ok\npaper worker still running',
        },
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/opl/sessions/resume') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        session_resume: {
          surface_id: 'opl_session_resume',
          mode: 'resume',
          resume: {
            session_id: String(body?.session_id ?? 'sess-frontdoor-001'),
            output: 'RUNTIME RESUME OUTPUT',
          },
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/status/workspace') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        workspace_status: {
          workspace_path: url.searchParams.get('path'),
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/domain/manifests') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        domain_manifests: {
          projects: [],
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/opl/workspaces') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        workspaces: {
          surface_id: 'opl_workspaces',
          action: 'list',
          summary: {
            active_projects_count: 1,
            total_projects_count: 1,
          },
          projects: [
            {
              project_id: 'medautoscience',
              project: 'med-autoscience',
              active_binding: {
                project_id: 'medautoscience',
                project: 'med-autoscience',
                workspace_path: activeWorkspacePath,
                status: 'active',
                direct_entry: {
                  command: null,
                  manifest_command: null,
                  url: 'http://127.0.0.1:8080',
                },
              },
            },
          ],
          bindings: [],
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/session/ledger') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        session_ledger: {
          surface_id: 'opl_managed_session_ledger',
          limit: Number(url.searchParams.get('limit') ?? '0'),
          sessions: [
            {
              session_id: 'sess-001',
              resource_totals: {
                latest_sample_status: 'captured',
              },
            },
          ],
        },
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/opl/workspaces/activate') {
      activeWorkspacePath = String(body?.workspace_path ?? activeWorkspacePath);
      response.statusCode = 200;
      response.end(JSON.stringify({
        workspaces: {
          surface_id: 'opl_workspaces',
          action: 'activate',
          binding: {
            project_id: String(body?.project_id ?? 'unknown'),
            workspace_path: activeWorkspacePath,
            status: 'active',
          },
          summary: {
            active_projects_count: 1,
            total_projects_count: 1,
          },
        },
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/opl/sessions') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        session_create: {
          surface_id: 'opl_session_create',
          request_mode: 'submitted',
          payload: {
            product_entry: {
              entry_surface: 'opl_session_api',
              input: {
                goal: String(body?.goal ?? ''),
              },
              task: {
                task_id: 'task-frontdoor-001',
                status: 'accepted',
                summary: '请求已提交到后台执行队列',
                session_id: null,
              },
            },
          },
        },
      }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({
      error: 'not_found',
      path: url.pathname,
    }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind fake OPL API server.');
  }

  return {
    server,
    requests,
    apiBaseUrl: `http://127.0.0.1:${address.port}/api`,
  };
}

