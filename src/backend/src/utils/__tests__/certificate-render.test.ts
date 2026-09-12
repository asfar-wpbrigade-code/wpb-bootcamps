import zlib from 'zlib'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import {
  CERTIFICATE_HEIGHT,
  CERTIFICATE_WIDTH,
  extractSvgTextItems,
  renderCertificatePdf,
  renderCertificatePng,
} from '../certificate-render'
import { HEADING_PLACEMENT, NAME_METRICS, SEAL_METRICS, generateCertificateSvg } from '../certificate-template'

/**
 * The text a PDF reader would find, with where it was placed.
 *
 * pdf-lib writes strings as hex inside a Flate-compressed content stream, so
 * neither the plain bytes nor a search for the words finds anything - which is
 * exactly the mistake to make when checking whether a text layer exists at
 * all. This inflates the streams and decodes the `Tm` / `Tj` pairs.
 */
function extractPdfTextPlacements(pdf: Buffer): Array<{ text: string, x: number, y: number }> {
  const placements: Array<{ text: string, x: number, y: number }> = []
  const marker = Buffer.from('stream')
  const endMarker = Buffer.from('endstream')

  for (let index = pdf.indexOf(marker); index !== -1; index = pdf.indexOf(marker, index + 1)) {
    let start = index + marker.length
    while (pdf[start] === 0x0d || pdf[start] === 0x0a) start++

    const end = pdf.indexOf(endMarker, start)
    if (end === -1) continue

    let content: string
    try {
      content = zlib.inflateSync(pdf.subarray(start, end)).toString('latin1')
    } catch {
      continue
    }

    const pattern = /1 0 0 1 ([-\d.]+) ([-\d.]+) Tm\s*<([0-9A-Fa-f]+)>\s*Tj/g
    for (const match of content.matchAll(pattern)) {
      placements.push({
        x: Number(match[1]),
        y: Number(match[2]),
        text: Buffer.from(match[3], 'hex').toString('latin1'),
      })
    }
  }

  return placements
}

function extractPdfText(pdf: Buffer): string {
  return extractPdfTextPlacements(pdf).map(placement => placement.text).join('\n')
}

const SAMPLE = {
  recipientName: 'Ada Lovelace',
  achievementName: 'Advanced WordPress Engineering',
  issuerName: 'WPBrigade',
  issueDate: '2026-08-01T00:00:00.000Z',
  credentialId: 'urn:uuid:2f8a1c3e-0000-4000-8000-abcdefabcdef',
  verifyUrl: 'https://bootcamp.labspk.com/credentials/urn:uuid:2f8a1c3e',
  description: 'Completed the advanced engineering track, covering performance, security and release process.',
  signatoryName: 'Grace Hopper',
  signatoryTitle: 'Programme Director',
}

// Rasterising at 4x is real work; the default 5s is not enough on a cold run.
jest.setTimeout(60000)

