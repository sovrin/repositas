import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '#nexitas/server/core/database'
import { createProject, deleteProject } from '#nexitas/server/core/projects'
import {
  createFolder,
  deleteFile,
  deleteFolder,
  deleteProjectFiles,
  getFile,
  listFiles,
  listFolders,
  readThumb,
  removeStaleParts,
  renameFolder,
  saveFile,
  saveThumb,
  updateFile,
} from '../../server/core/files'
import { repositas } from '../../server/core/module'
import { sniff } from '../../server/core/sniff'

const dirs: string[] = []
const dbs: DatabaseSync[] = []
afterEach(() => {
  for (const db of dbs.splice(0)) if (db.isOpen) db.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'repositas-test-'))
  dirs.push(dir)
  const db = openDatabase(join(dir, 'test.sqlite'), [repositas])
  dbs.push(db)
  createProject(db, { id: 'sonotas', name: 'sonotas', origins: [] })
  createProject(db, { id: 'other', name: 'other', origins: [] })
  return { db, files: join(dir, 'files') }
}

const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(
    parts.map((part) =>
      typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part),
    ),
  )
const u16be = (n: number) => [n >> 8, n & 0xff]
const u32be = (n: number) => [0, 0, ...u16be(n)]

const pngOf = (width: number, height: number) =>
  bytes('\x89PNG\r\n\x1A\n', u32be(13), 'IHDR', u32be(width), u32be(height), [8, 6, 0, 0, 0])
const png = bytes('\x89PNG\r\n\x1A\n', u32be(13), 'IHDR', u32be(640), u32be(480), [8, 6, 0, 0, 0])
// SOI, an APP0 segment to skip, then a baseline frame of 300 × 200.
const jpeg = bytes(
  [0xff, 0xd8, 0xff, 0xe0],
  u16be(16),
  'JFIF\0',
  Array(9).fill(0),
  [0xff, 0xc0],
  u16be(17),
  [8],
  u16be(200),
  u16be(300),
  Array(12).fill(0),
)

