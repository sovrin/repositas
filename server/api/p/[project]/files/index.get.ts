import { nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { requestProject } from '#nexitas/server/utils/projects'
import { listFiles } from '../../../../core/files'

export default defineEventHandler((event) => listFiles(nexitasDatabase(), requestProject(event).id))
