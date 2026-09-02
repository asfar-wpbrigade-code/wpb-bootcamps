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
import { PDFDocument } from 'pdf-lib'

/** Certificate artboard, in points. Exactly US Letter landscape. */
export const CERTIFICATE_WIDTH = 792
export const CERTIFICATE_HEIGHT = 612

/**
 * 4x gives roughly 288 DPI at Letter size, which prints without visible
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
 * @param {number} [scale] - Multiplier over the 792x612 artboard
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

/**
 * A single Letter-landscape page holding the rendered certificate.
 *
 * The page is sized in points to match the artboard exactly, so the image
 * lands edge to edge with no scaling and prints at its intended size.
 *
 * @param {string} svg - A complete certificate SVG document
 * @param {object} [meta] - Title and author for the PDF's document properties
 */
export async function renderCertificatePdf(
  svg: string,
  meta: { title?: string, author?: string } = {},
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

  if (meta.title) pdf.setTitle(meta.title)
  if (meta.author) pdf.setAuthor(meta.author)
  pdf.setProducer('WPBrigade Credentials')

  return Buffer.from(await pdf.save())
}
