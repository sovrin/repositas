import { z } from 'zod'
import { announceChange } from '#nexitas/server/utils/changes'
import { invalid } from '#nexitas/server/utils/invalid'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { folderNameSchema } from '../../../../../../../shared/contracts'
import { renameFolder } from '../../../../../../core/files'
import { routeFolder } from '../../../../../../utils/repositas'

/** Renames the folder: `{ name }`. */
export default defineEventHandler(async (event) => {
  const project = requestProject(event)
  const folder = routeFolder(event, project.id)
  const body = z.object({ name: folderNameSchema }).safeParse(await readBody(event))
  if (!body.success) throw invalid(body.error)
  if (!renameFolder(nexitasDatabase(), project.id, folder.id, body.data.name))
    throw invalid([{ path: 'name', message: 'There is a folder by that name.' }])
  announceChange()
  return { ok: true }
})
