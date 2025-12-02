import { promisify } from 'node:util';

import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import { parseCookie } from 'cookie';
import lodash from 'lodash';
import * as Sentry from '@sentry/node';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { getContext } from './context.js';
import {
    splitByDay,
    getLanDays,
    parseUrl,
    isUserError,
    withLanStatus,
    userIntroCode,
    randomCode,
    repeatTask,
    getDayStart,
    UserError,
    addMinutes,
    dateIsValid,
    getEventEnd,
    getViteManifest,
    getViteManifestCached,
    absoluteUrl,
    assetUrl,
} from './util.js';
import setupCommands from './commands.js';
import adminRouter from './admin.js';
import steamRouter from './steam.js';
import authRouter, { getCurrentUserLan } from './auth.js';
import helpers from './helpers.js';
import getCsrf from './csrf.js';
import {
    getDatabaseClient,
    getUser,
    teamsWithPoints,
    getEvents,
    getLansCached,
    getUserPoints,
    getIntroChallenges,
    claimChallenge,
    checkIsAdmin,
    getOrCreateIntroChallenge,
    checkIsEligible,
    getOrCreateUserLan,
    getHiddenCodeByCode,
    createHiddenCodeScore,
    createSecretScore,
    getGroups,
    getLanUsersWithGroups,
    updateUserTeam,
    getScores,
    getScoresDetails,
    getEventByCode,
    createEventCodeScore,
} from './database.js';
import { chooseTeam } from './teams.js';
import { watchPresenceUpdates, loginClient, assignTeamRole } from './discordApi.js';
import { scoreCommunityGames, getIsNextSlotReady } from './communityGame.js';
import { startLan, getIsLanStarted, endLan, getIsLanEnded } from './lanEvents.js';
import { sendScoreUpdates } from './scores.js';

import {
    ENVIRONMENT,
    PORT,
    HOST,
    DISCORD_TOKEN,
    DISCORD_CLIENT_ID,
    DISCORD_GUILD_ID,
    SENTRY_DSN,
    DISCORD_AUTH_URL,
    SECRETS,
    CONTENT_SECURITY_POLICY,
} from './environment.js';
import {
    INTRO_CHALLENGE_POINTS,
    SECRET_POINTS,
    HIDDEN_CODE_BONUS_POINTS,
    ASSET_CACHE_MAX_AGE,
} from './constants.js';
import { getExpressSession, getConditionalSession } from './session.js';
import routes from './routes.js';

if (ENVIRONMENT !== 'development') {
    Sentry.init({ dsn: SENTRY_DSN, environment: ENVIRONMENT, enableLogs: true, sendDefaultPii: false });
}

const csrf = getCsrf();

const db = getDatabaseClient();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const discordClient = await loginClient(DISCORD_TOKEN);
watchPresenceUpdates(db, discordClient);
await setupCommands(discordClient, DISCORD_CLIENT_ID);

const tasks = [
    await repeatTask(async () => await startLan(db, discordClient), await getIsLanStarted(db)),
    await repeatTask(async () => await endLan(db, discordClient), await getIsLanEnded(db)),
    await repeatTask(async () => await scoreCommunityGames(db, io), getIsNextSlotReady()),
    await repeatTask(async () => await sendScoreUpdates(db, io), true, 60 * 1000),
];

app.use((request: Request, _response, next) => {
    // TODO: Use zod
    request.cookies = parseCookie(request.headers.cookie || '');
    next();
});

const expressSession = getExpressSession();

app.use(getConditionalSession(expressSession));

app.use(compression());

app.use(express.urlencoded());
app.use(express.static('build', { maxAge: ASSET_CACHE_MAX_AGE, immutable: true }));
app.set('view engine', 'pug');

