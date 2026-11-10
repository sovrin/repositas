<script setup lang="ts">
import type { Folder, ProjectFile } from '../../shared/contracts'

/** <FileForm :file="file" :folders="folders" @saved="…" />
 *  A file's name and folder. Its address stays whatever they become. */
const props = defineProps<{ file: ProjectFile; folders: readonly Folder[] }>()
const emit = defineEmits<{ saved: [] }>()
const project = useProject().id.value
const name = ref(props.file.name)
const folderId = ref(props.file.folderId)
const { pending, error, issues, fieldError, submit } = useSubmit()

async function save() {
  const done = await submit(() =>
    $fetch(`/api/p/${project}/files/${props.file.id}`, {
      method: 'POST',
      body: { name: name.value, folderId: folderId.value },
    }),
  )
  if (done) emit('saved')
}
</script>

<template>
  <form class="stack gap-5" @submit.prevent="save">
    <fieldset :disabled="pending" class="stack gap-5">
      <div class="field">
        <label for="file-name">Name</label>
        <input
          id="file-name"
          v-model="name"
          class="input"
          data-size="s"
          required
          maxlength="200"
          autocomplete="off"
          :aria-invalid="!!fieldError('name') || undefined"
          aria-describedby="file-name-help"
        />
        <small id="file-name-help">Its address stays; downloads take the new name.</small>
        <span v-if="fieldError('name')" data-error>{{ fieldError('name') }}</span>
      </div>
      <div class="field">
        <label for="file-folder">Folder</label>
        <select
          id="file-folder"
          v-model="folderId"
          class="input"
          data-size="s"
          :aria-invalid="!!fieldError('folderId') || undefined"
        >
          <option :value="null">None</option>
          <option v-for="folder in folders" :key="folder.id" :value="folder.id">
            {{ folder.name }}
          </option>
        </select>
        <span v-if="fieldError('folderId')" data-error>{{ fieldError('folderId') }}</span>
      </div>
    </fieldset>

    <FormIssues :error="error" :issues="issues" failed="Could not save the file." />

    <div class="cluster gap-3 hairline-t pt-5">
      <button
        type="submit"
        class="btn end"
        data-size="s"
        data-variant="primary"
        :disabled="pending"
        :aria-busy="pending || undefined"
      >
        Save changes
      </button>
    </div>
  </form>
</template>
