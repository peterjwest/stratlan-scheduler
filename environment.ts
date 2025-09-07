import zod from 'zod';

export const Environment = zod.object({
    PORT: zod.string().transform((value) => parseInt(value, 10)),
    HOST: zod.string(),
    SECURE_COOKIE: zod.string().transform((value) => value === 'true'),
    SESSION_SECRET: zod.string(),
    DISCORD_TOKEN: zod.string(),
    DISCORD_CLIENT_ID: zod.string(),
    DISCORD_CLIENT_SECRET: zod.string(),
    DISCORD_GUILD_ID: zod.string(),
    STEAM_API_KEY: zod.string(),
    DATABASE_URL: zod.string(),
});

export default Environment.parse(process.env);
