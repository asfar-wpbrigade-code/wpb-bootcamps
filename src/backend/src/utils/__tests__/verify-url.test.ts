import { credentialPageUrl, qrPayloadUrl } from '../verify-url'

const ID = 'urn:uuid:a4f6f3b3-c56f-41f7-a4ad-8d2bf7ee79f8'
const HEX = 'A4F6F3B3C56F41F7A4AD8D2BF7EE79F8'

describe('credentialPageUrl', () => {
  it('percent-encodes the identifier, colons included', () => {
    expect(credentialPageUrl('https://bootcamp.labspk.com', ID))
      .toBe('https://bootcamp.labspk.com/credentials/urn%3Auuid%3Aa4f6f3b3-c56f-41f7-a4ad-8d2bf7ee79f8')
  })

  it('does not double the slash when the origin carries one', () => {
    expect(credentialPageUrl('https://bootcamp.labspk.com/', ID))
      .toBe('https://bootcamp.labspk.com/credentials/urn%3Auuid%3Aa4f6f3b3-c56f-41f7-a4ad-8d2bf7ee79f8')
  })
})

describe('qrPayloadUrl', () => {
  it('shortens and uppercases a urn:uuid credential', () => {
    expect(qrPayloadUrl('https://bootcamp.labspk.com', ID))
      .toBe(`HTTPS://BOOTCAMP.LABSPK.COM/V/${HEX}`)
  })

  it('keeps a port', () => {
    expect(qrPayloadUrl('http://localhost:3000', ID))
      .toBe(`HTTP://LOCALHOST:3000/V/${HEX}`)
  })

  it('encodes in QR alphanumeric mode, which is the point of the uppercasing', async () => {
    const QRCode = (await import('qrcode')).default
    const short = QRCode.create(qrPayloadUrl('https://bootcamp.labspk.com', ID), { errorCorrectionLevel: 'H' })
    const long = QRCode.create(credentialPageUrl('https://bootcamp.labspk.com', ID), { errorCorrectionLevel: 'H' })

    expect(short.segments.every(segment => segment.mode.id === 'Alphanumeric')).toBe(true)
    // Fewer modules across the same seal means larger modules, which is the
    // whole reason this function exists.
    expect(short.modules.size).toBeLessThan(long.modules.size)
  })

  it('falls back to the full URL for an identifier that is not a urn:uuid', () => {
    const imported = 'https://issuer.example.org/credentials/abc123'

    expect(qrPayloadUrl('https://bootcamp.labspk.com', imported))
      .toBe(credentialPageUrl('https://bootcamp.labspk.com', imported))
  })

  it('falls back when the site is served from a sub-path, whose case must not change', () => {
    expect(qrPayloadUrl('https://example.org/badges', ID))
      .toBe(credentialPageUrl('https://example.org/badges', ID))
  })

  it('falls back rather than throwing on an unparseable origin', () => {
    expect(qrPayloadUrl('not a url', ID)).toBe(credentialPageUrl('not a url', ID))
  })
})
