import querystring from 'node:querystring';

import zod from 'zod';

import { HOST, DISCORD_CLIENT_ID } from './environment';

export const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days 😱

export const MODERATOR_ROLES = ['Staff', 'Moderator'] as const;

export const TEAMS = ['Red', 'Blue'] as const;
export type TeamName = typeof TEAMS[number];

export const TEAM_BACKGROUND_CLASSES = {
    'Red': 'bg-team-red',
    'Blue': 'bg-team-blue',
} as const satisfies { [Property in TeamName]: string };

export const SCORE_TYPES = ['Awarded', 'CommunityGame', 'OneTimeCode', 'Achievement', 'IntroChallenge'] as const;
export const ScoreType = zod.enum(SCORE_TYPES);
export type ScoreType = typeof SCORE_TYPES[number];

export const SCORE_TYPE_NAMES = {
    'Awarded': 'Awarded',
    'CommunityGame': 'Community game',
    'OneTimeCode': 'QR code',
    'Achievement': 'Steam achievement',
    'IntroChallenge': 'Introductory challenge',
} as const satisfies { [Property in ScoreType]: string };

export const INTRO_CHALLENGE_TYPES = ['Login', 'GameActivity', 'OneTimeCode'] as const;
export const IntroChallengeType = zod.enum(INTRO_CHALLENGE_TYPES);
export type IntroChallengeType = typeof INTRO_CHALLENGE_TYPES[number];

export const INTRO_CHALLENGE_POINTS = {
    'Login': 50,
    'GameActivity': 50,
    'OneTimeCode': 50,
} as const satisfies { [Property in IntroChallengeType]: number };

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

export const COMMUNITY_GAMES_SCORE_INTERVAL = 30 * 1000; // 30 seconds
