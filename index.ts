
import { REST, Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import expressSession from 'express-session';
import sessionStore from 'connect-pg-simple';
import SteamAuth from 'node-steam-openid';
import zod from 'zod';
import lodash from 'lodash';

import {
    regenerateSession,
    saveSession,
    destroySession,
    splitByDay,
    getLanDays,
    getUrl,
    hasEventStarted,
    isAdmin,
    isEligible,
    isLanEnded,
    isLanActive,
} from './util';
import setupCommands from './commands';
import environment from './environment';
import { UserWithRoles, Team, Lan } from './schema';
import adminRouter from './admin';
import helpers from './helpers';
import {
    createTeams,
    getDatabaseClient,
    getUser,
    createOrUpdateUserByDiscordId,
    updateUser,
    updateRoles,
    getTeamPoints,
    getEvents,
    getCurrentLanCached,
    getLans,
    endFinishedActivities,
    getOrCreateGameActivity,
    getUserByDiscordId,
    getUserPoints,
    getOrCreateIntroChallenge,
    getIntroChallenges,
    claimChallenge,
} from './database';
import {
    getGuildRoles,
    mapRoleIds,
    getDiscordAccessToken,
    getDiscordUser,
    getDiscordGuildMember,
    getActivityIds,
} from './discordApi';
import { startScoringCommunityGames } from './communityGame';

// TODO: Tidy constants vs. environment
import {
    COOKIE_MAX_AGE,
    TEAMS,
    DISCORD_RETURN_URL,
    DISCORD_AUTH_URL,
    INTRO_CHALLENGE_POINTS,
} from './constants';

const {
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
} = environment;

/** Augments the session with userId */
declare module 'express-session' {
    interface SessionData {
        userId: number;
    }
}

declare global {
    namespace Express {
        interface Request {
            maybeUser: UserWithRoles | undefined;
            user: UserWithRoles;
            maybeCurrentLan: Lan | undefined;
            currentLan: Lan;
            lanEnded: boolean;
            partialContext: {
                currentPath: string;
                eventStarted: boolean;
                teams: Team[];
                user: UserWithRoles | undefined;
                maybeCurrentLan: Lan | undefined;
                lanEnded: boolean;
                lans?: Lan[];
                discordAuthUrl: string;
                helpers: typeof helpers;
            },
            context: {
                currentPath: string;
                eventStarted: boolean;
                teams: Team[];
                user: UserWithRoles | undefined;
                maybeCurrentLan: Lan | undefined;
                currentLan: Lan;
                lanEnded: boolean;
                lans?: Lan[];
                discordAuthUrl: string;
                helpers: typeof helpers;
            };
        }
    }
}

const db = await getDatabaseClient(DATABASE_URL);

const teams = await createTeams(db, TEAMS);

await startScoringCommunityGames(db);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.GuildMember, Partials.User],
});

client.once(Events.ClientReady, readyClient => console.log(`Logged in to Discord as ${readyClient.user.tag}`));

client.login(DISCORD_TOKEN);

client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
    const currentLan = await getCurrentLanCached(db);
    if (!currentLan || !isLanActive(currentLan)) return;

    const user = await getUserByDiscordId(db, newPresence.userId);
    if (!user) return;

    await endFinishedActivities(db, user, getActivityIds(newPresence.activities));

    if (newPresence.activities.length > 0) {
        await getOrCreateIntroChallenge(db, 'GameActivity', currentLan, user);
    }

    for (const activity of newPresence.activities) {
        if (!activity.applicationId) continue;

        const startTime = new Date(activity.createdTimestamp);
        await getOrCreateGameActivity(db, currentLan, user, activity.applicationId, activity.name, startTime);
    }
});

const rest = new REST().setToken(DISCORD_TOKEN);
await setupCommands(rest, DISCORD_CLIENT_ID, client);

const app = express();

app.use(cookieParser());

const SessionStore = sessionStore(expressSession);

app.use(expressSession({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { httpOnly: true, secure: SECURE_COOKIE, maxAge: COOKIE_MAX_AGE },
    store: new SessionStore({ conString: DATABASE_URL, tableName: 'Session' }),
}));

app.use(express.urlencoded());
app.use(express.static('build/public'));

app.set('view engine', 'pug');

