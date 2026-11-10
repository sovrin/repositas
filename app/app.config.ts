// repositas' part of the nexitas shell: its name, icon and hue, and its section in the nav.
export default defineAppConfig({
  nexitas: {
    modules: [
      {
        id: 'repositas',
        label: 'Files',
        description: 'Images and documents per project, served at a public address.',
        icon: 'folder',
        accent: 'yellow',
      },
    ],
    nav: [{ to: '/files', label: 'Files', module: 'repositas' }],
  },
})
