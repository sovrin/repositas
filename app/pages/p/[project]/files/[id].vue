<script setup lang="ts">
import { formatTime } from '#nexitas/app/lib/format'
import { FILE_TYPES, formatSize } from '../../../../../shared/contracts'
import FileList from '../../../../components/FileList.vue'
import { useProjectFiles } from '../../../../lib/files'

// One file, opened beside the list: how it looks, its address, and deleting it at the inspector's
// foot.
const route = useRoute()
const project = useProject().id.value
const id = route.params.id as string
const { data: files } = await useProjectFiles()
const file = computed(() => files.value?.find((known) => known.id === id))
const origin = useRequestURL().origin
const facts = computed(() => {
  const { type, size, width, height, createdAt } = file.value!
  return [
    FILE_TYPES[type] ?? type,
    width && height ? `${width} × ${height}` : '',
    formatSize(size),
    `uploaded ${formatTime(createdAt)}`,
  ]
    .filter(Boolean)
    .join(' · ')
})

const { pending, error: deleteError, submit } = useSubmit()
async function remove() {
  const done = await submit(() =>
    $fetch(`/api/p/${project}/files/${id}/delete`, { method: 'POST', body: {} }),
  )
  if (done) await navigateTo({ path: `/p/${project}/files`, query: route.query })
}
</script>

<template>
  <FileList :selected="id" :aside-name="file?.name ?? 'Not found'">
    <template #aside>
      <EmptyState v-if="!file">There is no such file; it may have been deleted.</EmptyState>
      <template v-else>
        <img
          v-if="file.width && file.height"
          :src="file.path"
          :alt="file.name"
          :width="file.width"
          :height="file.height"
        />
        <p class="text-s text-muted">{{ facts }}</p>
        <EmbedCode :code="origin + file.path" />
        <p>
          <a :href="file.path" target="_blank" rel="noopener" class="link text-s">Open the file</a>
        </p>
      </template>
    </template>
    <template v-if="file" #danger>
      <span>Its address stops working, on every site that uses it.</span>
      <DangerAction
        label="Delete file"
        :title="`Delete ${file.name}?`"
        :pending="pending"
        @confirm="remove"
      >
        This cannot be undone.
      </DangerAction>
      <AppAlert v-if="deleteError" class="w-full" title="Could not delete the file.">{{
        deleteError
      }}</AppAlert>
    </template>
  </FileList>
</template>
