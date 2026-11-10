# repositas

Files for [nexitas](https://github.com/sovrin/nexitas): images and documents per project, uploaded
in the admin and served at a public address your sites can use.

```
owner ── /p/<project>/files                 upload, sort into folders, rename, delete
site  ── GET /v1/files/<project>/<id>       the file's bytes, cached for good
```

- **Types**: PNG, JPEG, GIF, WebP and PDF, recognised by their bytes. SVG and HTML are refused:
  they could run a script on the app's origin.
- **Size**: up to 1 GB a file, or what `<APP>_REPOSITAS_MAX_FILE_MB` says, in megabytes
  (`NEXITAS_REPOSITAS_MAX_FILE_MB=200`). Uploads and downloads stream, so a large file never sits
  in memory. A proxy in front has its own limit: raise nginx's `client_max_body_size` (1 MB by
  default) to match; Caddy has none.
- **Addresses**: random and unguessable, but public: anyone who has one can read the file. A file
  never changes under its address; deleting it makes the address answer 404.
- **Folders**: one level, a file in one folder or none. A file's name and folder can change; its
  address stays. Deleting a folder deletes the files in it.
- **Storage**: on disk in the data directory (`<DATA_DIR>/repositas/`), beside the database. Back
  up both together.

## For other modules

repositas provides the `files` capability (see nexitas' `shared/capabilities.ts`). While it is
switched on, another module can read a project's file with `capability('files')?.get(db, project,
id)` and let the owner pick or upload one with the global `FilesPicker`:

```vue
<component
  :is="'FilesPicker'"
  v-if="useCapability('files').value"
  v-model="fileId"
  accept="image"
  @picked="onPicked"
/>
```

veritas uses it for its Image and File fields.

## Development

repositas is a Nuxt layer, built and run inside nexitas: link this checkout into nexitas'
`.modules/repositas` and run nexitas. `pnpm check` runs the tests here, with nexitas next to this
checkout.
