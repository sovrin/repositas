<script setup lang="ts">
import { formatAge } from '#nexitas/app/lib/format'
import { FILE_TYPES, formatSize } from '../../shared/contracts'
import { acceptTypes, uploadFile, useProjectFiles } from '../lib/files'

/** <FileList :selected="id" :aside-name="name"><template #aside>…</template></FileList>
 *  The project's files: their filter, search and page in the address, and Upload. A file's page
 *  renders it too, with `selected` marking its row and the file in `aside` (the inspector). */
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
const { data: files, error, refresh } = await useProjectFiles()

const filter = computed<Filter>(() =>
  route.query.show === 'images' || route.query.show === 'documents' ? route.query.show : 'all',
)
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

/** The list's address for a filter, search or page, leaving out the defaults. Anything new starts
 *  on the first page. */
function within(next: { show?: Filter; q?: string; page?: number }) {
  const query = { show: filter.value, q: q.value, page: 1, ...next }
  return {
    path: `/p/${project}/files`,
    query: {
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
const isImage = (type: string) => type.startsWith('image/')
const images = computed(() => all.value.filter((file) => isImage(file.type)).length)
const counts = computed((): Record<Filter, number> => ({
  all: all.value.length,
  images: images.value,
  documents: all.value.length - images.value,
}))
const shown = computed(() => {
  const needle = q.value.toLowerCase()
  return all.value.filter(
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
    last = await submit(() => uploadFile(project, file))
    if (!last) break
  }
  await refresh()
  if (last && picked.length === 1) await navigateTo(`/p/${project}/files/${last.id}`)
}
</script>

<template>
  <AppPage
    title="Files"
    failed="Could not load this project's files."
    :error="error"
    :retry="refresh"
    :aside-name="asideName"
    :aside-close="slots.aside ? { path: `/p/${project}/files`, query: route.query } : undefined"
  >
    <template #actions>
      <!-- The inspector's own controls hold the view while it is open. -->
      <label
        class="btn"
        data-size="s"
        :data-variant="slots.aside ? undefined : 'primary'"
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
    <template v-if="all.length" #filters>
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
    <EmptyState v-else>Nothing here.</EmptyState>

    <template v-if="slots.aside" #aside><slot name="aside" /></template>
    <template v-if="slots.danger" #danger><slot name="danger" /></template>
  </AppPage>
</template>
