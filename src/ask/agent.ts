/**
 * The agent layer behind Ask AI (modelled on Codex's workflow):
 * hand the model a set of read-only course tools (browse the index / read a
 * file / full-text search) and loop model → tools → model until it produces a
 * final answer. The process reaches the UI as a step stream via onStep / onTurn.
 */
import { chatAgentStream } from '../ai/providers'
import type { AgentMessage, ToolCall, ToolSchema } from '../ai/providers'
import type { AIProviderConfig } from '../types/ai'
import { tr } from '../i18n'

/** Read-only access to the course files (AskPanel provides it from the current course meta) */
export interface CourseFiles {
  /** Every file path in the course, relative */
  listFiles(): Promise<string[]>
  /** Read one file in full; null when it does not exist */
  readFile(path: string): Promise<string | null>
}

export type StepStatus = 'running' | 'done' | 'error'

export interface AgentStep {
  /** Tool-call id (unique within a round); the UI upserts by key */
  key: string
  /** One-line description, e.g. "Read lesson01.md · 3.4k chars" */
  label: string
  /** Raw tool output, truncated, shown when expanded */
  detail?: string
  status: StepStatus
}

/** One entry in the workflow timeline: a step row or the model's between-round narration */
export type FlowItem = { kind: 'step'; step: AgentStep } | { kind: 'note'; text: string }

const MAX_ROUNDS = 8
const READ_LIMIT = 8000 // characters a single read returns at most
const SEARCH_MATCH_CAP = 10 // most matches a search reports
const SEARCH_FILE_CAP = 150 // most files a search scans
const STEP_DETAIL_LIMIT = 800 // characters of step detail shown

/** Tool definitions. The names are the wire format and never translate; only the descriptions do. */
function tools(): ToolSchema[] {
  const a = tr().agent
  return [
    {
      name: 'list_course_files',
      description: a.toolList,
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'read_course_file',
      description: a.toolRead,
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: a.toolReadPath } },
        required: ['path'],
      },
    },
    {
      name: 'search_course',
      description: a.toolSearch,
      input_schema: {
        type: 'object',
        properties: { keyword: { type: 'string', description: a.toolSearchKeyword } },
        required: ['keyword'],
      },
    },
  ]
}

async function searchCourse(
  keyword: string,
  files: CourseFiles,
  cache: Map<string, string>,
): Promise<{ text: string; hits: number }> {
  const a = tr().agent
  const paths = await files.listFiles()
  const lines: string[] = []
  let hits = 0
  let scanned = 0
  let truncated = false
  for (const p of paths) {
    if (hits >= SEARCH_MATCH_CAP || scanned >= SEARCH_FILE_CAP) {
      truncated = true
      break
    }
    let text = cache.get(p)
    if (text === undefined) {
      text = (await files.readFile(p)) ?? ''
      cache.set(p, text)
    }
    if (!text) continue
    scanned++
    const ls = text.split('\n')
    for (let i = 0; i < ls.length; i++) {
      if (ls[i].includes(keyword)) {
        hits++
        lines.push(`${p}:${i + 1}  ${ls[i].trim().slice(0, 160)}`)
        if (hits >= SEARCH_MATCH_CAP) break
      }
    }
  }
  const head = a.searchHead(hits, truncated ? scanned : null)
  return { text: lines.length ? a.searchFound(head, lines.join('\n')) : a.searchEmpty(head), hits }
}

