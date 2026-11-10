// A project's files and folders: what is known about each file in the files table, the bytes on
// disk as <dir>/<id>. The id is random and the only name on disk, so no project id, folder or file
// name ever becomes part of a path.
import {
  closeSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { DatabaseSync } from 'node:sqlite'
import { newToken } from '#nexitas/server/core/auth'
import { THUMB_EDGE, THUMB_TYPES } from '#self/shared/contracts'
import type { Folder, ProjectFile } from '#self/shared/contracts'
import { sniff } from './sniff'

interface FileRow {
  id: string
  name: string
  type: string
  size: number
  width: number | null
  height: number | null
  folder_id: string | null
  thumb_type: string | null
  created_at: number
}

const COLUMNS = 'id, name, type, size, width, height, folder_id, thumb_type, created_at'

/** Where anyone reads a file: on this app's origin, by its project and id. */
export const filePath = (projectId: string, id: string) => `/v1/files/${projectId}/${id}`

const toFile = (projectId: string, row: FileRow): ProjectFile => ({
  id: row.id,
  name: row.name,
  type: row.type,
  size: row.size,
  width: row.width,
  height: row.height,
  path: filePath(projectId, row.id),
  folderId: row.folder_id,
  thumb: !!row.thumb_type,
  createdAt: row.created_at,
})

/** Newest first. */
export function listFiles(db: DatabaseSync, projectId: string): ProjectFile[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM files WHERE project_id = ? ORDER BY created_at DESC, id`)
    .all(projectId) as unknown as FileRow[]
  return rows.map((row) => toFile(projectId, row))
}

export function getFile(db: DatabaseSync, projectId: string, id: string): ProjectFile | null {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM files WHERE project_id = ? AND id = ?`)
    .get(projectId, id) as FileRow | undefined
  return row ? toFile(projectId, row) : null
}

// Enough to find a JPEG's size behind its metadata; the rest of the file is never read.
const HEAD = 512 * 1024
// An upload in progress, or one a crash cut off.
const PART = '.part'
// A file's preview, beside it.
const THUMB = '.thumb'

/** Removes a file's bytes and its preview's. */
function removeBytes(dir: string, id: string) {
  rmSync(join(dir, id), { force: true })
  rmSync(join(dir, id + THUMB), { force: true })
}

/** Streams the file to disk, so its size never touches memory, then stores it; or answers null
 *  when it is not a type repositas takes (see sniff). An upload that breaks off leaves nothing. */
