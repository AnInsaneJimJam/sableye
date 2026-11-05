import { defineConfig } from 'vite'

// Relative base: the output is plain static files that work from any host or sub-path.
export default defineConfig({ base: './', build: { target: 'es2022' } })
