import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';

import { Csrf } from './csrf';
import { getContext } from 'context';
import {
    getTeam,
    UserError,
    teamsWithCounts,
    getScoreFilters,
    getPages,
    addMinutes,
    getDayStart,
    getDayEnd,
} from './util';
import { randomiseTeams } from './teams';
import { PAGE_SIZE } from './constants';
import { User, UserTeams, Team } from './schema';
import {
    getLanUsersWithGroups,
    getUser,
    getUserWithTeam,
    getMinimalUsers,
    getLanUsersWithPoints,
    getGroups,
    getEvent,
    getEvents,
    getMinimalEvents,
    updateEvent,
    createEvent,
    updateTeams,
    getGameWithDuplicates,
    getGamesWithDuplicates,
    getGames,
    updateGame,
    countScores,
    countUserScores,
    getScores,
    getUserScores,
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
    getScoresDetails,
    DatabaseClient,
} from './database';
import {
    LanData,
    EventData,
    PointsQuery,
    AssignPointsData,
    HiddenCodeData,
    DuplicateGameData,
    EventQuery,
} from './validation';

import routes, { routeUrl } from './routes';

export default function (db: DatabaseClient, csrf: Csrf, io: Server) {
    const router = Router();

    router.get(routes.admin.lans.list, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        response.render('admin/lans/list', {
            ...context,
            lans: await getLans(db),
        });
    });

    router.get(routes.admin.lans.create, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        response.render('admin/lans/create', context);
    });

    router.post(routes.admin.lans.create, csrf.protect, async (request: Request, response: Response) => {
        const data = LanData.parse(request.body);

        await createLan(db, data);
        response.redirect(routeUrl(routes.admin.lans.list));
    });

    router.get(routes.admin.lans.get, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const lan = await getLan(db, Number(request.params.lanId));
        if (!lan) throw new UserError('Lan not found.');

        response.render('admin/lans/edit', { ...context, lan });
    });

    router.post(routes.admin.lans.get, csrf.protect, async (request: Request, response: Response) => {
        const data = LanData.parse(request.body);
        const lan = await getLan(db, Number(request.params.lanId));
        if (!lan) throw new UserError('Lan not found.');

        await updateLan(db, lan, data);
        response.redirect(routeUrl(routes.admin.lans.list));
    });

    router.get(routes.admin.events.list, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const events = await getEvents(db, context.currentLan);

        response.render('admin/events/list', { ...context, events });
    });

    router.get(routes.admin.events.create, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const query = EventQuery.parse(request.query);

        const scheduleStart = getDayStart(context.currentLan.scheduleStart);
        const scheduleEnd = getDayEnd(context.currentLan.scheduleEnd);

        const games = await getGames(db);
        response.render('admin/events/create', { ...context, games, query, scheduleStart, scheduleEnd });
    });

    router.post(routes.admin.events.create, csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const data = EventData.parse(request.body);
        const query = EventQuery.parse(request.query);

        await createEvent(db, context.currentLan, { ...data, createdBy: context.user.id });
        response.redirect(query.returnTo === 'schedule' ? routes.schedule : routes.admin.events.list);
    });

    router.get(routes.admin.events.get, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const query = EventQuery.parse(request.query);

        const event = await getEvent(db, context.currentLan, Number(request.params.eventId));
        if (!event) throw new UserError('Event not found.');

        const games = await getGames(db);

        const scheduleStart = getDayStart(context.currentLan.scheduleStart);
        const scheduleEnd = getDayEnd(context.currentLan.scheduleEnd);

        response.render('admin/events/edit', { ...context, event, games, query, scheduleStart, scheduleEnd });
    });

    router.post(routes.admin.events.get, csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const data = EventData.parse(request.body);
        const query = EventQuery.parse(request.query);

        const event = await getEvent(db, context.currentLan, Number(request.params.eventId));
        if (!event) throw new UserError('Event not found.');

        const now = new Date()
        if (now > event.startTime) {
            if (Number(data.startTime) != Number(event.startTime)) {
                throw new UserError('Start time can\'t be changed after the event starts.');
            }
            if (data.points !== event.points) {
                throw new UserError('Points can\'t be changed after the event starts.');
            }
            if (data.duration !== event.duration && now > addMinutes(event.startTime, data.duration)) {
                throw new UserError('Duration can\'t be reduced before now.');
            }
        }

        await updateEvent(db, event, data);
        response.redirect(query.returnTo === 'schedule' ? '/schedule' : routeUrl(routes.admin.events.list));
    });

    router.get(routes.admin.players.list, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const groups = await getGroups(db);
        const players =  await getLanUsersWithPoints(db, context.currentLan, groups);
        const teams = teamsWithCounts(context.currentLan.teams, players);

        response.render('admin/players/list', { ...context, teams, players });
    });

    router.get(routes.admin.players.get, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const query = PointsQuery.parse(request.query);

        const player = await getUser(db, context.currentLan, Number(request.params.playerId));
        if (!player) throw new UserError('User not found.');

        const filters = getScoreFilters(
            routeUrl(routes.admin.players.get, request.params.playerId!),
            ['Awarded', 'CommunityGame', 'IntroChallenge', 'HiddenCode'],
        );
        const pages = getPages(await countUserScores(db, context.currentLan, player, query.type), PAGE_SIZE);
        const scores = await getUserScores(db, context.currentLan, player, query.type, query.page);
        response.render('admin/players/view', { ...context, filters, query, pages, player, scores });
    });

    router.get(routes.admin.points.list, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const query = PointsQuery.parse(request.query);

        const filters = getScoreFilters(
            routes.admin.points.list,
            ['Awarded', 'CommunityGame', 'IntroChallenge', 'HiddenCode'],
        );
        const pages = getPages(await countScores(db, context.currentLan, query.type), PAGE_SIZE);
        const scores = await getScores(db, context.currentLan, query.type, query.page);
        response.render('admin/points/list', { ...context, filters, query, pages, scores });
    });

    router.get(routes.admin.points.create, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        const events = await getMinimalEvents(db, context.currentLan);
        const users = await getMinimalUsers(db, context.currentLan);
        response.render('admin/points/create', { ...context, events, users });
    });

    router.post(routes.admin.points.create, csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        if (context.currentLan?.isEnded) {
            throw new UserError('You can\'t submit any more scores, this LAN has ended!');
        }

        const data = AssignPointsData.parse(request.body);

        const event = data.eventId ? await getEvent(db, context.currentLan, data.eventId) : undefined;
        if (data.eventId && !event) throw new Error(`Event ${data.eventId} not found`);

        let owner: User & UserTeams | Team;
        if (data.type === 'player') {
            const player = await getUser(db, context.currentLan, data.userId);
            if (!player) {
                if (await getUser(db, undefined, data.userId)) {
                    throw new Error(`Player ${data.userId} not part of ${context.currentLan.name} LAN`);
                } else {
                    throw new Error(`Player ${data.userId} not found`);
                }
            }
            owner = player;
        } else {
            const team = getTeam(context.currentLan, data.teamId);
            if (!team) throw new Error(`Team ${data.type} not found`);
            owner = team;
        }

        const score = await awardScore(
            db, context.currentLan, context.user, data.points, data.reason, event, owner,
        );
        io.emit('NEW_SCORES', await getScoresDetails(db, context.currentLan, [score]));

        response.redirect(routes.admin.points.list);
    });

    router.post(routes.admin.players.randomise, csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        if (context.currentLan.isStarted) {
            throw new UserError('Cannot randomise teams after LAN has started');
        }

        const groups = await getGroups(db);
        const users = await getLanUsersWithGroups(db, context.currentLan, groups);
        const userTeams = randomiseTeams(context.currentLan.teams, groups, users);

        for (const [user, team] of userTeams) {
            user.team = team;
        }
        await updateTeams(db, context.currentLan, users);

        response.redirect(routes.admin.players.list);
    });

    router.post(routes.admin.players.switch, csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        const user = await getUserWithTeam(db, context.currentLan, Number(request.params.playerId));
        if (!user) throw new UserError('User not found');

        const teams = context.currentLan.teams;
        const teamIndex = teams.findIndex((team) => team.id === user.team?.id);
        const newTeam = teams[(teamIndex + teams.length + 1) % teams.length]!;
        await updateTeam(db, context.currentLan, user, newTeam);

        response.redirect(routes.admin.players.list);
    });

    router.get(routes.admin.codes.list, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const hiddenCodes = await getHiddenCodes(db, context.currentLan);

        response.render('admin/codes/list', { ...context, hiddenCodes });
    });

    router.get(routes.admin.codes.create, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        response.render('admin/codes/create', context);
    });

    router.post(routes.admin.codes.create, csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const data = HiddenCodeData.parse(request.body);

        await createHiddenCode(db, context.currentLan, data);
        response.redirect(routes.admin.codes.list);
    });

    router.get(routes.admin.codes.get, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const code = await getHiddenCode(db, context.currentLan, Number(request.params.codeId));
        if (!code) throw new UserError('Hidden code not found.');

        response.render('admin/codes/edit', { ...context, code });
    });

    router.post(routes.admin.codes.get, csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const data = HiddenCodeData.parse(request.body);
        const code = await getHiddenCode(db, context.currentLan, Number(request.params.codeId));
        if (!code) throw new UserError('Hidden code not found.');

        await updateHiddenCode(db, context.currentLan, code, data);
        response.redirect(routes.admin.codes.list);
    });

    router.get(routes.admin.games.list, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        response.render('admin/games/list', {
            ...context,
            games: await getGamesWithDuplicates(db),
        });
    });

    router.get(routes.admin.games.get, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        const game = await getGameWithDuplicates(db, Number(request.params.gameId));
        if (!game) throw new UserError('Game not found.');
        if (game.parentId) throw new UserError('Game is a duplicate.');

        const games = (await getGames(db)).filter((otherGame) => otherGame.id !== game.id );
        response.render('admin/games/edit', { ...context, game, games });
    });

    router.post(routes.admin.games.duplicates.create, csrf.protect, async (request: Request, response: Response) => {
        const game = await getGameWithDuplicates(db, Number(request.params.gameId));
        if (!game) throw new UserError('Game not found.');
        if (game.parentId) throw new UserError('Game is a duplicate.');

        const data = DuplicateGameData.parse(request.body);
        const duplicate = await getGameWithDuplicates(db, data.gameId);
        if (!duplicate) throw new UserError('Duplicate not found.');
        if (duplicate.duplicates.length > 0) throw new UserError('Duplicate cannot have duplicates.');

        if (game.duplicates.find((duplicate) => duplicate.id === data.gameId)) {
            throw new UserError('Game already has duplicate');
        }
        await updateGame(db, data.gameId, { parentId: game.id });

        response.redirect(routeUrl(routes.admin.games.get, request.params.gameId!));
    });

    router.post(routes.admin.games.duplicates.delete, csrf.protect, async (request: Request, response: Response) => {
        const game = await getGameWithDuplicates(db, Number(request.params.gameId));
        if (!game) throw new UserError('Game not found.');

        const duplicateId = Number(request.params.duplicateId);
        if (!game.duplicates.find((duplicate) => duplicate.id === duplicateId)) {
            throw new UserError('Game has no duplicate');
        }
        await updateGame(db, duplicateId, { parentId: undefined });

        response.redirect(routeUrl(routes.admin.games.get, request.params.gameId!));
    });

    return router;
}