describe('sniff', () => {
  it('reads the type and size from the bytes', () => {
    expect(sniff(png)).toEqual({ type: 'image/png', width: 640, height: 480 })
    expect(sniff(jpeg)).toEqual({ type: 'image/jpeg', width: 300, height: 200 })
    expect(sniff(bytes('GIF89a', [0x20, 0x01, 0x10, 0x00]))).toEqual({
      type: 'image/gif',
      width: 288,
      height: 16,
    })
    // VP8X: width - 1 and height - 1 as 24-bit little-endian numbers.
    const webp = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8X', Array(8).fill(0), [99, 0, 0, 49, 0, 0])
    expect(sniff(webp)).toEqual({ type: 'image/webp', width: 100, height: 50 })
    expect(sniff(bytes('%PDF-1.7\n'))).toEqual({
      type: 'application/pdf',
      width: null,
      height: null,
    })
  })

  it('refuses what it does not take, whatever the name says, and survives a cut header', () => {
    expect(sniff(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(sniff(bytes('<!doctype html>'))).toBeNull()
    expect(sniff(bytes('\x89PNG\r\n\x1A\n'))).toEqual({
      type: 'image/png',
      width: null,
      height: null,
    })
  })
})

describe('files', () => {
  it("stores, lists and deletes a project's files, scoped by the project", async () => {
    const { db, files } = setup()
    const saved = (await saveFile(db, files, 'sonotas', 'hero.png', Readable.from([png])))!
    expect(saved).toMatchObject({ name: 'hero.png', type: 'image/png', size: png.length })
    expect(saved.path).toBe(`/v1/files/sonotas/${saved.id}`)
    expect(saved.id).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(existsSync(join(files, saved.id))).toBe(true)
    expect(
      await saveFile(db, files, 'sonotas', 'evil.png', Readable.from([bytes('<svg/>')])),
    ).toBeNull()
    expect(listFiles(db, 'sonotas').map((file) => file.id)).toEqual([saved.id])
    // Another project cannot see it, read it through the capability, or delete it.
    expect(getFile(db, 'other', saved.id)).toBeNull()
    expect(repositas.provides!.files!.get(db, 'other', saved.id)).toBeNull()
    expect(repositas.provides!.files!.get(db, 'sonotas', saved.id)).toMatchObject({
      width: 640,
      height: 480,
    })
    expect(deleteFile(db, files, 'other', saved.id)).toBe(false)
    expect(deleteFile(db, files, 'sonotas', saved.id)).toBe(true)
    expect(existsSync(join(files, saved.id))).toBe(false)
  })

  it('sorts files into folders, and deletes a folder with its files', async () => {
    const { db, files } = setup()
    const blog = createFolder(db, 'sonotas', 'Blog')!
    const team = createFolder(db, 'sonotas', 'Team')!
    expect(createFolder(db, 'sonotas', 'Blog')).toBeNull()
    expect(renameFolder(db, 'sonotas', team.id, 'Blog')).toBe(false)
    expect(renameFolder(db, 'sonotas', team.id, 'About')).toBe(true)
    expect(listFolders(db, 'sonotas').map((folder) => folder.name)).toEqual(['About', 'Blog'])
    const other = createFolder(db, 'other', 'Theirs')!

    const kept = (await saveFile(db, files, 'sonotas', 'a.png', Readable.from([png])))!
    const gone = (await saveFile(db, files, 'sonotas', 'b.png', Readable.from([png]), blog.id))!
    expect(gone.folderId).toBe(blog.id)
    // Renamed and moved, at the same address; never into another project's folder.
    expect(updateFile(db, 'sonotas', kept.id, { name: 'hero.png', folderId: team.id })).toBe(true)
    expect(getFile(db, 'sonotas', kept.id)).toMatchObject({
      name: 'hero.png',
      folderId: team.id,
      path: kept.path,
    })
    expect(updateFile(db, 'sonotas', kept.id, { folderId: other.id })).toBe(false)
    expect(updateFile(db, 'other', kept.id, { name: 'x.png' })).toBe(false)
    expect(updateFile(db, 'sonotas', kept.id, { folderId: null })).toBe(true)
    expect(getFile(db, 'sonotas', kept.id)).toMatchObject({ name: 'hero.png', folderId: null })

    deleteFolder(db, files, 'other', blog.id) // not theirs: nothing happens
    expect(getFile(db, 'sonotas', gone.id)).not.toBeNull()
    deleteFolder(db, files, 'sonotas', blog.id)
    expect(listFiles(db, 'sonotas').map((file) => file.id)).toEqual([kept.id])
    expect(existsSync(join(files, gone.id))).toBe(false)
    expect(listFolders(db, 'sonotas').map((folder) => folder.name)).toEqual(['About'])
  })

  it('keeps one small preview per file, and drops it with the file', async () => {
    const { db, files } = setup()
    const saved = (await saveFile(db, files, 'sonotas', 'big.png', Readable.from([png])))!
    expect(saved.thumb).toBe(false)
    // Too large, not an image it takes, or another project's file: refused.
    expect(saveThumb(db, files, 'sonotas', saved.id, pngOf(640, 480))).toBe(false)
    expect(saveThumb(db, files, 'sonotas', saved.id, bytes('%PDF-1.7\n'))).toBe(false)
    expect(saveThumb(db, files, 'other', saved.id, pngOf(320, 240))).toBe(false)
    expect(saveThumb(db, files, 'sonotas', saved.id, pngOf(320, 240))).toBe(true)
    expect(getFile(db, 'sonotas', saved.id)!.thumb).toBe(true)
    expect(readThumb(db, files, 'sonotas', saved.id)!.type).toBe('image/png')
    expect(readThumb(db, files, 'other', saved.id)).toBeNull()
    // Its address never changes, so it is never replaced.
    expect(saveThumb(db, files, 'sonotas', saved.id, pngOf(160, 120))).toBe(false)
    expect(existsSync(join(files, `${saved.id}.thumb`))).toBe(true)
    deleteFile(db, files, 'sonotas', saved.id)
    expect(readdirSync(files)).toEqual([])
  })

  it('goes with its project, which its rows would otherwise hold on to', async () => {
    const { db, files } = setup()
    const folder = createFolder(db, 'sonotas', 'Blog')!
    const saved = (await saveFile(db, files, 'sonotas', 'a.jpg', Readable.from([jpeg]), folder.id))!
    expect(() => deleteProject(db, 'sonotas', [])).toThrow()
    // What the module's deleteProject runs, with a test folder for the data directory.
    deleteProject(db, 'sonotas', [
      { id: 'repositas', deleteProject: (db, id) => deleteProjectFiles(db, files, id) },
    ])
    expect(listFiles(db, 'sonotas')).toEqual([])
    expect(listFolders(db, 'sonotas')).toEqual([])
    expect(existsSync(join(files, saved.id))).toBe(false)
  })

  it('leaves nothing behind when an upload breaks off, and clears parts a crash left', async () => {
    const { db, files } = setup()
    const broken = new Readable({
      read() {
        this.push(png)
        this.destroy(new Error('aborted'))
      },
    })
    await expect(saveFile(db, files, 'sonotas', 'cut.png', broken)).rejects.toThrow('aborted')
    expect(readdirSync(files)).toEqual([])
    expect(listFiles(db, 'sonotas')).toEqual([])
    mkdirSync(files, { recursive: true })
    writeFileSync(join(files, 'old.part'), 'x')
    writeFileSync(join(files, 'new.part'), 'x')
    utimesSync(join(files, 'old.part'), 0, 0)
    removeStaleParts(files)
    expect(readdirSync(files)).toEqual(['new.part'])
  })
})
