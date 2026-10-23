import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages ligger under /Papp/. På Vercel (og lokalt med VITE_BASE=/) ligger appen i roten.
export default defineConfig({
  plugins: [react()],
  base: process.env.VERCEL || process.env.VITE_BASE ? '/' : '/Papp/',
})
