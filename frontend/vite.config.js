import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Injects the exact time the Vercel build ran
    '__BUILD_TIME__': JSON.stringify(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })),
    // Injects the Git commit hash (Vercel provides this automatically)
    '__COMMIT_SHA__': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7) : 'dev')
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
})
