/**
 * Certificate template.
 *
 * A reproduction of WPBrigade's printed certificate design (Certificate1.pdf)
 * as a dynamic SVG: navy frame, tiled emblem watermark, the logo lockup, the
 * recipient's name in script, and a seal carrying a live QR code.
 *
 * The canvas is 792 x 612 - US Letter landscape at 72dpi, matching the source
 * artwork, so coordinates measured from it transfer directly.
 *
 * Two pieces of the design are drawn as outlines rather than set in a font:
 * the heading (see certificate-assets/heading.ts) and the recipient's name.
 * Both faces would otherwise have to be present on whatever renders the file,
 * and a certificate gets viewed through an <img> tag, converted to PNG, and
 * opened offline after download - contexts where a missing font degrades
 * silently to a default serif. Outlines always draw.
 *
 * The remaining text uses Georgia, the design's body face, installed on
 * essentially every Windows and macOS machine, with Gelasio - metrically
 * identical and openly licensed - named after it for everything else. Because
 * the two share metrics, line breaks hold either way.
 */

import opentype from 'opentype.js'
import { generateQrCodeSvg } from './qr-code'
import { EMBLEM_PATHS, LOGO_VIEWBOX, WORDMARK_PATHS } from './certificate-assets/logo'
import { ALEX_BRUSH_BASE64 } from './certificate-assets/alex-brush'
import { HEADING_PATHS } from './certificate-assets/heading'

interface CertificateData {
  recipientName: string
  achievementName: string
  issuerName: string
  issueDate: string
  credentialId: string
  badgeImageUrl?: string
  verifyUrl: string
  /** Achievement description, printed as the citation paragraph. */
  description?: string
  /** Signature image for the achievement's signatory, as a data URI. */
  signatureImageDataUri?: string
  signatoryName?: string
  signatoryTitle?: string
  /** Programme run dates, printed as "From: ... - ..." when both are set. */
  programmeStartDate?: string
  programmeEndDate?: string
}

const WIDTH = 792
const HEIGHT = 612
const CENTRE = WIDTH / 2

const NAVY = '#152a63'
const BRAND_BLUE = '#3458ea'
const INK = '#2f3542'
const MUTED = '#6b7280'

const SERIF = "Georgia, Gelasio, 'Times New Roman', serif"
const SANS = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/**
 * Alex Brush, parsed once and reused across requests.
 *
 * Kept lazy so the cost is paid on the first certificate rather than at boot,
 * and skipped entirely on instances that never render one.
 */
let scriptFont: any = null

function getScriptFont() {
  if (!scriptFont) {
    const buffer = Buffer.from(ALEX_BRUSH_BASE64, 'base64')
    scriptFont = opentype.parse(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    )
  }

  return scriptFont
}

/** XML-escapes text destined for an SVG text node. */
function escapeXml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Draws the recipient's name centred, shrinking it to fit the width available.
 *
 * The width is measured from the font rather than estimated, so a long name is
 * sized exactly - it is the one line on the certificate that must never run
 * past the rule beneath it.
 */
function renderNameOutline(
  name: string,
  centreX: number,
  baselineY: number,
  maxWidth: number,
  idealSize: number
): string {
  const font = getScriptFont()
  const measured = font.getAdvanceWidth(name, idealSize)
  const size = measured > maxWidth ? idealSize * (maxWidth / measured) : idealSize
  const width = font.getAdvanceWidth(name, size)

  return font.getPath(name, centreX - width / 2, baselineY, size).toPathData(2)
}

/**
 * Shrinks a line of ordinary text until it fits.
 *
 * SVG cannot measure text, so this estimates from an average glyph width for
 * the face and size. Erring generous: a slightly small line reads as
 * considered, an overflowing one reads as broken.
 */
function fitFontSize(text: string, maxWidth: number, idealSize: number, widthRatio: number): number {
  const estimated = text.length * idealSize * widthRatio

  if (estimated <= maxWidth) return idealSize

  return Math.max(idealSize * 0.45, maxWidth / (text.length * widthRatio))
}

