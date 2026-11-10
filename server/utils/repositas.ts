import { resolve } from 'node:path'
import type { H3Event } from 'h3'
import { nexitasEnv, nexitasDatabase } from '#nexitas/server/utils/nexitas'
import { FILE_ID } from '../../shared/contracts'
import { getFile, getFolder } from '../core/files'

/** Where the bytes are: beside the database, in the data directory. */
export const filesDir = () => resolve(nexitasEnv('DATA_DIR')!, 'repositas')

/** The largest upload, in bytes: <APP>_REPOSITAS_MAX_FILE_MB megabytes, 1024 when unset. It guards
 *  the disk and the connection, not memory: uploads stream to disk. */
export function maxFileSize() {
  const configured = nexitasEnv('REPOSITAS_MAX_FILE_MB')
  const mb = configured === undefined ? 1024 : Number(configured)
  if (!Number.isInteger(mb) || mb < 1)
    throw new Error(`REPOSITAS_MAX_FILE_MB must be a whole number of megabytes, not ${configured}.`)
  return mb * 1024 * 1024
}

/** The route's file of `projectId`, or a 404. */
export function routeFile(event: H3Event, projectId: string) {
  const id = getRouterParam(event, 'id') ?? ''
  const file = FILE_ID.test(id) ? getFile(nexitasDatabase(), projectId, id) : null
  if (!file) throw createError({ statusCode: 404, statusMessage: 'There is no such file.' })
  return file
}

/** The route's folder of `projectId`, or a 404. */
export function routeFolder(event: H3Event, projectId: string) {
  const id = getRouterParam(event, 'folder') ?? ''
  const folder = FILE_ID.test(id) ? getFolder(nexitasDatabase(), projectId, id) : null
  if (!folder) throw createError({ statusCode: 404, statusMessage: 'There is no such folder.' })
  return folder
}
