import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { readThumb } from '#self/server/core/files'
import { filesDir, routeFile } from '#self/server/utils/repositas'

/** The file's preview, for the owner's list. It never changes, so the browser keeps it. */
export default defineEventHandler((event) => {
  const project = requestProject(event)
  const thumb = readThumb(
    nexitasDatabase(),
    filesDir(),
    project.id,
    routeFile(event, project.id).id,
  )
  if (!thumb) throw createError({ statusCode: 404, statusMessage: 'This file has no preview.' })
  setResponseHeaders(event, {
    'Content-Type': thumb.type,
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
  return sendStream(event, thumb.open())
})
