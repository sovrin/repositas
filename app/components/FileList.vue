<script setup lang="ts">
import { formatAge, plural } from '#nexitas/app/lib/format'
import type { Folder, ProjectFile } from '../../shared/contracts'
import { FILE_TYPES, formatSize } from '../../shared/contracts'
import {
  acceptTypes,
  addThumb,
  needsThumb,
  previewSrc,
  uploadFile,
  useProjectFiles,
  useProjectFolders,
} from '../lib/files'

/** <FileList :selected="id" :aside-name="name"><template #aside>…</template></FileList>
 *  The project's files as folders: the folders and the files in none, or one folder's files
 *  (`?folder=<id>`), with their filter, search and page in the address, and Upload. A search
 *  outside a folder finds files in all of them. A file's page renders it too, with `selected`
 *  marking its row and the file in `aside` (the inspector). Without a file, the inspector holds a
 *  new folder (`?add`) or the open folder (`?edit`). */
defineProps<{ selected?: string; asideName?: string }>()
const slots = defineSlots<{ aside?: () => unknown; danger?: () => unknown }>()

const PAGE_SIZE = 50
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'images', label: 'Images' },
  { value: 'documents', label: 'Documents' },
] as const
type Filter = (typeof FILTERS)[number]['value']

const route = useRoute()
const project = useProject().id.value
const [{ data: files, error, refresh }, { data: folders, refresh: refreshFolders }] =
  await Promise.all([useProjectFiles(), useProjectFolders()])

const openFolder = computed(() => folders.value?.find((known) => known.id === route.query.folder))
const adding = computed(() => !slots.aside && !openFolder.value && route.query.add !== undefined)
const editing = computed(() => !slots.aside && route.query.edit !== undefined && !!openFolder.value)

const filter = computed<Filter>(() =>
  route.query.show === 'images' || route.query.show === 'documents' ? route.query.show : 'all',
)
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

/** The list's address for a folder, filter, search or page, leaving out the defaults and closing
 *  a folder's inspector. Anything new starts on the first page. */
