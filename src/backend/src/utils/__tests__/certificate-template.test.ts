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
 * The departures from it are deliberate, and listed here because this file
 * exists to pin the design to that reference. The reference is a print
 * artefact rather than a system, and it is not self-consistent - the heading
 * is already corrected here for spelling, so there is precedent for fixing
 * what it got wrong.
 *
 *   1. **Everything on the panel is Georgia.** The reference sets the
 *      programme in Georgia Bold and the date directly beneath it in Roboto
 *      Bold, then the signatory in Roboto Bold again: adjacent lines of the
 *      same rank in two families. The sans now appears only inside artwork
 *      that carries its own typography - the logo lockup and the seal.
 *   2. **The signatory title is no longer bold.** A bold title under a bold
 *      name states no hierarchy at all.
 *   3. **One centre axis.** Everything set centres on it; the seal is the one
 *      element deliberately outside, low and left. The signature moved from
 *      the right to the axis and down to the foot of the panel.
 *   4. **The name's rule is cut to the citation's measure**, 420pt rather than
 *      500, and the name is held 18pt inside it either side.
 *   5. **One masthead rule below the lockup**, replacing the two segments that
 *      flanked its tagline.
 *   6. **The programme and its date sit 14pt higher**, on 400 and 420.4. That
 *      is what keeps a long programme name clear of the seal, which the seal's
 *      position no longer leaves room for at the reference's 414.
 *
 * The canvas, the heading, the introduction, the name's baseline and the
 * citation keep their reference positions.
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
    expect(svg).toContain('width="841.89"')
    expect(svg).toContain('height="595.28"')
    expect(svg).toContain('viewBox="0 0 841.89 595.28"')
  })

  it('sets the introduction at 10pt above the name', () => {
    expect(svg).toMatch(/y="188.28"[^>]*font-size="10"[^>]*font-style="italic"/)
    expect(svg).toContain('This Certificate is Proudly Presented to')
  })

  it('sets the citation at 10pt on 18pt leading', () => {
    expect(svg).toMatch(/y="318\.78"[^>]*font-size="10"[^>]*font-style="italic"/)
    expect(svg).toMatch(/y="336\.78"[^>]*font-size="10"/)
    expect(svg).toMatch(/y="354\.78"[^>]*font-size="10"/)
  })

  it('sets the programme in bold serif at 18pt, clear of the seal', () => {
    // Georgia Bold in the reference, not the sans the signature block uses.
    // The size is emitted through toFixed(1), so 18 arrives as "18.0".
    //
    // Baseline 400, not the reference's 414: the seal's top is at 404 now, and
    // a programme name long enough to reach x=148 met its rim there.
    expect(svg).toMatch(/y="383.28"[^>]*font-family="Georgia[^"]*"[^>]*font-size="18(\.0)?"[^>]*font-weight="bold"/)
    expect(svg).toContain('SEO FUNDAMENTALS')
  })

  it('sets the programme dates in bold serif at 10pt under it', () => {
    // Georgia, not the Roboto the reference used - the line directly above it
    // is Georgia Bold, and two families on adjacent lines of the same rank is
    // the inconsistency this design had.
    expect(svg).toMatch(/y="403\.68"[^>]*font-family="Georgia[^"]*"[^>]*font-size="10"[^>]*font-weight="bold"/)
    expect(svg).toContain('From: July 2026')
  })

  it('keeps the logo clear of the masthead rule', () => {
    // The lockup is anchored at its top and grows downward, so enlarging it
    // walks it into the rule below - at 0.54 with the rule where 0.46 left it,
    // the lockup would have ended 0.4pt past the line and struck through it.
    // Read from the rendered SVG so the scale, the top and the rule cannot be
    // changed independently without this noticing.
    const lockup = svg.match(/translate\([\d.]+, ([\d.]+)\) scale\(([\d.]+)\)/)
    expect(lockup).not.toBeNull()

    const LOCKUP_UNITS_TALL = 134
    const bottom = Number(lockup![1]) + LOCKUP_UNITS_TALL * Number(lockup![2])

    const rule = svg.match(/<line x1="320\.945" y1="([\d.]+)"/)
    expect(rule).not.toBeNull()

    expect(bottom).toBeLessThan(Number(rule![1]))
  })

  it('keeps the programme clear of the seal', () => {
    // Read out of the rendered SVG rather than restated from the constants,
    // so moving either one is what fails this rather than editing it.
    //
    // A long programme name reaches within about 150pt of the left edge, and
    // the seal sits under that. Its glyphs sit above its baseline, so the
    // whole line clears the seal as long as the baseline is above the seal's
    // topmost point - which is what the rim cut through when the seal moved up.
    // Anchored on the comment the template writes above it, so this cannot
    // pick up the heading's outline groups, which are also translated. The
    // optional <a> is the link wrapper, present when the seal has an address.
    const seal = svg.match(/Verification seal[\s\S]*?-->\s*(?:<a [^>]*>)?<g transform="translate\((\d+(?:\.\d+)?), (\d+(?:\.\d+)?)\)"/)
    expect(seal).not.toBeNull()

    const sealTop = Number(seal![2]) - 62
    const programme = svg.match(/y="(\d+(?:\.\d+)?)"[^>]*font-size="18(?:\.0)?"/)
    expect(programme).not.toBeNull()

    expect(Number(programme![1])).toBeLessThanOrEqual(sealTop)
  })

  it('sets the signature block in the serif, with the title unbolded', () => {
    expect(svg).toMatch(/y="526\.08"[^>]*font-family="Georgia[^"]*"[^>]*font-size="10"[^>]*font-weight="bold"/)
    expect(svg).toContain('TOM CRUISE')
    expect(svg).toMatch(/y="537.28"[^>]*font-family="Georgia[^"]*"[^>]*font-size="8"/)
    expect(svg).toContain('Manager')
    // A bold title under a bold name is not a hierarchy.
    expect(svg).not.toMatch(/y="537.28"[^>]*font-weight="bold"/)
  })

  it('centres the signature block and sets it low on the panel', () => {
    // On the page axis, like everything else the template sets, and below the
    // seal's band rather than beside it - level and centred, the two crowded
    // each other across a 49pt gap.
    expect(svg).toContain('translate(420.945, 0)')
    expect(svg).toMatch(/y="537.28"[^>]*font-size="8"/)
  })

  it('keeps the block on that line when there is no signatory title', () => {
    // It hangs upward from the bottom line, so a missing title moves the name
    // and the rule down rather than leaving a gap where the title would be.
    return generateCertificateSvg({ ...SAMPLE, signatoryTitle: undefined }).then((untitled) => {
      expect(untitled).toMatch(/y="537.28"[^>]*font-size="10"[^>]*font-weight="bold"/)
      expect(untitled).toContain('TOM CRUISE')
    })
  })

  it('wraps the seal in a link when there is an address for it', () => {
    return generateCertificateSvg({ ...SAMPLE, credentialUrl: 'https://example.test/credentials/urn%3Auuid%3Aabc' }).then((linked) => {
      // Both spellings: SVG 2 readers take href, SVG 1.1 readers only
      // xlink:href, and a certificate gets opened in whatever someone has.
      expect(linked).toContain('<a href="https://example.test/credentials/urn%3Auuid%3Aabc"')
      expect(linked).toContain('xlink:href="https://example.test/credentials/urn%3Auuid%3Aabc"')
      // Wrapping the seal, not something near it.
      expect(linked).toMatch(/<a [^>]*><g transform="translate\(155, 449\.28\)">/)
    })
  })

  it('draws the seal unwrapped when there is no address', () => {
    // An <a> pointing nowhere is worse than no <a>.
    expect(svg).not.toContain('<a ')
    expect(svg).toContain('<g transform="translate(155, 449.28)">')
  })

  it('leaves the seal as the one element off the centre axis', () => {
    // Deliberate, and the only one: a single considered break reads as
    // composition, where two half-balanced elements read as neither symmetric
    // nor intentionally offset.
    expect(svg).toContain('translate(155, 449.28)')
  })

  it('cuts the name’s rule to the citation’s measure', () => {
    // It ran 500pt wide over a citation about 420 - a line noticeably wider
    // than the block inside it.
    expect(svg).toContain('<line x1="210.945" y1="291.28" x2="630.945" y2="291.28"')
  })

  it('closes the masthead with one rule below the lockup', () => {
    // Two segments used to flank the lockup's own tagline, level with it,
    // decorating the middle of the masthead rather than closing it.
    expect(svg).toContain('<line x1="320.945" y1="124" x2="520.945" y2="124"')
    expect(svg).not.toMatch(/y1="107"/)
  })

  it('keeps a long name inside the rule rather than flush to it', () => {
    // Alex Brush at 80pt is far wider than the measure for a name this long,
    // so it scales down - to 384, not to the rule's own 420, which would put
    // the glyphs against both ends.
    return generateCertificateSvg({ ...SAMPLE, recipientName: 'Bartholomew Fitzgerald' }).then((long) => {
      const path = long.match(/<path d="([^"]+)" fill="#152a63"/)
      expect(path).not.toBeNull()

      // Every command in the outline starts with an x, so the extremes of
      // those are the extremes of the drawn name.
      const xs = [...path![1].matchAll(/[MLCQ]\s*(-?\d+(?:\.\d+)?)/g)].map(m => Number(m[1]))
      expect(xs.length).toBeGreaterThan(20)
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(210.945)
      expect(Math.max(...xs)).toBeLessThanOrEqual(630.945)
    })
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
    // x1="210.945" is CENTRE-210: the rule under the name, not the masthead's.
    const rule = svg.match(/<line x1="210.945" y1="(\d+(?:\.\d+)?)"/)
    expect(rule).not.toBeNull()
    expect(Number(rule![1])).toBeGreaterThanOrEqual(289.3)
  })

  it('spells the heading correctly, unlike the reference artwork', () => {
    // Certificate1.pdf reads "Cretificate" in both the heading and the
    // introduction. The outlines were corrected when they were lifted.
    expect(svg).not.toContain('Cretificate')
  })
})
