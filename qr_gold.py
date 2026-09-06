"""Generate a styled QR code with a brand logo image in the center zone."""
import math
import sys
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont

try:
    from pyzbar.pyzbar import decode as _zbar_decode
except ImportError:
    _zbar_decode = None

FONT_PATH = Path("C:/Windows/Fonts/arialbd.ttf")

TOP_TEXT = "CLICK OR SCAN TO VERIFY"
BOTTOM_TEXT = "W P B R I G A D E"
CENTER_TEXT = "WPB"

BOX_SIZE = 14
BORDER = 4
DOT_COLOR = (0, 0, 0)
BG_COLOR = (255, 255, 255)

# --- Gold frame palette ---
# Flat gold reads as mustard-yellow, not metal. What sells "metal" is a
# specular sweep: the same hue cycling dark -> mid -> bright -> near-white
# as the eye travels around the ring, as if one light source were raking
# across a polished bevel. Two stop sets, because one range can't do both
# jobs: SHEEN spans the full dark-to-highlight range for the wide band
# (where the pale end reads as a glint), while DEEP is floored at a much
# darker value for the small elements — the curved text and the accent
# stars — whose thin strokes and points would disappear against white paper
# if the sweep ever went pale there. Even SHEEN's brightest stop stays a
# definite gold rather than near-white, because a highlight that reaches
# the page color makes the band look like it breaks open where the glint
# falls instead of catching the light.
GOLD_SHEEN_STOPS = [
    (0.00, (110, 68, 12)),
    (0.30, (163, 118, 34)),
    (0.60, (205, 163, 66)),
    (0.82, (238, 208, 122)),
    (1.00, (249, 229, 164)),
]
GOLD_DEEP_STOPS = [
    (0.00, (90, 54, 8)),
    (0.45, (140, 98, 24)),
    (1.00, (196, 154, 60)),
]
# Two highlights per revolution, offset off the vertical, so the glints land
# on the upper-left / lower-right diagonal like a raking studio light.
GOLD_LOBES = 2
GOLD_PHASE_DEG = 35

# PIL's drawing primitives aren't anti-aliased, so rendering dots directly at
# BOX_SIZE leaves visibly jagged, slightly-inconsistent edges from pixel
# rounding. Rendering everything at AA_SCALE times the size, then downscaling
# with LANCZOS, gives every dot the same smooth, uniform edge.
AA_SCALE = 3

# Fallback used when pyzbar isn't installed to verify scannability directly.
# Empirically safe across QR versions 6-9 with ERROR_CORRECT_H (see below).
FALLBACK_CLEAR_FRAC = 0.18
MIN_CLEAR_FRAC = 0.14
CLEAR_FRAC_STEP = 0.02
INITIAL_CLEAR_FRAC = 0.32


def _star_vertices(cx, cy, outer_r, points=5, rotation_deg=-90, ratio=0.382):
    """Compute the 2*points vertices of a five-pointed star polygon.

    `ratio` is inner/outer vertex radius; 0.382 (~1/phi^2) gives the
    classic pentagram proportions rather than a "puffy" star.
    """
    inner_r = outer_r * ratio
    vertices = []
    for i in range(points * 2):
        angle = math.radians(rotation_deg + i * (360 / (points * 2)))
        r = outer_r if i % 2 == 0 else inner_r
        vertices.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return vertices


def _star_mask(size, points=5, rotation_deg=-90, ratio=0.382):
    """Render a filled five-pointed star silhouette as an L-mode image."""
    mask = Image.new("L", (size, size), 0)
    vertices = _star_vertices(size / 2, size / 2, size * 0.5 * 0.95, points, rotation_deg, ratio)
    ImageDraw.Draw(mask).polygon(vertices, fill=255)
    return mask


def _draw_solid_star(canvas, cx, cy, size, color):
    """Draw a single solid-filled star centered at (cx, cy) directly onto `canvas`."""
    vertices = _star_vertices(cx, cy, size / 2 * 0.95)
    ImageDraw.Draw(canvas).polygon(vertices, fill=color)