app.use(async (request: Request, response, next) => {
    const nonce = randomCode();
    response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY.replace(/<NONCE>/g, nonce));

    const manifest = await (ENVIRONMENT === 'development' ? getViteManifest() : getViteManifestCached());

    const userId = request.session?.userId;
    const currentPath = parseUrl(request.originalUrl).path;
    const currentUrl = request.originalUrl;
    const csrfToken = csrf.generateToken(request);
    const discordAuthUrl = DISCORD_AUTH_URL;

    const lans = await getLansCached(db);
    const isAdmin = await checkIsAdmin(db, userId);
    const currentLan = withLanStatus(await getCurrentUserLan(db, request, response, isAdmin, lans));

    const user = userId ? await getUser(db, currentLan, userId) : undefined;
    const points = currentLan && user ? await getUserPoints(db, currentLan, user) : undefined;

    if (user) {
        if (currentLan && !currentLan.isEnded && !user.isEnrolled) {
            if (await checkIsEligible(db, user, currentLan)) {
                await getOrCreateUserLan(db, user, currentLan);
                await getOrCreateIntroChallenge(db, 'Login', currentLan, user);
                user.isEnrolled = true;
            }
        }

        if (currentLan && currentLan.isActive && user.isEnrolled && !user.team) {
            const groups = await getGroups(db);
            await db.transaction(async (tx) => {
                const users = await getLanUsersWithGroups(tx, currentLan, groups);
                user.team = chooseTeam(currentLan.teams, groups, users, user.id);
                await updateUserTeam(tx, currentLan, user, user.team);
            });
            await assignTeamRole(discordClient, DISCORD_GUILD_ID, currentLan, user);
        }

        // Hide current team until event has started
        if (!currentLan?.isStarted) {
            user.team = undefined;
        }
    }
    request.context = {
        currentPath,
        currentUrl,
        routes,
        nonce,
        csrfToken,
        discordAuthUrl,
        user,
        points,
        isAdmin,
        currentLan,
        lans,
        helpers: {
            ...helpers,
            absoluteUrl: (url) => absoluteUrl(HOST, url),
            assetUrl: (path) => assetUrl(manifest, path),
        },
    };

    next();
});

app.use(authRouter(db, discordClient, expressSession));

app.use(routes.privacy, (request, response) => response.render('privacy', getContext(request)));

/** Require current LAN for following routes */
app.use((request, response, next) => {
    const context = getContext(request);
    if (!context.currentLan) {
        return response.render('unscheduled', context);
    }
    next();
});

app.get(routes.home, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    response.render('guide', {
        ...context,
        constants: { INTRO_CHALLENGE_POINTS },
        hiddenCode: context.user ? `/intro/code/${userIntroCode(context.user)}` : undefined,
        introChallenges: await getIntroChallenges(db, context.currentLan, context.user),
    });
});

app.get(routes.dashboard, async (request: Request, response) => {
    const context = getContext(request, 'WITH_LAN');

    const lastDashboard = new Date(Number(request.cookies['dashboard-last-open']));
    let scoresUntil = addMinutes(new Date(), -10);
    if (dateIsValid(lastDashboard) && lastDashboard > scoresUntil) {
        scoresUntil = lastDashboard;
    }

    const latestScores = await getScores(db, context.currentLan, scoresUntil);
    const latestScoreDetails = await getScoresDetails(db, context.currentLan, latestScores);

    const teams = await teamsWithPoints(db, context.currentLan, scoresUntil);
    const maxPoints = lodash.max(teams.map((team) => team.points)) || 0;
    const lanProgress = context.currentLan.progress;
    response.render('dashboard', { ...context, teams, maxPoints, lanProgress, latestScoreDetails });
});

app.get(routes.schedule, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    const showEvents = new Date() > getDayStart(context.currentLan.scheduleStart);
    const events = showEvents || context.isAdmin ? await getEvents(db, context.currentLan) : [];

    response.render('schedule', {
        ...context,
        eventsByDay: splitByDay(events, getLanDays(context.currentLan)),
    });
});

app.get(routes.intro.code, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.status(403).render('403', context);

    if (userIntroCode(context.user) === request.params.userCode) {
        await getOrCreateIntroChallenge(db, 'HiddenCode', context.currentLan, context.user);
    }
    response.redirect(routes.home + '#qr');
});

