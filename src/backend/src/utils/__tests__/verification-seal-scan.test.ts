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
const FRONTEND = 'https://bootcamp.wpbrigade.com'

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
async function scanCertificateAt(width: number, credentialId = CREDENTIAL_ID): Promise<string | null> {
  const svg = await generateCertificateSvg({
    ...CERTIFICATE,
    credentialId,
    verifyUrl: qrPayloadUrl(FRONTEND, credentialId),
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
    expect(await scanCertificateAt(1584)).toBe(`HTTPS://BOOTCAMP.WPBRIGADE.COM/V/A4F6F3B3C56F41F7A4AD8D2BF7EE79F8`)
  })

  it('still decodes below full resolution, which is where it used to fail', async () => {
    // Before the dot radius was fixed, everything below 1584 failed outright,
    // so this is the assertion that guards it. 1300px is roughly a certificate
    // filling a laptop screen.
    //
    // Across several credential ids rather than one, because a single id says
    // very little here. How far below the served size a symbol survives depends
    // on its own bit pattern - the mask the encoder picks, and how that falls
    // under the mark punched through the centre - so it varies from credential
    // to credential. This asserted 1000px and 1200px against one id until
    // 2026-09-15, and passed: measured across six ids on the domain of the day,
    // 1200px held for only three of them. It was one fixture's luck being read
    // as a property of the design.
    //
    // 1300px is where all six decode. The seal is unchanged - same version 6
    // symbol, same 41x41 modules, same physical size - and at the size the PNG
    // endpoint actually serves, every id decodes with room to spare.
    const ids = [
      CREDENTIAL_ID,
      'urn:uuid:0c4e5a1b-9d3f-4c8a-9f21-7ab6d5e40912',
      'urn:uuid:2f8a1c3e-0000-4000-8000-abcdefabcdef',
      'urn:uuid:ffffffff-eeee-4ddd-8ccc-bbbbaaaa9999',
    ]

    for (const id of ids) {
      expect(await scanCertificateAt(1300, id)).not.toBeNull()
    }
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
