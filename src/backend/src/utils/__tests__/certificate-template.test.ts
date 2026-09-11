import { generateCertificateSvg } from '../certificate-template'

/**
 * The design comes from the printed reference, Certificate1.pdf. These
 * assertions pin the type sizes and baselines measured out of that file -
 * composing each text matrix with its transform stack, since the raw Tf
 * numbers in the PDF are pre-transform and read about a third too large.
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
 *
 * Three deliberate departures from it, all in the name of internal
 * consistency. The reference is a print artefact, not a system, and it is not
 * self-consistent - the heading is already corrected here for spelling, so
 * there is precedent for fixing what it got wrong.
 *
 *   1. **Everything on the panel is Georgia.** The reference sets the
 *      programme in Georgia Bold and the date directly beneath it in Roboto
 *      Bold, then the signatory in Roboto Bold again: adjacent lines of the
 *      same rank in two families. The sans now appears only inside artwork
 *      that carries its own typography - the logo lockup and the seal.
 *   2. **The signatory title is no longer bold.** A bold title under a bold
 *      name states no hierarchy at all.
 *   3. **The bottom band shares an exact bottom edge**, and the seal and
 *      signature sit at equal insets from the panel edges. The reference had
 *      the seal's bottom at 538 and the title baseline at 540.7, and the two
 *      at 114pt and 230pt from their respective edges.
 *
 * Everything above the band - the canvas, the heading, the introduction, the
 * name, the citation and the programme - is untouched.
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

  it('sets the programme dates in bold serif at 10pt on baseline 434.4', () => {
    // Georgia, not the Roboto the reference used - the line directly above it
    // is Georgia Bold, and two families on adjacent lines of the same rank is
    // the inconsistency this design had.
    expect(svg).toMatch(/y="434\.4"[^>]*font-family="Georgia[^"]*"[^>]*font-size="10"[^>]*font-weight="bold"/)
    expect(svg).toContain('From: July 2026')
  })

  it('sets the signature block in the serif, with the title unbolded', () => {
    expect(svg).toMatch(/y="526\.8"[^>]*font-family="Georgia[^"]*"[^>]*font-size="10"[^>]*font-weight="bold"/)
    expect(svg).toContain('TOM CRUISE')
    expect(svg).toMatch(/y="538"[^>]*font-family="Georgia[^"]*"[^>]*font-size="8"/)
    expect(svg).toContain('Manager')
    // A bold title under a bold name is not a hierarchy.
    expect(svg).not.toMatch(/y="538"[^>]*font-weight="bold"/)
  })

  it('lands the signature block on the seal’s bottom edge', () => {
    // The seal is centred at y=476 with a diameter of 124, so it ends at 538,
    // and the last line of the signature block sits on exactly that. The
    // reference was 2.7pt out, which reads as loose rather than intended.
    expect(svg).toContain('translate(190, 476)')
    expect(svg).toMatch(/y="538"[^>]*font-size="8"/)
  })

  it('keeps that bottom edge when there is no signatory title', () => {
    // The block hangs upward from the shared edge, so a missing title moves
    // the name and rule down rather than leaving the band lopsided.
    return generateCertificateSvg({ ...SAMPLE, signatoryTitle: undefined }).then((untitled) => {
      expect(untitled).toMatch(/y="538"[^>]*font-size="10"[^>]*font-weight="bold"/)
      expect(untitled).toContain('TOM CRUISE')
    })
  })

  it('places the seal and the signature at equal insets from the panel', () => {
    // Panel edges are x=38 and x=754. The reference had them 114pt and 230pt
    // in, which reads as an accident.
    expect(svg).toContain('translate(190, 476)')
    expect(svg).toContain('translate(602, 0)')
  })

  it('sets every word on the panel in the serif', () => {
    // The sans belongs to artwork that carries its own typography - the logo
    // lockup, and the seal's legends, which run on a <textPath> and so have no
    // x of their own. Positioned text is what this file sets, and all of it
    // has to be Georgia; catching the seal here would assert the medal's
    // design rather than the panel's.
    const panelText = svg.match(/<text x="[^"]*"[^>]*font-family="[^"]*"/g) || []
    const sansOnPanel = panelText.filter(tag => tag.includes('Segoe UI'))

    expect(panelText.length).toBeGreaterThanOrEqual(6)
    expect(sansOnPanel).toEqual([])
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
