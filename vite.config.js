import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [tailwindcss()],
    build: {
        minify: 'terser',
        sourcemap: true,
        lib: {
            entry: 'public/app.js',
            formats: ['es'],
            fileName: 'app',
            cssFileName: 'style',
        },
        outDir: 'build',
    },
});
