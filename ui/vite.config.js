import { defineConfig } from 'vite'

export default defineConfig({
    server: {
        port: 3001,
        host: '127.0.0.1'
    },
    css: {
        devSourcemap: false
    }
})