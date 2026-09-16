/**
 * AI provider adapters (native fetch; the browser talks to the provider directly, BYOK)
 *
 * - openai-compatible: OpenAI / DeepSeek / Qwen / Zhipu, POST /chat/completions
 * - anthropic: Claude, POST /messages (a direct browser call needs the anthropic-dangerous-direct-browser-access header)
 *
 * The unified interface:
 * - chat()       a one-shot call (short requests, such as the connectivity test)
 * - chatStream() SSE streaming (selection Q&A, lesson generation), with onDelta called per chunk
 * - chatJSONStream() streaming JSON (structured work like lesson planning; a long request keeps
 *   bytes flowing, avoiding the Failed to fetch a proxy hands a non-streaming long connection)
 * - listModels() fetch the list of available models
 * - extractJSON / describeAIError / isAbortError helpers
 */
import type { AIProviderConfig } from '../types/ai'
// The dictionary is read non-reactively here: these messages are built at throw
// time, not rendered, so there is nothing to subscribe to.
import { tr } from '../i18n'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  messages: ChatMessage[]
  /** Ask for output JSON.parse can handle */
  json?: boolean
  temperature?: number
  /** Output token cap (required by Anthropic; left unset for OpenAI-compatible endpoints so each uses its own default) */
  maxTokens?: number
  signal?: AbortSignal
}

export interface StreamOptions extends ChatOptions {
  onDelta: (chunk: string) => void
  /** Reasoning deltas on reasoning models (DeepSeek reasoning_content / Claude thinking_delta); may be omitted */
  onReasoningDelta?: (chunk: string) => void
}

/* ───────── Agent: streaming chat with tool calls ───────── */

export interface ToolSchema {
  name: string
  description: string
  /** The parameter definition, as a JSON Schema */
  input_schema: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

/** Neutral message shape for agent conversations (each adapter translates it into its own protocol) */
export type AgentMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; id: string; name: string; content: string }

export interface AgentTurn {
  /** This round's streamed text (a tool round's narration, or the final answer) */
  text: string
  /** Tool calls issued this round; when non-empty the caller runs them and the loop continues */
  toolCalls: ToolCall[]
}

export interface AgentStreamOptions {
  messages: AgentMessage[]
  tools: ToolSchema[]
  temperature?: number
  signal?: AbortSignal
  onDelta?: (chunk: string) => void
}

/** Run one round of a tool-enabled conversation; text deltas go to onDelta while tool-call fragments accumulate into complete calls internally */
export async function chatAgentStream(config: AIProviderConfig, opts: AgentStreamOptions): Promise<AgentTurn> {
  if (config.kind === 'anthropic') return chatAgentStreamAnthropic(config, opts)
  return chatAgentStreamOpenAICompatible(config, opts)
}

function parseToolArgs(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : { _raw: raw }
  } catch {
    return { _raw: raw }
  }
}

function toOpenAIMessages(messages: AgentMessage[]): Record<string, unknown>[] {
  return messages.map((m) => {
    if (m.role === 'system' || m.role === 'user') return { role: m.role, content: m.content }
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.id, content: m.content }
    const out: Record<string, unknown> = { role: 'assistant', content: m.content || null }
    if (m.toolCalls?.length) {
      out.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      }))
    }
    return out
  })
}

function toAnthropicMessages(messages: AgentMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  let pendingResults: Record<string, unknown>[] = []
  const flushResults = () => {
    if (pendingResults.length) {
      out.push({ role: 'user', content: pendingResults })
      pendingResults = []
    }
  }
  for (const m of messages) {
    if (m.role === 'system') continue // carried by the top-level system parameter
    if (m.role === 'tool') {
      pendingResults.push({ type: 'tool_result', tool_use_id: m.id, content: m.content })
      continue
    }
    flushResults()
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content })
    } else {
      const blocks: Record<string, unknown>[] = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
      out.push({ role: 'assistant', content: blocks.length ? blocks : '' })
    }
  }
  flushResults()
  return out
}

