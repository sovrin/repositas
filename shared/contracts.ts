// Every rule about what repositas accepts lives here, shared by the admin pages and the server.
import { z } from 'zod'
import type { StoredFile } from '#nexitas/shared/capabilities'

/** What can be uploaded, by media type, with the name the admin shows. Only types a browser shows
 *  without running anything: no SVG or HTML, which could carry a script onto this app's origin. */
export const FILE_TYPES: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/gif': 'GIF',
  'image/webp': 'WebP',
  'application/pdf': 'PDF',
}
export const IMAGE_TYPES = Object.keys(FILE_TYPES).filter((type) => type.startsWith('image/'))

/** Ids are random, since anyone who has one can read the file. */
export const FILE_ID = /^[A-Za-z0-9_-]{32}$/

/** An upload's name, sent beside its bytes: `?name=hero.png`. */
export const fileNameSchema = z.string().trim().min(1, 'Give the file a name.').max(200)

/** A file on the admin's list. */
export interface ProjectFile extends StoredFile {
  createdAt: number
}

/** 2048 → "2 kB", 3_500_000 → "3.3 MB" */
export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
