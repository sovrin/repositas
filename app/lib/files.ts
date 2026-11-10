import type { ProjectFile } from '../../shared/contracts'
import { FILE_TYPES, IMAGE_TYPES } from '../../shared/contracts'

/** What the file inputs offer: every type repositas takes, or its images only. */
export const acceptTypes = (images = false) =>
  (images ? IMAGE_TYPES : Object.keys(FILE_TYPES)).join(',')

/** The project's files, shared by the Files page, a file beside it and every picker. */
export const useProjectFiles = () =>
  useProjectFetch<ProjectFile[]>('/files', { key: `repositas-files-${useProject().id.value}` })

/** Uploads one file to the open project's files: its bytes as they are, which the server streams
 *  to disk. */
export const uploadFile = (projectId: string, file: File) =>
  $fetch<ProjectFile>(`/api/p/${projectId}/files`, {
    method: 'POST',
    query: { name: file.name },
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
