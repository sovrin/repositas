import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { listFolders } from '../../../../../core/files'

export default defineEventHandler((event) =>
  listFolders(nexitasDatabase(), requestProject(event).id),
)
