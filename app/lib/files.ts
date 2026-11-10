import type { Folder, ProjectFile } from '../../shared/contracts'
import { FILE_TYPES, IMAGE_TYPES } from '../../shared/contracts'

/** What the file inputs offer: every type repositas takes, or its images only. */
export const acceptTypes = (images = false) =>
  (images ? IMAGE_TYPES : Object.keys(FILE_TYPES)).join(',')

/** The project's files, shared by the Files page, a file beside it and every picker. */
export const useProjectFiles = () =>
  useProjectFetch<ProjectFile[]>('/files', { key: `repositas-files-${useProject().id.value}` })

/** The project's folders, by name. */
export const useProjectFolders = () =>
  useProjectFetch<Folder[]>('/files/folders', {
    key: `repositas-folders-${useProject().id.value}`,
  })

/** Uploads one file to the open project's files, into a folder if given: its bytes as they are,
 *  which the server streams to disk. */
export const uploadFile = (projectId: string, file: File, folderId?: string | null) =>
  $fetch<ProjectFile>(`/api/p/${projectId}/files`, {
    method: 'POST',
    query: { name: file.name, ...(folderId ? { folder: folderId } : {}) },
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
