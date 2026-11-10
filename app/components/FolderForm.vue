<script setup lang="ts">
import type { Folder } from '#self/shared/contracts'

/** <FolderForm :folder="folder" @saved="…" />
 *  A new folder's name, or a folder's new one. Emits the folder as saved. */
const props = defineProps<{ folder?: Folder }>()
const emit = defineEmits<{ saved: [Folder] }>()
const project = useProject().id.value
const name = ref(props.folder?.name ?? '')
const { pending, error, issues, fieldError, submit } = useSubmit()

async function save() {
  const folder = props.folder
  const saved = await submit(() =>
    folder
      ? $fetch(`/api/p/${project}/files/folders/${folder.id}`, {
          method: 'POST',
          body: { name: name.value },
        }).then(() => ({ id: folder.id, name: name.value.trim() }))
      : $fetch<Folder>(`/api/p/${project}/files/folders`, {
          method: 'POST',
          body: { name: name.value },
        }),
  )
  if (saved) emit('saved', saved)
}
</script>

<template>
  <form class="stack gap-5" @submit.prevent="save">
    <fieldset :disabled="pending" class="stack gap-5">
      <div class="field">
        <label for="folder-name">Name</label>
        <input
          id="folder-name"
          v-model="name"
          class="input"
          data-size="s"
          required
          maxlength="60"
          placeholder="Blog"
          autocomplete="off"
          :aria-invalid="!!fieldError('name') || undefined"
        />
        <span v-if="fieldError('name')" data-error>{{ fieldError('name') }}</span>
      </div>
    </fieldset>

    <FormIssues :error="error" :issues="issues" failed="Could not save the folder." />

    <div class="cluster gap-3 hairline-t pt-5">
      <button
        type="submit"
        class="btn end"
        data-size="s"
        data-variant="primary"
        :disabled="pending"
        :aria-busy="pending || undefined"
      >
        {{ folder ? 'Rename folder' : 'Add folder' }}
      </button>
    </div>
  </form>
</template>