async function chatAgentStreamOpenAICompatible(config: AIProviderConfig, opts: AgentStreamOptions): Promise<AgentTurn> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: toOpenAIMessages(opts.messages),
    temperature: opts.temperature ?? 0.4,
    stream: true,
  }
  if (opts.tools.length) {
    body.tools = opts.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }))
  }
  const res = await postOpenAI(config, body, opts.signal)
  if (!res.ok) throw await toAIError(res, 'API')

  let text = ''
  const pending = new Map<number, { id?: string; name?: string; args: string }>()
  await consumeSSE(res, (data) => {
    if (data === '[DONE]') return
    try {
      const json = JSON.parse(data)
      const delta = json?.choices?.[0]?.delta
      if (typeof delta?.content === 'string' && delta.content) {
        text += delta.content
        opts.onDelta?.(delta.content)
      }
      // Tool calls arrive in fragments: aggregated by index, arguments concatenated piece by piece
      for (const tc of delta?.tool_calls ?? []) {
        const idx = typeof tc.index === 'number' ? tc.index : 0
        const cur = pending.get(idx) ?? { args: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name = tc.function.name
        if (typeof tc.function?.arguments === 'string') cur.args += tc.function.arguments
        pending.set(idx, cur)
      }
    } catch {
      // A non-JSON payload (a heartbeat or comment): skipped silently
    }
  })
  const toolCalls: ToolCall[] = []
  for (const [, p] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
    if (!p.name) continue
    toolCalls.push({ id: p.id ?? `call_${p.name}_${toolCalls.length}`, name: p.name, args: parseToolArgs(p.args) })
  }
  return { text, toolCalls }
}

async function chatAgentStreamAnthropic(config: AIProviderConfig, opts: AgentStreamOptions): Promise<AgentTurn> {
  const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: 8192,
    temperature: opts.temperature ?? 0.4,
    system,
    messages: toAnthropicMessages(opts.messages),
    stream: true,
  }
  if (opts.tools.length) {
    body.tools = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
  }
  const res = await fetch(`${trimSlash(config.baseURL)}/messages`, {
    method: 'POST',
    headers: anthropicHeaders(config),
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) throw await toAIError(res, 'Anthropic')

  let text = ''
  type Block = { kind: 'text' } | { kind: 'tool'; id: string; name: string; args: string }
  const blocks = new Map<number, Block>()
  await consumeSSE(res, (data) => {
    try {
      const json = JSON.parse(data)
      if (json?.type === 'content_block_start') {
        const cb = json.content_block ?? {}
        blocks.set(
          json.index,
          cb.type === 'tool_use'
            ? { kind: 'tool', id: cb.id ?? `toolu_${json.index}`, name: cb.name ?? '', args: '' }
            : { kind: 'text' },
        )
      } else if (json?.type === 'content_block_delta') {
        const b = blocks.get(json.index)
        const d = json.delta ?? {}
        if (b?.kind === 'tool' && d.type === 'input_json_delta' && typeof d.partial_json === 'string') b.args += d.partial_json
        else if (b?.kind === 'text' && d.type === 'text_delta' && typeof d.text === 'string') {
          text += d.text
          opts.onDelta?.(d.text)
        }
      }
    } catch {
      // Not a JSON line, so skip it
    }
  })
  const toolCalls: ToolCall[] = []
  for (const [, b] of blocks) {
    if (b.kind !== 'tool' || !b.name) continue
    toolCalls.push({ id: b.id, name: b.name, args: parseToolArgs(b.args) })
  }
  return { text, toolCalls }
}

/** An AI call error carrying the HTTP status (describeAIError turns it into user-facing copy) */
export class AIError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/** Call the AI and return the complete text */
export async function chat(config: AIProviderConfig, opts: ChatOptions): Promise<string> {
  if (config.kind === 'anthropic') return chatAnthropic(config, opts)
  return chatOpenAICompatible(config, opts)
}

/** Streaming call: onDelta fires per chunk and the promise resolves to the concatenated full text */
export async function chatStream(config: AIProviderConfig, opts: StreamOptions): Promise<string> {
  if (config.kind === 'anthropic') return chatStreamAnthropic(config, opts)
  return chatStreamOpenAICompatible(config, opts)
}

/** Streaming JSON call: forces JSON output (OpenAI response_format / Anthropic tool_choice),
 *  but carries it over SSE — a long request keeps bytes flowing, no intermediary cuts it off, and onDelta can paint live */
export async function chatJSONStream(config: AIProviderConfig, opts: StreamOptions): Promise<string> {
  if (config.kind === 'anthropic') return chatJSONStreamAnthropic(config, opts)
  return chatJSONStreamOpenAICompatible(config, opts)
}

/* ───────── OpenAI-compatible ───────── */

/** Connect-phase timeout: a request fails only when no response headers have arrived this long after sending. Some gateways do not return
 *  headers until the model produces its first token (buffering relays), and reasoning models are slow to start, so three minutes is generous. A genuinely unreachable endpoint errors at the TCP layer within seconds.
 *  The timeout lifts the moment headers arrive; the SSE idle watchdog takes over from there, so total generation time is never capped. */
