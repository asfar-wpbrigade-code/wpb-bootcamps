/**
 * Rasterises the certificate SVG and wraps it in a PDF.
 *
 * The SVG is the single source of truth for the design - see
 * certificate-template.ts. Nothing here knows the layout; it only converts.
 *
 * Fonts are supplied explicitly and system fonts are switched off. The
 * template's text is set in CSS stacks ("Georgia, Gelasio, ..." and
 * "'Segoe UI', Roboto, ..."), and the production image is node:22-alpine,
 * which ships no fonts at all - so left to its own devices the renderer would
 * substitute something arbitrary and a certificate generated on a developer's
 * Windows machine would not match one generated in production. Gelasio is
 * metric-compatible with Georgia and Roboto is already named in the sans
 * stack, so loading exactly these reproduces the intended design everywhere.
 */
import { Resvg } from '@resvg/resvg-js'
import { PDFDocument, PDFFont, PDFName, PDFString, StandardFonts } from 'pdf-lib'
import { HEADING_TEXT } from './certificate-assets/heading'
import { CANVAS, HEADING_PLACEMENT, NAME_METRICS, SEAL_METRICS } from './certificate-template'

/**
 * Read from the template rather than restated here.
 *
 * These were a second copy of 792 x 612, which was harmless only for as long
 * as the canvas never changed. It is A4 now, and a stale copy would have put
 * the PDF page and the SVG at different sizes - the artwork scaled to fit a
 * page it no longer matches.
 */
export const CERTIFICATE_WIDTH = CANVAS.width
export const CERTIFICATE_HEIGHT = CANVAS.height

/**
 * 4x gives roughly 288 DPI at A4 size, which prints without visible
 * softness. Higher scales grow the file faster than they improve the print.
 */
const PDF_SCALE = 4

/** 2x is plenty for sharing a certificate on screen or in a chat. */
const PNG_SCALE = 2

const FONT_MODULES = [
  '@expo-google-fonts/gelasio/400Regular/Gelasio_400Regular.ttf',
  '@expo-google-fonts/gelasio/400Regular_Italic/Gelasio_400Regular_Italic.ttf',
  '@expo-google-fonts/gelasio/700Bold/Gelasio_700Bold.ttf',
  '@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf',
  '@expo-google-fonts/roboto/700Bold/Roboto_700Bold.ttf',
]

/**
 * Resolved once and reused. resvg takes paths rather than buffers, and reads
 * them itself; require.resolve is what turns the package specifiers above into
 * real locations under node_modules.
 */
let fontFiles: string[] | null = null

function getFontFiles(): string[] {
  if (!fontFiles) {
    fontFiles = FONT_MODULES.map(specifier => require.resolve(specifier))
  }

  return fontFiles
}

/**
 * @param {string} svg - A complete certificate SVG document
 * @param {number} [scale] - Multiplier over the A4 artboard
 */
export function renderCertificatePng(svg: string, scale: number = PNG_SCALE): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: Math.round(CERTIFICATE_WIDTH * scale) },
    font: {
      fontFiles: getFontFiles(),
      // Deterministic output: without this the renderer would pick up whatever
      // the host happens to have, so local and production would diverge.
      loadSystemFonts: false,
      defaultFontFamily: 'Gelasio',
      serifFamily: 'Gelasio',
      sansSerifFamily: 'Roboto',
    },
  })

  return Buffer.from(resvg.render().asPng())
}

/** One string to place in the PDF's invisible text layer. */
interface TextItem {
  text: string
  /** SVG user units, measured from the top-left of the artboard. */
  x: number
  y: number
  size: number
  anchor: 'start' | 'middle' | 'end'
  serif: boolean
  bold: boolean
  italic: boolean
  /** Cap on the drawn width, for a string the template itself fits. */
  maxWidth?: number
}

/**
 * The `<text>` elements of a certificate SVG, with their positions.
 *
 * A regex over XML is usually a mistake; here the input is our own generated
 * output from certificate-template.ts, one element per line, no namespaces and
 * no nesting inside `<text>`. What it does have to handle is `<g
 * transform="translate(...)">`, because the signature block and the seal are
 * positioned by their group and their text carries `x="0"`.
 *
 * Text on a `<textPath>` is skipped: the seal's legends run around a circle
 * and have no x/y of their own, so there is nowhere flat to put them. They are
 * decorative - "VERIFIED CREDENTIAL" and the like - and the credential id they
 * sit beside is captured separately.
 */
