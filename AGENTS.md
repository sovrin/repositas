# Agent notes for repositas

Conventions for working on repositas, in code and in the interface.

## Code

- repositas is a module of [nexitas](https://github.com/sovrin/nexitas): a plain Nuxt layer that
  nexitas extends. The owner's sign-in, the `/api` guard, live updates, the database, projects and
  the page shell are there, and plug-in points are its interfaces (`shared/modules.ts`). repositas
  registers itself in `server/core/module.ts`. What every module needs belongs in nexitas; what only
  repositas needs, here. The rest of nexitas' AGENTS.md holds here too.
- repositas provides the `files` capability (`#nexitas/shared/capabilities`): `get` on the server
  and the global `FilesPicker` on the pages. Other modules use it through nexitas only; it never
  knows who they are, and changes to it are additive.
- A file's bytes are on disk under its random id, in the data directory's `repositas/`; a row in
  `files` says what they are. No project id or file name becomes part of a path.
- Folders (`folders`) are the admin's order only: one level, a file in one or none. They never
  reach the file's address or the capability.
- What is stored is checked by its bytes (`server/core/sniff.ts`), never by its name or the type
  the browser sends. Only types a browser shows without running anything: no SVG, no HTML.
- `/v1/files/<project>/<id>` is public through `publicRoutes`: anyone with the address reads the
  file, which never changes under its id. Sites use these addresses, so the route only grows.
- An upload is the file's raw bytes (`application/octet-stream`, which `rawBody` lets through
  nexitas' security middleware), its name in `?name=`. Uploads stream to a `.part` file and
  downloads stream from disk: no file is ever read into memory whole. `maxBody`, the largest
  file, is configured (`REPOSITAS_MAX_FILE_MB`), so the plugin sets it.

## UI

- The look and the patterns are nexitas': see `../nexitas/AGENTS.md` (UI).
- Lint changed Vue files: `node ../aequitas/dist/aequitas-check.mjs --css ../nexitas/app/assets/nexitas.css <files>`.

## Checks

`pnpm check`, `pnpm lint` and `pnpm format:check` must stay green here, and `pnpm check` and
`pnpm build` in nexitas with this checkout in its `.modules/`.

## Commits and releases

Commit messages are [conventional](https://www.conventionalcommits.org): `feat(files): …`,
`fix: …`. Give a scope or leave the parentheses out; never write `feat(): …`. Before 1.0, `feat`
and `fix` bump the patch version and a change marked `!` the minor. Mark a change that breaks
`/v1/files` or the `files` capability with `!`. Don't edit the version in `package.json` or
`CHANGELOG.md` by hand; the release PR does that.
