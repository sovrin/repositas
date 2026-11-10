import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { getProject } from '#nexitas/server/core/projects'
import { readStream } from '#self/server/core/files'
import { filesDir, routeFile } from '#self/server/utils/repositas'

/** A file's bytes, for anyone with its address. They never change under an id, so caches keep
 *  them for good. */
export default defineEventHandler((event) => {
  const project = getProject(nexitasDatabase(), getRouterParam(event, 'project') ?? '')
  if (!project) throw createError({ statusCode: 404, statusMessage: 'There is no such file.' })
  const file = routeFile(event, project.id)
  setHeaders(event, {
    'Content-Type': file.type,
    'Content-Length': String(file.size),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'Cache-Control': 'public, max-age=31536000, immutable',
  })
  // Streamed, so a large file never sits in memory.
  return sendStream(event, readStream(filesDir(), file.id))
})
