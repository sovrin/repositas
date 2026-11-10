import { announceChange } from '#nexitas/server/utils/changes'
import { invalid } from '#nexitas/server/utils/invalid'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { fileChangeSchema } from '#self/shared/contracts'
import { updateFile } from '#self/server/core/files'
import { routeFile } from '#self/server/utils/repositas'

/** Renames the file or moves it to another folder: `{ name }`, `{ folderId }` (null: none). Its
 *  address stays. */
export default defineEventHandler(async (event) => {
  const project = requestProject(event)
  const file = routeFile(event, project.id)
  const change = fileChangeSchema.safeParse(await readBody(event))
  if (!change.success) throw invalid(change.error)
  if (!updateFile(nexitasDatabase(), project.id, file.id, change.data))
    throw invalid([{ path: 'folderId', message: 'There is no such folder.' }])
  announceChange()
  return { ok: true }
})
