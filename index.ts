import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import expressSession from 'express-session';
import sessionStore from 'connect-pg-simple';

import { getContext } from './context';
import { splitByDay, getLanDays, getUrl, isUserError, withLanStatus } from './util';
import setupCommands from './commands';
import { Team } from './schema';
import adminRouter from './admin';
import steamRouter from './steam';
import authRouter, { getCurrentUserLan } from './auth';
import helpers from './helpers';
import getCsrf from './csrf';
import {
    getDatabaseClient,
    getUser,
    getTeamPoints,
    getEvents,
    getLansCached,
    getUserPoints,
    getIntroChallenges,
    claimChallenge,
    checkIsAdmin,
    getOrCreateIntroChallenge,
    checkIsEligible,
    getOrCreateUserLan,
} from './database';
import { watchPresenceUpdates, loginClient } from './discordApi';
import { startScoringCommunityGames } from './communityGame';
import {
    PORT,
    HOST,
    SECURE_COOKIE,
    SESSION_SECRET,
    DISCORD_TOKEN,
    DISCORD_CLIENT_ID,
    DATABASE_URL,
} from './environment';
import { COOKIE_MAX_AGE, DISCORD_AUTH_URL, INTRO_CHALLENGE_POINTS } from './constants';

const csrf = getCsrf();

const db = await getDatabaseClient(DATABASE_URL);

await startScoringCommunityGames(db);

const discordClient = loginClient(DISCORD_TOKEN);
watchPresenceUpdates(db, discordClient);
await setupCommands(discordClient, DISCORD_CLIENT_ID);

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
    const userId = request.session.userId;
    const currentPath = getUrl(request.originalUrl).path;
    const currentUrl = request.originalUrl;
    const csrfToken = csrf.generateToken(request);
    const discordAuthUrl = DISCORD_AUTH_URL;

    const lans = await getLansCached(db);
    const isAdmin = await checkIsAdmin(db, userId);
    const currentLan = withLanStatus(await getCurrentUserLan(db, request, response, isAdmin, lans));

    const user = request.session.userId ? await getUser(db, currentLan, request.session.userId) : undefined;

    if (user) {
        if (currentLan && !currentLan?.isEnded && !user.isEnrolled) {
            if (await checkIsEligible(db, user, currentLan)) {
                // TODO: Also assign team if started
                await getOrCreateUserLan(db, user, currentLan);
                await getOrCreateIntroChallenge(db, 'Login', currentLan, user);
                user.isEnrolled = true;
            }
        }

        // Hide current team until event has started
        if (!currentLan?.isStarted) {
            user.team = undefined;
        }
    }
    request.context = {
        currentPath, currentUrl, csrfToken, discordAuthUrl, user, isAdmin, currentLan, lans, helpers,
    };

    next();
});

app.use('/auth', authRouter(db, discordClient));

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
app.use('/admin', adminRouter(db, csrf));

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