# Hand-drawn dot-matrix glyphs for the center mark. A real typeface's curves
# and diagonals don't land cleanly on a coarse grid — downsampling one
# produces messy, half-filled cells at the edges. These are designed directly
# on the grid instead, so every "on" cell is a deliberate, unambiguous dot
# and the letterforms stay crisp at low resolution.
_DOT_FONT = {
    "W": ["10001",
          "10001",
          "10001",
          "10101",
          "10101",
          "11011",
          "10001"],
    "P": ["11110",
          "10001",
          "10001",
          "11110",
          "10000",
          "10000",
          "10000"],
    "B": ["11110",
          "10001",
          "10001",
          "11110",
          "10001",
          "10001",
          "11110"],
}
_DOT_FONT_HEIGHT = 7
_DOT_FONT_GAP = 1


def _bitmap_text_cells(text):
    """Return the "on" (col, row) cells for `text` set in _DOT_FONT, plus its total size."""
    cells = []
    col_cursor = 0
    for ch in text:
        glyph = _DOT_FONT[ch]
        for row, bits in enumerate(glyph):
            for col, bit in enumerate(bits):
                if bit == "1":
                    cells.append((col_cursor + col, row))
        col_cursor += len(glyph[0]) + _DOT_FONT_GAP
    total_w = col_cursor - _DOT_FONT_GAP
    return cells, total_w, _DOT_FONT_HEIGHT


