import { expect, test } from './kit'

import { describeImage, dimensionsOf, formatBytes, imageKind, imageSvg, MAX_DRAW_BYTES } from '../hooks/image'
import { PANE, START, hasText, plain, world } from './world'

/** Bytes as the base64 the engine hands back. */
const b64 = (bytes: number[]) => btoa(bytes.map(c => String.fromCharCode(c)).join(''))
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const be16 = (n: number) => [(n >>> 8) & 255, n & 255]
/** The first bytes of a PNG of this size: signature, then the IHDR chunk. */
const pngBytes = (w: number, h: number) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0]
const png = (w: number, h: number) => b64(pngBytes(w, h))
/** A JPEG: SOI, an APP0 segment, then SOF0 holding the size. */
const jpeg = (w: number, h: number) => b64([0xff, 0xd8, 0xff, 0xe0, ...be16(16), ...Array(14).fill(0), 0xff, 0xc0, ...be16(17), 8, ...be16(h), ...be16(w), 3, 1, 0x22, 0, 2, 0x11, 1])
const utf8 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))

test('imageKind: PNG, JPEG and SVG by extension, any case; nothing else', () => {
  expect(imageKind('C:/work/demo/a.PNG')).toBe('png')
  expect(imageKind('a.jpg')).toBe('jpeg')
  expect(imageKind('a.jpeg')).toBe('jpeg')
  expect(imageKind('logo.svg')).toBe('svg')
  expect(imageKind('a.gif')).toBe(null)
  expect(imageKind('a.png.txt')).toBe(null)
  expect(imageKind('README')).toBe(null)
})

test('dimensionsOf reads the size from a PNG and a JPEG header, and from an SVG\'s width and height or viewBox', () => {
  expect(dimensionsOf('png', png(640, 480))).toEqual({ width: 640, height: 480 })
  expect(dimensionsOf('jpeg', jpeg(1024, 768))).toEqual({ width: 1024, height: 768 })
  expect(dimensionsOf('svg', utf8('<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="60"></svg>'))).toEqual({ width: 120, height: 60 })
  expect(dimensionsOf('svg', utf8('<svg viewBox="0 0 24 12.5" xmlns="http://www.w3.org/2000/svg"></svg>'))).toEqual({ width: 24, height: 12.5 })
  // Not what it says it is, or no size in it: unknown, not a guess.
  expect(dimensionsOf('png', b64([1, 2, 3, 4]))).toEqual({ width: null, height: null })
  expect(dimensionsOf('jpeg', b64([0xff, 0xd8, 0xff, 0xe0, 0, 2]))).toEqual({ width: null, height: null })
  expect(dimensionsOf('svg', utf8('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toEqual({ width: null, height: null })
  expect(dimensionsOf('png', 'not base64 !!')).toEqual({ width: null, height: null })
})

test('formatBytes and describeImage say what the file is, in words that stand without the picture', () => {
  expect(formatBytes(512)).toBe('512 B')
  expect(formatBytes(53_248)).toBe('52 KB')
  expect(formatBytes(2_621_440)).toBe('2.5 MB')
  expect(describeImage('png', { width: 640, height: 480 }, 53_248)).toBe('PNG image · 640×480 · 52 KB')
  expect(describeImage('jpeg', { width: null, height: null }, 900)).toBe('JPEG image · size unknown · 900 B')
  expect(describeImage('svg', { width: 24, height: 12.5 }, 300)).toBe('SVG image · 24×12.5 · 300 B')
})

test('imageSvg wraps the file in one drawing at its own size, shown no wider than 320', () => {
  const small = imageSvg('png', 'QUJD', { width: 100, height: 50 })
  expect(small.svg).toContain('<image href="data:image/png;base64,QUJD" width="100" height="50"/>')
  expect(small.svg).toContain('viewBox="0 0 100 50"')
  expect(small).toMatchObject({ width: 100, height: 50 })
  expect(imageSvg('jpeg', 'QUJD', { width: 1000, height: 500 })).toMatchObject({ width: 320, height: 160 })
  expect(imageSvg('svg', 'QUJD', { width: 100, height: 50 }).svg).toContain('data:image/svg+xml;base64,QUJD')
  // A size not known: a box of a default size, the picture fitted in it.
  expect(imageSvg('png', 'QUJD', { width: null, height: null })).toMatchObject({ width: 320, height: 240 })
  expect(MAX_DRAW_BYTES).toBeLessThan(131_072 * 0.75)
})

const DIRS: Record<string, [string, 'file' | 'dir'][]> = {
  'C:\\work\\demo': [['logo.png', 'file'], ['photo.jpg', 'file'], ['icon.svg', 'file'], ['big.png', 'file'], ['README.md', 'file']],
}
const FILES = { 'C:\\work\\demo\\README.md': '# Demo\n' }
const rowKey = (name: string) => `row-c:/work/demo/${name}`

/** The Svg that holds a picture: an Svg drops its key as a Text does, and the card's crab is an Svg too. */
const pictureOf = async (ui: any) => (await ui.findAll({ type: 'Svg' })).find((s: any) => String(s.props?.source).includes('<image'))

async function doubleClick(ui: any, key: string) {
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: key })
  await ui.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: key })
}

