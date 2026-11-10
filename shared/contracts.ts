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

/** A file's preview, made by the owner's browser: an image of at most THUMB_EDGE pixels on its
 *  longest side, at most THUMB_MAX bytes. An image that small already is its own preview. */
export const THUMB_EDGE = 320
export const THUMB_MAX = 256 * 1024
export const THUMB_TYPES = ['image/webp', 'image/jpeg', 'image/png']

/** Ids are random, since anyone who has one can read the file. Folders' ids are made alike. */
export const FILE_ID = /^[A-Za-z0-9_-]{32}$/

/** An upload's name, sent beside its bytes: `?name=hero.png`. */
export const fileNameSchema = z.string().trim().min(1, 'Give the file a name.').max(200)

/** A folder's name, unique within its project. */
export const folderNameSchema = z.string().trim().min(1, 'Give the folder a name.').max(60)

/** A file's new name, or the folder it goes in (null: none). */
export const fileChangeSchema = z.object({
  name: fileNameSchema.optional(),
  folderId: z.string().regex(FILE_ID, 'There is no such folder.').nullable().optional(),
})

/** A file on the admin's list, in one folder or none. The folder is the admin's order only: it
 *  never becomes part of the file's address. */
export interface ProjectFile extends StoredFile {
  folderId: string | null
  /** Whether it has a preview of its own (see THUMB_MAX). */
  thumb: boolean
  createdAt: number
}

/** A way to sort a project's files. Deleting one deletes the files in it. */
export interface Folder {
  id: string
  name: string
}

/** 2048 → "2 kB", 3_500_000 → "3.3 MB" */
export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
