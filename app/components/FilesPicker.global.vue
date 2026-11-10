<script setup lang="ts">
import type { StoredFile } from '#nexitas/shared/capabilities'
import { IMAGE_TYPES } from '../../shared/contracts'
import { acceptTypes, uploadFile, useProjectFiles } from '../lib/files'

/** The files capability's picker (see #nexitas/shared/capabilities), global so another module can
 *  render it by name without importing repositas: one of the open project's files, or a new one
 *  uploaded. Its `id` goes to the select, for the field's label. */
defineOptions({ inheritAttrs: false })
const props = defineProps<{ accept?: 'image' }>()
const fileId = defineModel<string | null>({ required: true })
const emit = defineEmits<{ picked: [StoredFile | null] }>()

const project = useProject().id.value
const { data: files, refresh } = useProjectFiles()
const choices = computed(() =>
  (files.value ?? []).filter((file) => !props.accept || IMAGE_TYPES.includes(file.type)),
)
const current = computed(() => choices.value.find((file) => file.id === fileId.value) ?? null)

// Once the list is in, the file given is told (or dropped when it is gone), and every pick after.
watch(
  [files, fileId],
  () => {
    if (!files.value) return
    if (fileId.value && !current.value) fileId.value = null
    emit('picked', current.value)
  },
  { immediate: true },
)

const { pending, error, submit } = useSubmit()
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const uploaded = await submit(() => uploadFile(project, file))
  if (!uploaded) return
  await refresh()
  fileId.value = uploaded.id
}
</script>

<template>
  <div class="stack gap-2">
    <img
      v-if="current?.width && current.height"
      :src="current.path"
      :alt="current.name"
      :width="current.width"
      :height="current.height"
    />
    <div class="cluster gap-2 flex-nowrap">
      <select v-bind="$attrs" v-model="fileId" class="input flex-1 min-w-0" data-size="s">
        <option :value="null">None</option>
        <option v-for="file in choices" :key="file.id" :value="file.id">{{ file.name }}</option>
      </select>
      <label class="btn" data-size="s" :aria-busy="pending || undefined"
        >Upload<input
          type="file"
          class="sr-only"
          :accept="acceptTypes(accept === 'image')"
          :disabled="pending"
          @change="upload"
      /></label>
    </div>
    <span v-if="error" data-error>{{ error }}</span>
  </div>
</template>
