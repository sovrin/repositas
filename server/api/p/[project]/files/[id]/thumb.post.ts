import { announceChange } from '#nexitas/server/utils/changes'
import { invalid } from '#nexitas/server/utils/invalid'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { THUMB_MAX } from '../../../../../../shared/contracts'
import { saveThumb } from '../../../../../core/files'
import { filesDir, routeFile } from '../../../../../utils/repositas'

/** Stores the file's preview: a small image the owner's browser made of it, as the body
 *  (application/octet-stream). Read whole, so its announced length is checked first. */
export default defineEventHandler(async (event) => {
  const project = requestProject(event)
  const file = routeFile(event, project.id)
  if (Number(getRequestHeader(event, 'content-length')) > THUMB_MAX)
    throw createError({ statusCode: 413, statusMessage: 'A preview is at most 256 kB.' })
  const bytes = (await readRawBody(event, false)) ?? Buffer.alloc(0)
  if (!saveThumb(nexitasDatabase(), filesDir(), project.id, file.id, bytes))
    throw invalid([{ path: 'data', message: 'Send a small image, once.' }])
  announceChange()
  setResponseStatus(event, 201)
  return { ok: true }
})
