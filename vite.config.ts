import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['Platform_URL','API_KEY_PROVIDER_BASE_URL','API_KEY_PROVIDER_ADMINKEY']) {
    process.env[key] ??= env[key] || ''
  }
  return { plugins: [tanstackStart(), react()] }
})