const IMAGES = (): Record<string, string> => ({
  'C:\\work\\demo\\logo.png': png(640, 480),
  'C:\\work\\demo\\photo.jpg': jpeg(1024, 768),
  'C:\\work\\demo\\icon.svg': utf8('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle r="5"/></svg>'),
  // 100,000 bytes after the header: over what is drawn.
  'C:\\work\\demo\\big.png': b64([...pngBytes(4000, 3000), ...Array(100_000).fill(0)]),
})

test('a double-click on an image shows it on the desktop: one Svg holding the picture, with a line saying what it is', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES, images: IMAGES() })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await doubleClick(ui, rowKey('logo.png'))
  await clock.settle()
  const svg = await pictureOf(ui)
  expect(String(svg?.props?.source)).toContain('<image href="data:image/png;base64,iVBORw0K')
  expect(svg?.props).toMatchObject({ width: 320, height: 240, alt: 'logo.png: PNG image, 640×480' })
  expect(await hasText(ui, 'PNG image · 640×480 · 29 B')).toBe(true)
  // Back to the tree as with any file.
  await ui.press({ key: 'preview-back' })
  expect(await pictureOf(ui)).toBeUndefined()
  await ui.unmount()
})

test('a JPEG and an SVG file show the same way', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES, images: IMAGES() })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await doubleClick(ui, rowKey('photo.jpg'))
  await clock.settle()
  expect(String((await pictureOf(ui))?.props?.source)).toContain('data:image/jpeg;base64,')
  expect(await hasText(ui, 'JPEG image · 1024×768 · 36 B')).toBe(true)
  await ui.press({ key: 'preview-back' })
  await doubleClick(ui, rowKey('icon.svg'))
  await clock.settle()
  expect(String((await pictureOf(ui))?.props?.source)).toContain('data:image/svg+xml;base64,')
  expect(await hasText(ui, 'SVG image · 24×24 · 84 B')).toBe(true)
  await ui.unmount()
})

test('a picture too big to draw is described in words, with the way to open it', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES, images: IMAGES() })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await doubleClick(ui, rowKey('big.png'))
  await clock.settle()
  expect(await pictureOf(ui)).toBeUndefined()
  expect((await ui.findAll({ type: 'Text' })).map((t: any) => plain(t.text)).some((t: string) => /^▣ PNG image · 4000×3000 · \d+(\.\d)? [KM]B$/.test(t))).toBe(true)
  expect(await hasText(ui, 'Too big to draw here (over 88 KB): ↗ opens it in your image viewer.')).toBe(true)
  await ui.unmount()
})

test('on the terminal an image is a line of words: what it is and its size, not a picture', async ($, on) => {
  const { clock } = world(on, { dirs: DIRS, files: FILES, images: IMAGES() })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'terminal', ...PANE })
  await doubleClick(ui, rowKey('logo.png'))
  await clock.settle()
  expect(await ui.find({ key: 'preview-image' })).toBeUndefined()
  expect(await hasText(ui, '▣ PNG image · 640×480 · 29 B')).toBe(true)
  expect(await hasText(ui, 'The terminal does not draw pictures here: ↗ opens it in your image viewer.')).toBe(true)
  await ui.unmount()
})

test('a text file and a binary that is not an image keep their old ways', async ($, on) => {
  const { clock } = world(on, { dirs: { 'C:\\work\\demo': [['README.md', 'file'], ['blob.bin', 'file']] }, files: { ...FILES, 'C:\\work\\demo\\blob.bin': 'PK\u0003\u0004\u0000\u0000binary' } })
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'filetrail', surface: 'desktop', ...PANE })
  await doubleClick(ui, 'row-c:/work/demo/blob.bin')
  await clock.settle()
  expect(await hasText(ui, 'This looks like a binary file, so it is not shown here.')).toBe(true)
  await ui.unmount()
})
