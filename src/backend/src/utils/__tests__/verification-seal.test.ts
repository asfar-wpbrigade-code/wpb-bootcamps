import QRCode from 'qrcode'
import { DOT_RADIUS, generateVerificationSealSvg, MARK_DOT_RADIUS } from '../verification-seal'

/**
 * The seal's proportions are qr_gold.py's, and these pin them as fractions of
 * the diameter so the port cannot drift from the design it came from.
 *
 * The clear zone is a fixed count of modules rather than the fraction of the
 * symbol qr_gold.py uses, because a fraction swallows an ever-larger count as
 * the version climbs and fails outright at versions 13 and 18. What is pinned
 * here is the budget that zone spends.
 *
 * This comment used to say that a decode test could not run in CI, because
 * "the pure-JavaScript decoders read the dotted modules unreliably at some
 * scales and fine at others". That observation was correct and the conclusion
 * drawn from it was wrong. The unreliability was not the decoder being less
 * forgiving than a phone: the data dots inked 30% of their modules, so at any
 * scale but 1:1 a dark module averaged to light grey and read as white, and
 * whether that tipped either way depended on where the module grid fell
 * against the pixel grid. jsQR was reporting a real defect, and the seal
 * shipped with a QR that phones could not read. It is tested by decoding now -
 * see verification-seal-scan.test.ts.
 */
const DIAMETER = 124

/**
 * Splits data dots from mark dots by radius. Derived from the two constants
 * rather than written as a literal, which is what broke when they changed:
 * a hardcoded 0.35 sat between 0.31 and 0.42 and below both of their
 * replacements, so every dot counted as part of the mark.
 */
const DOT_BOUNDARY = (DOT_RADIUS + MARK_DOT_RADIUS) / 2

/** A realistic verification URL: an origin, "/credentials/", and a urn:uuid. */
const URL = 'https://bootcamp.labspk.com/credentials/urn:uuid:0c4e5a1b-9d3f-4c8a-9f21-7ab6d5e40912'

/** The dots the QR is drawn with, as (x, y, radius) triples. */
const dots = (svg: string): Array<{ x: number, y: number, r: number }> => {
  const group = svg.match(/<g fill="#000000">(.*?)<\/g>/s)
  if (!group) throw new Error('the seal drew no QR dots')

  return [...group[1].matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"/g)]
    .map(([, x, y, r]) => ({ x: Number(x), y: Number(y), r: Number(r) }))
}

/** The symbol the seal draws: the smallest version that fits, floored at 6. */
const symbol = (verifyUrl: string) => {
  const smallest = QRCode.create(verifyUrl, { errorCorrectionLevel: 'H' })
  const version = Math.max(smallest.version, 6)
  return QRCode.create(verifyUrl, { errorCorrectionLevel: 'H', version }).modules
}

/**
 * One module's width, worked out the way the seal does: the content square
 * over the symbol plus its four-module quiet zone on each side.
 *
 * Recovering it from a drawn dot's radius instead would divide a coordinate
 * already rounded to three decimals by a fraction under one, and by the time
 * that reaches the mark's outermost column it has been multiplied by more
 * than twenty.
 */
const moduleBox = (verifyUrl: string, diameter: number): number =>
  (diameter * 0.625) / (symbol(verifyUrl).size + 4 * 2)

/** How many of the symbol's modules are set, ignoring the finder patterns. */
const setModulesOutsideFinders = (verifyUrl: string): { set: number, total: number } => {
  const { size, data } = symbol(verifyUrl)

  const inFinder = (row: number, column: number): boolean =>
    [[0, 0], [0, size - 7], [size - 7, 0]].some(
      ([fr, fc]) => row >= fr && row < fr + 7 && column >= fc && column < fc + 7,
    )

  let set = 0
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (data[row * size + column] && !inFinder(row, column)) set++
    }
  }

  return { set, total: size * size }
}

