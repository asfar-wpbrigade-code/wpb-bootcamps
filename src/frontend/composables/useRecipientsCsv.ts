export interface CsvRecipient {
  name: string
  email: string
  organization: string
  expirationDate: string
}

/** A row that could not be used, identified by its line in the file. */
export interface CsvRowIssue {
  line: number
  problem: string
}

export interface CsvParseResult {
  recipients: CsvRecipient[]
  issues: CsvRowIssue[]
  /** Set when the file as a whole is unusable, rather than individual rows. */
  error: string | null
}

/** Good enough to catch typos and mangled rows; the server validates properly. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]{2,}$/

/** Only unambiguous, sortable dates - see validateExpiry. */
const ISO_DATE_PATTERN = /^(\d{4})[-/](\d{2})[-/](\d{2})$/

const REQUIRED_COLUMNS = ['name', 'email'] as const

/**
 * `Expiration Date`, `expirationdate` and `expiration_date` are the same
 * column to anyone filling in a spreadsheet, so treat them as one.
 */
export function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

/**
 * Accepts YYYY-MM-DD only, and deliberately rejects everything else.
 *
 * `31/12/2027` and `12/31/2027` are the same characters meaning different
 * days. Guessing sets a real certificate to expire on the wrong date and
 * nobody finds out until it lapses early, so an explained rejection is the
 * kinder failure.
 */
export function validateExpiry(raw: string): { value?: string, problem?: string } {
  const trimmed = (raw ?? '').trim()

  if (!trimmed) {
    return { value: '' }
  }

  const match = trimmed.match(ISO_DATE_PATTERN)

  if (!match) {
    return { problem: `expiry date "${trimmed}" is not in YYYY-MM-DD format` }
  }

  const [, year, month, day] = match
  const normalised = `${year}-${month}-${day}`
  const parsed = new Date(`${normalised}T00:00:00.000Z`)

  // Rejects 2027-02-31, which Date rolls forward into March rather than
  // reporting as invalid.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalised) {
    return { problem: `expiry date "${trimmed}" is not a real date` }
  }

  return { value: normalised }
}

/**
 * Turns parsed CSV rows into recipients, collecting per-row problems instead
 * of throwing on the first one - someone fixing a spreadsheet wants the whole
 * list, not one error at a time.
 *
 * Kept free of papaparse and of the DOM so it can be tested directly.
 */
export function buildRecipients(
  rows: Record<string, string>[],
  headers: string[],
): CsvParseResult {
  const missing = REQUIRED_COLUMNS.filter(column => !headers.includes(column))

  if (missing.length > 0) {
    return {
      recipients: [],
      issues: [],
      error: headers.length > 0
        ? `The CSV needs ${missing.join(' and ')} column${missing.length > 1 ? 's' : ''}. Found: ${headers.join(', ')}.`
        : 'That file has no header row. The first line should read: name,email',
    }
  }

  const recipients: CsvRecipient[] = []
  const issues: CsvRowIssue[] = []
  const seen = new Map<string, number>()

  rows.forEach((row, index) => {
    // +2: one for the header row, one because spreadsheets count from 1.
    const line = index + 2
    const name = (row.name ?? '').trim()
    const email = (row.email ?? '').trim()
    const organization = (row.organization ?? '').trim()

    // A row that is entirely blank is not worth complaining about.
    if (!name && !email) {
      return
    }

    if (!name) {
      issues.push({ line, problem: 'no name' })
      return
    }

    if (!EMAIL_PATTERN.test(email)) {
      issues.push({
        line,
        problem: email ? `"${email}" is not a valid email address` : 'no email address',
      })
      return
    }

    const lowered = email.toLowerCase()

    if (seen.has(lowered)) {
      issues.push({ line, problem: `${email} is already on line ${seen.get(lowered)} - skipped` })
      return
    }

    const expiry = validateExpiry(row.expirationdate ?? '')

    if (expiry.problem) {
      issues.push({ line, problem: expiry.problem })
      return
    }

    seen.set(lowered, line)
    recipients.push({ name, email, organization, expirationDate: expiry.value ?? '' })
  })

  if (recipients.length === 0) {
    return {
      recipients: [],
      issues,
      error: issues.length > 0
        ? 'No usable rows - every row had a problem. See the list below.'
        : 'That file has a header row but no recipients.',
    }
  }

  return { recipients, issues, error: null }
}

/**
 * Parses an uploaded recipients CSV.
 *
 * Uses papaparse - already a dependency, previously unused anywhere - rather
 * than splitting on commas. A quoted field containing a comma, which
 * spreadsheets produce constantly, used to shift every later column along by
 * one: `"Khan, Ali",ali@example.com` arrived as name `"Khan` and email
 * `Ali"`, and the server then rejected a perfectly good address. Papa also
 * detects the delimiter, so the semicolon-separated files Excel writes in
 * many locales work instead of failing as "empty or invalid", and it strips
 * the byte-order mark Excel puts at the start of UTF-8 files.
 *
 * papaparse is imported here, and only in the browser, because it cannot go
 * through nitro's server build: nitro replaces the text `typeof window` with
 * `"undefined"` across the whole bundle (nitropack/dist/rollup/index.mjs,
 * @rollup/plugin-replace with no delimiters, so string literals are rewritten
 * too), and papaparse builds its web worker from a source string containing
 * `typeof window`. The replacement drops a double quote into the middle of a
 * double-quoted string, and `nuxt build` dies with
 * "Expected ',', got 'undefined'" in a dependency that is itself valid.
 *
 * `import.meta.client` compiles to `false` on the server, so this whole
 * branch - and papaparse with it - is removed from the server bundle rather
 * than merely left uncalled. A static import, or a dynamic one without the
 * guard, is still bundled and still breaks the build.
 *
 * Nothing needs it server-side regardless: it parses a file the browser has
 * just read from the user's disk.
 */
export async function parseRecipientsCsv(input: File | string): Promise<CsvParseResult> {
  if (!import.meta.client) {
    return { recipients: [], issues: [], error: 'CSV files are read in the browser.' }
  }

  const { default: Papa } = await import('papaparse')

  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(input as any, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: normaliseHeader,
      complete: (results) => {
        resolve(buildRecipients(results.data, results.meta.fields ?? []))
      },
      error: (parseError: Error) => {
        resolve({
          recipients: [],
          issues: [],
          error: `Could not read that file: ${parseError.message}`,
        })
      },
    })
  })
}
