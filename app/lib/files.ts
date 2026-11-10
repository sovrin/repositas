import type { Folder, ProjectFile } from '../../shared/contracts'
import { FILE_TYPES, IMAGE_TYPES, THUMB_EDGE, THUMB_MAX } from '../../shared/contracts'

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
 *  which the server streams to disk. Then its preview, made here from the bytes in hand. */
export async function uploadFile(projectId: string, file: File, folderId?: string | null) {
  const uploaded = await $fetch<ProjectFile>(`/api/p/${projectId}/files`, {
    method: 'POST',
    query: { name: file.name, ...(folderId ? { folder: folderId } : {}) },
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
  await addThumb(projectId, uploaded, file)
  return uploaded
}

const isImage = (file: ProjectFile) => IMAGE_TYPES.includes(file.type)

/** An image larger than a preview may be, still without one. */
export const needsThumb = (file: ProjectFile) =>
  isImage(file) && file.size > THUMB_MAX && !file.thumb

/** What the list shows of a file: a small image as it is, a large one's preview, else nothing. */
export function previewSrc(projectId: string, file: ProjectFile) {
  if (!isImage(file)) return null
  if (file.size <= THUMB_MAX) return file.path
  return file.thumb ? `/api/p/${projectId}/files/${file.id}/thumb` : null
}

/** Makes the file's preview from its bytes and sends it, when it needs one. A preview is a nicety:
 *  whatever fails (a format this browser can't draw, the network) leaves the file without one. */
export async function addThumb(projectId: string, file: ProjectFile, source: Blob) {
  if (!needsThumb(file)) return false
  const thumb = await makeThumb(source)
  if (!thumb || thumb.size > THUMB_MAX) return false
  return $fetch(`/api/p/${projectId}/files/${file.id}/thumb`, {
    method: 'POST',
    body: thumb,
    headers: { 'Content-Type': 'application/octet-stream' },
  }).then(
    () => true,
    () => false,
  )
}

/** The image drawn at most THUMB_EDGE pixels on its longest side, as WebP; as JPEG on white where
 *  the browser can't write WebP (Safari). Null when it can't draw the image. */
async function makeThumb(source: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(source)
    const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')!
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const encode = (type: string) =>
      new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.8))
    const webp = await encode('image/webp')
    if (webp?.type === 'image/webp') return webp
    context.globalCompositeOperation = 'destination-over'
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    return await encode('image/jpeg')
  } catch {
    return null
  }
}
