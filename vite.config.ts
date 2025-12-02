import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from "vite-plugin-top-level-await";

import { castPlugin, publicAssetsPlugin } from './plugins.js';

export default defineConfig(({ mode }) => {
    const isDev = mode === 'development';

    return {
        plugins: [
            castPlugin(wasm)(),
            castPlugin(topLevelAwait)(),
            tailwindcss(),
            publicAssetsPlugin(),
        ],
        publicDir: false,
        worker: {
            format: 'es',
            plugins: () => [
                castPlugin(wasm)(),
                castPlugin(topLevelAwait)(),
            ],
            rollupOptions: {
                output: {
                    manualChunks: (id: string): string | undefined =>  {
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
        build: {
            manifest: true,
            minify: isDev ? false : 'terser',
            sourcemap: !isDev,
            cssCodeSplit: true,
            lib: {
                entry: 'frontend/app.ts',
                formats: ['es'],
                fileName: 'app',
            },
            outDir: 'build',
            rollupOptions: {
                input: {
                    app: 'frontend/app.ts',
                    style: 'css/style.css',
                },
                output: {
                    entryFileNames: '[name]-[hash].js',
                    manualChunks: (id: string): string | undefined => {
                        if (id.includes('node_modules/qrcode')) {
                            return 'qrcode';
                        }
                        if (id.includes('node_modules/three')) {
                            return 'three';
                        }
                        if (id.includes('node_modules')) {
                            return 'vendor';
                        }
                    },
                    assetFileNames: () => '[name]-[hash][extname]',
                },
            },
        },
    };
});