const CONNECT_TIMEOUT_MS = 180_000

/** fetch plus the connect-phase timeout; the external signal is forwarded for the whole life of the request, the streaming body read included
 *  (tapping Stop must be able to cut an established stream); the connect timeout only applies before headers arrive */
async function fetchAI(url: string, init: RequestInit): Promise<Response> {
  const external = init.signal
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort(external?.reason)
  if (external) {
    if (external.aborted) ctrl.abort(external.reason)
    else external.addEventListener('abort', onAbort)
  }
  const timer = setTimeout(() => ctrl.abort(new AIError(tr().aiError.connectTimeout(Math.round(CONNECT_TIMEOUT_MS / 1000)))), CONNECT_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
    // onAbort is deliberately left in place: after the headers an external abort must still be able to stop the streaming body (the listener is collected with the request object anyway)
  }
}

async function postOpenAI(config: AIProviderConfig, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  return fetchAI(`${trimSlash(config.baseURL)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
    signal,
  })
}

async function chatOpenAICompatible(config: AIProviderConfig, opts: ChatOptions): Promise<string> {
  const buildBody = (json: boolean): Record<string, unknown> => {
    const b: Record<string, unknown> = {
      model: config.model,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts.temperature ?? 0.4,
      stream: false,
    }
    if (json) b.response_format = { type: 'json_object' }
    return b
  }
  return withDeadline(CHAT_DEADLINE_MS, 'API', opts.signal, async (sig) => {
    let res = await postOpenAI(config, buildBody(!!opts.json), sig)
    // Some endpoints/models do not support response_format (they 400 on json_object): drop it and retry once;
    // the system prompt already insists on JSON only, and extractJSON parses it leniently
    if (!res.ok && res.status === 400 && opts.json) {
      res = await postOpenAI(config, buildBody(false), sig)
    }
    if (!res.ok) throw await toAIError(res, 'API')
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content) throw new AIError(tr().aiError.emptyText)
    return content
  })
}

async function chatStreamOpenAICompatible(config: AIProviderConfig, opts: StreamOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: opts.temperature ?? 0.4,
    stream: true,
  }
  const res = await postOpenAI(config, body, opts.signal)
  if (!res.ok) throw await toAIError(res, 'API')

  let full = ''
  await consumeSSE(res, (data) => {
    if (data === '[DONE]') return
    try {
      const json = JSON.parse(data)
      // Handles both delta.content and message.content (some gateways still send message while streaming)
      const choice = json?.choices?.[0]
      const delta = choice?.delta?.content ?? choice?.message?.content ?? ''
      if (typeof delta === 'string' && delta) {
        full += delta
        opts.onDelta(delta)
      }
      // Reasoning deltas on reasoning models (DeepSeek's reasoning_content and friends)
      const reasoning = choice?.delta?.reasoning_content
      if (typeof reasoning === 'string' && reasoning) opts.onReasoningDelta?.(reasoning)
    } catch {
      // A non-JSON payload (a heartbeat or comment): skipped silently
    }
  })
  if (!full) throw new AIError(tr().aiError.emptyBody)
  return full
}

async function chatJSONStreamOpenAICompatible(config: AIProviderConfig, opts: StreamOptions): Promise<string> {
  const buildBody = (json: boolean): Record<string, unknown> => {
    const b: Record<string, unknown> = {
      model: config.model,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts.temperature ?? 0.4,
      stream: true,
    }
    if (json) b.response_format = { type: 'json_object' }
    return b
  }
  // Some endpoints/models do not support response_format (they 400 on json_object): drop it and retry once;
  // the system prompt already insists on JSON only, and extractJSON parses it leniently
  let res = await postOpenAI(config, buildBody(true), opts.signal)
  if (!res.ok && res.status === 400) {
    await res.body?.cancel().catch(() => {})
    res = await postOpenAI(config, buildBody(false), opts.signal)
  }
  if (!res.ok) throw await toAIError(res, 'API')

  let full = ''
  await consumeSSE(res, (data) => {
    if (data === '[DONE]') return
    try {
      const json = JSON.parse(data)
      const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? ''
      if (typeof delta === 'string' && delta) {
        full += delta
        opts.onDelta(delta)
      }
    } catch {
      // A non-JSON payload (a heartbeat or comment): skipped silently
    }
  })
  if (!full) throw new AIError(tr().aiError.emptyText)
  return full
}

/* ───────── Anthropic ───────── */

function anthropicHeaders(config: AIProviderConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

async function chatAnthropic(config: AIProviderConfig, opts: ChatOptions): Promise<string> {
  const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const messages = opts.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: opts.maxTokens ?? 8192,
    temperature: opts.temperature ?? 0.4,
    system,
    messages,
  }
  // Forcing JSON: carried by a tool_use (Claude follows a prompt-only JSON request unreliably)
  if (opts.json) {
    body.tools = [{
      name: 'emit_json',
      description: 'Emit the structured JSON result.',
      input_schema: { type: 'object', additionalProperties: true },
    }]
    body.tool_choice = { type: 'tool', name: 'emit_json' }
  }

  return withDeadline(CHAT_DEADLINE_MS, 'Anthropic', opts.signal, async (sig) => {
    const res = await fetchAI(`${trimSlash(config.baseURL)}/messages`, {
      method: 'POST',
      headers: anthropicHeaders(config),
      body: JSON.stringify(body),
      signal: sig,
    })
    if (!res.ok) throw await toAIError(res, 'Anthropic')
    const data = await res.json()
    // Even with a forced tool_choice Claude may emit a text preamble first, so the tool_use block has to win
    let text: string | null = null
    for (const block of data?.content ?? []) {
      if (block.type === 'tool_use' && block.input) return JSON.stringify(block.input)
      if (text === null && block.type === 'text' && typeof block.text === 'string') text = block.text
    }
    if (text !== null) return text
    throw new AIError(tr().aiError.anthropicEmpty)
  })
}

async function chatStreamAnthropic(config: AIProviderConfig, opts: StreamOptions): Promise<string> {
  const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const messages = opts.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: opts.maxTokens ?? 8192,
    temperature: opts.temperature ?? 0.4,
    system,
    messages,
    stream: true,
  }
  const res = await fetchAI(`${trimSlash(config.baseURL)}/messages`, {
    method: 'POST',
    headers: anthropicHeaders(config),
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) throw await toAIError(res, 'Anthropic')

  let full = ''
  await consumeSSE(res, (data) => {
    try {
      const json = JSON.parse(data)
      // Only the body deltas; ping / message_start / message_delta (usage) and the rest are ignored
      if (json?.type === 'content_block_delta' && json?.delta?.type === 'text_delta' && typeof json.delta.text === 'string') {
        full += json.delta.text
        opts.onDelta(json.delta.text)
      } else if (json?.type === 'content_block_delta' && json?.delta?.type === 'thinking_delta' && typeof json.delta.thinking === 'string') {
        opts.onReasoningDelta?.(json.delta.thinking)
      }
    } catch {
      // Not a JSON line, so skip it
    }
  })
  if (!full) throw new AIError(tr().aiError.anthropicEmpty)
  return full
}

/** Streaming plus forced JSON: carried by a tool_use (Claude follows a prompt-only JSON request unreliably),
 *  with input_json_delta assembling the JSON text piece by piece; streaming keeps the connection alive */
async function chatJSONStreamAnthropic(config: AIProviderConfig, opts: StreamOptions): Promise<string> {
  const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const messages = opts.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: opts.maxTokens ?? 8192,
    temperature: opts.temperature ?? 0.4,
    system,
    messages,
    stream: true,
    tools: [{
      name: 'emit_json',
      description: 'Emit the structured JSON result.',
      input_schema: { type: 'object', additionalProperties: true },
    }],
    tool_choice: { type: 'tool', name: 'emit_json' },
  }
  const res = await fetchAI(`${trimSlash(config.baseURL)}/messages`, {
    method: 'POST',
    headers: anthropicHeaders(config),
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) throw await toAIError(res, 'Anthropic')

  let full = ''
  await consumeSSE(res, (data) => {
    try {
      const json = JSON.parse(data)
      // The JSON rides in on the tool_use block's input_json_delta; a text preamble, if any, is taken too (extractJSON is lenient)
      if (json?.type === 'content_block_delta' && json?.delta?.type === 'input_json_delta' && typeof json.delta.partial_json === 'string') {
        full += json.delta.partial_json
        opts.onDelta(json.delta.partial_json)
      } else if (json?.type === 'content_block_delta' && json?.delta?.type === 'text_delta' && typeof json.delta.text === 'string') {
        opts.onDelta(json.delta.text)
      }
    } catch {
      // Not a JSON line, so skip it
    }
  })
  if (!full) throw new AIError(tr().aiError.anthropicEmpty)
  return full
}

/* ───────── SSE parsing ───────── */

/** Stream idle limit: the connection counts as hung by the far end only after this long with no bytes at all, and is dropped (reasoning models can pause for a long time, hence ten minutes) */
const SSE_IDLE_MS = 600_000

/** A single read guarded by the idle watchdog: on timeout it cancels the stream and throws, so fetch can never hang forever */
async function readWithIdleGuard(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const read = reader.read()
  read.catch(() => {}) // When the watchdog wins, reader.cancel() makes read reject; the empty catch is attached up front to avoid an unhandled rejection
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      read,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AIError(tr().aiError.streamIdle(Math.round(SSE_IDLE_MS / 1000)))),
          SSE_IDLE_MS,
        )
      }),
    ])
  } catch (e) {
    void reader.cancel().catch(() => {})
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** Consume an SSE response body: pull out each data: payload and call back (neither protocol needs event:, comments or blank lines) */
async function consumeSSE(res: Response, onData: (data: string) => void): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) throw new AIError(tr().aiError.noStream)
  const decoder = new TextDecoder()
  let buf = ''
  const handleLine = (line: string) => {
    if (line.startsWith('data:')) onData(line.slice(5).trim())
  }
  for (;;) {
    const { done, value } = await readWithIdleGuard(reader)
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      handleLine(buf.slice(0, nl).replace(/\r$/, ''))
      buf = buf.slice(nl + 1)
    }
  }
  buf += decoder.decode()
  if (buf) handleLine(buf.replace(/\r$/, ''))
}

/* ───────── Errors and helpers ───────── */

/** Overall timeout for a non-streaming call: with no byte-by-byte signal to watch, a duration is the only backstop (at which point the request is aborted and an error thrown) */
const CHAT_DEADLINE_MS = 600_000

/** Run an async task that takes a signal within a time limit; on timeout the underlying request is aborted with an AIError, and the external signal is forwarded alongside */
async function withDeadline<T>(
  ms: number,
  label: string,
  external: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort(external?.reason)
  if (external) {
    if (external.aborted) ctrl.abort(external.reason)
    else external.addEventListener('abort', onAbort)
  }
  const timer = setTimeout(
    () => ctrl.abort(new AIError(tr().aiError.timeout(label, Math.round(ms / 1000)))),
    ms,
  )
  try {
    return await run(ctrl.signal)
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', onAbort)
  }
}

async function toAIError(res: Response, label: string): Promise<AIError> {
  const text = await res.text().catch(() => res.statusText)
  return new AIError(`${label} ${res.status}: ${text.slice(0, 300)}`, res.status)
}

/** Turn any failure into a message the user can act on */
export function describeAIError(e: unknown): string {
  if (isAbortError(e)) return tr().aiError.stopped
  if (e instanceof AIError) {
    const s = e.status
    if (s === 401 || s === 403) return tr().aiError.auth(s)
    if (s === 404) return tr().aiError.notFound
    if (s === 429) return tr().aiError.rateLimited
    if (s !== undefined && s >= 500) return tr().aiError.serverError(s)
    return e.message
  }
  if (e instanceof TypeError) {
    return tr().aiError.network
  }
  return (e as Error)?.message ?? String(e)
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

/** Best-effort JSON extraction from AI text (tolerating a ```json wrapper and surrounding chatter) */
export function extractJSON(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) return s.slice(start, end + 1)
  return s
}

/* ───────── Fetching the model list ───────── */

export async function listModels(config: AIProviderConfig): Promise<string[]> {
  if (config.kind === 'anthropic') {
    const res = await fetch(`${trimSlash(config.baseURL)}/models?limit=100`, {
      headers: { ...anthropicHeaders(config), Accept: 'application/json' },
    })
    if (!res.ok) throw await toAIError(res, tr().aiError.fetchModelsFailed)
    const data = await res.json()
    return (Array.isArray(data?.data) ? data.data : []).map((m: { id?: string }) => m.id).filter(Boolean) as string[]
  }
  const res = await fetch(`${trimSlash(config.baseURL)}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
  })
  if (!res.ok) throw await toAIError(res, tr().aiError.fetchModelsFailed)
  const data = await res.json()
  const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : []
  return arr
    .map((m: { id?: string; model?: string; name?: string }) => m.id || m.model || m.name)
    .filter(Boolean) as string[]
}