app.use(async (request, response, next) => {
    const currentPath = getUrl(request.originalUrl).path;

    const user = request.session.userId ? await getUser(db, request.session.userId) : undefined;

    let currentLan = await getCurrentLanCached(db);
    let lanEnded = !currentLan || isLanEnded(currentLan);

    // Hide current team until event has started
    const eventStarted = hasEventStarted(currentLan);
    if (user && !eventStarted) user.teamId = null;

    let lans: Lan[] | undefined;

    if (isAdmin(user)) {
        lans = await getLans(db);

        // If there's no current LAN, admins get the last one as default
        if (!currentLan) {
            currentLan = lodash.last(lans);
            lanEnded = false;
        }

        if (request.cookies['selected-lan']) {
            // Don't set a cookie for the default currentLan
            if (currentLan?.id === Number(request.cookies['selected-lan'])) {
                response.clearCookie('selected-lan', { path: '/' });
            } else {
                currentLan = lans.find((lan) => lan.id === Number(request.cookies['selected-lan']));
                lanEnded = false;
            }
        }
    }

    request.maybeUser = user;
    request.maybeCurrentLan = currentLan;
    request.lanEnded = lanEnded;

    request.partialContext = {
        currentPath,
        eventStarted,
        teams,
        user,
        maybeCurrentLan: currentLan,
        lanEnded,
        lans,
        discordAuthUrl: DISCORD_AUTH_URL,
        helpers,
    }

    next();
});

app.get('/login', async (request, response) => {
    const query = zod.object({ code: zod.string() }).parse(request.query);

    // Check access token is valid by fetching user
    const accessToken = await getDiscordAccessToken(
        DISCORD_CLIENT_ID,
        DISCORD_CLIENT_SECRET,
        DISCORD_RETURN_URL,
        query.code,
    );
    const discordUser = await getDiscordUser(accessToken);

    const discordMember = await getDiscordGuildMember(rest, DISCORD_GUILD_ID, discordUser.id);
    const serverRoles = await getGuildRoles(rest, DISCORD_GUILD_ID);
    const roles = mapRoleIds(serverRoles, discordMember.roles);

    const user = await createOrUpdateUserByDiscordId(db, discordUser.id, {
        accessToken,
        discordUsername: discordUser.username,
        discordNickname: discordMember.nick || discordUser.global_name,
        discordAvatarId: discordUser.avatar,
    });
    await updateRoles(db, user, roles);

    await regenerateSession(request);
    request.session.userId = user.id;
    await saveSession(request);

    if (request.maybeCurrentLan) {
        await getOrCreateIntroChallenge(db, 'Login', request.currentLan, user);
    }

    response.redirect(request.cookies['login-redirect'] || '/');
});

app.get('/logout', async (request, response) => {
    await destroySession(request);

    response.redirect('/');
});

app.use(async (request, response, next) => {
    if (!request.maybeCurrentLan) {
        return response.render('unscheduled', request.partialContext);
    }

    request.currentLan = request.maybeCurrentLan;
    request.context = { ...request.partialContext, currentLan: request.maybeCurrentLan };

    next();
});

app.get('/', async (request, response) => {
    response.render('guide', {
        ...request.context,
        points: request.maybeUser ? await getUserPoints(db, request.currentLan, request.maybeUser) : 0,
        constants: { INTRO_CHALLENGE_POINTS },
        introChallenges: await getIntroChallenges(db, request.currentLan, request.maybeUser),
        isEligible: isEligible(request.currentLan, request.maybeUser),
    });
});

app.get('/schedule', async (request, response) => {
    const events = await getEvents(db, request.currentLan);

    response.render('schedule', {
        ...request.partialContext,
        eventsByDay: splitByDay(events, getLanDays(request.currentLan)),
    });
});

app.use('/dashboard', async (request, response) => {
    const teamPoints: Array<{ team: Team, points: number }> = [];
    for (const team of request.context.teams) {
        teamPoints.push({ team, points: await getTeamPoints(db, request.currentLan, team) });
    }
    response.render('dashboard', { ...request.context, teamPoints });
});

app.use(async (request, response, next) => {
    if (!request.maybeUser) return response.render('404', request.context);
    request.user = request.maybeUser;
    next();
});

app.get('/claim/:challengeId', async (request, response) => {
    if (!request.currentLan) {
        throw new Error('No active LAN');
    }
    await claimChallenge(db, request.currentLan, request.user, Number(request.params.challengeId));
    response.redirect('/');
});

const steamAuth = new SteamAuth({
    realm: HOST,
    returnUrl: `${HOST}/steam/authenticate`,
    apiKey: STEAM_API_KEY,
});

app.get('/steam', async (request, response) => {
    response.redirect(await steamAuth.getRedirectUrl());
});

app.get('/steam/authenticate', async (request, response) => {
    const steamUser = await steamAuth.authenticate(request);
    await updateUser(db, request.user.id, {
        steamId: steamUser.steamid,
        steamUsername: steamUser.username,
        steamAvatar: steamUser.avatar.large,
    });

    response.redirect('/');
});

app.use('/admin', adminRouter(db));

app.use((request: Request, response: Response, next: NextFunction) => {
    response.render('404', request.context);
});

app.use((error: any, request: Request, response: Response, next: NextFunction) => {
    console.error('Server error', error);
    response.render('500', request.context);
});

app.listen(PORT, () => {
    console.log(`Server listening at ${HOST}`);

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled rejection:', reason, promise);
    });
});
