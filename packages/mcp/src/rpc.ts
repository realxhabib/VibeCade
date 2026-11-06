/**
 * A small Model Context Protocol server: JSON-RPC 2.0 over newline-delimited
 * stdio, with tools, resources and prompts. Zero dependencies; the transport
 * is a pair of streams so tests can drive it in memory.
 */

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL_VERSION = PROTOCOL_VERSIONS[0];

export type JsonSchema = Record<string, unknown>;

export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run(args: Record<string, unknown>): Promise<ToolResult> | ToolResult;
}

export interface Resource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType: string;
  read(): string;
}

export interface Prompt {
  name: string;
  title: string;
  description: string;
  arguments?: { name: string; description: string; required?: boolean }[];
  get(args: Record<string, string>): string;
}

export interface ServerDefinition {
  name: string;
  version: string;
  title?: string;
  instructions?: string;
  tools: Tool[];
  resources?: Resource[];
  prompts?: Prompt[];
}

type Id = string | number;
interface Request {
  jsonrpc: "2.0";
  id?: Id | null;
  method: string;
  params?: Record<string, unknown>;
}
interface Response {
  jsonrpc: "2.0";
  id: Id | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const ERRORS = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

/** Tool output as text (for every client) plus structured content (for clients that read it). */
export function textResult(text: string, structured?: Record<string, unknown>, isError = false): ToolResult {
  const result: ToolResult = { content: [{ type: "text", text }] };
  if (structured) result.structuredContent = structured;
  if (isError) result.isError = true;
  return result;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Answers one decoded JSON-RPC message; `null` for notifications. */
export function createHandler(server: ServerDefinition): (message: unknown) => Promise<Response | null> {
  const tools = new Map(server.tools.map((t) => [t.name, t]));
  const resources = new Map((server.resources ?? []).map((r) => [r.uri, r]));
  const prompts = new Map((server.prompts ?? []).map((p) => [p.name, p]));

  const methods: Record<string, (params: Record<string, unknown>) => unknown> = {
    initialize(params) {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : LATEST_PROTOCOL_VERSION;
      const capabilities: Record<string, unknown> = { tools: { listChanged: false } };
      if (resources.size) capabilities.resources = { listChanged: false, subscribe: false };
      if (prompts.size) capabilities.prompts = { listChanged: false };
      return {
        protocolVersion,
        capabilities,
        serverInfo: { name: server.name, version: server.version, ...(server.title ? { title: server.title } : {}) },
        ...(server.instructions ? { instructions: server.instructions } : {}),
      };
    },
    ping: () => ({}),
    "tools/list": () => ({
      tools: server.tools.map(({ name, title, description, inputSchema, annotations }) => ({
        name,
        title,
        description,
        inputSchema,
        ...(annotations ? { annotations } : {}),
      })),
    }),
    async "tools/call"(params) {
      const tool = typeof params.name === "string" ? tools.get(params.name) : undefined;
      if (!tool) throw new RpcError(ERRORS.invalidParams, `Unknown tool: ${String(params.name)}`);
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!isObject(args)) throw new RpcError(ERRORS.invalidParams, "arguments must be an object");
      try {
        return await tool.run(args);
      } catch (error) {
        // Tool failures are results the model can read and react to, not protocol errors.
        return textResult(error instanceof Error ? error.message : String(error), undefined, true);
      }
    },
    "resources/list": () => ({
      resources: [...resources.values()].map(({ uri, name, title, description, mimeType }) => ({ uri, name, title, description, mimeType })),
    }),
    "resources/templates/list": () => ({ resourceTemplates: [] }),
    "resources/read"(params) {
      const resource = typeof params.uri === "string" ? resources.get(params.uri) : undefined;
      if (!resource) throw new RpcError(-32002, `Resource not found: ${String(params.uri)}`);
      return { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: resource.read() }] };
    },
    "prompts/list": () => ({
      prompts: [...prompts.values()].map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args ?? [] })),
    }),
    "prompts/get"(params) {
      const prompt = typeof params.name === "string" ? prompts.get(params.name) : undefined;
      if (!prompt) throw new RpcError(ERRORS.invalidParams, `Unknown prompt: ${String(params.name)}`);
      const raw = isObject(params.arguments) ? params.arguments : {};
      const args = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
      return { description: prompt.description, messages: [{ role: "user", content: { type: "text", text: prompt.get(args) } }] };
    },
  };

  return async (message) => {
    if (!isObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      const id = isObject(message) && (typeof message.id === "string" || typeof message.id === "number") ? message.id : null;
      // A response from the client (we never send requests) is ignored.
      if (isObject(message) && message.method === undefined && ("result" in message || "error" in message)) return null;
      return { jsonrpc: "2.0", id, error: { code: ERRORS.invalidRequest, message: "Invalid request" } };
    }
    const request = message as unknown as Request;
    const isNotification = request.id === undefined;
    if (isNotification) return null; // notifications/initialized, notifications/cancelled…
    const id = request.id ?? null;
    const method = Object.prototype.hasOwnProperty.call(methods, request.method) ? methods[request.method] : undefined;
    if (!method) return { jsonrpc: "2.0", id, error: { code: ERRORS.methodNotFound, message: `Method not found: ${request.method}` } };
    try {
      const result = await method(isObject(request.params) ? request.params : {});
      return { jsonrpc: "2.0", id, result };
    } catch (error) {
      const code = error instanceof RpcError ? error.code : ERRORS.internal;
      return { jsonrpc: "2.0", id, error: { code, message: error instanceof Error ? error.message : String(error) } };
    }
  };
}

/** Serves `server` over newline-delimited JSON: one message per line in, one per line out. */
export function serveStdio(
  server: ServerDefinition,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const handle = createHandler(server);
  const send = (response: Response | null) => {
    if (response) output.write(`${JSON.stringify(response)}\n`);
  };
  const dispatch = async (line: string) => {
    if (!line.trim()) return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: ERRORS.parse, message: "Parse error" } });
      return;
    }
    if (Array.isArray(message)) {
      const answers = (await Promise.all(message.map(handle))).filter((r): r is Response => r !== null);
      if (answers.length) output.write(`${JSON.stringify(answers)}\n`);
      return;
    }
    send(await handle(message));
  };

  return new Promise((resolve) => {
    let buffer = "";
    // One message at a time, so responses come back in request order (the tools are quick).
    let queue = Promise.resolve();
    const enqueue = (line: string) => {
      queue = queue.then(() => dispatch(line)).catch(() => {});
    };
    input.setEncoding?.("utf8");
    input.on("data", (chunk: string | Buffer) => {
      buffer += chunk.toString();
      let at: number;
      while ((at = buffer.indexOf("\n")) >= 0) {
        enqueue(buffer.slice(0, at).replace(/\r$/, ""));
        buffer = buffer.slice(at + 1);
      }
    });
    input.on("end", () => {
      if (buffer.trim()) enqueue(buffer);
      void queue.then(() => resolve());
    });
  });
}
