// Pictures in the pane: telling a PNG, a JPEG or an SVG by its name, reading its size from its
// own header, and wrapping it as one SVG drawing for a surface that draws vectors (the desktop,
// whose pane has no picture element). No engine calls here.

export type ImageKind = 'png' | 'jpeg' | 'svg'

/** The most bytes of a picture drawn: its base64 and the wrapper must fit the 131072 characters one drawing holds. */
export const MAX_DRAW_BYTES = 90_000
/** The widest a picture is drawn, in pixels. */
export const MAX_DRAW_WIDTH = 320
/** The box of a picture whose own size is not known. */
const UNKNOWN_BOX = { width: 320, height: 240 }

const MIME: Record<ImageKind, string> = { png: 'image/png', jpeg: 'image/jpeg', svg: 'image/svg+xml' }
const NAME: Record<ImageKind, string> = { png: 'PNG', jpeg: 'JPEG', svg: 'SVG' }

/** What a file's name says it is, or null for anything that is not a PNG, a JPEG or an SVG. */
export function imageKind(path: string): ImageKind | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase()
  return ext === 'png' ? 'png' : ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'svg' ? 'svg' : null
}

export type Size = { width: number | null; height: number | null }
const UNKNOWN: Size = { width: null, height: null }

/** The bytes of a base64 text, or null when it is not base64. */
function decode(base64: string): Uint8Array | null {
  try {
    const raw = atob(base64)
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

const u32 = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0
const u16 = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!

/** JPEG markers that start a frame and carry its size (every SOF but DHT, JPG and DAC). */
const isFrame = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc

/** A number in an SVG's width or height ("120", "120px"); null for a percentage or anything else. */
function px(value: string | undefined): number | null {
  const m = /^\s*([0-9]*\.?[0-9]+)(px)?\s*$/.exec(value ?? '')
  return m ? Number(m[1]) : null
}

/**
 * A picture's size in pixels from its first bytes: a PNG's header chunk, a JPEG's frame
 * marker, an SVG's width and height or else its viewBox. Unknown (nulls) when the bytes are
 * not what the name says or hold no size: never a guess.
 */
export function dimensionsOf(kind: ImageKind, base64: string): Size {
  const bytes = decode(base64)
  if (!bytes) return UNKNOWN
  if (kind === 'png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    if (bytes.length < 24 || signature.some((v, i) => bytes[i] !== v)) return UNKNOWN
    return { width: u32(bytes, 16), height: u32(bytes, 20) }
  }
  if (kind === 'jpeg') {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return UNKNOWN
    let at = 2
    while (at + 4 <= bytes.length) {
      if (bytes[at] !== 0xff) return UNKNOWN
      const marker = bytes[at + 1]!
      if (isFrame(marker)) return at + 9 <= bytes.length ? { width: u16(bytes, at + 7), height: u16(bytes, at + 5) } : UNKNOWN
      at += 2 + u16(bytes, at + 2)
    }
    return UNKNOWN
  }
  const text = new TextDecoder().decode(bytes.subarray(0, 4096))
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? ''
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1]
  const width = px(attr('width'))
  const height = px(attr('height'))
  if (width !== null && height !== null) return { width, height }
  const box = (attr('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) return { width: box[2]!, height: box[3]! }
  return UNKNOWN
}

/** 512 as `512 B`, 53248 as `52 KB`, 2621440 as `2.5 MB`. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** What a picture is, in words that stand without it: "PNG image · 640×480 · 52 KB". */
export function describeImage(kind: ImageKind, size: Size, bytes: number): string {
  const dims = size.width !== null && size.height !== null ? `${size.width}×${size.height}` : 'size unknown'
  return `${NAME[kind]} image · ${dims} · ${formatBytes(bytes)}`
}

/** The picture's own size as words, for the drawing's alt text. */
export function altOf(name: string, kind: ImageKind, size: Size): string {
  return `${name}: ${NAME[kind]} image, ${size.width !== null && size.height !== null ? `${size.width}×${size.height}` : 'size unknown'}`
}

/**
 * One SVG drawing that shows the picture at its own proportions: the file as a data URL in
 * an `<image>`, in a viewBox of its size. `width` and `height` are the pixels to draw it at,
 * no wider than MAX_DRAW_WIDTH, never enlarged.
 */
export function imageSvg(kind: ImageKind, base64: string, size: Size): { svg: string; width: number; height: number } {
  const w = size.width ?? UNKNOWN_BOX.width
  const h = size.height ?? UNKNOWN_BOX.height
  const shown = w > MAX_DRAW_WIDTH ? MAX_DRAW_WIDTH : w
  const height = Math.max(1, Math.round((h * shown) / w))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${shown}" height="${height}" viewBox="0 0 ${w} ${h}"><image href="data:${MIME[kind]};base64,${base64}" width="${w}" height="${h}"/></svg>`
  return { svg, width: shown, height }
}
