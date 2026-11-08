import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))

function privacyPolicyAliases() {
  return {
    name: 'privacy-policy-aliases',
    apply: 'build',
    writeBundle({ dir }) {
      const policy = resolve(dir, 'privacy/index.html')
      const legacyDirectory = resolve(dir, 'privacy-policy')
      mkdirSync(legacyDirectory, { recursive: true })
      copyFileSync(policy, resolve(legacyDirectory, 'index.html'))
      copyFileSync(policy, resolve(dir, 'privacy-policy.html'))
    },
  }
}

export default defineConfig({
  // Sent as x-app-version so the server can attribute a device binding to a build.
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), privacyPolicyAliases()],
})