describe('verification seal', () => {
  it('draws the QR from the URL it is given, and nothing else', () => {
    const first = generateVerificationSealSvg('https://one.example.org/credentials/urn:uuid:aaa', DIAMETER)
    const second = generateVerificationSealSvg('https://two.example.org/credentials/urn:uuid:bbb', DIAMETER)
    const again = generateVerificationSealSvg('https://one.example.org/credentials/urn:uuid:aaa', DIAMETER)

    expect(first).not.toEqual(second)
    // Same URL, same seal: nothing about the frame is randomised, so a
    // certificate regenerated later is byte-identical.
    expect(first).toEqual(again)
  })

  it.each([
    ['a short URL', 'https://wpb.dev/c/1'],
    ['a realistic URL', URL],
    ['a long self-hosted URL', `${URL}${'x'.repeat(120)}`],
  ])('spends little of the error-correction budget on the mark, for %s', (_label, verifyUrl) => {
    const svg = generateVerificationSealSvg(verifyUrl, DIAMETER)
    const drawn = dots(svg)
    const box = moduleBox(verifyUrl, DIAMETER)
    const data = drawn.filter(dot => dot.r < box * DOT_BOUNDARY)
    const { set, total } = setModulesOutsideFinders(verifyUrl)

    // Level H recovers around 30% of the symbol. The clear zone is 27 modules
    // by 11 - the mark plus its margins - so what it costs falls as a longer
    // URL pushes the version up, and is worst at the version 6 floor.
    expect(set - data.length).toBeLessThan(total * 0.12)
    expect(data.length).toBeGreaterThan(0)
  })

  it('sets the mark on the QR"s own grid, centred', () => {
    const drawn = dots(generateVerificationSealSvg(URL, DIAMETER))
    const box = moduleBox(URL, DIAMETER)
    const mark = drawn.filter(dot => dot.r > box * DOT_BOUNDARY)

    // 53 lit cells across "WPB", bigger and tighter-packed than the data dots.
    expect(mark).toHaveLength(53)
    // The mark's own 17 by 7 grid, centred on the seal: with an odd count in
    // each direction the middle dot lands on the centre, and the outermost dot
    // centres fall a whole 8 and 3 modules out.
    const extent = (values: number[]): number => Math.max(...values.map(Math.abs))
    expect(extent(mark.map(dot => dot.x))).toBeCloseTo(box * 8, 3)
    expect(extent(mark.map(dot => dot.y))).toBeCloseTo(box * 3, 3)
  })

  it('holds the design"s proportions, whatever diameter it is asked for', () => {
    const svg = generateVerificationSealSvg(URL, 1000)

    // The face fills the diameter; the band is 0.026 of it at the outer edge,
    // so its stroked centreline sits 13 in.
    expect(svg).toContain('<circle cx="0" cy="0" r="500" fill="#ffffff" />')
    expect(svg).toContain('r="487" fill="none" stroke="url(#sealSheen)" stroke-width="26"')
    // The hairline ring, 0.005 wide with its outer edge at 0.468.
    expect(svg).toContain('r="465.5" fill="none" stroke="url(#sealSheen)" stroke-width="5"')
    // The legends, on a 0.435 arc at 0.044 of the diameter.
    expect(svg).toContain('font-size="44"')
    // The span is 38 degrees either side of straight up, so the top arc runs
    // from -128 to -52 degrees.
    expect(svg).toContain('<path id="sealLegendTop" fill="none" d="M -267.813 -342.785 A 435 435 0 0 1 267.813 -342.785" />')
    // Each legend is stretched to the 76 degrees the design gives it: 76/360
    // of a 435-radius circle's circumference.
    expect(svg).toContain(`textLength="${Number(((76 * Math.PI) / 180 * 435).toFixed(3))}"`)
    // The QR takes 0.625 of the diameter, putting the content square's edge at
    // 312.5, and it fills that square: the four-module quiet zone lies inside
    // the edge, so the outermost dot's centre sits four and a half modules in.
    const outermost = Math.max(...dots(svg).map(dot => Math.abs(dot.x)))
    expect(outermost).toBeLessThan(312.5)
    expect(outermost).toBeCloseTo(312.5 - 4.5 * moduleBox(URL, 1000), 2)
  })

  it('draws the frame the design calls for', () => {
    const svg = generateVerificationSealSvg(URL, DIAMETER)

    expect(svg).toContain('CLICK OR SCAN TO VERIFY')
    expect(svg).toContain('W P B R I G A D E')
    // Two curved legends, two accent stars, three finder patterns of three
    // rectangles each, and the gold in its two palettes.
    expect(svg.match(/<textPath /g)).toHaveLength(2)
    expect(svg.match(/<polygon /g)).toHaveLength(2)
    expect(svg.match(/<rect /g)).toHaveLength(9)
    expect(svg).toContain('<linearGradient id="sealSheen"')
    expect(svg).toContain('<linearGradient id="sealDeep"')
  })

  it('rakes the light across the band the way the design does', () => {
    const svg = generateVerificationSealSvg(URL, 1000)
    const sheen = svg.match(/<linearGradient id="sealSheen"[^>]*>(.*?)<\/linearGradient>/s)![0]

    // qr_gold.py's sweep peaks at 27.5 and 207.5 degrees. A linear gradient
    // reaches both at once with its axis a quarter turn off them, at 117.5 -
    // pointing (-0.462, 0.887) - and with its brightest stop at the midpoint.
    expect(sheen).toContain('x1="230.874" y1="-443.505" x2="-230.874" y2="443.505"')
    expect(sheen).toContain('<stop offset="0.5" stop-color="rgb(249,229,164)" />')
    // Darkest at both ends, so the two glints land a half turn apart.
    expect(sheen).toContain('<stop offset="0" stop-color="rgb(110,68,12)" />')
    expect(sheen).toContain('<stop offset="1" stop-color="rgb(110,68,12)" />')
  })
})
