import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/ArchRel/',
  plugins: [
    tailwindcss(),
    vue(),
  ],
  test: {
    include: ['src/core/**/*.test.ts'],
  },
})
