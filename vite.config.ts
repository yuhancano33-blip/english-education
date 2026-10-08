import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { apiDevServer } from './dev/api-dev-server'

export default defineConfig({
  // apiDevServer: solo en `npm run dev`, sirve las funciones de api/ en local
  plugins: [vue(), apiDevServer()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
