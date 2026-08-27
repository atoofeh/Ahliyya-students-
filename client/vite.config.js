import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

export default defineConfig({
  // Sent as x-app-version so the server can attribute a device binding to a build.
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react()],
})
