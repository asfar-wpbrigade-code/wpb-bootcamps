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
import { generateVerificationSealSvg } from './verification-seal'
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

/** The hairline-ruled panel everything sits inside. */
const PANEL_LEFT = 38
const PANEL_RIGHT = WIDTH - PANEL_LEFT

/**
 * The composition is symmetric about the page's vertical axis, and the
 * verification seal is the one thing deliberately outside it.
 *
 * Every set element — the masthead, the heading, the introduction, the name
 * and its rule, the citation, the programme, the date and the signature —
 * centres on `CENTRE`. The seal sits low and left of that column on purpose:
 * a single considered break reads as composition, where two half-balanced
 * elements read as neither symmetric nor intentionally offset.
 *
 * The widths taper accordingly — the masthead rule is the narrowest, the
 * name's rule the widest, and the rule is cut to the citation's measure so the
 * block beneath it does not sit inside a line noticeably wider than itself.
 *
 * The seal's diameter is not ours to shrink: the QR inside it has to survive
 * being scanned off paper, which is what it is sized for.
 */
const SEAL_CENTRE_X = 155
const SEAL_CENTRE_Y = 466
const SEAL_DIAMETER = 124

/** Half-width of the rule under the recipient's name, cut to the citation. */
const NAME_RULE_REACH = 210

/**
 * Distance from the citation's last baseline to the programme's.
 *
 * It was 42.5, putting the programme on y=414 — exactly where the seal's top
 * point used to be, tangent and clear by nothing. Moving the seal up 10pt put
 * its rim through the first two letters of a programme name long enough to
 * reach that far left ("WORDPRESS DEVELOPMENT FUNDAMENTALS" runs to x=148; the
 * seal now reaches x=209 at that height). A short name never noticed.
 *
 * Lifting the programme and its date by 14pt clears the seal's new top with
 * 4pt to spare, and keeps the programme at its full 18pt — the alternative was
 * shrinking long programme names to fit beside the seal, which costs the
 * second most important line on the certificate to save a decoration.
 */
const PROGRAMME_DROP = 28.5

/**
 * Where the signature block ends.
 *
 * The block hangs upward from this line, so an achievement with no signatory
 * title moves the rule and the name down rather than leaving a gap where the
 * title would have been. It sits below the seal's own band, low on the panel,
 * rather than beside it — centred and level, the two would have crowded each
 * other across a 49pt gap.
 */
const SIGNATURE_BOTTOM_Y = 554
const SIGNATURE_NAME_DROP = 16
const SIGNATURE_TITLE_DROP = 11.2

/**
 * The masthead: the logo lockup, then a single rule beneath it.
 *
 * The rule used to be two segments flanking the lockup's own tagline, level
 * with it. One continuous line below the whole lockup separates the masthead
 * from the heading instead of decorating the middle of it.
 */
const LOGO_TOP_Y = 44
const LOGO_SCALE = 0.46
const MASTHEAD_RULE_Y = 116
const MASTHEAD_RULE_REACH = 100

const NAVY = '#152a63'
const BRAND_BLUE = '#3458ea'
const INK = '#2f3542'
const MUTED = '#6b7280'

/**
 * Every word set on the panel is in the serif.
 *
 * The reference mixed the two: the programme in Georgia Bold and the date
 * directly beneath it in Roboto Bold, then the signatory in Roboto Bold again.
 * Adjacent lines of the same rank in two different families is the kind of
 * thing that reads as "assembled" rather than designed, and it is the single
 * most visible inconsistency on the certificate.
 *
 * The sans survives only inside artwork that carries its own typography — the
 * logo lockup, whose wordmark is outlines, and the verification seal's
 * legends, which belong to the medal. Neither is body text and neither is set
 * here.
 */
const SERIF = "Georgia, Gelasio, 'Times New Roman', serif"

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
 * Where the recipient's name sits, and how big it wants to be.
 *
 * Exported because the name is drawn as outlines - the script face cannot be
 * assumed installed anywhere - and outlines carry no text. The PDF's invisible
 * text layer has to put the name back at the same place, and reads these
 * rather than repeating the numbers (certificate-render.ts).
 */
