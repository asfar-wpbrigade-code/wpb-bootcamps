import { Resvg } from '@resvg/resvg-js'
import jsQRModule from 'jsqr'
import { PNG } from 'pngjs'
import { generateCertificateSvg } from '../certificate-template'
import { qrPayloadUrl } from '../verify-url'

/**
 * The certificate's QR code has to be readable by a phone, which no assertion
 * about the SVG's contents can establish - the symbol was structurally valid
 * the whole time it was failing in people's hands. So these decode it.
 *
 * The failure this guards against: the data modules were drawn as circles of
 * radius 0.31 modules, inking 30% of each module and leaving gaps between
 * neighbours, so any scale but 1:1 averaged a dark module into light grey and
 * the decoder read it as white. The certificate only decoded from the raw 2x
 * PNG. Because the ratio is scale-invariant, it did not improve with a larger
 * seal, and nothing in the SVG looked wrong.
 *
 * The thresholds below are deliberately generous - they assert the property
 * (readable well below full resolution), not the exact pixel at which this
 * particular decoder gives up.
 */
const jsQR = (jsQRModule as any).default ?? jsQRModule

const CREDENTIAL_ID = 'urn:uuid:a4f6f3b3-c56f-41f7-a4ad-8d2bf7ee79f8'
const FRONTEND = 'https://bootcamp.labspk.com'

const CERTIFICATE = {
  recipientName: 'Ali Asfar',
  achievementName: 'SEO Fundamentals',
  issuerName: 'WPBrigade',
  issueDate: '2026-09-07T00:00:00.000Z',
  credentialId: CREDENTIAL_ID,
  description: 'Completed the programme.',
  signatoryName: 'Hasan Shahid',
  signatoryTitle: 'Programme Director',
}

/** Rasterises the certificate at a given pixel width and reads its QR code. */
async function scanCertificateAt(width: number): Promise<string | null> {
  const svg = await generateCertificateSvg({
    ...CERTIFICATE,
    verifyUrl: qrPayloadUrl(FRONTEND, CREDENTIAL_ID),
  })

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
  const image = PNG.sync.read(Buffer.from(png))
  const result = jsQR(new Uint8ClampedArray(image.data), image.width, image.height)

  return result ? result.data : null
}

// Rasterising the certificate several times over is real work.
jest.setTimeout(120000)

describe('the QR code on the certificate', () => {
  it('decodes at the size the PNG endpoint serves', async () => {
    expect(await scanCertificateAt(1584)).toBe(`HTTPS://BOOTCAMP.LABSPK.COM/V/A4F6F3B3C56F41F7A4AD8D2BF7EE79F8`)
  })

  it('still decodes well below full resolution, which is where it used to fail', async () => {
    // 1200px is roughly a certificate filling a laptop screen. Before the dot
    // radius was fixed, everything below 1584 failed.
    expect(await scanCertificateAt(1200)).not.toBeNull()
    expect(await scanCertificateAt(1000)).not.toBeNull()
  })

  it('carries a URL that resolves to the credential, not the raw identifier', async () => {
    const decoded = await scanCertificateAt(1584)

    expect(decoded).toMatch(/^HTTPS?:\/\//)
    // The frontend redirects /v/<hex> to the credential page; see the
    // frontend's server/middleware/short-verify.ts.
    expect(decoded).toContain('/V/')
    expect(decoded).not.toContain('URN')
  })
})
