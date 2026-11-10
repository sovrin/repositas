import { z } from 'zod'
import { announceChange } from '#nexitas/server/utils/changes'
import { invalid } from '#nexitas/server/utils/invalid'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { folderNameSchema } from '#self/shared/contracts'
import { createFolder } from '#self/server/core/files'

/** Creates a folder: `{ name }`. */
export default defineEventHandler(async (event) => {
  const project = requestProject(event)
  const body = z.object({ name: folderNameSchema }).safeParse(await readBody(event))
  if (!body.success) throw invalid(body.error)
  const folder = createFolder(nexitasDatabase(), project.id, body.data.name)
  if (!folder) throw invalid([{ path: 'name', message: 'There is a folder by that name.' }])
  announceChange()
  setResponseStatus(event, 201)
  return folder
})