export async function saveFile(
  db: DatabaseSync,
  dir: string,
  projectId: string,
  name: string,
  source: Readable,
  folderId: string | null = null,
  now = Date.now(),
): Promise<ProjectFile | null> {
  const id = newToken('')
  const path = join(dir, id)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  try {
    await pipeline(source, createWriteStream(path + PART, { mode: 0o600 }))
    const kind = sniff(readHead(path + PART))
    if (!kind) return null
    const { size } = statSync(path + PART)
    renameSync(path + PART, path)
    try {
      db.prepare(
        `INSERT INTO files (id, project_id, name, type, size, width, height, folder_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, projectId, name, kind.type, size, kind.width, kind.height, folderId, now)
    } catch (error) {
      removeBytes(dir, id)
      throw error
    }
    return getFile(db, projectId, id)
  } finally {
    rmSync(path + PART, { force: true })
  }
}

function readHead(path: string) {
  const head = Buffer.alloc(HEAD)
  const fd = openSync(path, 'r')
  try {
    return head.subarray(0, readSync(fd, head, 0, HEAD, 0))
  } finally {
    closeSync(fd)
  }
}

export const readStream = (dir: string, id: string) => createReadStream(join(dir, id))

/** Stores the file's preview, sent by the owner's browser: false when it is not a small image of
 *  a type it may be, or the file has no such file or a preview already. Its address never
 *  changes, so a preview is never replaced. */
export function saveThumb(
  db: DatabaseSync,
  dir: string,
  projectId: string,
  id: string,
  bytes: Buffer,
) {
  const kind = sniff(bytes)
  const file = getFile(db, projectId, id)
  if (!kind || !THUMB_TYPES.includes(kind.type) || !file || file.thumb) return false
  if (!kind.width || !kind.height || Math.max(kind.width, kind.height) > THUMB_EDGE) return false
  const path = join(dir, id + THUMB)
  writeFileSync(path + PART, bytes, { mode: 0o600 })
  renameSync(path + PART, path)
  db.prepare('UPDATE files SET thumb_type = ? WHERE project_id = ? AND id = ?').run(
    kind.type,
    projectId,
    id,
  )
  return true
}

/** The preview's media type and a way to read its bytes, or null when the file has none. */
export function readThumb(db: DatabaseSync, dir: string, projectId: string, id: string) {
  const row = db
    .prepare('SELECT thumb_type FROM files WHERE project_id = ? AND id = ?')
    .get(projectId, id) as { thumb_type: string | null } | undefined
  if (!row?.thumb_type) return null
  return { type: row.thumb_type, open: () => createReadStream(join(dir, id + THUMB)) }
}

/** Removes uploads a crash cut off: parts older than `age` ms. */
export function removeStaleParts(dir: string, age = 60 * 60 * 1000, now = Date.now()) {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return // nothing uploaded yet
  }
  for (const name of names)
    if (name.endsWith(PART) && now - statSync(join(dir, name)).mtimeMs > age)
      rmSync(join(dir, name), { force: true })
}

/** False when the project has no such file. */
export function deleteFile(db: DatabaseSync, dir: string, projectId: string, id: string) {
  const gone =
    db.prepare('DELETE FROM files WHERE project_id = ? AND id = ?').run(projectId, id).changes === 1
  if (gone) removeBytes(dir, id)
  return gone
}

/** Renames the file or puts it in one of the project's folders (null: none); its address stays.
 *  False when the project has no such file or folder. */
export function updateFile(
  db: DatabaseSync,
  projectId: string,
  id: string,
  change: { name?: string; folderId?: string | null },
) {
  const file = getFile(db, projectId, id)
  const { name = file?.name, folderId = file?.folderId ?? null } = change
  if (!file || (folderId && !getFolder(db, projectId, folderId))) return false
  db.prepare('UPDATE files SET name = ?, folder_id = ? WHERE project_id = ? AND id = ?').run(
    name!,
    folderId,
    projectId,
    id,
  )
  return true
}

/** Deletes every file of a project, and its folders. */
// shortcut: runs in the core's transaction, but disk is not transactional: if the project's
// deletion rolls back afterwards, its rows stay and their bytes are gone. Unlink after commit if
// that ever bites.
export function deleteProjectFiles(db: DatabaseSync, dir: string, projectId: string) {
  const rows = db.prepare('SELECT id FROM files WHERE project_id = ?').all(projectId) as {
    id: string
  }[]
  db.prepare('DELETE FROM files WHERE project_id = ?').run(projectId)
  db.prepare('DELETE FROM folders WHERE project_id = ?').run(projectId)
  for (const row of rows) removeBytes(dir, row.id)
}

/** By name. */
export const listFolders = (db: DatabaseSync, projectId: string) =>
  db
    .prepare('SELECT id, name FROM folders WHERE project_id = ? ORDER BY name COLLATE NOCASE, id')
    .all(projectId) as unknown as Folder[]

export const getFolder = (db: DatabaseSync, projectId: string, id: string) =>
  (db.prepare('SELECT id, name FROM folders WHERE project_id = ? AND id = ?').get(projectId, id) as
    | Folder
    | undefined) ?? null

const nameTaken = (db: DatabaseSync, projectId: string, name: string, except = '') =>
  !!db
    .prepare('SELECT 1 FROM folders WHERE project_id = ? AND name = ? AND id != ?')
    .get(projectId, name, except)

/** The new folder, or null when the project has one by that name. */
export function createFolder(db: DatabaseSync, projectId: string, name: string, now = Date.now()) {
  if (nameTaken(db, projectId, name)) return null
  const id = newToken('')
  db.prepare('INSERT INTO folders (id, project_id, name, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    projectId,
    name,
    now,
  )
  return { id, name }
}

/** False when another folder of the project has that name. */
export function renameFolder(db: DatabaseSync, projectId: string, id: string, name: string) {
  if (nameTaken(db, projectId, name, id)) return false
  db.prepare('UPDATE folders SET name = ? WHERE project_id = ? AND id = ?').run(name, projectId, id)
  return true
}

/** Deletes the folder with every file in it. */
// shortcut: the rows go in one transaction, the bytes after it; a crash between leaves orphaned
// bytes on disk, never a row without bytes. Sweep orphans if that ever matters.
export function deleteFolder(db: DatabaseSync, dir: string, projectId: string, id: string) {
  const ids = (
    db
      .prepare('SELECT id FROM files WHERE project_id = ? AND folder_id = ?')
      .all(projectId, id) as {
      id: string
    }[]
  ).map((row) => row.id)
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM files WHERE project_id = ? AND folder_id = ?').run(projectId, id)
    db.prepare('DELETE FROM folders WHERE project_id = ? AND id = ?').run(projectId, id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  for (const file of ids) removeBytes(dir, file)
}

/** How many files a project has, and their bytes together. */
export function countFiles(db: DatabaseSync, projectId: string) {
  return db
    .prepare(
      'SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM files WHERE project_id = ?',
    )
    .get(projectId) as { files: number; bytes: number }
}

/** Files uploaded since `since`, newest first: the news on the project's overview. */
export function listNewFiles(db: DatabaseSync, projectId: string, since: number) {
  return db
    .prepare(
      `SELECT id, name, created_at AS at FROM files
      WHERE project_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 30`,
    )
    .all(projectId, since) as { id: string; name: string; at: number }[]
}
