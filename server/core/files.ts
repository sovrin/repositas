// A project's files: what is known about each in the files table, the bytes on disk as
// <dir>/<id>. The id is random and the only name on disk, so no project id or file name ever
// becomes part of a path.
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
} from 'node:fs'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { DatabaseSync } from 'node:sqlite'
import { newToken } from '#nexitas/server/core/auth'
import type { ProjectFile } from '../../shared/contracts'
import { sniff } from './sniff'

interface FileRow {
  id: string
  name: string
  type: string
  size: number
  width: number | null
  height: number | null
  created_at: number
}

const COLUMNS = 'id, name, type, size, width, height, created_at'

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

/** Streams the file to disk, so its size never touches memory, then stores it; or answers null
 *  when it is not a type repositas takes (see sniff). An upload that breaks off leaves nothing. */
export async function saveFile(
  db: DatabaseSync,
  dir: string,
  projectId: string,
  name: string,
  source: Readable,
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
        `INSERT INTO files (id, project_id, name, type, size, width, height, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, projectId, name, kind.type, size, kind.width, kind.height, now)
    } catch (error) {
      rmSync(path, { force: true })
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
  if (gone) rmSync(join(dir, id), { force: true })
  return gone
}

/** Deletes every file of a project. */
// shortcut: runs in the core's transaction, but disk is not transactional: if the project's
// deletion rolls back afterwards, its rows stay and their bytes are gone. Unlink after commit if
// that ever bites.
export function deleteProjectFiles(db: DatabaseSync, dir: string, projectId: string) {
  const rows = db.prepare('SELECT id FROM files WHERE project_id = ?').all(projectId) as {
    id: string
  }[]
  db.prepare('DELETE FROM files WHERE project_id = ?').run(projectId)
  for (const row of rows) rmSync(join(dir, row.id), { force: true })
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
