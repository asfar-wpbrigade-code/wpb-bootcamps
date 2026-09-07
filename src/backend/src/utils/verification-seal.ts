/**
 * The verification seal - a gold-framed QR code carrying the credential's
 * verification URL, drawn as an SVG fragment for certificate-template.ts.
 *
 * The design comes from qr_gold.py at the repository root, which is where it
 * was worked out: a struck-medal frame (a wide gold band with a specular
 * sweep, a hairline ring inside it, curved legends top and bottom, accent
 * stars at the sides) around a dotted QR code with a "WPB" mark punched
 * through the middle. Every proportion below is the fraction of the seal's
 * diameter that script uses, so the two stay comparable.
 *
 * Three things are done differently here, because SVG is not a raster:
 *
 *  - Gold. The script sweeps its gradient by angle, one pie slice at a time.
 *    SVG has no conic gradient, but it does not need one: on a ring, a linear
 *    gradient laid across the circle varies as cos(theta - axis), and the
 *    script's two-lobed sin(2*theta + phase) is exactly that squared. So the
 *    same colour lands at the same angle from one linear gradient per palette,
 *    with the stops re-placed from t onto position (see angularSweepGradient).
 *
 *  - The legends are real text on an arc, stretched to the span with
 *    textLength, rather than glyphs stamped one at a time.
 *
 *  - The clear zone behind the mark is a fixed number of modules rather than a
 *    fraction of the symbol. The script sizes it proportionally and then
 *    shrinks it until a decoder confirms the result still scans; there is no
 *    decoder in this process, so the zone is instead pinned to the size the
 *    mark actually needs. That is also the safer of the two: as a longer URL
 *    pushes the symbol to a higher version, a fixed fraction swallows an
 *    ever-larger count of modules and eventually the alignment patterns that
 *    sit near the centre, which is what makes the script's 0.32 fail outright
 *    at versions 13 and 18. A fixed count shrinks as a share of the symbol
 *    instead. See __tests__/verification-seal.test.ts, which decodes the
 *    result back across the range of URL lengths.
 */
import QRCode from 'qrcode'

/** Matches certificate-template.ts, so the legends set in the same face. */
const SANS = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const TOP_LEGEND = 'CLICK OR SCAN TO VERIFY'
const BOTTOM_LEGEND = 'W P B R I G A D E'

/**
 * Every length here is a fraction of the seal's diameter.
 *
 * The radii tile the annulus outside the QR without overlapping: the wide band
 * owns the outer edge, a hairline ring sits just inside it, and the legends and
 * accent stars occupy the space below that. The lower bound is set by the QR,
 * whose content is a square reaching 0.442 from the centre at its corners - so
 * nothing may be drawn full-circle inside that radius, and the legends are
 * confined to the angles where the square is only 0.3125 away (see LEGEND_SPAN).
 */
const CONTENT_RATIO = 0.625
const BAND_WIDTH = 0.026
/**
 * A solid dark-gold hairline on each edge of the band. The sweep's pale
 * highlights fade almost into the white page where they meet the band's edge,
 * which leaves the outline looking soft; capping both edges with the deep gold
 * keeps the band crisply defined all the way round, the way a struck seal has
 * a raised rim.
 */
const BAND_EDGE_WIDTH = 0.0026
const INNER_RING_OUTER_RADIUS = 0.468
const INNER_RING_WIDTH = 0.005
const STAR_SIZE = 0.082
const STAR_RADIUS = 0.412
const LEGEND_RADIUS = 0.435
const LEGEND_SIZE = 0.044

/**
 * Half the arc each legend spans, in degrees.
 *
 * The QR content is a square, not a circle, so its distance from the centre
 * varies with angle: least at its flat edges, greatest at its corners by a
 * factor of root two. A span swinging more than 45 degrees off a cardinal
 * direction sweeps across a corner, where the square suddenly reaches far
 * enough out to pass under a finder pattern even though there was clearance at
 * the edges. Staying under 45 keeps each legend over a flat edge, where the gap
 * to the ring is largest and roughly constant.
 */
const LEGEND_SPAN = 38

