<script setup lang="ts">
import { formatAge } from '#nexitas/app/lib/format'
import { FILE_TYPES, formatSize } from '../../shared/contracts'
import { acceptTypes, uploadFile, useProjectFiles, useProjectFolders } from '../lib/files'

/** <FileList :selected="id" :aside-name="name"><template #aside>…</template></FileList>
 *  The project's files: their folder, filter, search and page in the address, and Upload. A file's
 *  page renders it too, with `selected` marking its row and the file in `aside` (the inspector).
 *  Without a file, the inspector holds a new folder (`?add`) or the open folder (`?edit`). */
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

// All files, those in no folder ('none'), or one folder's by its id.
const folder = computed(() => {
  const value = route.query.folder
  return value === 'none' || folders.value?.some((known) => known.id === value)
    ? (value as string)
    : 'all'
})
const openFolder = computed(() => folders.value?.find((known) => known.id === folder.value))
const adding = computed(() => !slots.aside && route.query.add !== undefined)
const editing = computed(() => !slots.aside && route.query.edit !== undefined && !!openFolder.value)

const filter = computed<Filter>(() =>
  route.query.show === 'images' || route.query.show === 'documents' ? route.query.show : 'all',
)
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

/** The list's address for a folder, filter, search or page, leaving out the defaults and closing
 *  a folder's inspector. Anything new starts on the first page. */
function within(next: { folder?: string; show?: Filter; q?: string; page?: number }) {
  const query = { folder: folder.value, show: filter.value, q: q.value, page: 1, ...next }
  return {
    path: `/p/${project}/files`,
    query: {
      ...(query.folder !== 'all' ? { folder: query.folder } : {}),
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
const folderName = computed(
  () => new Map((folders.value ?? []).map((known) => [known.id, known.name])),
)
const folderCount = (id: string | null) => all.value.filter((file) => file.folderId === id).length
const folderLinks = computed(() => [
  {
    label: `All ${all.value.length}`,
    to: within({ folder: 'all' }),
    current: folder.value === 'all',
  },
  {
    label: `None ${folderCount(null)}`,
    to: within({ folder: 'none' }),
    current: folder.value === 'none',
  },
  ...(folders.value ?? []).map((known) => ({
    label: `${known.name} ${folderCount(known.id)}`,
    to: within({ folder: known.id }),
    current: folder.value === known.id,
  })),
])
const inFolder = computed(() =>
  folder.value === 'all'
    ? all.value
    : all.value.filter((file) => file.folderId === (folder.value === 'none' ? null : folder.value)),
)
const isImage = (type: string) => type.startsWith('image/')
const images = computed(() => inFolder.value.filter((file) => isImage(file.type)).length)
const counts = computed((): Record<Filter, number> => ({
  all: inFolder.value.length,
  images: images.value,
  documents: inFolder.value.length - images.value,
}))
const shown = computed(() => {
  const needle = q.value.toLowerCase()
  return inFolder.value.filter(
    (file) =>
      (filter.value === 'all' || isImage(file.type) === (filter.value === 'images')) &&
      (!needle || file.name.toLowerCase().includes(needle)),
  )
})
const pageFiles = computed(() =>
  shown.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
const headline = computed(() =>
  all.value.length
    ? `${formatSize(all.value.reduce((sum, file) => sum + file.size, 0))} stored`
    : 'No files yet',
)

// One file opens beside the list once uploaded; several stay in the list.
const { pending, error: uploadError, submit } = useSubmit()
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = [...(input.files ?? [])]
  input.value = ''
  let last
  for (const file of picked) {
    last = await submit(() => uploadFile(project, file, openFolder.value?.id))
    if (!last) break
  }
  await refresh()
  if (last && picked.length === 1)
    await navigateTo({ path: `/p/${project}/files/${last.id}`, query: within({}).query })
}

async function folderSaved(saved: { id: string }) {
  await refreshFolders()
  await navigateTo(within({ folder: saved.id }))
}

const deleting = useSubmit()
async function removeFolder() {
  const id = openFolder.value!.id
  const done = await deleting.submit(() =>
    $fetch(`/api/p/${project}/files/folders/${id}/delete`, { method: 'POST', body: {} }),
  )
  if (!done) return
  await Promise.all([refresh(), refreshFolders()])
  await navigateTo(within({ folder: 'all' }))
}
</script>

<template>
  <AppPage
    title="Files"
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
          @change="upload"
      /></label>
    </template>
    <template #lead>
      <AppLead :title="headline">
        <template #meta
          >{{ Object.values(FILE_TYPES).join(', ') }}. Anyone with a file's address can read
          it.</template
        >
      </AppLead>
      <AppAlert v-if="uploadError" title="Could not upload.">{{ uploadError }}</AppAlert>
    </template>
    <template v-if="all.length || folders?.length" #filters>
      <FilterLinks v-if="folders?.length" label="Folder" :options="folderLinks" />
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
      <SearchBox v-model="searchText" label="Search files by name" @search="search" />
    </template>

    <div v-if="pageFiles.length" class="stack gap-6">
      <DataTable label="Files">
        <thead>
          <tr>
            <th scope="col">File</th>
            <th v-if="folder === 'all' && folders?.length" scope="col">Folder</th>
            <th scope="col">Type</th>
            <th scope="col" data-num>Size</th>
            <th scope="col" data-num>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="file in pageFiles"
            :key="file.id"
            :aria-selected="file.id === selected ? 'true' : undefined"
          >
            <td>
              <NuxtLink
                :to="{ path: `/p/${project}/files/${file.id}`, query: route.query }"
                class="link break-words"
                >{{ file.name }}</NuxtLink
              >
            </td>
            <td v-if="folder === 'all' && folders?.length" class="text-s text-muted">
              {{ (file.folderId && folderName.get(file.folderId)) || '' }}
            </td>
            <td class="text-s">{{ FILE_TYPES[file.type] ?? file.type }}</td>
            <td data-num class="text-muted">{{ formatSize(file.size) }}</td>
            <td data-num class="text-muted">
              <time>{{ formatAge(file.createdAt) }}</time>
            </td>
          </tr>
        </tbody>
      </DataTable>
      <PagerNav
        :page="page"
        :page-size="PAGE_SIZE"
        :total="shown.length"
        :to="(next) => within({ page: next })"
      />
    </div>
    <EmptyState v-else-if="!all.length"
      >Upload images and documents; each gets an address your sites can use.</EmptyState
    >
    <EmptyState v-else-if="q">Nothing matches “{{ q }}” here.</EmptyState>
    <EmptyState v-else-if="openFolder && !inFolder.length"
      >Nothing in this folder yet; Upload puts files here.</EmptyState
    >
    <EmptyState v-else>Nothing here.</EmptyState>

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
