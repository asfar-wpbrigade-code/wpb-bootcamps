import { generateCertificateSvg } from '../certificate-template'

/**
 * The design is not ours to invent: it comes from the printed reference,
 * Certificate1.pdf. These assertions pin the type sizes and baselines measured
 * out of that file - composing each text matrix with its transform stack, since
 * the raw Tf numbers in the PDF are pre-transform and read about a third too
 * large.
 *
 * Reference, in page coordinates on the 792x612 canvas:
 *
 *   Certificate of Completion   y 175.7   35pt   Engravers Old English
 *   This Certificate is ...     y 205.1   10pt   Georgia Italic
 *   <recipient>                 y 289.5   80pt   Alex Brush
 *   citation x3                 y 335.5 / 353.5 / 371.5   10pt   Georgia Italic
 *   <programme>                 y 414.0   18pt   Georgia Bold
 *   From: ... - ...             y 434.4   10pt   Roboto Bold
 *   <signatory>                 y 529.5   10pt   Roboto Bold
 *   <title>                     y 540.7    8pt   Roboto Bold
 */
const SAMPLE = {
  recipientName: 'Tiger Tiago',
  achievementName: 'SEO Fundamentals',
  issuerName: 'WPBrigade',
  issueDate: '2026-09-02T00:00:00.000Z',
  credentialId: 'urn:uuid:75ba700b-2f17-4395-a15d-7853c0aff533',
  verifyUrl: 'https://bootcamp.labspk.com/credentials/urn:uuid:75ba700b',
  // Long enough to wrap to the three citation lines the reference is drawn
  // around; the programme and date baselines follow from that count.
  description: 'Awarded for successfully completing WPBrigade’s WordPress Development '
    + 'Fundamentals programme, covering theme and plugin development, the WordPress APIs, '
    + 'and secure, standards-compliant PHP.',
  signatoryName: 'Tom Cruise',
  signatoryTitle: 'Manager',
  programmeStartDate: '2026-07-01T00:00:00.000Z',
  programmeEndDate: '2026-08-01T00:00:00.000Z',
}

describe('certificate template, against the printed reference', () => {
  let svg: string

  beforeAll(async () => {
    svg = await generateCertificateSvg(SAMPLE)
  })

  it('uses the reference canvas', () => {
    expect(svg).toContain('width="792"')
    expect(svg).toContain('height="612"')
    expect(svg).toContain('viewBox="0 0 792 612"')
  })

  it('sets the introduction at 10pt on baseline 205', () => {
    expect(svg).toMatch(/y="205"[^>]*font-size="10"[^>]*font-style="italic"/)
    expect(svg).toContain('This Certificate is Proudly Presented to')
  })

  it('sets the citation at 10pt from baseline 335.5, on 18pt leading', () => {
    expect(svg).toMatch(/y="335\.5"[^>]*font-size="10"[^>]*font-style="italic"/)
    expect(svg).toMatch(/y="353\.5"[^>]*font-size="10"/)
    expect(svg).toMatch(/y="371\.5"[^>]*font-size="10"/)
  })

  it('sets the programme in bold serif at 18pt on baseline 414', () => {
    // Georgia Bold in the reference, not the sans the signature block uses.
    // The size is emitted through toFixed(1), so 18 arrives as "18.0".
    expect(svg).toMatch(/y="414"[^>]*font-family="Georgia[^"]*"[^>]*font-size="18(\.0)?"[^>]*font-weight="bold"/)
    expect(svg).toContain('SEO FUNDAMENTALS')
  })

  it('sets the programme dates in bold sans at 10pt on baseline 434.4', () => {
    expect(svg).toMatch(/y="434\.4"[^>]*font-family="'Segoe UI'[^"]*"[^>]*font-size="10"[^>]*font-weight="bold"/)
    expect(svg).toContain('From: July 2026')
  })

  it('sets the signature block at 10pt and 8pt', () => {
    expect(svg).toMatch(/y="529\.5"[^>]*font-size="10"[^>]*font-weight="bold"/)
    expect(svg).toContain('TOM CRUISE')
    expect(svg).toMatch(/y="540\.7"[^>]*font-size="8"[^>]*font-weight="bold"/)
    expect(svg).toContain('Manager')
  })

  it('keeps the rule clear of the script descenders', () => {
    // Alex Brush at 80pt drops 16.4pt below its baseline of 289.5, so anything
    // above y=306 would strike through a name like "Gregory Page".
    // x1="146" is CENTRE-250: the rule under the name, not the shorter
    // decorative pair either side of the logo.
    const rule = svg.match(/<line x1="146" y1="(\d+(?:\.\d+)?)"/)
    expect(rule).not.toBeNull()
    expect(Number(rule![1])).toBeGreaterThanOrEqual(306)
  })

  it('spells the heading correctly, unlike the reference artwork', () => {
    // Certificate1.pdf reads "Cretificate" in both the heading and the
    // introduction. The outlines were corrected when they were lifted.
    expect(svg).not.toContain('Cretificate')
  })
})
