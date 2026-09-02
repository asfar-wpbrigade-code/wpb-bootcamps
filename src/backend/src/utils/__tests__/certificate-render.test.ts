import { PDFDocument } from 'pdf-lib'
import {
  CERTIFICATE_HEIGHT,
  CERTIFICATE_WIDTH,
  renderCertificatePdf,
  renderCertificatePng,
} from '../certificate-render'
import { generateCertificateSvg } from '../certificate-template'

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
    expect(png.readUInt32BE(16)).toBe(CERTIFICATE_WIDTH * 2)
    expect(png.readUInt32BE(20)).toBe(CERTIFICATE_HEIGHT * 2)
  })

  it('produces a single Letter-landscape PDF page', async () => {
    const pdf = await renderCertificatePdf(svg, { title: 'Certificate', author: 'WPBrigade' })

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')

    const parsed = await PDFDocument.load(pdf)
    expect(parsed.getPageCount()).toBe(1)

    const { width, height } = parsed.getPage(0).getSize()
    expect(Math.round(width)).toBe(CERTIFICATE_WIDTH)
    expect(Math.round(height)).toBe(CERTIFICATE_HEIGHT)
    expect(parsed.getTitle()).toBe('Certificate')
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
