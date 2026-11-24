import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

export type ManagedMcpToolCallResult = {
  called: boolean;
  isError: boolean;
  content: unknown[] | null;
  structuredContent: Record<string, unknown> | null;
};

export type ManagedMcpProbeResult = {
  initialize_ok: boolean;
  protocol_version: string | null;
  server_name: string | null;
  server_version: string | null;
  observed_tools: string[];
  tool_call: ManagedMcpToolCallResult | null;
  error: string | null;
};

function stringEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

export async function probeStdioMcpServer(input: {
  command: string;
  args: readonly string[];
  protocolVersion: string;
  timeoutMs: number;
  callTool?: {
    name: string;
    arguments: Record<string, unknown>;
  };
}): Promise<ManagedMcpProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`MCP probe timed out after ${input.timeoutMs}ms.`));
  }, input.timeoutMs);
  timer.unref?.();

  const stderrChunks: string[] = [];
  let stderrLength = 0;
  const maxStderrChars = 8192;

  const transport = new StdioClientTransport({
    command: input.command,
    args: [...input.args],
    env: stringEnv(process.env),
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk: Buffer | string) => {
    if (stderrLength >= maxStderrChars) return;
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    stderrChunks.push(text.slice(0, maxStderrChars - stderrLength));
    stderrLength += text.length;
  });

  const client = new Client(
    { name: 'opl-framework', version: '0.3.5' },
    { supportedProtocolVersions: [input.protocolVersion] },
  );

  let initializeOk = false;
  let protocolVersion: string | null = null;
  let serverName: string | null = null;
  let serverVersion: string | null = null;
  let observedTools: string[] = [];
  let toolCall: ManagedMcpToolCallResult | null = null;
  let errorMessage: string | null = null;

  try {
    const requestOptions = {
      timeout: input.timeoutMs,
      signal: controller.signal,
    };
    await client.connect(transport, requestOptions);
    initializeOk = true;
    protocolVersion = client.getNegotiatedProtocolVersion() ?? null;
    const serverInfo = client.getServerVersion();
    serverName = typeof serverInfo?.name === 'string' ? serverInfo.name : null;
    serverVersion = typeof serverInfo?.version === 'string' ? serverInfo.version : null;

    const listResult = await client.listTools(undefined, requestOptions);
    observedTools = [
      ...new Set(
        (listResult.tools ?? [])
          .map((tool) => tool?.name)
          .filter((name): name is string => typeof name === 'string' && name.length > 0),
      ),
    ];

    if (input.callTool) {
      try {
        const result = await client.callTool(
          {
            name: input.callTool.name,
            arguments: input.callTool.arguments,
          },
          requestOptions,
        );
        const record = result as Record<string, unknown>;
        const content = Array.isArray(record.content) ? record.content : null;
        const structuredContent = record.structuredContent && typeof record.structuredContent === 'object'
          && !Array.isArray(record.structuredContent)
          ? record.structuredContent as Record<string, unknown>
          : null;
        toolCall = {
          called: true,
          isError: record.isError === true,
          content,
          structuredContent,
        };
      } catch (callError) {
        toolCall = {
          called: false,
          isError: true,
          content: null,
          structuredContent: null,
        };
        errorMessage = callError instanceof Error ? callError.message : String(callError);
      }
    }
  } catch (error) {
    const stderrText = stderrChunks.join('').trim();
    const primary = error instanceof Error ? error.message : String(error);
    errorMessage = stderrText ? `${primary}\n${stderrText}` : primary;
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }

  return {
    initialize_ok: initializeOk,
    protocol_version: protocolVersion,
    server_name: serverName,
    server_version: serverVersion,
    observed_tools: observedTools,
    tool_call: toolCall,
    error: initializeOk && observedTools.length > 0 && !errorMessage
      ? null
      : errorMessage,
  };
}
