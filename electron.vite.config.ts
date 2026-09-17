import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: { build: { bytecode: true } },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'csp-desenvolvimento',
        apply: 'serve',
        // O pre�mbulo React e o WebSocket HMR s� s�o permitidos no desenvolvimento.
        transformIndexHtml(html: string): string {
          return html
            .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
            .replace(
              "default-src 'self'",
              "default-src 'self'; connect-src 'self' ws://localhost:* ws://127.0.0.1:*"
            )
        }
      }
    ]
  }
})