export function extractSvgTextItems(svg: string): TextItem[] {
  const items: TextItem[] = []
  const offsets: Array<{ x: number, y: number }> = []
  let cursor = 0

  const attr = (tag: string, name: string): string | null => {
    const match = tag.match(new RegExp(`${name}="([^"]*)"`))
    return match ? match[1] : null
  }

  while (cursor < svg.length) {
    const next = svg.indexOf('<', cursor)
    if (next === -1) break

    if (svg.startsWith('</g', next)) {
      offsets.pop()
      cursor = next + 3
      continue
    }

    if (svg.startsWith('<g', next) && /^<g[\s>]/.test(svg.slice(next, next + 3))) {
      const end = svg.indexOf('>', next)
      const tag = svg.slice(next, end + 1)
      const translate = tag.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/)
      const parent = offsets[offsets.length - 1] ?? { x: 0, y: 0 }

      offsets.push(translate
        ? { x: parent.x + Number(translate[1]), y: parent.y + Number(translate[2]) }
        : { x: parent.x, y: parent.y })

      cursor = end + 1
      continue
    }

    if (svg.startsWith('<text', next)) {
      const openEnd = svg.indexOf('>', next)
      const closeStart = svg.indexOf('</text>', openEnd)

      if (openEnd === -1 || closeStart === -1) break

      const tag = svg.slice(next, openEnd + 1)
      const content = svg.slice(openEnd + 1, closeStart)
      const offset = offsets[offsets.length - 1] ?? { x: 0, y: 0 }

      // No markup inside means a plain string; anything else is a textPath.
      if (!content.includes('<')) {
        const family = attr(tag, 'font-family') || ''
        const anchor = attr(tag, 'text-anchor')

        items.push({
          text: unescapeXml(content),
          x: Number(attr(tag, 'x') || 0) + offset.x,
          y: Number(attr(tag, 'y') || 0) + offset.y,
          size: Number(attr(tag, 'font-size') || 10),
          anchor: anchor === 'middle' || anchor === 'end' ? anchor : 'start',
          serif: isSerifStack(family),
          bold: attr(tag, 'font-weight') === 'bold',
          italic: attr(tag, 'font-style') === 'italic',
        })
      }

      cursor = closeStart + 7
      continue
    }

    cursor = next + 1
  }

  return items
}

/**
 * Whether a CSS font stack is a serif one, judged by its first family.
 *
 * The template sets stacks, not faces: `"Georgia, Gelasio, 'Times New Roman',
 * serif"` and `"'Segoe UI', Roboto, Helvetica, Arial, sans-serif"`. Searching
 * the whole stack for "serif" matches `sans-serif` too, which put the date,
 * the signatory and the credential id in Times - invisibly, so the only
 * symptom was a selection rectangle slightly the wrong width. The first family
 * is the one a renderer actually uses, and the one to judge by.
 */
function isSerifStack(family: string): boolean {
  const first = family.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  return /^(georgia|gelasio|times|serif)/i.test(first)
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Drops what a standard PDF font cannot encode.
 *
 * The invisible layer is drawn in Times/Helvetica, which are WinAnsi and so
 * cover Latin-1 and no more. A name in Arabic or Chinese would make
 * `drawText` throw and take the whole PDF with it, so those characters are
 * dropped from the *search* layer only - the visible certificate renders them
 * correctly, because resvg draws real glyphs from the loaded fonts.
 *
 * Embedding a Unicode subset would fix it properly, at the cost of a font in
 * every PDF and a dependency on a face that covers the scripts in question.
 * Worth revisiting when a recipient actually needs it.
 */
function toWinAnsi(text: string): string {
  return [...text]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code === 0x20 || (code >= 0x21 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)
    })
    .join('')
    .trim()
}

/**
 * A single Letter-landscape page holding the rendered certificate.
 *
 * The page is sized in points to match the artboard exactly, so the image
 * lands edge to edge with no scaling and prints at its intended size.
 *
 * Over that image goes an invisible text layer, the way a scanned document is
 * made searchable. The visible certificate is unchanged - it is still the
 * rasterised SVG, which is what keeps the design identical to the PNG and the
 * web view - but the text is now selectable, copyable, findable with Ctrl-F
 * and legible to a screen reader, where before the whole page was one picture.
 *
 * Two of the strings on the certificate are drawn as vector outlines rather
 * than text and cannot be recovered from the SVG at all: the heading, whose
 * face is licensed and cannot be embedded, and the recipient's name, whose
 * script face cannot be assumed installed anywhere. They are the two a reader
 * is most likely to search for, so they are placed from their known metrics -
 * `HEADING_PLACEMENT`/`HEADING_TEXT` and `NAME_METRICS` - with the name passed
 * in by the caller.
 *
 * @param {string} svg - A complete certificate SVG document
 * @param {object} [meta] - Document properties, the outlined name, and the
 *   address the seal links to
 */