/** Run one tool call; returns the label to display and the text handed back to the model */
async function execTool(
  call: ToolCall,
  files: CourseFiles,
  cache: Map<string, string>,
): Promise<{ label: string; result: string }> {
  const a = tr().agent
  if (call.name === 'list_course_files') {
    const paths = await files.listFiles()
    const shown = paths.slice(0, 400)
    return {
      label: a.listed(paths.length),
      result: `${a.listedResult(paths.length)}\n${shown.join('\n')}${paths.length > shown.length ? '\n…' : ''}`,
    }
  }
  if (call.name === 'read_course_file') {
    const p = String(call.args.path ?? '').trim()
    if (!p) return { label: a.readNoPath, result: a.readNoPathResult }
    let text = cache.get(p)
    if (text === undefined) {
      text = (await files.readFile(p)) ?? ''
      cache.set(p, text)
    }
    if (!text) return { label: a.readEmpty(p), result: a.readEmptyResult(p) }
    return {
      label: a.read(p, a.charCount(text.length)),
      result: text.length > READ_LIMIT ? `${text.slice(0, READ_LIMIT)}\n${a.readTruncated(text.length)}` : text,
    }
  }
  if (call.name === 'search_course') {
    const kw = String(call.args.keyword ?? call.args.query ?? call.args.q ?? '').trim()
    if (!kw) return { label: a.searchNoKeyword, result: a.searchNoKeywordResult }
    const out = await searchCourse(kw, files, cache)
    return { label: a.search(kw.slice(0, 20), out.hits), result: out.text }
  }
  return { label: a.unknownTool(call.name), result: a.unknownToolResult(call.name) }
}

export interface AskAgentParams {
  config: AIProviderConfig
  courseTitle: string
  sectionTitle?: string
  /** First user message (free-form payload / selection payload / the follow-up text itself) */
  question: string
  /** Previous rounds, carried on follow-ups (q is the short display text) */
  history?: { q: string; a: string }[]
  /** Course file access; when absent this degrades to plain streaming Q&A with no tools */
  files?: CourseFiles | null
  signal: AbortSignal
  /** Streaming deltas (both the final answer and tool-round narration come through here) */
  onDelta: (chunk: string) => void
  /** Tool step upsert (by step.key) */
  onStep: (step: AgentStep) => void
  /** End of each model round; final=false means this was a tool round's narration */
  onTurn?: (text: string, final: boolean) => void
}

/** Run the whole agent loop; resolves to the final answer text */
export async function runAskAgent(params: AskAgentParams): Promise<string> {
  const { config, files, signal, onDelta, onStep, onTurn } = params
  const hasTools = !!files
  const a = tr().agent

  const sys = [
    a.systemIntro(params.courseTitle),
    hasTools ? a.systemWithTools : a.systemNoTools,
    params.sectionTitle && a.systemSection(params.sectionTitle),
    a.systemRules,
  ]
    .filter(Boolean)
    .join('\n')

  const messages: AgentMessage[] = [
    { role: 'system', content: sys },
    ...((params.history ?? []).flatMap((h) => [
      { role: 'user' as const, content: h.q },
      { role: 'assistant' as const, content: h.a },
    ])),
    { role: 'user', content: params.question },
  ]

  const cache = new Map<string, string>()
  let acc = ''

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const turn = await chatAgentStream(config, {
      messages,
      tools: hasTools ? tools() : [],
      temperature: 0.4,
      signal,
      onDelta,
    })
    onTurn?.(turn.text, turn.toolCalls.length === 0)
    if (turn.toolCalls.length === 0 || signal.aborted) {
      return turn.text || acc
    }
    acc += turn.text
    messages.push({ role: 'assistant', content: turn.text, toolCalls: turn.toolCalls })
    for (const call of turn.toolCalls) {
      onStep({ key: call.id, label: a.running(call.name), status: 'running' })
      let result: string
      try {
        const out = await execTool(call, files!, cache)
        onStep({ key: call.id, label: out.label, detail: out.result.slice(0, STEP_DETAIL_LIMIT), status: 'done' })
        result = out.result
      } catch (e) {
        result = tr().agent.execFailed((e as Error).message)
        onStep({ key: call.id, label: a.failed(call.name), detail: result, status: 'error' })
      }
      messages.push({ role: 'tool', id: call.id, name: call.name, content: result })
    }
  }

  // Out of rounds: force a wrap-up with the tools withdrawn
  messages.push({ role: 'user', content: tr().agent.roundLimit })
  const final = await chatAgentStream(config, { messages, tools: [], temperature: 0.4, signal, onDelta })
  return final.text || acc
}
