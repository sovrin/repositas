import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// repositas is a module of nexitas: a Nuxt layer that nexitas extends, as its modules.json lists it.
// The owner's sign-in, the /api guard, live updates, the database, projects and the page shell are
// nexitas'; this layer adds the files: uploads, the address sites read them at, and the files
// capability other modules use. Everything here resolves from this folder, since the app around
// it is nexitas.
const root = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2026-09-06',
  // nexitas allows its own files and aequitas'; these are repositas' own.
  vite: { server: { fs: { allow: [root] } } },
})
