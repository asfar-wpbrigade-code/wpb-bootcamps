import { describe, expect, it } from 'vitest'
import { buildRecipients, normaliseHeader, parseRecipientsCsv, validateExpiry } from '../useRecipientsCsv'

/**
 * These cover the shapes real spreadsheets produce. The hand-rolled
 * `split(',')` parser this replaced corrupted quoted fields silently and
 * rejected semicolon-delimited files as "empty or invalid", so the cases
 * below are regressions as much as they are unit tests.
 */

describe('normaliseHeader', () => {
  it('treats spacing, casing and separators as noise', () => {
    expect(normaliseHeader('  Expiration Date ')).toBe('expirationdate')
    expect(normaliseHeader('expiration_date')).toBe('expirationdate')
    expect(normaliseHeader('Expiration-Date')).toBe('expirationdate')
    expect(normaliseHeader('EMAIL')).toBe('email')
  })
})

describe('validateExpiry', () => {
  it('accepts ISO dates, with either separator', () => {
    expect(validateExpiry('2027-12-31')).toEqual({ value: '2027-12-31' })
    expect(validateExpiry('2027/12/31')).toEqual({ value: '2027-12-31' })
  })

  it('treats a blank value as "no expiry"', () => {
    expect(validateExpiry('')).toEqual({ value: '' })
    expect(validateExpiry('   ')).toEqual({ value: '' })
  })

  it('refuses ambiguous day/month orderings rather than guessing', () => {
    expect(validateExpiry('31/12/2027').problem).toContain('YYYY-MM-DD')
    expect(validateExpiry('12/31/2027').problem).toContain('YYYY-MM-DD')
  })

  it('rejects dates that do not exist', () => {
    expect(validateExpiry('2027-02-31').problem).toContain('not a real date')
  })

  it('rejects free text', () => {
    expect(validateExpiry('next tuesday').problem).toBeTruthy()
  })
})

describe('buildRecipients', () => {
  const headers = ['name', 'email', 'expirationdate']

  it('accepts a well-formed set of rows', () => {
    const result = buildRecipients([
      { name: 'Jane Doe', email: 'jane@example.com', expirationdate: '2027-12-31' },
      { name: 'Ali Khan', email: 'ali@example.com', expirationdate: '' },
    ], headers)

    expect(result.error).toBeNull()
    expect(result.issues).toEqual([])
    expect(result.recipients).toHaveLength(2)
    expect(result.recipients[0]).toMatchObject({ name: 'Jane Doe', expirationDate: '2027-12-31' })
  })

  it('names the missing column instead of calling the file invalid', () => {
    const result = buildRecipients([{ name: 'Jane Doe' }], ['name'])

    expect(result.error).toContain('email')
    expect(result.error).toContain('Found: name')
  })

  it('explains that a headerless file has no header', () => {
    expect(buildRecipients([], []).error).toContain('no header row')
  })

  it('reports bad rows by their spreadsheet line number and keeps the rest', () => {
    const result = buildRecipients([
      { name: 'Jane Doe', email: 'jane@example.com' },
      { name: 'No Email', email: '' },
      { name: '', email: 'nameless@example.com' },
      { name: 'Bad Address', email: 'not-an-email' },
      { name: 'Ali Khan', email: 'ali@example.com' },
    ], headers)

    expect(result.recipients.map(r => r.email)).toEqual(['jane@example.com', 'ali@example.com'])
    // Line 2 is the first data row, so the failures are on 3, 4 and 5.
    expect(result.issues.map(i => i.line)).toEqual([3, 4, 5])
    expect(result.issues[2].problem).toContain('not a valid email address')
  })

  it('skips a repeated address and points at the line that already had it', () => {
    const result = buildRecipients([
      { name: 'Jane Doe', email: 'jane@example.com' },
      { name: 'Jane Again', email: 'JANE@example.com' },
    ], headers)

    expect(result.recipients).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({ line: 3 })
    expect(result.issues[0].problem).toContain('already on line 2')
  })

  it('ignores entirely blank rows without complaining', () => {
    const result = buildRecipients([
      { name: 'Jane Doe', email: 'jane@example.com' },
      { name: '', email: '' },
    ], headers)

    expect(result.recipients).toHaveLength(1)
    expect(result.issues).toEqual([])
  })

  it('reports a file where every row failed', () => {
    const result = buildRecipients([{ name: 'Bad', email: 'nope' }], headers)

    expect(result.recipients).toEqual([])
    expect(result.error).toContain('No usable rows')
  })
})

describe('parseRecipientsCsv', () => {
  it('parses a plain comma-separated file', async () => {
    const result = await parseRecipientsCsv('name,email\nJane Doe,jane@example.com\nAli Khan,ali@example.com')

    expect(result.error).toBeNull()
    expect(result.recipients).toHaveLength(2)
  })

  it('keeps a quoted comma inside the field it belongs to', async () => {
    const result = await parseRecipientsCsv('name,email\n"Khan, Ali",ali@example.com')

    expect(result.error).toBeNull()
    expect(result.recipients[0]).toMatchObject({ name: 'Khan, Ali', email: 'ali@example.com' })
  })

  it('handles semicolon-delimited files, as Excel writes in many locales', async () => {
    const result = await parseRecipientsCsv('name;email\nJane Doe;jane@example.com')

    expect(result.error).toBeNull()
    expect(result.recipients[0]).toMatchObject({ name: 'Jane Doe', email: 'jane@example.com' })
  })

  it('strips the byte-order mark Excel puts on UTF-8 files', async () => {
    const result = await parseRecipientsCsv('﻿name,email\nJane Doe,jane@example.com')

    expect(result.error).toBeNull()
    expect(result.recipients).toHaveLength(1)
  })

  it('copes with CRLF line endings', async () => {
    const result = await parseRecipientsCsv('name,email\r\nJane Doe,jane@example.com\r\n')

    expect(result.error).toBeNull()
    expect(result.recipients).toHaveLength(1)
  })

  it('accepts columns in any order and any casing', async () => {
    const result = await parseRecipientsCsv('Email,Name\njane@example.com,Jane Doe')

    expect(result.error).toBeNull()
    expect(result.recipients[0]).toMatchObject({ name: 'Jane Doe', email: 'jane@example.com' })
  })
})
