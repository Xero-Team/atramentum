/**
 * Test setup.
 *
 * Pins the UI language to Chinese. jsdom reports an en-US locale, so without
 * this every assertion written against the Chinese copy would silently start
 * checking the English one — `pipeline.test.ts` asserts on the generated
 * INDEX.md and the plan text, and `parsePlan` throws Chinese error messages.
 *
 * The dictionaries themselves are kept in step by the type system (`en.ts` is
 * typed as `Dict`, derived from `zh.ts`), so there is nothing to assert about
 * their alignment here.
 */
import { useSettingsStore } from './store/settingsStore'

useSettingsStore.setState({ lang: 'zh' })
