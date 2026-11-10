import { registerModule } from '#nexitas/server/utils/nexitas'
import { repositas } from '#self/server/core/module'
import { maxFileSize } from '#self/server/utils/repositas'

export default defineNitroPlugin(() => registerModule({ ...repositas, maxBody: maxFileSize() }))
