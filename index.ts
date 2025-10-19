
import { REST, Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import expressSession from 'express-session';
import sessionStore from 'connect-pg-simple';
import SteamAuth from 'node-steam-openid';
import zod from 'zod';

import {
    regenerateSession,
    saveSession,
    destroySession,
    splitByDay,
    getLanDays,
    getUrl,
    hasEventStarted,
} from './util';
import setupCommands from './commands';
import environment from './environment';
import { User, Team, Lan } from './schema';
import adminRouter from './admin';
import helpers from './helpers';
import {
    createTeams,
    getDatabaseClient,
    getUser,
    createOrUpdateUserByDiscordId,
    updateUser,
    getTeamPoints,
    getLanEvents,
    getCurrentLan,
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
    MODERATOR_ROLES,
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
        maybeUser: User | undefined;
        user: User;
        context: {
            currentPath: string;
            eventStarted: boolean;
            teams: Team[];
            user: User | undefined;
            lan: Lan | undefined;
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

client.once(Events.ClientReady, readyClient => console.log(`Logged in as ${readyClient.user.tag}`));

client.login(DISCORD_TOKEN);

client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
    // TODO: Check we're in an active LAN

    const user = await getUserByDiscordId(db, newPresence.userId);
    if (!user) return;

    await endFinishedActivities(db, user, getActivityIds(newPresence.activities));

    if (newPresence.activities.length > 0) {
        await getOrCreateIntroChallenge(db, 'GameActivity', user);
    }

    for (const activity of newPresence.activities) {
        if (!activity.applicationId) continue;

        const startTime = new Date(activity.createdTimestamp);
        await getOrCreateGameActivity(db, user, activity.applicationId, activity.name, startTime);
    }
});

const rest = new REST().setToken(DISCORD_TOKEN);
await setupCommands(rest, DISCORD_CLIENT_ID, client);
const ROLES = await getGuildRoles(rest, DISCORD_GUILD_ID);

const app = express();

app.use(cookieParser());

const SessionStore = sessionStore(expressSession);

app.use(expressSession({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: true, secure: SECURE_COOKIE, maxAge: COOKIE_MAX_AGE },
  store: new SessionStore({ conString: DATABASE_URL, tableName : 'Session' }),
}));

app.use(express.urlencoded());
app.use(express.static('build/public'));

app.set('view engine', 'pug');

app.use(async (request, response, next) => {
    const currentPath = getUrl(request.originalUrl).path;
    const lan = await getCurrentLan(db);
    const user = request.session.userId ? await getUser(db, request.session.userId) : undefined;
    const eventStarted = hasEventStarted(lan);
    if (user && !eventStarted) user.teamId = null;
    request.maybeUser = user;
    request.context = {
        currentPath,
        eventStarted,
        teams,
        user,
        lan,
        discordAuthUrl: DISCORD_AUTH_URL,
        helpers,
    }
    next();
});

app.get('/schedule', async (request, response) => {
    const events = await getLanEvents(db, request.context.lan);

    response.render('schedule', {
        ...request.context,
        eventsByDay: splitByDay(events, getLanDays(request.context.lan)),
    });
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
    const roles = mapRoleIds(ROLES, discordMember.roles);

    // TODO: Save roles

    const user = await createOrUpdateUserByDiscordId(db, discordUser.id, {
        accessToken,
        discordUsername: discordUser.username,
        discordNickname: discordMember.nick || discordUser.global_name,
        discordAvatarId: discordUser.avatar,
        isAdmin: Boolean(roles.find((role) => (MODERATOR_ROLES as readonly string[]).includes(role.name))),
    });

    await regenerateSession(request);
    request.session.userId = user.id;
    await saveSession(request);

    await getOrCreateIntroChallenge(db, 'Login', user);

    response.redirect(request.cookies['login-redirect']);
});

app.get('/logout', async (request, response) => {
    await destroySession(request);

    response.redirect('/');
});

app.get('/', async (request, response) => {
    // TODO: Check if user has role

    const introChallenges = await getIntroChallenges(db, request.maybeUser);
    const points = request.maybeUser ? await getUserPoints(db, request.maybeUser) : 0;
    response.render('guide', { ...request.context, points, constants: { INTRO_CHALLENGE_POINTS }, introChallenges});
});

app.use('/dashboard', async (request, response) => {
    const teamPoints: Array<{ team: Team, points: number }> = [];
    for (const team of request.context.teams) {
        teamPoints.push({ team, points: await getTeamPoints(db, team) });
    }
    response.render('dashboard', { ...request.context, teamPoints });
});

app.use(async (request, response, next) => {
    if (!request.maybeUser) return response.render('404', request.context);
    request.user = request.maybeUser;
    next();
});

app.use('/claim/:challengeId', async (request, response) => {
    await claimChallenge(db, request.user, Number(request.params.challengeId));
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
