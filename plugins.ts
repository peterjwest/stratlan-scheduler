import { promises as fs } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';

import { PluginOption, Plugin } from 'vite';

import { BUILD_DIRECTORY, PUBLIC_DIRECTORY } from './constants.js';
import { getViteManifest, saveViteManifest, Manifest } from './util.js';

export function castPlugin(plugin: unknown) {
    return (plugin as () => PluginOption);
}

export async function processDirectory(
    manifest: Manifest, directory: string, baseDir: string = PUBLIC_DIRECTORY,
): Promise<void> {

    for (const fileName of await fs.readdir(directory)) {
        if (fileName.startsWith('.')) continue;

        const fullPath = join(directory, fileName);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
            await processDirectory(manifest, fullPath, baseDir);
            continue;
        }

        const nameParts = fileName.split('.');
        const extension = nameParts.pop();
        const baseName = nameParts.join('.');

        if (!extension) throw new Error(`File ${fileName} missing extension`);

        const content = await fs.readFile(fullPath);
        const hashBuffer = createHash('sha256').update(content).digest();
        const hash = hashBuffer.toString('base64url').slice(0, 8);
        const hashedName = `${baseName}-${hash}.${extension}`;

        const relativePath = relative(baseDir, fullPath).replace(/\\/g, '/');
        const outputUrl = join(dirname(relativePath), hashedName);
        const outputPath = join(BUILD_DIRECTORY, outputUrl);

        await fs.mkdir(dirname(outputPath), { recursive: true });
        await fs.copyFile(fullPath, outputPath);

        const manifestKey = `public/${relativePath}`;
        manifest[manifestKey] = { file: outputUrl, src: manifestKey };
    }
}

export function publicAssetsPlugin(): Plugin {
    return {
        name: 'public-assets',
        async closeBundle() {
            const manifest = await getViteManifest();
            await processDirectory(manifest, PUBLIC_DIRECTORY);
            await saveViteManifest(manifest);
        },
    };
}
