import { UserConfig } from 'unlinted';

export default {
    rules: {
        CONTENT_VALIDATION: {
            exclude: (defaults: string[]) => [...defaults, '/assets', '*.webp'],
        },
    },
} satisfies UserConfig;
