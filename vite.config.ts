import { defineConfig, PluginOption } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from "vite-plugin-top-level-await";

function castPlugin(plugin: unknown) {
    return (plugin as () => PluginOption);
}

export default defineConfig(({ mode }) => {
    const isDev = mode === 'development';

    return {
        plugins: [
            castPlugin(wasm)(),
            castPlugin(topLevelAwait)(),
            tailwindcss(),
        ],
        worker: {
            plugins: () => [
                castPlugin(wasm)(),
                castPlugin(topLevelAwait)(),
            ],
        },
        build: {
            minify: isDev ? false : 'terser',
            sourcemap: !isDev,
            lib: {
                entry: 'public/app.ts',
                formats: ['es'],
                fileName: 'app',
                cssFileName: 'style',
            },
            outDir: 'build',
            rollupOptions: {
                input: {
                    app: 'public/app.ts',
                    'physicsWorker': 'public/physicsWorker.ts',
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
                        if (id.includes('node_modules')) {
                            return 'vendor';
                        }
                    },
                },
            },
        },
    };
});
