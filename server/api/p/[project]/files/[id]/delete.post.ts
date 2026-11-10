import { announceChange } from '#nexitas/server/utils/changes'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { deleteFile } from '../../../../../core/files'
import { filesDir, routeFile } from '../../../../../utils/repositas'

/** Deletes the file; its address answers 404 from then on, wherever it is used. */
export default defineEventHandler((event) => {
  const project = requestProject(event)
  deleteFile(nexitasDatabase(), filesDir(), project.id, routeFile(event, project.id).id)
  announceChange()
  return { ok: true }
})
