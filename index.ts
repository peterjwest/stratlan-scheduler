import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import expressSession from 'express-session';
import sessionStore from 'connect-pg-simple';
import zod from 'zod';
import lodash from 'lodash';

import {
    getContext,
    Context,
    regenerateSession,
    saveSession,
    destroySession,
    splitByDay,
    getLanDays,
    getUrl,
    isAdmin,
    isEligible,
    isLanStarted,
    isLanEnded,
    isUserError,
} from './util';
import setupCommands from './commands';
import environment from './environment';
import { Team, LanWithTeams } from './schema';
import adminRouter from './admin';
import steamRouter from './steam';
import helpers from './helpers';
import {
    getDatabaseClient,
    getUser,
    createOrUpdateUserByDiscordId,
    updateRoles,
    getTeamPoints,
    getEvents,
    getCurrentLanCached,
    getLans,
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
    watchPresenceUpdates,
    loginClient,
} from './discordApi';
import { startScoringCommunityGames } from './communityGame';

// TODO: Tidy constants vs. environment
import {
    COOKIE_MAX_AGE,
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
            context: Context;
        }
    }
}

const db = await getDatabaseClient(DATABASE_URL);

await startScoringCommunityGames(db);

const client = loginClient(DISCORD_TOKEN);
watchPresenceUpdates(db, client);
await setupCommands(client, DISCORD_CLIENT_ID);

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
    const user = request.session.userId ? await getUser(db, request.session.userId) : undefined;

    let currentLan = await getCurrentLanCached(db);
    let lanEnded = !currentLan || isLanEnded(currentLan);

    // Hide current team until event has started
    const lanStarted = Boolean(currentLan && isLanStarted(currentLan));
    if (user && !lanStarted) user.teamId = null;

    let lans: LanWithTeams[] | undefined = [];

    if (isAdmin(user)) {
        lans = await getLans(db);

        // If there's no current LAN, admins get the last one as default
        if (!currentLan) {
            currentLan = lodash.last(lans);
            lanEnded = true;
        }

        if (request.cookies['selected-lan']) {
            // Don't set a cookie for the default currentLan
            if (currentLan?.id === Number(request.cookies['selected-lan'])) {
                response.clearCookie('selected-lan', { path: '/' });
            } else {
                currentLan = lans.find((lan) => lan.id === Number(request.cookies['selected-lan']));
                lanEnded = true;
            }
        }
    }

    request.context = {
        currentPath: getUrl(request.originalUrl).path,
        currentUrl: request.originalUrl,
        discordAuthUrl: DISCORD_AUTH_URL,
        user,
        currentLan,
        lanStarted,
        lanEnded,
        lans,
        helpers,
    };

    next();
});

app.get('/login', async (request, response) => {
    const context = getContext(request);
    const query = zod.object({ code: zod.string() }).parse(request.query);

    // Check access token is valid by fetching user
    const accessToken = await getDiscordAccessToken(
        DISCORD_CLIENT_ID,
        DISCORD_CLIENT_SECRET,
        DISCORD_RETURN_URL,
        query.code,
    );
    const discordUser = await getDiscordUser(accessToken);

    const discordMember = await getDiscordGuildMember(client, DISCORD_GUILD_ID, discordUser.id);
    const serverRoles = await getGuildRoles(client, DISCORD_GUILD_ID);
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

    if (context.currentLan) {
        await getOrCreateIntroChallenge(db, 'Login', context.currentLan, user);
    }

    response.redirect(request.cookies['login-redirect'] || '/');
});

app.get('/logout', async (request, response) => {
    await destroySession(request);

    response.redirect('/');
});

/** Require current LAN for following routes */
app.use(async (request, response, next) => {
    const context = getContext(request);
    if (!context.currentLan) {
        return response.render('unscheduled', context);
    }
    next();
});

app.get('/', async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    response.render('guide', {
        ...context,
        points: context.user ? await getUserPoints(db, context.currentLan, context.user) : 0,
        constants: { INTRO_CHALLENGE_POINTS },
        introChallenges: await getIntroChallenges(db, context.currentLan, context.user),
        isEligible: isEligible(context.currentLan, context.user),
    });
});

app.get('/schedule', async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    const events = await getEvents(db, context.currentLan);

    response.render('schedule', {
        ...context,
        eventsByDay: splitByDay(events, getLanDays(context.currentLan)),
    });
});

app.use('/dashboard', async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    const teamPoints: Array<{ team: Team, points: number }> = [];
    for (const team of context.currentLan.teams) {
        teamPoints.push({ team, points: await getTeamPoints(db, context.currentLan, team) });
    }
    response.render('dashboard', { ...context, teamPoints });
});

/** Require login for following routes */
app.use(async (request, response, next) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.render('404', context);
    next();
});

app.get('/claim/:challengeId', async (request, response) => {
    const context = getContext(request, 'LOGGED_IN');
    await claimChallenge(db, context.currentLan, context.user, Number(request.params.challengeId));
    response.redirect('/');
});

app.use('/steam', steamRouter(db));
app.use('/admin', adminRouter(db));

/** 404 handler */
app.use((request: Request, response: Response) => {
    response.render('404', getContext(request));
});

/** Error handler */
app.use((error: any, request: Request, response: Response, next: NextFunction) => {
    if (!isUserError(error)) console.error('Server error', error);
    response.render('500', { ...getContext(request), error });
});

/** Start server */
app.listen(PORT, () => {
    console.log(`Server listening at ${HOST}`);

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled rejection:', reason, promise);
    });
});