describe('certificate rendering', () => {
  let svg: string

  beforeAll(async () => {
    svg = await generateCertificateSvg(SAMPLE)
  })

  it('produces a PNG at the requested scale', () => {
    const png = renderCertificatePng(svg, 2)

    // PNG signature, then width/height as big-endian uint32 in the IHDR chunk.
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
    // Rounded, because A4's dimensions are not whole points: 841.89 x 2 is
    // 1683.78, and a raster is whole pixels.
    expect(png.readUInt32BE(16)).toBe(Math.round(CERTIFICATE_WIDTH * 2))
    expect(png.readUInt32BE(20)).toBe(Math.round(CERTIFICATE_HEIGHT * 2))
  })

  it('produces a single A4-landscape PDF page', async () => {
    const pdf = await renderCertificatePdf(svg, { title: 'Certificate', author: 'WPBrigade' })

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')

    // updateMetadata: false, or load() overwrites Producer with pdf-lib's own
    // value in memory and the assertion below tests pdf-lib rather than us.
    const parsed = await PDFDocument.load(pdf, { updateMetadata: false })
    expect(parsed.getPageCount()).toBe(1)

    const { width, height } = parsed.getPage(0).getSize()
    // Exactly A4: 841.89 x 595.28pt is 297 x 210mm. A rounded comparison would
    // have accepted a page 0.11pt out, and this is the assertion that says the
    // PDF will print on the paper it is meant for.
    expect(width).toBeCloseTo(CERTIFICATE_WIDTH, 2)
    expect(height).toBeCloseTo(CERTIFICATE_HEIGHT, 2)
    expect(width / 72 * 25.4).toBeCloseTo(297, 1)
    expect(height / 72 * 25.4).toBeCloseTo(210, 1)
    expect(parsed.getTitle()).toBe('Certificate')
    expect(parsed.getAuthor()).toBe('WPBrigade')
    expect(parsed.getProducer()).toBe('WPBrigade Credentials')
  })

  it('carries a searchable text layer over the raster image', async () => {
    // The visible certificate is a rasterised SVG, so without this layer the
    // whole page is one picture: nothing to select, nothing for Ctrl-F,
    // nothing for a screen reader.
    const pdf = await renderCertificatePdf(svg, { recipientName: SAMPLE.recipientName })
    const text = extractPdfText(pdf)

    // The two drawn as vector outlines - the heading's face is licensed and
    // the name's script face cannot be assumed installed - so neither can be
    // recovered from the SVG, and both are what a reader searches for.
    expect(text).toContain(SAMPLE.recipientName)
    expect(text).toContain('Certificate of Completion')

    // And the ordinary <text> elements, including the two positioned by their
    // group transform rather than their own x.
    expect(text).toContain('ADVANCED WORDPRESS ENGINEERING')
    expect(text).toContain('GRACE HOPPER')
    expect(text).toContain('Programme Director')
    expect(text).toContain(SAMPLE.credentialId)
  })

  it('places the text layer where the glyphs are', async () => {
    const pdf = await renderCertificatePdf(svg, { recipientName: SAMPLE.recipientName })
    const placements = extractPdfTextPlacements(pdf)

    const heading = placements.find(p => p.text === 'Certificate of Completion')
    const name = placements.find(p => p.text === SAMPLE.recipientName)

    // PDF y counts up from the bottom, SVG counts down from the top, and both
    // put the baseline there. Getting this wrong would mirror the layer
    // vertically and nothing would look amiss, since it is invisible.
    //
    // Both read from the template's own exported placements rather than from
    // literals: the heading's outlines are translated up and across to centre
    // them on the A4 canvas, and the name sits 16.72pt higher than the Letter
    // reference put it. The text layer has to land where they ended up.
    expect(heading!.y).toBeCloseTo(CERTIFICATE_HEIGHT - HEADING_PLACEMENT.baselineY, 1)
    expect(name!.y).toBeCloseTo(CERTIFICATE_HEIGHT - NAME_METRICS.baselineY, 1)

    // Both are centred, so each starts left of the centre line it is drawn on.
    expect(name!.x).toBeLessThan(CERTIFICATE_WIDTH / 2)
    expect(name!.x).toBeGreaterThan(CERTIFICATE_WIDTH / 2 - NAME_METRICS.maxWidth / 2 - 1)
  })

  it('keeps a name a standard PDF font cannot encode out of the layer only', async () => {
    // The layer is drawn in Times/Helvetica, which are WinAnsi. drawText
    // throws on anything outside it, which would have taken the whole PDF
    // with it - so those characters are dropped from the search layer. The
    // visible certificate still renders them: resvg draws real glyphs.
    const unicodeSvg = await generateCertificateSvg({ ...SAMPLE, recipientName: '李明 Ming' })
    const pdf = await renderCertificatePdf(unicodeSvg, { recipientName: '李明 Ming' })

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(extractPdfText(pdf)).toContain('Ming')
  })

  it('reads the text elements out of the SVG, transforms included', () => {
    const items = extractSvgTextItems(svg)
    const byText = (needle: string) => items.find(item => item.text.includes(needle))

    // x="0" inside <g transform="translate(420.945, 0)">: read without applying
    // the group's offset, this lands at the left edge of the page.
    expect(byText('GRACE HOPPER')!.x).toBeCloseTo(CERTIFICATE_WIDTH / 2, 1)
    expect(byText('GRACE HOPPER')!.y).toBeCloseTo(526.08, 1)

    // The seal's legends run along a <textPath> and have no x/y to use.
    expect(items.every(item => item.text.trim().length > 0)).toBe(true)

    // Every positioned line on the panel is Georgia now. The serif test still
    // has to be right about the sans, because "sans-serif" contains "serif"
    // and the seal's legends still use it - it is just no longer reachable
    // from anything this template positions.
    expect(byText('Issued:')!.serif).toBe(true)
    expect(byText('This Certificate is Proudly')!.serif).toBe(true)
    expect(items.every(item => item.serif)).toBe(true)
  })

  it('makes the seal a clickable link to the credential', async () => {
    // The seal's legend says "CLICK OR SCAN TO VERIFY". Until this, only the
    // scanning half was true in any format.
    const url = 'https://bootcamp.labspk.com/credentials/urn%3Auuid%3A2f8a1c3e'
    const pdf = await renderCertificatePdf(svg, { verifyUrl: url })
    const parsed = await PDFDocument.load(pdf, { updateMetadata: false })

    const annots = parsed.getPage(0).node.Annots()
    expect(annots?.size()).toBe(1)

    const link = annots!.lookup(0, PDFDict)
    expect(link.lookup(PDFName.of('Subtype'), PDFName)).toBe(PDFName.of('Link'))

    const action = link.lookup(PDFName.of('A'), PDFDict)
    expect(action.lookup(PDFName.of('URI'), PDFString).asString()).toBe(url)
  })

  it('puts that link exactly on the seal', async () => {
    // A link that misses the seal is worse than none: it either does nothing
    // where the artwork invites a click, or catches the text beside it.
    // PDF y counts up from the bottom, SVG down from the top, so the seal's
    // SVG box of 93..217 x 404..528 is 93..217 x 84..208 here.
    const pdf = await renderCertificatePdf(svg, { verifyUrl: 'https://example.test/c' })
    const parsed = await PDFDocument.load(pdf, { updateMetadata: false })

    const link = parsed.getPage(0).node.Annots()!.lookup(0, PDFDict)
    const rect = link.lookup(PDFName.of('Rect'), PDFArray)
    const [left, bottom, right, top] = [0, 1, 2, 3].map(i => (rect.lookup(i) as any).asNumber())

    const radius = SEAL_METRICS.diameter / 2
    expect(left).toBeCloseTo(SEAL_METRICS.centreX - radius, 1)
    expect(right).toBeCloseTo(SEAL_METRICS.centreX + radius, 1)
    expect(bottom).toBeCloseTo(CERTIFICATE_HEIGHT - (SEAL_METRICS.centreY + radius), 1)
    expect(top).toBeCloseTo(CERTIFICATE_HEIGHT - (SEAL_METRICS.centreY - radius), 1)
  })

  it('leaves the link out when no address is given', async () => {
    // Nothing to point at is not the same as pointing at nothing. pdf-lib
    // carries an empty Annots array on every page regardless, so the check is
    // that it holds no annotation rather than that the key is absent.
    const pdf = await renderCertificatePdf(svg, {})
    const parsed = await PDFDocument.load(pdf, { updateMetadata: false })

    expect(parsed.getPage(0).node.Annots()?.size() ?? 0).toBe(0)
  })

  it('rasterises the seal identically whether or not it is inside a link', async () => {
    // The risk the SVG link carries: resvg draws the PNG and the PDF's page
    // image, and a renderer that skipped <a> subtrees would drop the seal out
    // of both while the SVG kept looking right. It does not - the two rasters
    // are byte-for-byte the same - and this is what would catch a resvg
    // upgrade that changed its mind.
    const linked = await generateCertificateSvg({ ...SAMPLE, credentialUrl: 'https://example.test/c' })
    const plain = await generateCertificateSvg(SAMPLE)

    expect(Buffer.compare(renderCertificatePng(linked, 1), renderCertificatePng(plain, 1))).toBe(0)
  })

  it('renders without system fonts, so output does not depend on the host', () => {
    // The template sets text in "Georgia, Gelasio, ..." and "'Segoe UI',
    // Roboto, ...". Alpine has none of those; if the bundled fonts were not
    // being applied the glyphs would collapse and the file would be far
    // smaller than a page of rendered text.
    const png = renderCertificatePng(svg, 1)
    expect(png.byteLength).toBeGreaterThan(20000)
  })
})
