import { Router } from 'express';
import zod from 'zod';

import { parseInteger, formatScoreType } from './util';
import { Event, Team } from './schema';
import { getUser, getMinimalUsers, getEvent, getMinimalEvents, getScores, awardScore, DatabaseClient } from './database';
import { TEAMS, ScoreType } from './constants';

const AssignPoints = zod.object({
    points: zod.string().transform((id) => parseInteger(id)),
    reason: zod.string(),
    eventId: zod.string().transform((id) => id ? parseInteger(id) : undefined),
    submit: zod.literal('Submit'),
})

const AssignTeamPoints = AssignPoints.extend({
    type: zod.enum(TEAMS),
});

const AssignPlayerPoints = AssignPoints.extend({
    type: zod.literal(['Player']),
    userId: zod.string().transform((id) => parseInteger(id)),
});

const AssignPointsData = zod.union([AssignTeamPoints, AssignPlayerPoints]);

const PointsQuery = zod.object({
    type: zod.union([ScoreType, zod.undefined()]),
    assigned: zod.union([zod.string(), zod.undefined()]).transform((value) => value === 'true'),
});

export default function (db: DatabaseClient) {
    const router = Router();

    router.use((request, response, next) => {
        if (!request.user.isAdmin) return response.status(403).send('Unauthorised');
        next();
    });

    router.get('/', async (request, response) => {
        response.render('admin/index', request.context);
    });

    router.get('/points', async (request, response) => {
        const query = PointsQuery.parse(request.query);
        const filters = [
            { name: 'All', url: '/admin/points' },
            { name: formatScoreType('Awarded'), url: '/admin/points?type=Awarded' },
            { name: formatScoreType('CommunityGame'), url: '/admin/points?type=CommunityGame' },
            // { name: formatScoreType('Achievement'), url: '/admin/points?type=Achievement' },
            // { name: formatScoreType('OneTimeCode'), url: '/admin/points?type=OneTimeCode' },
            // { name: 'Manually assigned', url: '/admin/points?assigned=true' },
        ]
        response.render('admin/points', {
            ...request.context,
            filters,
            path: request.originalUrl,
            assignedScores: await getScores(db, query.type, query.assigned),
        });
    });

    router.get('/assign', async (request, response) => {
        response.render('admin/assign', {
            ...request.context,
            events: await getMinimalEvents(db),
            users: await getMinimalUsers(db),
        });
    });

    // TODO: CSRF
    router.post('/assign', async (request, response) => {
        const body = AssignPointsData.parse(request.body);

        let event: Event | undefined;
        if (body.eventId) {
            event = await getEvent(db, body.eventId);
            if (!event) return response.status(500).send('Event not found');
        }

        if (body.type === 'Player') {
            const player = await getUser(db, body.userId);
            if (!player) return response.status(500).send('Player not found');

            const playerTeam = request.context.teams.find((team) => team.id === player.teamId);
            if (!playerTeam) return response.status(500).send('Player does not have a team');

            // TODO: Check eligible for LAN

            await awardScore(
                db,
                request.user,
                body.points,
                body.reason,
                event,
                playerTeam,
                player,
            );
        } else {
            const team = request.context.teams.find((team) => team.name === body.type) as Team;
            await awardScore(
                db,
                request.user,
                body.points,
                body.reason,
                event,
                team,
            );
        }

        response.redirect('/admin/points');
    });

    return router;
}