type Rgb = readonly [number, number, number]
/** A colour and the point in the sweep, 0 (darkest) to 1 (brightest), it sits at. */
type GoldStop = readonly [number, Rgb]

/**
 * Flat gold reads as mustard-yellow, not metal. What sells metal is a specular
 * sweep: the same hue cycling dark - mid - bright - near-white as the eye
 * travels round the ring, as if one light source were raking across a polished
 * bevel. Two stop sets, because one range cannot do both jobs. SHEEN spans the
 * full dark-to-highlight range for the wide band, where the pale end reads as a
 * glint; DEEP is floored much darker for the small elements - the curved
 * legends and the accent stars - whose thin strokes and points would disappear
 * against white paper if the sweep ever went pale there. Even SHEEN's brightest
 * stop stays a definite gold rather than near-white, because a highlight that
 * reaches the page colour makes the band look like it breaks open where the
 * glint falls instead of catching the light.
 */
const GOLD_SHEEN_STOPS: readonly GoldStop[] = [
  [0.00, [110, 68, 12]],
  [0.30, [163, 118, 34]],
  [0.60, [205, 163, 66]],
  [0.82, [238, 208, 122]],
  [1.00, [249, 229, 164]],
]
const GOLD_DEEP_STOPS: readonly GoldStop[] = [
  [0.00, [90, 54, 8]],
  [0.45, [140, 98, 24]],
  [1.00, [196, 154, 60]],
]

/**
 * Where the highlights fall, as the bearing of the gradient's axis in degrees.
 *
 * qr_gold.py brightens with sin(2*theta + 35), which peaks at 27.5 and 207.5
 * degrees - the upper-left / lower-right diagonal, like a raking studio light.
 * A linear gradient across the circle instead varies as cos(theta - axis), so
 * putting the axis a quarter turn off those peaks brightens at the same two
 * bearings.
 */
const SWEEP_AXIS_DEG = 27.5 + 90

const QUIET_ZONE = 4

/**
 * The symbol is forced no smaller than this, as qr_gold.py does, so the clear
 * zone stays a modest share of it - at version 6 the mark's 27 columns already
 * take up two thirds of the symbol's width, and anything smaller could not hold
 * the mark at all.
 */
const MIN_VERSION = 6

/** The strongest error correction, since the mark erases modules. */
const ERROR_CORRECTION = 'H'

/**
 * Plain circles read as cleaner and less cluttered than rounded squares at this
 * density. Both radii are a fraction of the module: the mark's dots are bigger
 * and tighter-packed so it pops against the data instead of blending in.
 *
 * DOT_RADIUS has a floor that is not aesthetic. A circle of radius r inks
 * pi*r^2 of its module, so the 0.31 this used to be covered 30% of each dark
 * module and left a gap between neighbours. A decoder thresholds the image it
 * is given, and every scale but 1:1 averages a module's ink with the paper
 * around it - so a "dark" module arrived as light grey and read as white. The
 * certificate's QR only decoded from the raw 2x PNG at 100%; on screen, in
 * print, or from any resize it failed. The ratio is scale-invariant, which is
 * why the symptom did not improve with a larger seal, and why the failures
 * came and went with rasterisation rather than with size.
 *
 * At 0.45 a dot inks 64% of its module and neighbours touch. Measured against
 * jsQR, the whole certificate then decodes down to a 1200px render instead of
 * only at 1584px, and to 900px once the payload is the short URL below.
 */
export const DOT_RADIUS = 0.45
/**
 * Kept above DOT_RADIUS so the mark still reads as strokes against the data
 * rather than dissolving into it - at 0.5 its dots meet, which is what makes
 * the glyphs continuous. It was 0.42, chosen when the data dots were 0.31.
 */
export const MARK_DOT_RADIUS = 0.5

/**
 * Hand-drawn dot-matrix glyphs for the centre mark. A real typeface's curves
 * and diagonals do not land cleanly on a grid this coarse - downsampling one
 * produces messy, half-filled cells at the edges. These are designed directly
 * on the grid instead, so every lit cell is a deliberate, unambiguous dot and
 * the letterforms stay crisp.
 */