/**
 * Breaks the citation into lines, since SVG will not wrap text itself.
 * Anything past the last line is elided rather than silently dropped.
 */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text).trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word

    if (candidate.length > maxChars && current) {
      lines.push(current)
      current = word
      if (lines.length === maxLines) break
    }
    else {
      current = candidate
    }
  }

  if (lines.length < maxLines && current) lines.push(current)

  const rendered = lines.join(' ')
  if (lines.length === maxLines && words.join(' ').length > rendered.length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:]$/, '')}...`
  }

  return lines
}

function formatDate(value?: string): string {
  if (!value) return ''

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "July 2026 - August 2026", as the design has it. */
function formatProgrammePeriod(start?: string, end?: string): string {
  const monthYear = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  }

  const from = start ? monthYear(start) : ''
  const to = end ? monthYear(end) : ''

  if (from && to) return `${from} – ${to}`

  return from || ''
}

export const generateCertificateSvg = async (data: CertificateData): Promise<string> => {
  const {
    recipientName,
    achievementName,
    issuerName,
    issueDate,
    credentialId,
    verifyUrl,
    description,
    signatureImageDataUri,
    signatoryName,
    signatoryTitle,
    programmeStartDate,
    programmeEndDate,
  } = data

  const period = formatProgrammePeriod(programmeStartDate, programmeEndDate)
  // The design prints a programme period. With no dates set on the
  // achievement, the issue date is the honest substitute rather than a
  // half-empty line.
  const dateLine = period ? `From: ${period}` : `Issued: ${formatDate(issueDate)}`

  const citation = description ? wrapText(description, 92, 3) : []
  const citationTop = 336
  const programmeY = citation.length > 0 ? citationTop + citation.length * 17 + 26 : 372
  const dateY = programmeY + 24

  const nameOutline = renderNameOutline(recipientName, CENTRE, 292, 500, 76)
  const achievementSize = fitFontSize(achievementName, 430, 22, 0.6)

  const qrSize = 72
  const qrCodeSvg = await generateQrCodeSvg(verifyUrl, qrSize)

  const watermarkTile = 132
  const watermarkScale = 0.42
  const logoScale = 0.46

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img"
     aria-label="Certificate of completion awarded to ${escapeXml(recipientName)} for ${escapeXml(achievementName)}">
  <defs>
    <!-- The emblem, tiled faintly across the panel -->
    <pattern id="watermark" x="0" y="0" width="${watermarkTile}" height="${watermarkTile}" patternUnits="userSpaceOnUse">
      <g transform="scale(${watermarkScale})" opacity="0.05" fill="${BRAND_BLUE}">
        ${EMBLEM_PATHS.join('\n        ')}
      </g>
      <g transform="translate(${watermarkTile / 2}, ${watermarkTile / 2}) scale(${watermarkScale})" opacity="0.05" fill="${BRAND_BLUE}">
        ${EMBLEM_PATHS.join('\n        ')}
      </g>
    </pattern>

    <linearGradient id="sealGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f6e27a" />
      <stop offset="45%" stop-color="#d4af37" />
      <stop offset="100%" stop-color="#b8860b" />
    </linearGradient>
  </defs>

  <!-- Navy border -->
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${NAVY}" />
  <rect x="26" y="22" width="${WIDTH - 52}" height="${HEIGHT - 44}" fill="#ffffff" />

  <!-- Panel, watermarked, inside a hairline rule -->
  <rect x="38" y="34" width="${WIDTH - 76}" height="${HEIGHT - 68}" fill="#fbfbfd" />
  <rect x="38" y="34" width="${WIDTH - 76}" height="${HEIGHT - 68}" fill="url(#watermark)" />
  <rect x="38" y="34" width="${WIDTH - 76}" height="${HEIGHT - 68}" fill="none" stroke="${INK}" stroke-width="0.8" />

  <!-- Logo lockup. The tagline is part of the artwork; the rules flank it -->
  <g transform="translate(${CENTRE - (LOGO_VIEWBOX.width * logoScale) / 2}, 50) scale(${logoScale})">
    <g fill="${BRAND_BLUE}">
      ${EMBLEM_PATHS.join('\n      ')}
    </g>
    <g fill="#191A1E">
      ${WORDMARK_PATHS.join('\n      ')}
    </g>
  </g>
  <line x1="${CENTRE - 118}" y1="107" x2="${CENTRE - 52}" y2="107" stroke="${MUTED}" stroke-width="0.7" />
  <line x1="${CENTRE + 52}" y1="107" x2="${CENTRE + 118}" y2="107" stroke="${MUTED}" stroke-width="0.7" />

  <!-- Heading, as outlines lifted from the source artwork -->
  <g fill="${INK}">${HEADING_PATHS}</g>
  <text x="${CENTRE}" y="209" font-family="${SERIF}" font-size="13" font-style="italic" text-anchor="middle" fill="${MUTED}">This certificate is proudly presented to</text>

  <!-- Recipient, drawn as outlines so the script survives any renderer -->
  <path d="${nameOutline}" fill="${NAVY}" />
  <line x1="${CENTRE - 250}" y1="308" x2="${CENTRE + 250}" y2="308" stroke="${MUTED}" stroke-width="0.7" />

  <!-- Citation -->
  ${citation.map((line, index) => `<text x="${CENTRE}" y="${citationTop + index * 17}" font-family="${SERIF}" font-size="11.5" font-style="italic" text-anchor="middle" fill="${MUTED}">${escapeXml(line)}</text>`).join('\n  ')}

  <!-- Programme -->
  <text x="${CENTRE}" y="${programmeY}" font-family="${SERIF}" font-size="${achievementSize.toFixed(1)}" font-weight="bold" text-anchor="middle" fill="${NAVY}">“${escapeXml(achievementName)}”</text>
  <text x="${CENTRE}" y="${dateY}" font-family="${SERIF}" font-size="12" font-weight="bold" text-anchor="middle" fill="${INK}">${escapeXml(dateLine)}</text>

  <!-- Verification seal -->
  <g transform="translate(152, 476)">
    <circle cx="0" cy="0" r="62" fill="url(#sealGold)" />
    <circle cx="0" cy="0" r="52" fill="#ffffff" />
    <circle cx="0" cy="0" r="52" fill="none" stroke="#b8860b" stroke-width="1.2" />
    <g transform="translate(${-qrSize / 2}, ${-qrSize / 2 + 5})">${qrCodeSvg}</g>
    <text x="0" y="-36" font-family="${SANS}" font-size="4.6" letter-spacing="0.3" text-anchor="middle" fill="#8a6d1f">CLICK OR SCAN TO VERIFY</text>
    <text x="0" y="45" font-family="${SANS}" font-size="4.6" letter-spacing="0.7" text-anchor="middle" fill="#8a6d1f">WPBRIGADE</text>
  </g>

  <!-- Signature block -->
  <g transform="translate(${CENTRE + 128}, 0)">
    ${signatureImageDataUri
      ? `<image href="${signatureImageDataUri}" x="-85" y="452" width="170" height="46" preserveAspectRatio="xMidYMax meet" />`
      : ''}
    <line x1="-95" y1="506" x2="95" y2="506" stroke="${INK}" stroke-width="0.8" />
    <text x="0" y="522" font-family="${SANS}" font-size="10.5" font-weight="bold" letter-spacing="0.6" text-anchor="middle" fill="${INK}">${escapeXml((signatoryName || issuerName || '').toUpperCase())}</text>
    ${signatoryTitle
      ? `<text x="0" y="536" font-family="${SANS}" font-size="9" text-anchor="middle" fill="${MUTED}">${escapeXml(signatoryTitle)}</text>`
      : ''}
  </g>

  <!-- Credential id, small, for anyone checking by hand -->
  <text x="${WIDTH - 52}" y="${HEIGHT - 46}" font-family="${SANS}" font-size="6" text-anchor="end" fill="#a8aeb9">${escapeXml(credentialId)}</text>
</svg>`
}
