import querystring from 'node:querystring';

import zod from 'zod';

import { parseUrl } from './util.js';

export const Environment = zod.object({
    ENVIRONMENT: zod.string(),
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
    REMOTE_DATABASE_URL: zod.string().optional(),
    REMOTE_DISCORD_GUILD_ID: zod.string().optional(),
    SEATPICKER_DISCORD_USERNAME: zod.string().optional(),
    SEATPICKER_DISCORD_PASSWORD: zod.string().optional(),
    SECRET_ONE: zod.string(),
    SENTRY_DSN: zod.string(),
});

export const {
    ENVIRONMENT,
    PORT,
    HOST,
    SECURE_COOKIE,
    SESSION_SECRET,
    DISCORD_TOKEN,
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_GUILD_ID,
    STEAM_API_KEY,
    DATABASE_URL,
    REMOTE_DATABASE_URL,
    REMOTE_DISCORD_GUILD_ID,
    SEATPICKER_DISCORD_USERNAME,
    SEATPICKER_DISCORD_PASSWORD,
    SECRET_ONE,
    SENTRY_DSN,
} = Environment.parse(process.env);

export const DISCORD_RETURN_URL = `${HOST}/auth/login`;
export const DISCORD_AUTH_URL = 'https://discord.com/oauth2/authorize?' + querystring.encode({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: DISCORD_RETURN_URL,
    scope: 'identify',
});

export const CONTENT_SECURITY_POLICY = [
    "base-uri 'none'",
    "form-action 'self'",
    "default-src 'none'",
    "img-src 'self' data: https://cdn.discordapp.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "script-src 'nonce-<NONCE>'",
    `connect-src 'self' wss://${parseUrl(HOST).host} *.sentry.io`,
    "worker-src 'self'",
].join('; ');

export const SECRETS = { [SECRET_ONE]: 1 } as const;
