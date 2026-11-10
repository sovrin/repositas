import { registerModule } from '#nexitas/server/utils/nexitas'
import { repositas } from '../core/module'
import { maxFileSize } from '../utils/repositas'

export default defineNitroPlugin(() => registerModule({ ...repositas, maxBody: maxFileSize() }))
