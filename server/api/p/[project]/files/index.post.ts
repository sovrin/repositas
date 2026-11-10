import { announceChange } from '#nexitas/server/utils/changes'
import { invalid } from '#nexitas/server/utils/invalid'
import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { FILE_TYPES, fileNameSchema } from '../../../../../shared/contracts'
import { getFolder, saveFile } from '../../../../core/files'
import { filesDir } from '../../../../utils/repositas'

/** Uploads one file: its bytes as the body (application/octet-stream), its name as `?name=`, the
 *  folder it goes in, if any, as `?folder=`. The core has checked the announced length against the
 *  largest file. */
export default defineEventHandler(async (event) => {
  const project = requestProject(event)
  const name = fileNameSchema.safeParse(getQuery(event).name)
  if (!name.success) throw invalid([{ path: 'name', message: name.error.issues[0]!.message }])
  const { folder } = getQuery(event)
  const db = nexitasDatabase()
  if (folder !== undefined && !(typeof folder === 'string' && getFolder(db, project.id, folder)))
    throw invalid([{ path: 'folder', message: 'There is no such folder.' }])
  const file = await saveFile(db, filesDir(), project.id, name.data, event.node.req, folder ?? null)
  if (!file)
    throw invalid([
      { path: 'data', message: `Upload a ${Object.values(FILE_TYPES).join(', ')} file.` },
    ])
  announceChange()
  setResponseStatus(event, 201)
  return file
})
