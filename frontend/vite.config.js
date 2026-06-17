import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'DailyTrack',
        short_name: 'DailyTrack',
        description: 'Personal Finance & Lifestyle Tracker',
        theme_color: '#080b12',
        background_color: '#080b12',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
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
