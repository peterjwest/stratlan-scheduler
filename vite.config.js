import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import wasm from "vite-plugin-wasm";

export default defineConfig({
    plugins: [tailwindcss(), wasm()],
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

        rollupOptions: {
            input: {
                app: 'public/app.js',
                'physicsWorker': 'public/physicsWorker.js',
            },
            output: {
                entryFileNames: '[name].js',
                manualChunks: (id) => {
                    if (id.includes('node_modules/qrcode')) {
                        return 'qrcode';
                    }
                    if (id.includes('node_modules/three')) {
                        return 'three';
                    }
                    if (id.includes('node_modules/@dimforge/rapier3d')) {
                        return 'rapier';
                    }
                },
            },
        },
    },
});