app.get(routes.intro.claim, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.status(403).render('403', context);

    if (context.currentLan.isEnded) throw new UserError('Too late! The event is over.');

    const score = await claimChallenge(db, context.currentLan, context.user, Number(request.params.challengeId));
    if (score) {
        io.emit('NEW_SCORES', await getScoresDetails(db, context.currentLan, [score]));
    }
    response.redirect(routes.home);
});

app.get(routes.code, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.status(403).render('403', context);

    if (context.currentLan.isEnded) throw new UserError('Too late! The event is over.');

    const code = await getHiddenCodeByCode(db, context.currentLan, request.params.hiddenCode);
    if (!code) throw new UserError('Not a valid code, sorry!');

    const createdScore = await createHiddenCodeScore(db, context.user, code);
    if (!createdScore) {
        return response.render('code', { ...context, code, bonus: HIDDEN_CODE_BONUS_POINTS, existing: true });
    }

    io.emit('NEW_SCORES', await getScoresDetails(db, context.currentLan, [createdScore]));
    response.render('code', { ...context, score: createdScore, code, bonus: HIDDEN_CODE_BONUS_POINTS, existing: false });
});

app.get(routes.event, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.status(403).render('403', context);

    if (context.currentLan.isEnded) throw new UserError('Too late! The event is over.');

    const event = await getEventByCode(db, context.currentLan, request.params.code);
    if (!event) throw new UserError('Not a valid code, sorry!');

    const now = new Date();
    if (now < event.startTime) throw new UserError('This event hasn\'t started yet.');
    if (now > getEventEnd(event)) throw new UserError('This event has ended.');

    const createdScore = await createEventCodeScore(db, context.user, event);
    if (!createdScore) {
        return response.render('event', { ...context, event, existing: true });
    }

    io.emit('NEW_SCORES', await getScoresDetails(db, context.currentLan, [createdScore]));
    response.render('event', { ...context, score: createdScore, event, existing: false });
});

app.get(routes.secret, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.status(403).render('403', context);

    if (context.currentLan.isEnded) throw new UserError('Too late! The event is over.');

    const secretNumber = SECRETS[request.params.secretCode];
    if (!secretNumber) return response.render('secret', { ...context, valid: false });

    const score = await createSecretScore(db, context.currentLan, context.user, secretNumber);
    if (!score) {
        return response.render('secret', { ...context, valid: true, alreadyFound: true });
    }

    io.emit('NEW_SCORES', await getScoresDetails(db, context.currentLan, [score]));
    response.render('secret', { ...context, valid: true, secretPoints: SECRET_POINTS });
});

/** Require login for following routes */
app.use((request, response, next) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.status(404).render('404', context);
    next();
});

app.use(steamRouter(db));
app.use(adminRouter(db, csrf, io));

/** 404 handler */
app.use((request, response) => {
    response.status(404).render('404', getContext(request));
});

/** UserError handler */
app.use((error: Error, request: Request, response: Response, next: NextFunction) => {
    if (isUserError(error)) {
        return response.status(500).render('500', { ...getContext(request), error, code: response.sentry });
    }
    next(error);
});

if (ENVIRONMENT !== 'development') {
    Sentry.setupExpressErrorHandler(app);
}

/** Error handler */
app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
    console.error('Server error', error);
    response.status(500).render('500', { ...getContext(request), error, code: response.sentry });
});

/** Start server */
const server = httpServer.listen(PORT, () => {
    console.log(`Server listening at ${HOST}`);

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled rejection:', reason, promise);
    });
});

const shutDown = lodash.once(async () => {
    console.log('Shutting down');

    for (const cancelTask of tasks) cancelTask();
    console.log('Tasks cancelled');

    await promisify(server.close.bind(server))();
    console.log('Server closed');

    await io.close();
    console.log('Socket.io closed');

    await discordClient.destroy();
    console.log('Disconnected from Discord');

    await db.disconnect();
    console.log('Database disconnected');

    process.exit();
});

process.on('SIGINT', () => void shutDown());
process.on('SIGTERM', () => void shutDown());
