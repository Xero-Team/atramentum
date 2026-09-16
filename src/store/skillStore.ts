/**
 * Writing-style skills: a reusable style guide (with a sample lesson) distilled from an
 * existing course, selected when writing and injected into the prompt so the output
 * matches that course's voice and skeleton. Stored in localStorage.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { tr } from '../i18n'

export interface WritingSkill {
  id: string
  name: string
  /** The style guide (Markdown; injected into the generation prompt) */
  styleGuide: string
  /** A full sample lesson (to imitate the voice) */
  sample: string
  /** Where it was distilled from (a course title, for display) */
  from: string
  createdAt: number
}

interface SkillState {
  skills: WritingSkill[]
  add: (s: { name: string; styleGuide: string; sample: string; from: string }) => WritingSkill
  remove: (id: string) => void
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set) => ({
      skills: [],
      add: ({ name, styleGuide, sample, from }) => {
        const skill: WritingSkill = {
          id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim() || tr().course.untitledSkill,
          styleGuide,
          sample,
          from,
          createdAt: Date.now(),
        }
        set((s) => ({ skills: [...s.skills, skill] }))
        return skill
      },
      remove: (id) => set((s) => ({ skills: s.skills.filter((k) => k.id !== id) })),
    }),
    {
      name: 'moxue-skills',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
