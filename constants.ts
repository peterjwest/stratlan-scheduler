import querystring from 'node:querystring';

import zod from 'zod';
import lodash from 'lodash';

import { HOST, DISCORD_CLIENT_ID, SECRET_ONE } from './environment';

export const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days 😱

export const MODERATOR_ROLES = ['RVB Admin'] as const;

export const TEAMS = ['Red', 'Blue'] as const;
export type TeamName = typeof TEAMS[number];

export const TEAM_BACKGROUND_CLASSES = {
    'Red': 'bg-team-red',
    'Blue': 'bg-team-blue',
} as const satisfies { [Property in TeamName]: string };

export const SCORE_TYPES = ['Awarded', 'CommunityGame', 'HiddenCode', 'Achievement', 'IntroChallenge', 'Secret'] as const;
export const ScoreType = zod.enum(SCORE_TYPES);
export type ScoreType = typeof SCORE_TYPES[number];

export const SCORE_TYPE_NAMES = {
    'Awarded': 'Awarded',
    'CommunityGame': 'Community game',
    'HiddenCode': 'Hidden code',
    'Achievement': 'Steam achievement',
    'IntroChallenge': 'Intro challenge',
    'Secret': 'Secret',
} as const satisfies { [Property in ScoreType]: string };

export const INTRO_CHALLENGE_TYPES = ['Login', 'GameActivity', 'HiddenCode'] as const;
export const IntroChallengeType = zod.enum(INTRO_CHALLENGE_TYPES);
export type IntroChallengeType = typeof INTRO_CHALLENGE_TYPES[number];

export const INTRO_CHALLENGE_POINTS = {
    'Login': 50,
    'GameActivity': 50,
    'HiddenCode': 50,
} as const satisfies { [Property in IntroChallengeType]: number };

export const HIDDEN_CODE_BONUS_POINTS = 50;
export const HIDDEN_CODE_POINTS = 25;

export const SECRET_POINTS = 100;

export const SECRETS = { 1: SECRET_ONE } as const;
export const SECRETS_BY_CODE = lodash.mapValues(lodash.invert(SECRETS), (value) => Number(value));

export const DISCORD_RETURN_URL = `${HOST}/auth/login`;
export const DISCORD_AUTH_URL = 'https://discord.com/oauth2/authorize?' + querystring.encode({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: DISCORD_RETURN_URL,
    scope: 'identify',
});

export const DISCORD_LOGIN_URL = 'https://discord.com/login';
export const DISCORD_HOMEPAGE_URL = 'https://discord.com';
export const DISCORD_ASSET_URL = 'https://discord.com/assets/favicon.ico';

export const SEATPICKER_LOGIN_URL = 'https://seatpicker.stratlan.co.uk/login/discord';
export const SEATPICKER_URL = 'https://seatpicker.stratlan.co.uk/';
export const SEATPICKER_SEATING_URL = 'https://seatpicker.stratlan.co.uk/seating';

export const SCHEDULE_START_TIME = 10;
export const SCHEDULE_END_TIME = 26;

export const EVENT_TIMESLOT_MINUTES = 10;
export const EVENT_TIMESLOT_THRESHOLD = 0.5;

export const REPEAT_INTERVAL = 10 * 1000; // 10 seconds

export const PAGE_SIZE = 20;

export const CONTENT_SECURITY_POLICY = [
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "default-src 'none'",
    "img-src 'self' data: https://cdn.discordapp.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "script-src 'nonce-<NONCE>'",
    "connect-src 'self' *.sentry.io"
].join('; ');
