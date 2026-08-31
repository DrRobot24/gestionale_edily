import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Tailwind 4 gira come plugin di Vite, non piu' come step PostCSS.
// Non esiste tailwind.config.js: la configurazione sta in src/index.css
// dentro il blocco @theme. E' la stessa impostazione di wbs-office.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
