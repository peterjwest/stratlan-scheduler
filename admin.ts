import { Router } from 'express';
import zod from 'zod';

import { parseInteger, formatDate } from './util';
import { Team } from './schema';
import { getUser, getMinimalUsers, getAssignedScores, createScore, DatabaseClient } from './database';
import { TEAMS } from './constants';


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


export default function (db: DatabaseClient, teams: Team[]) {
    const router = Router();

    router.use((request, response, next) => {
        if (!request.user.isAdmin) return response.status(403).send('Unauthorised');
        next();
    });

    router.get('/', async (request, response) => {
        const users = await getMinimalUsers(db);

        response.render('admin/index', { user: request.user, users });
    });

    router.get('/assign', async (request, response) => {
        const users = await getMinimalUsers(db);
        const assignedScores = await getAssignedScores(db);

        response.render('admin/assign', {
            user: request.user,
            users,
            assignedScores,
            formatDate,
            getTeam: (teamId: number) => teams.find((team) => team.id === teamId),
        });
    });

    // TODO: CSRF
    router.post('/assign', async (request, response) => {
        const body = AssignPointsData.parse(request.body);

        if (body.type === 'Player') {
            const player = await getUser(db, body.userId);
            if (!player) return response.status(500).send('Player not found');

            const playerTeam = teams.find((team) => team.id === player.teamId);
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
                teams.find((team) => team.name === body.type) as Team,
            );
        }

        response.redirect('/admin/assign');
    });

    return router;
}
