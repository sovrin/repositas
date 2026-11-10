// What a file is, read from its first bytes, never from its name or the type the browser claims:
// only what passes here is stored and served.

export interface Sniffed {
  type: string
  width: number | null
  height: number | null
}

const NO_SIZE = { width: null, height: null }

/** The file's type, with its size in pixels for an image; null for a type repositas does not
 *  take. */
export function sniff(bytes: Buffer): Sniffed | null {
  const at = (offset: number, text: string) =>
    bytes.subarray(offset, offset + text.length).toString('latin1') === text
  if (at(0, '\x89PNG\r\n\x1A\n'))
    return { type: 'image/png', ...size(() => [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]) }
  if (at(0, 'GIF87a') || at(0, 'GIF89a'))
    return { type: 'image/gif', ...size(() => [bytes.readUInt16LE(6), bytes.readUInt16LE(8)]) }
  if (at(0, 'RIFF') && at(8, 'WEBP')) return { type: 'image/webp', ...size(() => webpSize(bytes)) }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { type: 'image/jpeg', ...size(() => jpegSize(bytes)) }
  if (at(0, '%PDF-')) return { type: 'application/pdf', ...NO_SIZE }
  return null
}

// A truncated or odd header leaves the size unknown rather than refusing the file.
function size(read: () => [number, number] | null) {
  try {
    const [width, height] = read() ?? []
    return width && height ? { width, height } : NO_SIZE
  } catch {
    return NO_SIZE
  }
}

function webpSize(bytes: Buffer): [number, number] | null {
  const chunk = bytes.subarray(12, 16).toString('latin1')
  if (chunk === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff]
  if (chunk === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)]
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21)
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]
  }
  return null
}

// The size is in the first start-of-frame segment; every segment before it says its length.
function jpegSize(bytes: Buffer): [number, number] | null {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]!
    if (marker === 0xff) {
      offset++
      continue
    }
    const frame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (frame) return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)]
    offset += 2 + bytes.readUInt16BE(offset + 2)
  }
  return null
}
