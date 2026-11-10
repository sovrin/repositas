// repositas as a nexitas module: its schema, the public route files are read at, what it says
// about a project, and the files capability other modules (veritas' image fields) use.
import { readOnlyCors } from '#nexitas/server/utils/cors'
import { formatCount, plural } from '#nexitas/app/lib/format'
import type { NexitasModule } from '#nexitas/shared/modules'
import { formatSize } from '../../shared/contracts'
import { filesDir } from '../utils/repositas'
import { countFiles, deleteProjectFiles, getFile, listNewFiles, removeStaleParts } from './files'

export const repositas: NexitasModule = {
  id: 'repositas',
  migrations: [
    // The bytes are on disk under the id (see files.ts); a row says what they are.
    `CREATE TABLE files (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL,
      width INTEGER, height INTEGER, created_at INTEGER NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX files_newest ON files(project_id, created_at);`,
    // Folders sort a project's files, one level, a file in one or none.
    `CREATE TABLE folders (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE (project_id, name)
    ) WITHOUT ROWID;
    ALTER TABLE files ADD COLUMN folder_id TEXT REFERENCES folders(id);
    CREATE INDEX files_folder ON files(folder_id);`,
  ],
  // Read by sites anywhere, in an <img> or a link, so the address alone is the key.
  publicRoutes: [
    {
      path: /^\/v1\/files\/[a-z0-9-]+\/[A-Za-z0-9_-]{32}$/,
      json: true,
      guard: (event) => readOnlyCors(event, 'Files are only read here.'),
    },
  ],
  // Everything repositas serves; switched off, all of it answers 404.
  paths: ['/files', '/api/files', '/v1/files'],
  // Uploads are the file's bytes, streamed to disk. Its maxBody, the largest file, is configured,
  // so the plugin sets it once the app's environment can be read (maxFileSize).
  rawBody: true,
  hourly: () => removeStaleParts(filesDir()),
  projectStatus: (db, projectId) => {
    const { files, bytes } = countFiles(db, projectId)
    if (!files) return []
    return [
      {
        text: `${plural(files, 'file')} · ${formatSize(bytes)}`,
        to: `/p/${projectId}/files`,
        figure: formatCount(files),
      },
    ]
  },
  projectActivity: (db, projectId, since) =>
    listNewFiles(db, projectId, since).map((file) => ({
      at: file.at,
      title: 'File uploaded',
      detail: file.name,
      to: `/p/${projectId}/files/${file.id}`,
    })),
  deleteProject: (db, projectId) => deleteProjectFiles(db, filesDir(), projectId),
  provides: { files: { get: getFile } },
}
