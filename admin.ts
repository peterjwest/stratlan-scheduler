import { Router, Request, Response, NextFunction } from 'express';
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
    updateTeams,
    getGames,
    getScores,
    awardScore,
    getLans,
    getLan,
    createLan,
    updateLan,
    updateTeam,
    DatabaseClient,
} from './database';
import {
    LanData,
    EventData,
    PointsQuery,
    AssignPointsData,
} from './validation';

export default function (db: DatabaseClient, csrf: Csrf, discordClient: Client) {
    const router = Router();

    router.use((request: Request, response: Response, next: NextFunction) => {
        const context = getContext(request, 'LOGGED_IN');
        if (!context.isAdmin) return response.render('404', context);
        next();
    });

    router.get('/lans', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        response.render('admin/lans/lans', {
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

        response.render('admin/lans/lan', { ...context, lan });
    });

    router.post('/lans/:lanId', csrf.protect, async (request: Request, response: Response) => {
        const data = LanData.parse(request.body);
        const lan = await getLan(db, Number(request.params.lanId));
        if (!lan) throw new UserError('Lan not found.');

        await updateLan(db, lan, data);
        response.redirect('/admin/lans');
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
        ];
        response.render('admin/points', {
            ...context,
            filters,
            assignedScores: await getScores(db, context.currentLan, query.type),
        });
    });

    router.get('/assign', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');
        response.render('admin/assign', {
            ...context,
            events: await getMinimalEvents(db, context.currentLan),
            users: await getMinimalUsers(db, context.currentLan),
        });
    });

    router.post('/assign', csrf.protect, async (request: Request, response: Response) => {
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

        console.log(user);
        const teams = context.currentLan.teams;
        const teamIndex = teams.findIndex((team) => team.id === user.team?.id);
        const newTeam = teams[(teamIndex + teams.length + 1) % teams.length]!;
        await updateTeam(db, context.currentLan, user, newTeam);

        response.redirect('/admin/teams');
    });

    return router;
}