const MARK_GLYPHS: Record<string, readonly string[]> = {
  W: ['10001',
      '10001',
      '10001',
      '10101',
      '10101',
      '11011',
      '10001'],
  P: ['11110',
      '10001',
      '10001',
      '11110',
      '10000',
      '10000',
      '10000'],
  B: ['11110',
      '10001',
      '10001',
      '11110',
      '10001',
      '10001',
      '11110'],
}
const MARK_TEXT = 'WPB'
const MARK_GLYPH_GAP = 1
/** Clear modules left round the mark. Wider than tall, as the mark is. */
const MARK_MARGIN_COLS = 5
const MARK_MARGIN_ROWS = 2

const DOT_COLOUR = '#000000'
const PAPER = '#ffffff'

/** Trims the noise off computed coordinates; SVG needs no more precision. */
const n = (value: number): number => Number(value.toFixed(3))

const rad = (deg: number): number => (deg * Math.PI) / 180

/** Samples a stop list at `t` in [0, 1], blending linearly between stops. */
const sampleGold = (stops: readonly GoldStop[], t: number): Rgb => {
  const clamped = Math.min(Math.max(t, 0), 1)

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]
    const [t1, c1] = stops[i + 1]

    if (clamped <= t1) {
      const f = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0)
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ]
    }
  }

  return stops[stops.length - 1][1]
}

/**
 * A linear gradient reproducing qr_gold.py's angular sweep on a ring.
 *
 * A point at angle theta on a ring of the circle's own radius sits at position
 * p = (1 + cos(theta - axis)) / 2 along an axis-aligned gradient spanning that
 * circle, and with the axis a quarter turn off the highlights the script's
 * brightness works out as t = 1 - (2p - 1)^2. That inverts exactly: a colour
 * the script places at t belongs at p = 0.5 +/- sqrt(1 - t) / 2. So each stop
 * is emitted twice, once either side of the midpoint, and no sampling of the
 * curve is needed - every stop lands at precisely the bearing it does in the
 * script.
 */
const angularSweepGradient = (id: string, stops: readonly GoldStop[], radius: number): string => {
  const axis = rad(SWEEP_AXIS_DEG)
  const dx = radius * Math.cos(axis)
  const dy = radius * Math.sin(axis)

  const positions = new Set<number>()
  for (const [t] of stops) {
    const half = Math.sqrt(Math.max(0, 1 - t)) / 2
    positions.add(0.5 - half)
    positions.add(0.5 + half)
  }

  const markup = [...positions]
    .sort((a, b) => a - b)
    .map(p => {
      const [r, g, b] = sampleGold(stops, 1 - (2 * p - 1) ** 2)
      return `<stop offset="${n(p)}" stop-color="rgb(${r},${g},${b})" />`
    })
    .join('')

  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"`
    + ` x1="${n(-dx)}" y1="${n(-dy)}" x2="${n(dx)}" y2="${n(dy)}">${markup}</linearGradient>`
}

/**
 * The lit cells of MARK_TEXT set in MARK_GLYPHS, as (column, row) pairs, with
 * the size of the grid they occupy.
 */
const markCells = (): { cells: Array<readonly [number, number]>, cols: number, rows: number } => {
  const cells: Array<readonly [number, number]> = []
  let cursor = 0

  for (const character of MARK_TEXT) {
    const glyph = MARK_GLYPHS[character]

    glyph.forEach((bits, row) => {
      bits.split('').forEach((bit, column) => {
        if (bit === '1') cells.push([cursor + column, row])
      })
    })

    cursor += glyph[0].length + MARK_GLYPH_GAP
  }

  return { cells, cols: cursor - MARK_GLYPH_GAP, rows: MARK_GLYPHS[MARK_TEXT[0]].length }
}

/**
 * A five-pointed star as polygon points, centred on (cx, cy).
 *
 * The inner-to-outer vertex radius is 1/phi^2, which gives the classic
 * pentagram proportions rather than a puffy star.
 */
const starPoints = (cx: number, cy: number, size: number): string => {
  const outer = (size / 2) * 0.95
  const inner = outer * 0.382

  return Array.from({ length: 10 }, (_, i) => {
    const angle = rad(-90 + i * 36)
    const r = i % 2 === 0 ? outer : inner
    return `${n(cx + r * Math.cos(angle))},${n(cy + r * Math.sin(angle))}`
  }).join(' ')
}

