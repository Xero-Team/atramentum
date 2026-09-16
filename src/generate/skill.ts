/**
 * Style-skill distillation: hand an existing course (index + sample lesson) to
 * the AI to summarise into a reusable "writing style guide"; once saved as a
 * skill it is injected into the generation prompt when writing a course.
 */
import { chatStream } from '../ai/providers'
import type { AIProviderConfig } from '../types/ai'
import { tr } from '../i18n'

/** Distil a style guide from a course (returns Markdown) */
export async function distillSkill(
  config: AIProviderConfig,
  params: { courseTitle: string; indexText: string; sampleSection: string },
  signal?: AbortSignal,
): Promise<string> {
  const p = tr().pipeline
  const user = [
    p.distillTask,
    p.distillCourse(params.courseTitle),
    params.indexText && p.distillIndex(params.indexText.slice(0, 2500)),
    params.sampleSection && p.distillSample(params.sampleSection.slice(0, 4500)),
    p.distillOutput,
    ...p.distillOutline,
    p.distillLength,
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await chatStream(config, {
    messages: [
      { role: 'system', content: p.distillSystem },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
    maxTokens: 4096,
    signal,
    onDelta: () => {},
  })
  return stripFence(raw)
}

function stripFence(text: string): string {
  const t = text.trim()
  const m = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/.exec(t)
  return m ? m[1].trim() : t
}