export async function renderCertificatePdf(
  svg: string,
  meta: { title?: string, author?: string, recipientName?: string, verifyUrl?: string } = {},
): Promise<Buffer> {
  const png = renderCertificatePng(svg, PDF_SCALE)

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([CERTIFICATE_WIDTH, CERTIFICATE_HEIGHT])
  const embedded = await pdf.embedPng(png)

  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: CERTIFICATE_WIDTH,
    height: CERTIFICATE_HEIGHT,
  })

  const fonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    serifItalic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }

  const pick = (item: TextItem): PDFFont => {
    if (item.serif) {
      if (item.bold) return fonts.serifBold
      if (item.italic) return fonts.serifItalic
      return fonts.serif
    }
    return item.bold ? fonts.sansBold : fonts.sans
  }

  const items: TextItem[] = [
    {
      text: HEADING_TEXT,
      // The template translates the outlines to centre them on the page, so
      // this reads where they end up rather than where they were drawn.
      x: HEADING_PLACEMENT.centreX,
      y: HEADING_PLACEMENT.baselineY,
      size: 30,
      anchor: 'middle',
      serif: true,
      bold: false,
      italic: false,
      maxWidth: HEADING_PLACEMENT.width,
    },
    ...extractSvgTextItems(svg),
  ]

  if (meta.recipientName) {
    items.push({
      text: meta.recipientName,
      x: CERTIFICATE_WIDTH / 2,
      y: NAME_METRICS.baselineY,
      size: NAME_METRICS.idealSize,
      anchor: 'middle',
      serif: true,
      bold: false,
      italic: true,
      // The template shrinks a long name to fit; so does this, so a selection
      // over the name lines up with the glyphs beneath it.
      maxWidth: NAME_METRICS.maxWidth,
    })
  }

  for (const item of items) {
    const text = toWinAnsi(item.text)
    if (!text) continue

    const font = pick(item)

    // Fit first, then measure: a size reduced to fit changes the width the
    // anchor is resolved against.
    let size = item.size
    if (item.maxWidth) {
      const measured = font.widthOfTextAtSize(text, size)
      if (measured > item.maxWidth) size = size * (item.maxWidth / measured)
    }

    const width = font.widthOfTextAtSize(text, size)
    const x = item.anchor === 'middle'
      ? item.x - width / 2
      : item.anchor === 'end' ? item.x - width : item.x

    page.drawText(text, {
      x,
      // SVG measures y down from the top and puts the baseline there; PDF
      // measures up from the bottom, and drawText's y is also the baseline.
      y: CERTIFICATE_HEIGHT - item.y,
      size,
      font,
      // Invisible, not absent. The glyphs beneath come from the raster image;
      // these exist to be selected, searched and read aloud.
      opacity: 0,
    })
  }

  if (meta.verifyUrl) {
    // The seal's own legend reads "CLICK OR SCAN TO VERIFY", and until now
    // only the second half of that was true: the QR scanned, and nothing
    // anywhere was clickable. A PDF link annotation over the seal makes the
    // legend honest for anyone reading the certificate on a screen, which is
    // most of them.
    //
    // The rect is the seal's bounding box, flipped into PDF coordinates - SVG
    // measures y down from the top, PDF up from the bottom - and read from
    // SEAL_METRICS so it cannot drift away from where the seal is drawn.
    //
    // It is a box over a circle, so the corners are live a few points outside
    // the rim. That is the shape PDF link annotations are: a QuadPoints
    // outline would not be honoured by most readers, and a cursor in the
    // corner of the seal is a fair guess at meaning to click it.
    const radius = SEAL_METRICS.diameter / 2
    const left = SEAL_METRICS.centreX - radius
    const right = SEAL_METRICS.centreX + radius
    const top = CERTIFICATE_HEIGHT - (SEAL_METRICS.centreY - radius)
    const bottom = CERTIFICATE_HEIGHT - (SEAL_METRICS.centreY + radius)

    const link = pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [left, bottom, right, top],
      // No visible border: the seal is the affordance, and a reader-drawn
      // rectangle around it would sit on the artwork.
      Border: [0, 0, 0],
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(meta.verifyUrl),
      },
    })

    page.node.set(PDFName.of('Annots'), pdf.context.obj([link]))
  }

  if (meta.title) pdf.setTitle(meta.title)
  if (meta.author) pdf.setAuthor(meta.author)
  pdf.setProducer('WPBrigade Credentials')

  return Buffer.from(await pdf.save())
}