/** An annulus, drawn as a stroked circle so the gold can be a gradient. */
const ring = (outerRadius: number, width: number, paint: string): string =>
  `<circle cx="0" cy="0" r="${n(outerRadius - width / 2)}" fill="none"`
  + ` stroke="${paint}" stroke-width="${n(width)}" />`

/**
 * The QR itself: dots for data, pebbled finder patterns, and the brand mark in
 * a clear zone punched through the centre. Drawn into a `side` by `side` box
 * centred on the origin, quiet zone included.
 */
const renderQrBody = (verifyUrl: string, side: number): string => {
  // qrcode picks the smallest version the data fits in; the design wants a
  // floor under that, and asking for a version too small for the data throws.
  const smallest = QRCode.create(verifyUrl, { errorCorrectionLevel: ERROR_CORRECTION })
  const qr = smallest.version >= MIN_VERSION
    ? smallest
    : QRCode.create(verifyUrl, { errorCorrectionLevel: ERROR_CORRECTION, version: MIN_VERSION })

  const { size, data } = qr.modules
  const box = side / (size + QUIET_ZONE * 2)
  const origin = -side / 2
  // Module column and row to the centre of its dot.
  const cx = (column: number): number => origin + (QUIET_ZONE + column + 0.5) * box
  const cy = (row: number): number => origin + (QUIET_ZONE + row + 0.5) * box

  const FINDER_SIZE = 7
  const finders = [[0, 0], [0, size - FINDER_SIZE], [size - FINDER_SIZE, 0]]
  const inFinder = (row: number, column: number): boolean => finders.some(
    ([fr, fc]) => row >= fr && row < fr + FINDER_SIZE && column >= fc && column < fc + FINDER_SIZE,
  )

  // The symbol's module count is always odd, and the clear zone is odd in both
  // directions - an odd-sized mark inside equal margins - so it centres on the
  // middle module exactly, with no half-modules bleeding in at its edges.
  const mark = markCells()
  const centre = (size - 1) / 2
  const halfClearCols = (mark.cols - 1) / 2 + MARK_MARGIN_COLS
  const halfClearRows = (mark.rows - 1) / 2 + MARK_MARGIN_ROWS
  const inClearZone = (row: number, column: number): boolean =>
    Math.abs(column - centre) <= halfClearCols && Math.abs(row - centre) <= halfClearRows

  const dots: string[] = []
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (!data[row * size + column]) continue
      if (inFinder(row, column) || inClearZone(row, column)) continue
      dots.push(`<circle cx="${n(cx(column))}" cy="${n(cy(row))}" r="${n(box * DOT_RADIUS)}" />`)
    }
  }

  // Pebble-like rounded corners rather than the strict-spec sharp squares, to
  // match the rounded data dots.
  const finderPattern = ([row, column]: number[]): string => {
    const x = origin + (QUIET_ZONE + column) * box
    const y = origin + (QUIET_ZONE + row) * box
    const outer = FINDER_SIZE * box
    const inner = outer - box * 2
    const pupil = box * 3

    return `<rect x="${n(x)}" y="${n(y)}" width="${n(outer)}" height="${n(outer)}"`
      + ` rx="${n(outer * 0.24)}" fill="${DOT_COLOUR}" />`
      + `<rect x="${n(x + box)}" y="${n(y + box)}" width="${n(inner)}" height="${n(inner)}"`
      + ` rx="${n(inner * 0.24)}" fill="${PAPER}" />`
      + `<rect x="${n(x + box * 2)}" y="${n(y + box * 2)}" width="${n(pupil)}" height="${n(pupil)}"`
      + ` rx="${n(pupil * 0.28)}" fill="${DOT_COLOUR}" />`
  }

  // The clear zone is already free of data dots and the seal's face is white,
  // so the mark only has to stamp its own dots onto it.
  const markOriginCol = centre - (mark.cols - 1) / 2
  const markOriginRow = centre - (mark.rows - 1) / 2
  const markDots = mark.cells.map(([column, row]) =>
    `<circle cx="${n(cx(markOriginCol + column))}" cy="${n(cy(markOriginRow + row))}"`
    + ` r="${n(box * MARK_DOT_RADIUS)}" />`)

  return `<g fill="${DOT_COLOUR}">${dots.join('')}${markDots.join('')}</g>
    ${finders.map(finderPattern).join('\n    ')}`
}

