import { Router, Request, Response } from 'express';
import { Client } from 'discord.js';

import { Csrf } from './csrf';
import { getContext } from 'context';
import { formatScoreType, getTeam, UserError, teamsWithCounts} from './util';
import { randomiseTeams } from './teams';
import {
    getLanUsers,
    getUser,
    getUserWithLan,
    getMinimalUsers,
    getGroups,
    getEvent,
    getMinimalEvents,
    updateEvent,
    createEvent,
    updateTeams,
    getGameWithDuplicates,
    getGames,
    updateGame,
    getScores,
    awardScore,
    getLans,
    getLan,
    createLan,
    updateLan,
    updateTeam,
    getHiddenCodes,
    getHiddenCode,
    createHiddenCode,
    updateHiddenCode,
    DatabaseClient,
} from './database';
import {
    LanData,
    EventData,
    PointsQuery,
    AssignPointsData,
    HiddenCodeData,
    DuplicateGameData,
} from './validation';

export default function (db: DatabaseClient, csrf: Csrf, discordClient: Client) {
    const router = Router();

    router.get('/lans', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        response.render('admin/lans/list', {
            ...context,
            lans: await getLans(db),
        });
    });

    router.get('/lans/create', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        response.render('admin/lans/create', context);
    });

    router.post('/lans/create', csrf.protect, async (request: Request, response: Response) => {
        const data = LanData.parse(request.body);

        await createLan(db, data);
        response.redirect('/admin/lans');
    });

    router.get('/lans/:lanId', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const lan = await getLan(db, Number(request.params.lanId));
        if (!lan) throw new UserError('Lan not found.');

        response.render('admin/lans/edit', { ...context, lan });
    });

    router.post('/lans/:lanId', csrf.protect, async (request: Request, response: Response) => {
        const data = LanData.parse(request.body);
        const lan = await getLan(db, Number(request.params.lanId));
        if (!lan) throw new UserError('Lan not found.');

        await updateLan(db, lan, data);
        response.redirect('/admin/lans');
    });

    router.get('/events/create', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const games = await getGames(db);

        response.render('admin/events/create', { ...context, games });
    });

    router.post('/events/create', csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        console.log(request.body);
        const data = EventData.parse(request.body);

        await createEvent(db, context.currentLan, data);
        response.redirect('/schedule');
    });

    router.get('/events/:eventId', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        const event = await getEvent(db, context.currentLan, Number(request.params.eventId));

        if (!event) throw new UserError('Event not found.');

        const games = await getGames(db);

        response.render('admin/events/edit', { ...context, event, games });
    });

    router.post('/events/:eventId', csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const data = EventData.parse(request.body);
        const event = await getEvent(db, context.currentLan, Number(request.params.eventId));

        if (!event) throw new UserError('Event not found.');

        await updateEvent(db, event, data);
        response.redirect('/schedule');
    });

    router.get('/points', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const query = PointsQuery.parse(request.query);
        const filters = [
            { name: 'All', url: '/admin/points' },
            { name: formatScoreType('Awarded'), url: '/admin/points?type=Awarded' },
            { name: formatScoreType('CommunityGame'), url: '/admin/points?type=CommunityGame' },
            { name: formatScoreType('IntroChallenge'), url: '/admin/points?type=IntroChallenge' },
            { name: formatScoreType('HiddenCode'), url: '/admin/points?type=HiddenCode' },
        ];
        response.render('admin/points/list', {
            ...context,
            filters,
            assignedScores: await getScores(db, context.currentLan, query.type),
        });
    });

    router.get('/points/assign', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        response.render('admin/points/create', {
            ...context,
            events: await getMinimalEvents(db, context.currentLan),
            users: await getMinimalUsers(db, context.currentLan),
        });
    });

    router.post('/points/assign', csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        if (context.currentLan?.isEnded) {
            throw new UserError('You can\'t submit any more scores, this LAN has ended!');
        }

        const data = AssignPointsData.parse(request.body);

        const event = data.eventId ? await getEvent(db, context.currentLan, data.eventId) : undefined;
        if (data.eventId && !event) throw new Error(`Event ${data.eventId} not found`);

        if (data.type === 'player') {
            const player = await getUser(db, context.currentLan, data.userId);
            if (!player) {
                if (await getUser(db, undefined, data.userId)) {
                    throw new Error(`Player ${data.userId} not part of ${context.currentLan.name} LAN`);
                } else {
                    throw new Error(`Player ${data.userId} not found`);
                }
            }

            await awardScore(
                db, context.currentLan, context.user, data.points, data.reason, event, player,
            );
        } else {
            const team = getTeam(context.currentLan, data.teamId);
            if (!team) throw new Error(`Team ${data.type} not found`);

            await awardScore(
                db, context.currentLan, context.user, data.points, data.reason, event, team,
            );
        }

        response.redirect('/admin/points');
    });

    router.get('/teams', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const groups = await getGroups(db);
        const users = await getLanUsers(db, context.currentLan, groups);
        const teams = teamsWithCounts(context.currentLan.teams, users);

        response.render('admin/teams', { ...context, users, teams });
    });

    router.post('/teams/randomise', csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        if (context.currentLan.isStarted) {
            throw new UserError('Cannot randomise teams after LAN has started');
        }

        const groups = await getGroups(db);
        const users = await getLanUsers(db, context.currentLan, groups);
        const userTeams = randomiseTeams(context.currentLan.teams, groups, users);

        for (const [user, team] of userTeams) {
            user.team = team;
        }
        await updateTeams(db, context.currentLan, users);

        response.redirect('/admin/teams');
    });

    router.post('/teams/switch/:userId', csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        const user = await getUserWithLan(db, context.currentLan,  Number(request.params.userId));
        if (!user) throw new UserError('User not found');

        const teams = context.currentLan.teams;
        const teamIndex = teams.findIndex((team) => team.id === user.team?.id);
        const newTeam = teams[(teamIndex + teams.length + 1) % teams.length]!;
        await updateTeam(db, context.currentLan, user, newTeam);

        response.redirect('/admin/teams');
    });

    router.get('/codes', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const hiddenCodes = await getHiddenCodes(db, context.currentLan);

        response.render('admin/codes/list', { ...context, hiddenCodes });
    });

    router.get('/codes/create', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        response.render('admin/codes/create', context);
    });

    router.post('/codes/create', csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const data = HiddenCodeData.parse(request.body);

        await createHiddenCode(db, context.currentLan, data);
        response.redirect('/admin/codes');
    });

    router.get('/codes/:codeId', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const code = await getHiddenCode(db, context.currentLan, Number(request.params.codeId));
        if (!code) throw new UserError('Hidden code not found.');

        response.render('admin/codes/edit', { ...context, code });
    });

    router.post('/codes/:codeId', csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const data = HiddenCodeData.parse(request.body);
        const code = await getHiddenCode(db, context.currentLan, Number(request.params.codeId));
        if (!code) throw new UserError('Hidden code not found.');

        await updateHiddenCode(db, context.currentLan, code, data);
        response.redirect('/admin/codes');
    });

    router.get('/games', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        response.render('admin/games/list', {
            ...context,
            games: await getGames(db),
        });
    });

    router.get('/games/:gameId', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const game = await getGameWithDuplicates(db, Number(request.params.gameId));
        if (!game) throw new UserError('Game not found.');

        const games = (await getGames(db)).filter((otherGame) => otherGame.id !== game.id );
        response.render('admin/games/edit', { ...context, game, games });
    });

    router.post('/games/:gameId/duplicates', csrf.protect, async (request: Request, response: Response) => {
        const game = await getGameWithDuplicates(db, Number(request.params.gameId));
        if (!game) throw new UserError('Game not found.');

        const data = DuplicateGameData.parse(request.body);
        if (game.duplicates.find((duplicate) => duplicate.id === data.gameId)) {
            throw new UserError('Game already has duplicate');
        }
        await updateGame(db, data.gameId, { parentId: game.id });

        response.redirect(`/admin/games/${request.params.gameId}`);
    });

    router.post('/games/:gameId/duplicates/:duplicateId/delete', csrf.protect, async (request: Request, response: Response) => {
        const game = await getGameWithDuplicates(db, Number(request.params.gameId));
        if (!game) throw new UserError('Game not found.');

        const duplicateId = Number(request.params.duplicateId);
        if (!game.duplicates.find((duplicate) => duplicate.id === duplicateId)) {
            throw new UserError('Game has no duplicate');
        }
        await updateGame(db, duplicateId, { parentId: undefined });

        response.redirect(`/admin/games/${request.params.gameId}`);
    });

    return router;
}
