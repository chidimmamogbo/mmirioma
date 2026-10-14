/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/  ·  test options: https://vitest.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // API client tests mock fetch and need no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
