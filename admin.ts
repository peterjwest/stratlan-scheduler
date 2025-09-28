import { Router } from 'express';
import zod from 'zod';

import { parseInteger } from './util';
import { Team } from './schema';
import { getUser, getMinimalUsers, getScores, createScore, DatabaseClient } from './database';
import { TEAMS, ScoreType } from './constants';


const AssignPoints = zod.object({
    points: zod.string().transform((id) => parseInteger(id)),
    reason:  zod.string(),
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
            { name: 'Awarded', url: '/admin/points?type=Awarded' },
            { name: 'Community game', url: '/admin/points?type=CommunityGame' },
            // { name: 'Steam achievement', url: '/admin/points?type=Achievement' },
            // { name: 'QR code', url: '/admin/points?type=OneTimeCode' },
            { name: 'Manually assigned', url: '/admin/points?assigned=true' },
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
            users: await getMinimalUsers(db),
        });
    });

    // TODO: CSRF
    router.post('/assign', async (request, response) => {
        const body = AssignPointsData.parse(request.body);

        if (body.type === 'Player') {
            const player = await getUser(db, body.userId);
            if (!player) return response.status(500).send('Player not found');

            const playerTeam = request.context.teams.find((team) => team.id === player.teamId);
            if (!playerTeam) return response.status(500).send('Player does not have a team');

            await createScore(
                db,
                request.user,
                body.points,
                body.reason,
                playerTeam,
                player,
            );
        } else {
            await createScore(
                db,
                request.user,
                body.points,
                body.reason,
                request.context.teams.find((team) => team.name === body.type) as Team,
            );
        }

        response.redirect('/admin/points');
    });

    return router;
}
