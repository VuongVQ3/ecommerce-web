import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The CMS component registry lives in ../shared (shared with the backend)
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../shared'] },
    // Forward API calls to the Spring Boot backend during development
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
