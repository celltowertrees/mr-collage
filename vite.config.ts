/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Playwright owns e2e/**/*.spec.ts — keep Vitest scoped to unit tests
    // under src/ so it doesn't try to run (or fail on) Playwright specs.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
