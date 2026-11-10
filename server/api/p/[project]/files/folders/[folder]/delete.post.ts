import { announceChange } from '#nexitas/server/utils/changes'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { deleteFolder } from '../../../../../../core/files'
import { filesDir, routeFolder } from '../../../../../../utils/repositas'

/** Deletes the folder with every file in it; their addresses answer 404 from then on. */
export default defineEventHandler((event) => {
  const project = requestProject(event)
  deleteFolder(nexitasDatabase(), filesDir(), project.id, routeFolder(event, project.id).id)
  announceChange()
  return { ok: true }
})
