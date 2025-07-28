import querystring from 'node:querystring';

import zod from 'zod';

import environment from './environment';

const {
    PORT,
    DISCORD_CLIENT_ID
} = environment;

export const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days 😱
export const HOST = `http://localhost:${PORT}`;

export const MODERATOR_ROLES = ['Staff', 'Moderator'] as const;

export const TEAMS = ['Red', 'Blue'] as const;
export type TeamName = typeof TEAMS[number];

export const SCORE_TYPES =  ['Awarded', 'CommunityGame', 'OneTimeCode', 'Achievement'] as const;
export const ScoreType = zod.enum(SCORE_TYPES);
export type ScoreType = typeof SCORE_TYPES[number];

export const DISCORD_RETURN_URL = `${HOST}/login`;
export const DISCORD_AUTH_URL = 'https://discord.com/oauth2/authorize?' + querystring.encode({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: DISCORD_RETURN_URL,
    scope: 'identify',
});
