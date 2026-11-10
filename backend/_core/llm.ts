import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?:
      | "audio/mpeg"
      | "audio/wav"
      | "application/pdf"
      | "audio/mp4"
      | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  maxCompletionTokens?: number;
  max_completion_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  /** Disable helper retries when a caller must make at most one model attempt. */
  retry?: boolean;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const platformApiBase = () => {
  if (!ENV.forgeApiUrl.trim())
    throw new Error("MANUS_API_URL is not configured");
  return ENV.forgeApiUrl.replace(/\/$/, "");
};
const resolveApiUrl = () => `${platformApiBase()}/v1/chat/completions`;

const assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("MANUS_API_KEY is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// Every outbound request is bounded. Each timeout covers connecting, headers and
// reading the whole body. Worst cases: model discovery 4 s + 1 s + 4 s = 9 s;
// the chat call 15 s (it is not retried).
const CHAT_TIMEOUT_MS = 15_000;
const CHAT_MAX_RETRIES = 0;
const DISCOVERY_TIMEOUT_MS = 4_000;
const DISCOVERY_MAX_RETRIES = 1;
const RETRY_MIN_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 500;
// A provider's Retry-After header is honoured only up to this cap.
const RETRY_AFTER_CAP_MS = 1_000;

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

type Attempt<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error; retryable: boolean; retryAfterMs?: number };

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

// One bounded attempt. The timer is cleared only after the body has been read, so a
// provider that stalls mid-response is cut off too. Error messages never include the
// provider's response body, the request, or any credential.
const attemptJson = async <T>(
  url: string,
  init: FetchInit,
  label: string,
  timeoutMs: number
): Promise<Attempt<T>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const timedOut = (): Attempt<T> => ({
    ok: false,
    error: new Error(`${label} timed out after ${timeoutMs} ms`),
    retryable: true,
  });
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      try {
        await response.body?.cancel();
      } catch {
        // Body already settled; nothing to clean up.
      }
      return {
        ok: false,
        error: new Error(`${label} failed: ${response.status}`),
        retryable: isRetryableStatus(response.status),
        retryAfterMs,
      };
    }
    try {
      // Race the body read against the abort so the bound does not depend on the
      // fetch implementation erroring a stalled body stream.
      const aborted = new Promise<never>((_, reject) => {
        if (controller.signal.aborted) reject(new Error("aborted"));
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true }
        );
      });
      return {
        ok: true,
        value: (await Promise.race([response.json(), aborted])) as T,
      };
    } catch {
      return controller.signal.aborted
        ? timedOut()
        : {
            ok: false,
            error: new Error(`${label} returned an unreadable response`),
            retryable: false,
          };
    }
  } catch {
    return controller.signal.aborted
      ? timedOut()
      : {
          ok: false,
          error: new Error(`${label} network error`),
          retryable: true,
        };
  } finally {
    clearTimeout(timer);
  }
};

// Bounded request with a small, capped retry budget. Only timeouts, network errors,
// 429 and 5xx are retried; other 4xx responses fail immediately.
const requestJson = async <T>(
  url: string,
  init: FetchInit,
  options: { label: string; timeoutMs: number; maxRetries: number }
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    const result = await attemptJson<T>(
      url,
      init,
      options.label,
      options.timeoutMs
    );
    if (result.ok) return result.value;
    if (!result.retryable || attempt >= options.maxRetries) throw result.error;
    console.warn(
      `${options.label} retry ${attempt + 1}/${options.maxRetries} after: ${result.error.message}`
    );
    const jitter =
      RETRY_MIN_DELAY_MS +
      Math.random() * (RETRY_MAX_DELAY_MS - RETRY_MIN_DELAY_MS);
    await sleep(
      Math.min(Math.max(jitter, result.retryAfterMs ?? 0), RETRY_AFTER_CAP_MS)
    );
  }
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens,
    maxCompletionTokens,
    max_completion_tokens,
    retry,
  } = params;

  const payload: Record<string, unknown> = {
    messages: messages.map(normalizeMessage),
  };

  if (model) {
    payload.model = model;
  }

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const resolvedMaxCompletionTokens =
    max_completion_tokens ?? maxCompletionTokens;
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxCompletionTokens === "number")
    payload.max_completion_tokens = resolvedMaxCompletionTokens;
  else if (typeof resolvedMaxTokens === "number")
    payload.max_tokens = resolvedMaxTokens;

  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  return requestJson<InvokeResult>(
    resolveApiUrl(),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify(payload),
    },
    {
      label: "LLM invoke",
      timeoutMs: CHAT_TIMEOUT_MS,
      maxRetries: retry === false ? 0 : CHAT_MAX_RETRIES,
    }
  );
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export async function listLLMModels(): Promise<ModelsResponse> {
  assertApiKey();

  const url = `${platformApiBase()}/v1/models`;

  return requestJson<ModelsResponse>(
    url,
    { headers: { authorization: `Bearer ${ENV.forgeApiKey}` } },
    {
      label: "List LLM models",
      timeoutMs: DISCOVERY_TIMEOUT_MS,
      maxRetries: DISCOVERY_MAX_RETRIES,
    }
  );
}
