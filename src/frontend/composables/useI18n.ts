/**
 * Lightweight translation lookup — no @nuxtjs/i18n dependency needed.
 *
 * The site ships in English only. This stays in place rather than being
 * stripped out because every component calls `t('some.key')`, and the keys are
 * a useful single source for the site's wording: copy changes happen in
 * locales/en.json instead of being scattered through templates.
 *
 * The upstream project carried French, Italian, Spanish, German and Portuguese
 * translations of its own marketing copy. They were removed rather than left
 * to rot: the copy they translated no longer exists, and a half-translated
 * language switcher is worse than none.
 *
 * To add a language later: add the JSON file, add it to MESSAGES and LOCALES,
 * and put the switcher back in the header.
 */

import en from '../locales/en.json'

type LocaleCode = 'en'

const MESSAGES: Record<LocaleCode, Record<string, any>> = { en }

export const LOCALES = [
  { code: 'en' as LocaleCode, name: 'English' },
]

/** Resolve a dot-separated key path in a nested object */
function resolve(obj: Record<string, any>, key: string): string | undefined {
  const parts = key.split('.')
  let cur: any = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return typeof cur === 'string' ? cur : undefined
}

export function useI18n() {
  const locale = useState<LocaleCode>('locale', () => 'en')

  /** Translate a dot-notation key, with optional `{param}` interpolation */
  function t(key: string, params?: Record<string, string>): string {
    const messages = MESSAGES[locale.value] ?? MESSAGES.en
    let value = resolve(messages, key) ?? resolve(MESSAGES.en, key) ?? key
    if (params) {
      value = value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`)
    }
    return value
  }

  function setLocale(code: LocaleCode | string) {
    locale.value = (code in MESSAGES ? code : 'en') as LocaleCode
  }

  return {
    t,
    locale: readonly(locale),
    locales: readonly(ref(LOCALES)),
    setLocale,
  }
}