export const NAME_METRICS = {
  baselineY: 289.5,
  // Inside the rule rather than exactly as wide as it: a long name scaled to
  // the full measure touches both ends, which reads as cramped rather than
  // fitted. 18pt of air either side.
  maxWidth: NAME_RULE_REACH * 2 - 36,
  idealSize: 80,
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
  const citationTop = 335.5
  const CITATION_LEADING = 18
  const programmeY = citation.length > 0
    ? citationTop + (citation.length - 1) * CITATION_LEADING + PROGRAMME_DROP
    : 378
  const dateY = programmeY + 20.4

  const nameOutline = renderNameOutline(
    recipientName,
    CENTRE,
    NAME_METRICS.baselineY,
    NAME_METRICS.maxWidth,
    NAME_METRICS.idealSize
  )
  const achievementSize = fitFontSize(achievementName.toUpperCase(), 470, 18, 0.62)

  const verificationSeal = generateVerificationSealSvg(verifyUrl, SEAL_DIAMETER)

  // The block hangs upward from the shared bottom edge, so losing the title
  // moves the rule and the name down rather than leaving the band lopsided.
  const signatureNameY = signatoryTitle ? SIGNATURE_BOTTOM_Y - SIGNATURE_TITLE_DROP : SIGNATURE_BOTTOM_Y
  const signatureRuleY = signatureNameY - SIGNATURE_NAME_DROP

  const watermarkTile = 132
  const watermarkScale = 0.42

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img"
     aria-label="Certificate of completion awarded to ${escapeXml(recipientName)} for ${escapeXml(achievementName)}">
  <defs>
    <!-- The emblem, tiled faintly across the panel -->
    <pattern id="watermark" x="0" y="0" width="${watermarkTile}" height="${watermarkTile}" patternUnits="userSpaceOnUse">
      <g transform="scale(${watermarkScale})" opacity="0.035" fill="${BRAND_BLUE}">
        ${EMBLEM_PATHS.join('\n        ')}
      </g>
      <g transform="translate(${watermarkTile / 2}, ${watermarkTile / 2}) scale(${watermarkScale})" opacity="0.035" fill="${BRAND_BLUE}">
        ${EMBLEM_PATHS.join('\n        ')}
      </g>
    </pattern>
  </defs>

  <!-- Navy border -->
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${NAVY}" />
  <rect x="26" y="22" width="${WIDTH - 52}" height="${HEIGHT - 44}" fill="#ffffff" />

  <!-- Panel, watermarked, inside a hairline rule -->
  <rect x="38" y="34" width="${WIDTH - 76}" height="${HEIGHT - 68}" fill="#fbfbfd" />
  <rect x="38" y="34" width="${WIDTH - 76}" height="${HEIGHT - 68}" fill="url(#watermark)" />
  <rect x="38" y="34" width="${WIDTH - 76}" height="${HEIGHT - 68}" fill="none" stroke="${INK}" stroke-width="0.8" />

  <!-- Logo lockup, with one rule closing the masthead beneath it -->
  <g transform="translate(${CENTRE - (LOGO_VIEWBOX.width * LOGO_SCALE) / 2}, ${LOGO_TOP_Y}) scale(${LOGO_SCALE})">
    <g fill="${BRAND_BLUE}">
      ${EMBLEM_PATHS.join('\n      ')}
    </g>
    <g fill="#191A1E">
      ${WORDMARK_PATHS.join('\n      ')}
    </g>
  </g>
  <line x1="${CENTRE - MASTHEAD_RULE_REACH}" y1="${MASTHEAD_RULE_Y}" x2="${CENTRE + MASTHEAD_RULE_REACH}" y2="${MASTHEAD_RULE_Y}" stroke="${MUTED}" stroke-width="0.7" />

  <!-- Heading, as outlines lifted from the source artwork -->
  <g fill="${INK}">${HEADING_PATHS}</g>
  <text x="${CENTRE}" y="205" font-family="${SERIF}" font-size="10" font-style="italic" text-anchor="middle" fill="${MUTED}">This Certificate is Proudly Presented to</text>

  <!-- Recipient, drawn as outlines so the script survives any renderer -->
  <path d="${nameOutline}" fill="${NAVY}" />
  <line x1="${CENTRE - NAME_RULE_REACH}" y1="308" x2="${CENTRE + NAME_RULE_REACH}" y2="308" stroke="${MUTED}" stroke-width="0.7" />

  <!-- Citation -->
  ${citation.map((line, index) => `<text x="${CENTRE}" y="${citationTop + index * CITATION_LEADING}" font-family="${SERIF}" font-size="10" font-style="italic" text-anchor="middle" fill="${MUTED}">${escapeXml(line)}</text>`).join('\n  ')}

  <!-- Programme -->
  <text x="${CENTRE}" y="${programmeY}" font-family="${SERIF}" font-size="${achievementSize.toFixed(1)}" font-weight="bold" letter-spacing="1.2" text-anchor="middle" fill="${NAVY}">${escapeXml(achievementName.toUpperCase())}</text>
  <text x="${CENTRE}" y="${dateY}" font-family="${SERIF}" font-size="10" font-weight="bold" text-anchor="middle" fill="${INK}">${escapeXml(dateLine)}</text>

  <!-- Verification seal. Its frame, legends and QR all come from
       verification-seal.ts; only where it sits is decided here. -->
  <g transform="translate(${SEAL_CENTRE_X}, ${SEAL_CENTRE_Y})">${verificationSeal}</g>

  <!-- Signature block, on the centre axis at the foot of the panel -->
  <g transform="translate(${CENTRE}, 0)">
    ${signatureImageDataUri
      ? `<image href="${signatureImageDataUri}" x="-85" y="${signatureRuleY - 61.5}" width="170" height="46" preserveAspectRatio="xMidYMax meet" />`
      : ''}
    <line x1="-95" y1="${signatureRuleY}" x2="95" y2="${signatureRuleY}" stroke="${INK}" stroke-width="0.8" />
    <text x="0" y="${signatureNameY}" font-family="${SERIF}" font-size="10" font-weight="bold" letter-spacing="0.6" text-anchor="middle" fill="${INK}">${escapeXml((signatoryName || issuerName || '').toUpperCase())}</text>
    ${signatoryTitle
      ? `<text x="0" y="${SIGNATURE_BOTTOM_Y}" font-family="${SERIF}" font-size="8" text-anchor="middle" fill="${MUTED}">${escapeXml(signatoryTitle)}</text>`
      : ''}
  </g>

  <!-- Credential id, small, for anyone checking by hand -->
  <text x="${WIDTH - 52}" y="${HEIGHT - 46}" font-family="${SERIF}" font-size="6" text-anchor="end" fill="#a8aeb9">${escapeXml(credentialId)}</text>
</svg>`
}