/**
 * @param {string} verifyUrl - The URL the QR encodes, and the page the legend
 *   invites the holder to open
 * @param {number} diameter - The seal's width, in the certificate's units
 * @returns {string} An SVG fragment centred on its own origin
 */
export const generateVerificationSealSvg = (verifyUrl: string, diameter: number): string => {
  const radius = diameter / 2
  const legendRadius = diameter * LEGEND_RADIUS
  const legendArc = rad(LEGEND_SPAN * 2) * legendRadius

  // Sweeping clockwise - the first angle the smaller - sets each glyph upright
  // with its head away from the centre, which is what the upper arc wants;
  // sweeping the other way turns the glyphs to face the centre, which is what
  // keeps the lower legend reading left to right rather than upside down.
  const legendArcPath = (id: string, fromDeg: number, toDeg: number): string => {
    const at = (deg: number): string =>
      `${n(legendRadius * Math.cos(rad(deg)))} ${n(legendRadius * Math.sin(rad(deg)))}`

    return `<path id="${id}" fill="none" d="M ${at(fromDeg)}`
      + ` A ${n(legendRadius)} ${n(legendRadius)} 0 0 ${toDeg > fromDeg ? 1 : 0} ${at(toDeg)}" />`
  }

  const legend = (pathId: string, text: string): string =>
    `<text font-family="${SANS}" font-size="${n(diameter * LEGEND_SIZE)}" font-weight="bold"`
    + ` fill="url(#sealDeep)" text-anchor="middle" dominant-baseline="central">`
    + `<textPath href="#${pathId}" startOffset="50%" textLength="${n(legendArc)}"`
    + ` lengthAdjust="spacing">${text}</textPath></text>`

  const star = (bearingDeg: number): string =>
    `<polygon points="${starPoints(
      diameter * STAR_RADIUS * Math.cos(rad(bearingDeg)),
      diameter * STAR_RADIUS * Math.sin(rad(bearingDeg)),
      diameter * STAR_SIZE,
    )}" fill="url(#sealDeep)" />`

  const bandWidth = diameter * BAND_WIDTH
  const edgeWidth = diameter * BAND_EDGE_WIDTH

  return `<g>
    <defs>
      ${angularSweepGradient('sealSheen', GOLD_SHEEN_STOPS, radius)}
      ${angularSweepGradient('sealDeep', GOLD_DEEP_STOPS, radius)}
      ${legendArcPath('sealLegendTop', -90 - LEGEND_SPAN, -90 + LEGEND_SPAN)}
      ${legendArcPath('sealLegendBottom', 90 + LEGEND_SPAN, 90 - LEGEND_SPAN)}
    </defs>

    <!-- The seal's face. Opaque, so the panel's watermark cannot show through
         behind the QR and cost it contrast. -->
    <circle cx="0" cy="0" r="${n(radius)}" fill="${PAPER}" />

    <!-- Gold frame: the band, a rim on each of its edges, and the hairline
         ring inside it -->
    ${ring(radius, bandWidth, 'url(#sealSheen)')}
    ${ring(radius, edgeWidth, 'url(#sealDeep)')}
    ${ring(radius - bandWidth + edgeWidth, edgeWidth, 'url(#sealDeep)')}
    ${ring(diameter * INNER_RING_OUTER_RADIUS, diameter * INNER_RING_WIDTH, 'url(#sealSheen)')}

    <!-- Accent stars at 3 and 9 o'clock, filling the space the legends leave
         bare. They take the deep gold: a star's points are thin enough that
         wherever the sweep ran pale it lost its silhouette and read as a smudge
         rather than a shape. -->
    ${star(0)}
    ${star(180)}

    ${legend('sealLegendTop', TOP_LEGEND)}
    ${legend('sealLegendBottom', BOTTOM_LEGEND)}

    ${renderQrBody(verifyUrl, diameter * CONTENT_RATIO)}
  </g>`
}