function within(next: { folder?: string | null; show?: Filter; q?: string; page?: number }) {
  const query = {
    folder: openFolder.value?.id ?? null,
    show: filter.value,
    q: q.value,
    page: 1,
    ...next,
  }
  return {
    path: `/p/${project}/files`,
    query: {
      ...(query.folder ? { folder: query.folder } : {}),
      ...(query.show !== 'all' ? { show: query.show } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(query.page > 1 ? { page: String(query.page) } : {}),
    },
  }
}

const searchText = ref(q.value)
watch(q, (value) => (searchText.value = value))
const search = () => navigateTo(within({ q: searchText.value.trim() }))

const all = computed(() => files.value ?? [])
// Searching outside a folder looks in all of them, so the rows say where each file is.
const everywhere = computed(() => !openFolder.value && !!q.value)
const pool = computed(() =>
  everywhere.value
    ? all.value
    : all.value.filter((file) => file.folderId === (openFolder.value?.id ?? null)),
)
const isImage = (type: string) => type.startsWith('image/')
const images = computed(() => pool.value.filter((file) => isImage(file.type)).length)
const counts = computed((): Record<Filter, number> => ({
  all: pool.value.length,
  images: images.value,
  documents: pool.value.length - images.value,
}))
const needle = computed(() => q.value.toLowerCase())
const shownFiles = computed(() =>
  pool.value.filter(
    (file) =>
      (filter.value === 'all' || isImage(file.type) === (filter.value === 'images')) &&
      (!needle.value || file.name.toLowerCase().includes(needle.value)),
  ),
)
// Folders lead the top level, with what is in them; a type filter shows files only.
const shownFolders = computed(() =>
  openFolder.value || filter.value !== 'all'
    ? []
    : (folders.value ?? [])
        .filter((known) => !needle.value || known.name.toLowerCase().includes(needle.value))
        .map((known) => {
          const inside = all.value.filter((file) => file.folderId === known.id)
          return {
            folder: known,
            files: inside.length,
            bytes: inside.reduce((sum, file) => sum + file.size, 0),
          }
        }),
)
type Row = { folder: Folder; files: number; bytes: number } | { file: ProjectFile }
const rows = computed((): Row[] => [
  ...shownFolders.value,
  ...shownFiles.value.map((file) => ({ file })),
])
const pageRows = computed(() =>
  rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
const folderName = (id: string | null) => folders.value?.find((known) => known.id === id)?.name
const headline = computed(() =>
  all.value.length
    ? `${formatSize(all.value.reduce((sum, file) => sum + file.size, 0))} stored`
    : 'No files yet',
)
// In a folder, the trail leads back to the top level; a file's page has the section's own.
const trail = computed(() =>
  openFolder.value && !slots.aside ? [{ label: 'Files', to: `/p/${project}/files` }] : [],
)

// One file opens beside the list once uploaded; several stay in the list.
const { pending, error: uploadError, submit } = useSubmit()
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = [...(input.files ?? [])]
  input.value = ''
  return upload(picked)
}
async function upload(picked: File[]) {
  if (!picked.length || pending.value) return
  let last
  for (const file of picked) {
    last = await submit(() => uploadFile(project, file, openFolder.value?.id))
    if (!last) break
  }
  await refresh()
  if (last && picked.length === 1)
    await navigateTo({ path: `/p/${project}/files/${last.id}`, query: within({}).query })
}

// Large images uploaded before previews, or where making one failed, get one once they are shown:
// this browser fetches the image and draws it small. Each is tried once while the list is open.
const tried = new Set<string>()
// Images this browser could not draw show their icon instead.
const unreadable = reactive(new Set<string>())
async function fillThumbs() {
  const missing = pageRows.value.flatMap((row) =>
    'file' in row && needsThumb(row.file) && !tried.has(row.file.id) ? [row.file] : [],
  )
  if (!missing.length) return
  for (const file of missing) {
    tried.add(file.id)
    const source = await fetch(file.path).then(
      (response) => (response.ok ? response.blob() : null),
      () => null,
    )
    if (source) await addThumb(project, file, source)
  }
  await refresh()
}
onMounted(() => watch(pageRows, fillThumbs, { immediate: true }))

// Files dropped anywhere on the page: aequitas' page dropzone shows while they are dragged and
// keeps the browser from opening them; a file input takes its own drop.
function dropped(event: DragEvent) {
  if ((event.target as Element).closest?.('input[type="file"]')) return
  upload([...(event.dataTransfer?.files ?? [])])
}
onMounted(() => window.addEventListener('drop', dropped))
onUnmounted(() => window.removeEventListener('drop', dropped))

async function folderSaved(saved: { id: string }) {
  await refreshFolders()
  await navigateTo(within({ folder: saved.id, q: '', show: 'all' }))
}

const deleting = useSubmit()
async function removeFolder() {
  const id = openFolder.value!.id
  const done = await deleting.submit(() =>
    $fetch(`/api/p/${project}/files/folders/${id}/delete`, { method: 'POST', body: {} }),
  )
  if (!done) return
  await Promise.all([refresh(), refreshFolders()])
  await navigateTo(within({ folder: null }))
}
</script>

<template>
  <AppPage
    :title="openFolder?.name ?? 'Files'"
    :trail="trail"
    failed="Could not load this project's files."
    :error="error"
    :retry="refresh"
    :aside-name="editing ? openFolder!.name : asideName"
    :aside-title="adding ? 'New folder' : undefined"
    :aside-close="
      slots.aside
        ? { path: `/p/${project}/files`, query: route.query }
        : adding || editing
          ? within({})
          : undefined
    "
  >
    <template #actions>
      <template v-if="!slots.aside">
        <NuxtLink
          v-if="openFolder"
          class="btn"
          data-size="s"
          data-variant="ghost"
          :to="{ query: { ...within({}).query, edit: null } }"
          >Edit folder</NuxtLink
        >
        <NuxtLink
          v-else
          class="btn"
          data-size="s"
          data-variant="ghost"
          :to="{ query: { ...within({}).query, add: null } }"
          >New folder</NuxtLink
        >
      </template>
      <!-- The inspector's own controls hold the view while it is open. -->
      <label
        class="btn"
        data-size="s"
        :data-variant="slots.aside || adding || editing ? undefined : 'primary'"
        :aria-busy="pending || undefined"
        >Upload<input
          type="file"
          class="sr-only"
          multiple
          :accept="acceptTypes()"
          :disabled="pending"
          @change="choose"
      /></label>
    </template>
    <template #lead>
      <AppLead v-if="!openFolder" :title="headline">
        <template #meta
          >{{ Object.values(FILE_TYPES).join(', ') }}. Anyone with a file's address can read
          it.</template
        >
      </AppLead>
      <AppAlert v-if="uploadError" title="Could not upload.">{{ uploadError }}</AppAlert>
    </template>
    <template v-if="all.length || folders?.length" #filters>
      <FilterLinks
        label="Show"
        :options="
          FILTERS.map((option) => ({
            label: `${option.label} ${counts[option.value]}`,
            to: within({ show: option.value }),
            current: filter === option.value,
          }))
        "
      />
      <SearchBox
        v-model="searchText"
        :label="openFolder ? 'Search this folder by name' : 'Search all files by name'"
        @search="search"
      />
    </template>

    <div v-if="pageRows.length" class="stack gap-6">
      <DataTable label="Files">
        <thead>
          <tr>
            <th scope="col">File</th>
            <th v-if="everywhere" scope="col">Folder</th>
            <th scope="col">Type</th>
            <th scope="col" data-num>Size</th>
            <th scope="col" data-num>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in pageRows" :key="'folder' in row ? row.folder.id : row.file.id">
            <tr v-if="'folder' in row">
              <td>
                <NuxtLink
                  :to="within({ folder: row.folder.id, q: '', show: 'all' })"
                  class="link cluster gap-3 flex-nowrap"
                  ><span class="frame size-6 bg-fill" data-ratio="square"
                    ><span class="grid place-center"
                      ><i class="icon" data-icon="folder" aria-hidden="true"></i></span></span
                  ><span class="break-words min-w-0">{{ row.folder.name }}</span></NuxtLink
                >
              </td>
              <td v-if="everywhere"></td>
              <td class="text-s">Folder · {{ plural(row.files, 'file') }}</td>
              <td data-num class="text-muted">{{ row.files ? formatSize(row.bytes) : '' }}</td>
              <td></td>
            </tr>
            <tr v-else :aria-selected="row.file.id === selected ? 'true' : undefined">
              <td>
                <NuxtLink
                  :to="{ path: `/p/${project}/files/${row.file.id}`, query: route.query }"
                  class="link cluster gap-3 flex-nowrap"
                  ><span class="frame size-6 bg-fill" data-ratio="square"
                    ><img
                      v-if="previewSrc(project, row.file) && !unreadable.has(row.file.id)"
                      :src="previewSrc(project, row.file)!"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      @error="unreadable.add(row.file.id)" /><span v-else class="grid place-center"
                      ><i
                        class="icon"
                        :data-icon="row.file.type.startsWith('image/') ? 'image' : 'file-text'"
                        aria-hidden="true"
                      ></i></span></span
                  ><span class="break-words min-w-0">{{ row.file.name }}</span></NuxtLink
                >
              </td>
              <td v-if="everywhere" class="text-s text-muted">
                {{ folderName(row.file.folderId) ?? '' }}
              </td>
              <td class="text-s">{{ FILE_TYPES[row.file.type] ?? row.file.type }}</td>
              <td data-num class="text-muted">{{ formatSize(row.file.size) }}</td>
              <td data-num class="text-muted">
                <time>{{ formatAge(row.file.createdAt) }}</time>
              </td>
            </tr>
          </template>
        </tbody>
      </DataTable>
      <PagerNav
        :page="page"
        :page-size="PAGE_SIZE"
        :total="rows.length"
        :to="(next) => within({ page: next })"
      />
    </div>
    <EmptyState v-else-if="!all.length && !folders?.length"
      >Upload images and documents; each gets an address your sites can use.</EmptyState
    >
    <EmptyState v-else-if="q">Nothing matches “{{ q }}” here.</EmptyState>
    <EmptyState v-else-if="openFolder && !pool.length"
      >Nothing in this folder yet; Upload puts files here.</EmptyState
    >
    <EmptyState v-else>Nothing here.</EmptyState>

    <!-- Fixed to the viewport: under the panes' glass it would cover only the pane. -->
    <Teleport to="body">
      <div class="dropzone" data-page aria-hidden="true">
        <strong>Drop to upload{{ openFolder ? ` to ${openFolder.name}` : '' }}</strong>
        {{ Object.values(FILE_TYPES).join(', ') }}
      </div>
    </Teleport>

    <template v-if="slots.aside" #aside><slot name="aside" /></template>
    <template v-else-if="adding" #aside><FolderForm @saved="folderSaved" /></template>
    <template v-else-if="editing" #aside>
      <FolderForm :key="openFolder!.id" :folder="openFolder" @saved="folderSaved" />
    </template>
    <template v-if="slots.danger" #danger><slot name="danger" /></template>
    <template v-else-if="editing" #danger>
      <span>Deletes the folder and every file in it; their addresses stop working.</span>
      <DangerAction
        label="Delete folder"
        :title="`Delete ${openFolder!.name} and its files?`"
        :confirm-word="openFolder!.name"
        :pending="deleting.pending.value"
        @confirm="removeFolder"
      >
        This cannot be undone.
      </DangerAction>
      <AppAlert v-if="deleting.error.value" class="w-full" title="Could not delete the folder.">{{
        deleting.error.value
      }}</AppAlert>
    </template>
  </AppPage>
</template>