def _render_qr_body(data: str, clear_frac: float) -> Image.Image:
    """Render the QR matrix + finder patterns + centered "WPB" mark, no outer frame.

    The clear zone reserved for the center mark is a fraction (`clear_frac`) of the
    image's side length. Larger data payloads push the QR to a higher
    version, and Reed-Solomon error correction is applied per-block rather
    than globally — so a clear zone that's safe at one version can concentrate
    too much erasure in a single block at another and break decoding, even
    though the overall erased area stays under the nominal 30% budget for
    ERROR_CORRECT_H. Callers should shrink clear_frac and re-render if a
    decode check fails (see create_custom_qr).
    """
    qr = qrcode.QRCode(
        version=6,  # force larger matrix so clear zone has more dot-columns
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=BOX_SIZE,
        border=BORDER,
    )
    qr.add_data(data)
    qr.make(fit=True)

    matrix = qr.get_matrix()
    size = len(matrix)
    img_px = size * BOX_SIZE  # final, logical size returned to the caller
    box = BOX_SIZE * AA_SCALE  # supersampled working size used while drawing

    img = Image.new("RGB", (size * box, size * box), BG_COLOR)
    draw = ImageDraw.Draw(img)

    CORNER_SIZE = 7
    finder_origins = [
        (BORDER, BORDER),
        (BORDER, size - BORDER - CORNER_SIZE),
        (size - BORDER - CORNER_SIZE, BORDER),
    ]

    def is_finder(row, col):
        for fr, fc in finder_origins:
            if fr <= row < fr + CORNER_SIZE and fc <= col < fc + CORNER_SIZE:
                return True
        return False

    # The clear zone is shaped to match the center mark's aspect ratio (wide
    # and short, for "WPB") rather than forced square — a square clear zone
    # big enough to make 3 letters legible would need far more total erased
    # area than a rectangle with the same width, since a square wastes
    # height the mark doesn't need. `area_side` is the equivalent square
    # side clear_frac used to represent before this change, so clear_frac's
    # safe range (and the shrink-on-failure loop in create_custom_qr) still
    # means the same thing: the rectangle's area == area_side^2, just
    # reshaped so that area buys legibility instead of unused vertical margin.
    center_cells, center_w, center_h = _bitmap_text_cells(CENTER_TEXT)
    aspect = center_w / center_h
    center_px = (size * box) // 2
    area_side = size * box * clear_frac
    half_h = int(area_side / math.sqrt(aspect)) // 2
    half_w = int(area_side * math.sqrt(aspect)) // 2
    # Snap to module grid so no partial dots bleed in at the edges
    clear_x1 = (center_px - half_w) // box * box
    clear_y1 = (center_px - half_h) // box * box
    clear_x2 = -(-(center_px + half_w) // box) * box  # ceiling
    clear_y2 = -(-(center_px + half_h) // box) * box
    clear_w = clear_x2 - clear_x1
    clear_h = clear_y2 - clear_y1

    def in_clear_zone(row, col):
        mx1, my1 = col * box, row * box
        mx2, my2 = mx1 + box, my1 + box
        return mx2 > clear_x1 and mx1 < clear_x2 and my2 > clear_y1 and my1 < clear_y2

    # Plain circles read as cleaner and less cluttered than rounded squares
    # at this density, and the extra gap around each one (a circle inscribed
    # in its cell covers less area than a rounded square would) gives the
    # overall pattern more breathing room.
    PAD = box * 0.19

    def draw_dot(px, py):
        draw.ellipse([px + PAD, py + PAD, px + box - PAD - 1, py + box - PAD - 1], fill=DOT_COLOR)

    # Bigger, tighter-packed dots for the center mark, so it pops against the
    # regular data dots instead of blending in at the same size.
    BOLD_PAD = box * 0.08

    def draw_dot_bold(px, py):
        draw.ellipse([px + BOLD_PAD, py + BOLD_PAD, px + box - BOLD_PAD - 1, py + box - BOLD_PAD - 1], fill=DOT_COLOR)

    # Draw QR data dots
    for r in range(size):
        for c in range(size):
            if not matrix[r][c] or is_finder(r, c) or in_clear_zone(r, c):
                continue
            draw_dot(c * box, r * box)

    # Draw finder patterns with pebble-like rounded corners instead of the
    # strict-spec sharp squares, matching the rounded QR data dots.
    def draw_finder_pat(row, col):
        x, y = col * box, row * box
        outer = CORNER_SIZE * box
        draw.rounded_rectangle([x, y, x + outer - 1, y + outer - 1], radius=outer * 0.24, fill=DOT_COLOR)
        sep = box
        inner_w = outer - sep * 2
        draw.rounded_rectangle(
            [x + sep, y + sep, x + outer - sep - 1, y + outer - sep - 1],
            radius=inner_w * 0.24, fill=BG_COLOR,
        )
        off, sz = box * 2, box * 3
        draw.rounded_rectangle([x + off, y + off, x + off + sz - 1, y + off + sz - 1], radius=sz * 0.28, fill=DOT_COLOR)

    for fr, fc in finder_origins:
        draw_finder_pat(fr, fc)

    # --- Render "WPB" as a dot-matrix silhouette in the clear zone ---
    # The clear zone is already excluded from QR-data dots above, so it's
    # blank white here — we only need to stamp letter dots on top of it,
    # using the bolder dot style so the mark reads as a deliberate accent
    # rather than blending into the surrounding data dots. The bitmap is
    # placed at the largest whole-number scale that fits, so it stays crisp
    # (nearest-neighbor blockiness, not blurry) at any clear-zone size.
    MARGIN_MODULES = 1
    clear_col1, clear_row1 = clear_x1 // box, clear_y1 // box
    cols_total = clear_w // box
    rows_total = clear_h // box
    effective_cols = max(1, cols_total - MARGIN_MODULES * 2)
    effective_rows = max(1, rows_total - MARGIN_MODULES * 2)

    mark_scale = max(1, min(effective_cols // center_w, effective_rows // center_h))
    col_offset = clear_col1 + MARGIN_MODULES + (effective_cols - center_w * mark_scale) // 2
    row_offset = clear_row1 + MARGIN_MODULES + (effective_rows - center_h * mark_scale) // 2

    for cx, cy in center_cells:
        for sy in range(mark_scale):
            for sx in range(mark_scale):
                draw_dot_bold(
                    (col_offset + cx * mark_scale + sx) * box,
                    (row_offset + cy * mark_scale + sy) * box,
                )

    # Downscale from the supersampled working resolution back to the logical
    # size with LANCZOS — this is what makes every dot's edge smooth and
    # uniform instead of hard-edged and slightly inconsistent pixel to pixel.
    return img.resize((img_px, img_px), Image.LANCZOS)


def _lerp_stops(stops, t):
    """Sample a list of (position, RGB) stops at `t` in [0, 1] with linear blending."""
    t = min(max(t, 0.0), 1.0)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            f = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
            return tuple(round(a + (b - a) * f) for a, b in zip(c0, c1))
    return stops[-1][1]


def _angular_gradient(diameter, stops, lobes=GOLD_LOBES, phase_deg=GOLD_PHASE_DEG, wedges=720):
    """Build a square image whose color sweeps with the angle around its center.

    Drawn as `wedges` pie slices rather than per-pixel: a full-canvas
    per-pixel loop at these sizes takes seconds in pure Python, while 720
    slices are indistinguishable from a continuous sweep once the gold is
    only ever seen through a narrow ring mask. Adjacent slices overlap by a
    fraction of a degree so no background hairlines show at the seams.
    """
    img = Image.new("RGB", (diameter, diameter), stops[0][1])
    draw = ImageDraw.Draw(img)
    bbox = [0, 0, diameter - 1, diameter - 1]
    step = 360 / wedges
    for i in range(wedges):
        start = i * step
        mid = math.radians(start + step / 2)
        t = (math.sin(lobes * mid + math.radians(phase_deg)) + 1) / 2
        draw.pieslice(bbox, start=start - 0.6, end=start + step + 0.6, fill=_lerp_stops(stops, t))
    return img


def _ring(mask_draw, center, outer_r, width, ss):
    """Punch one concentric ring (annulus) into a supersampled L-mode mask.

    Rings must be added outermost-first: each one fills a disk out to
    `outer_r` and then clears the disk inside it, so a later, smaller ring
    only ever writes inside the hole an earlier one left behind.
    """
    cx, cy = center[0] * ss, center[1] * ss
    outer, inner = outer_r * ss, (outer_r - width) * ss
    mask_draw.ellipse([cx - outer, cy - outer, cx + outer, cy + outer], fill=255)
    if inner > 0:
        mask_draw.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=0)


def _draw_curved_text(canvas, text, font, radius, center, start_deg, end_deg, fill=DOT_COLOR):
    """Stamp `text` along a circular arc, one rotated glyph at a time.

    Angles use the same convention as draw_arc: 0=east/90=south/180=west/
    270(or -90)=north, increasing clockwise. Characters advance from
    start_deg to end_deg in the order they appear in `text`.

    Passing start_deg < end_deg (sweeping clockwise) orients each glyph
    "up" away from the circle's center — correct for text on the upper
    arc. Passing start_deg > end_deg (sweeping counter-clockwise) flips
    "up" to face the center instead, which is what keeps text on the
    lower arc reading upright left-to-right instead of upside-down.
    """
    widths = [font.getlength(ch) for ch in text]
    total_w = sum(widths) or 1
    sweep = 1.0 if end_deg >= start_deg else -1.0

    cum = 0.0
    for ch, w in zip(text, widths):
        t = (cum + w / 2.0) / total_w
        cum += w
        if ch.strip() == "":
            continue

        theta = math.radians(start_deg + t * (end_deg - start_deg))
        tangent_x = -math.sin(theta) * sweep
        tangent_y = math.cos(theta) * sweep
        pil_angle = -math.degrees(math.atan2(tangent_y, tangent_x))

        pad = int(font.size * 0.6)
        bbox = font.getbbox(ch)
        tile_size = max(bbox[2] - bbox[0], bbox[3] - bbox[1]) + pad * 2
        tile = Image.new("RGBA", (tile_size, tile_size), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((tile_size / 2, tile_size / 2), ch, font=font, fill=fill, anchor="mm")
        rotated = tile.rotate(pil_angle, resample=Image.BICUBIC, expand=True)

        px = center[0] + radius * math.cos(theta)
        py = center[1] + radius * math.sin(theta)
        paste_xy = (round(px - rotated.width / 2), round(py - rotated.height / 2))
        canvas.paste(rotated, paste_xy, rotated)


def create_custom_qr(data: str, output_path: str) -> None:
    """Generate a branded QR code with a dotted "WPB" mark centered in the clear zone.

    Args:
        data: URL or string to encode.
        output_path: File path for the output PNG.
    """
    if _zbar_decode is not None:
        clear_frac = INITIAL_CLEAR_FRAC
        img = _render_qr_body(data, clear_frac)
        while clear_frac > MIN_CLEAR_FRAC:
            result = _zbar_decode(img)
            if result and result[0].data.decode() == data:
                break
            clear_frac -= CLEAR_FRAC_STEP
            img = _render_qr_body(data, clear_frac)
        else:
            result = _zbar_decode(img)
            if not (result and result[0].data.decode() == data):
                print("Warning: could not verify the QR scans correctly even at the smallest center mark size.")
    else:
        print("Note: pyzbar not installed — skipping scan verification, using a conservative center mark size.")
        img = _render_qr_body(data, FALLBACK_CLEAR_FRAC)

    img_px = img.width

    # --- Circular frame ---
    # QR content square sits at ~62.5% of the circle's diameter, matching a
    # standard "circle frame" QR template (finder patterns well inset from
    # the ring, with room for accent arcs in between).
    CONTENT_RATIO = 0.625
    diameter = round(img_px / CONTENT_RATIO)
    radius = diameter / 2
    center = (radius, radius)

    framed = Image.new("RGBA", (diameter, diameter), BG_COLOR + (255,))

    # --- Gold "verified stamp" frame ---
    # Every radius below is a fraction of the diameter, and they are chosen
    # to tile the annulus outside the QR without overlapping: the wide band
    # owns the outer edge, a hairline ring sits just inside it, and the
    # curved text and accent stars occupy the space below that. The lower
    # bound is set by the QR: its content is a SQUARE whose corners reach
    # 0.442*d from the center, so nothing may be drawn full-circle inside
    # that radius (see the HALF_SPAN note below for the text, which is
    # confined to the angles where the square is only 0.3125*d away).
    BAND_WIDTH = diameter * 0.026
    # Two solid dark-gold hairlines, one on each edge of the band. The
    # gradient's pale highlights fade almost into the white page where they
    # meet the band's edge, which makes the outline look soft and unfinished;
    # capping both edges with the DEEP gold keeps the band crisply defined
    # all the way around, the way a struck seal has a raised rim.
    EDGE_LINE = max(1, round(diameter * 0.0026))
    INNER_RING_OUTER_R = radius * 0.936  # == 0.468 * diameter
    INNER_RING_WIDTH = max(2, round(diameter * 0.005))

    SIDE_STAR_SIZE = diameter * 0.082
    SIDE_STAR_RADIUS = diameter * 0.412

    # Masks are built at MASK_SS times the final size and downscaled, so
    # every gold edge is anti-aliased instead of stair-stepped.
    MASK_SS = 4
    sheen_mask_hi = Image.new("L", (diameter * MASK_SS, diameter * MASK_SS), 0)
    sheen_draw = ImageDraw.Draw(sheen_mask_hi)
    _ring(sheen_draw, center, radius, BAND_WIDTH, MASK_SS)
    _ring(sheen_draw, center, INNER_RING_OUTER_R, INNER_RING_WIDTH, MASK_SS)

    deep_mask_hi = Image.new("L", (diameter * MASK_SS, diameter * MASK_SS), 0)
    deep_draw = ImageDraw.Draw(deep_mask_hi)
    _ring(deep_draw, center, radius, EDGE_LINE, MASK_SS)
    _ring(deep_draw, center, radius - BAND_WIDTH + EDGE_LINE, EDGE_LINE, MASK_SS)

    # --- Side accent stars ---
    # Small stars at 3 and 9 o'clock fill the space the text arcs leave bare,
    # echoing the center mark instead of a plain dot or diamond. They take the
    # DEEP gold rather than the sheen: a star's points are thin enough that
    # wherever the sweep ran pale, the star lost its silhouette and read as a
    # smudge instead of a shape.
    for side_deg in (0, 180):
        theta = math.radians(side_deg)
        sx = center[0] + SIDE_STAR_RADIUS * math.cos(theta)
        sy = center[1] + SIDE_STAR_RADIUS * math.sin(theta)
        _draw_solid_star(deep_mask_hi, sx * MASK_SS, sy * MASK_SS, SIDE_STAR_SIZE * MASK_SS, 255)

    sheen_gradient = _angular_gradient(diameter, GOLD_SHEEN_STOPS)
    deep_gradient = _angular_gradient(diameter, GOLD_DEEP_STOPS)

    framed.paste(sheen_gradient, (0, 0), sheen_mask_hi.resize((diameter, diameter), Image.LANCZOS))
    framed.paste(deep_gradient, (0, 0), deep_mask_hi.resize((diameter, diameter), Image.LANCZOS))

    # --- Curved annulus text ---
    # The QR content is a SQUARE, not a circle, so its distance from center
    # varies with angle: minimal at its flat edges (half its side length),
    # maximal at its corners (that times sqrt(2)). A text span that swings
    # more than 45 degrees off a cardinal direction sweeps across a corner,
    # where the square suddenly reaches much farther out — enough to pass
    # under the finder patterns even when there's clearance at the edges.
    # Keeping the half-span under 45 degrees keeps the whole arc over a flat
    # edge, where the safe gap to the ring is largest and roughly constant.
    # Pulled a bit further off both the ring and the square's corner reach
    # (versus the tightest values that would still technically clear them)
    # so the text sits with visible breathing room instead of grazing the
    # boundary.
    #
    # Drawn white onto a scratch layer and used only for its alpha, so the
    # letters can be filled with the DEEP gradient rather than a flat color
    # — the same trick as the rings, but with the glyphs as the mask.
    HALF_SPAN = 38
    TEXT_RADIUS = diameter * 0.435
    FONT_SIZE = round(diameter * 0.044)
    font = ImageFont.truetype(str(FONT_PATH), size=FONT_SIZE)

    text_layer = Image.new("RGBA", (diameter, diameter), (0, 0, 0, 0))
    _draw_curved_text(text_layer, TOP_TEXT, font, TEXT_RADIUS, center, -90 - HALF_SPAN, -90 + HALF_SPAN,
                      fill=(255, 255, 255))
    _draw_curved_text(text_layer, BOTTOM_TEXT, font, TEXT_RADIUS, center, 90 + HALF_SPAN, 90 - HALF_SPAN,
                      fill=(255, 255, 255))
    framed.paste(deep_gradient, (0, 0), text_layer.getchannel("A"))

    paste_xy = (round(radius - img_px / 2), round(radius - img_px / 2))
    framed.paste(img.convert("RGBA"), paste_xy)

    # --- Mask everything outside the outer ring to transparent ---
    # Supersample the mask so the circular edge is anti-aliased rather than
    # jagged, then apply it as the alpha channel (the canvas is fully opaque
    # up to here, so this purely cuts the corners away).
    SUPERSAMPLE = 4
    mask_hi = Image.new("L", (diameter * SUPERSAMPLE, diameter * SUPERSAMPLE), 0)
    ImageDraw.Draw(mask_hi).ellipse([0, 0, mask_hi.width - 1, mask_hi.height - 1], fill=255)
    mask = mask_hi.resize((diameter, diameter), Image.LANCZOS)
    framed.putalpha(mask)

    framed.save(output_path)
    print(f"QR code saved to: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: uv run pr.py https://badges.ninja/awards/408216ab-48d6-4ac6-898f-6efc3966c214 output1.png")
        sys.exit(1)

    create_custom_qr(data=sys.argv[1], output_path=sys.argv[2])