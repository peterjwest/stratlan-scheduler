import { promisify } from 'node:util';

import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import lodash from 'lodash';

import { getContext } from './context';
import {
    splitByDay,
    getLanDays,
    parseUrl,
    isUserError,
    withLanStatus,
    absoluteUrl,
    userIntroCode,
    UserError,
} from './util';
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
    getHiddenCodeByCode,
    getOrCreateHiddenCodeScore,
    findSecretScoreByLan,
    createSecretScore,
} from './database';
import { watchPresenceUpdates, loginClient } from './discordApi';
import { startScoringCommunityGames } from './communityGame';
import { PORT, HOST, DISCORD_TOKEN, DISCORD_CLIENT_ID } from './environment';
import { DISCORD_AUTH_URL, INTRO_CHALLENGE_POINTS, HIDDEN_CODE_POINTS, SECRET_POINTS, SECRETS_BY_CODE } from './constants';
import { getExpressSession, getConditionalSession } from './session';
import routes from './routes';

const csrf = getCsrf();

const db = await getDatabaseClient();

const stopScoring = await startScoringCommunityGames(db);

const discordClient = loginClient(DISCORD_TOKEN);
watchPresenceUpdates(db, discordClient);
await setupCommands(discordClient, DISCORD_CLIENT_ID);

const app = express();

app.use(cookieParser());

const expressSession = getExpressSession();

app.use(getConditionalSession(expressSession));

app.use(express.urlencoded());
app.use(express.static('build/public'));
app.set('view engine', 'pug');

app.use(async (request, response, next) => {
    const userId = request.session?.userId;
    const currentPath = parseUrl(request.originalUrl).path;
    const currentUrl = request.originalUrl;
    const csrfToken = csrf.generateToken(request);
    const discordAuthUrl = DISCORD_AUTH_URL;

    const lans = await getLansCached(db);
    const isAdmin = await checkIsAdmin(db, userId);
    const currentLan = withLanStatus(await getCurrentUserLan(db, request, response, isAdmin, lans));

    const user = userId ? await getUser(db, currentLan, userId) : undefined;

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
        currentPath, currentUrl, routes,csrfToken, discordAuthUrl, user, isAdmin, currentLan, lans, helpers,
    };

    next();
});

app.use(authRouter(db, discordClient, expressSession));

/** Require current LAN for following routes */
app.use(async (request, response, next) => {
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
        points: context.user ? await getUserPoints(db, context.currentLan, context.user) : 0,
        constants: { INTRO_CHALLENGE_POINTS },
        hiddenCode: context.user ? absoluteUrl(`/intro/code/${userIntroCode(context.user)}`) : undefined,
        introChallenges: await getIntroChallenges(db, context.currentLan, context.user),
    });
});

app.use(routes.dashboard, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');

    const teamPoints: Array<{ team: Team, points: number }> = [];
    for (const team of context.currentLan.teams) {
        const points = context.currentLan.isStarted ? await getTeamPoints(db, context.currentLan, team) : 0;
        teamPoints.push({ team, points });
    }

    const maxPoints = lodash.maxBy(teamPoints, 'points')?.points;
    // TODO: Slowly animate max points on change
    response.render('dashboard', { ...context, teamPoints, maxPoints });
});

app.get(routes.schedule, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    const events = await getEvents(db, context.currentLan);

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
    response.redirect(routes.home);
});

app.get(routes.intro.claim, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.status(403).render('403', context);

    await claimChallenge(db, context.currentLan, context.user, Number(request.params.challengeId));
    response.redirect(routes.home);
});

app.get(routes.code, async (request, response) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.status(403).render('403', context);

    const code = await getHiddenCodeByCode(db, context.currentLan, request.params.hiddenCode);
    if (!code) throw new UserError('Not a valid code, sorry!');

    await getOrCreateHiddenCodeScore(db, context.user, code);

    response.render('code', {
        ...context,
        points: HIDDEN_CODE_POINTS,
        code,
    });
});

app.get(routes.secret, async (request: Request, response: Response, next: NextFunction) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.status(403).render('403', context);

    const secretNumber = SECRETS_BY_CODE[request.params.secretCode || ''];
    if (!secretNumber) return response.render('secret', { ...context });

    if (await findSecretScoreByLan(db, context.currentLan, secretNumber)) {
        return response.render('secret', { ...context, valid: true, alreadyFound: true });
    }

    await createSecretScore(db, context.currentLan, context.user, secretNumber)

    response.render('secret', { ...context, valid: true, points: SECRET_POINTS });
});

/** Require login for following routes */
app.use(async (request, response, next) => {
    const context = getContext(request, 'WITH_LAN');
    if (!context.user) return response.status(404).render('404', context);
    next();
});

app.use(steamRouter(db));
app.use(adminRouter(db, csrf, discordClient));

/** 404 handler */
app.use((request: Request, response: Response) => {
    response.status(404).render('404', getContext(request));
});

/** Error handler */
app.use((error: any, request: Request, response: Response, next: NextFunction) => {
    if (!isUserError(error)) console.error('Server error', error);
    response.status(500).render('500', { ...getContext(request), error });
});

/** Start server */
const server = app.listen(PORT, () => {
    console.log(`Server listening at ${HOST}`);

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled rejection:', reason, promise);
    });
});

const shutDown = lodash.once(async () => {
    console.log('Shutting down');
    stopScoring();

    await promisify(server.close);
    console.log('Server closed');

    await discordClient.destroy();
    console.log('Disconnected from Discord');

    await db.disconnect();
    console.log('Database disconnected');

    process.exit();
});

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
