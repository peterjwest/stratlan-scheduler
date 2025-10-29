import { Router, Request, Response, NextFunction } from 'express';
import zod from 'zod';

import { Csrf } from './csrf';
import { getContext } from 'context';
import { parseInteger, formatScoreType, getTeam, UserError } from './util';
import { Event } from './schema';
import {
    getUser,
    getMinimalUsers,
    getEvent,
    getMinimalEvents,
    getScores,
    awardScore,
    getLans,
    getLan,
    createLan,
    updateLan,
    DatabaseClient,
} from './database';
import { ScoreType } from './constants';

const LanData = zod.object({
    name: zod.string(),
    role: zod.string(),
    eventStart: zod.string().transform((date) => date ? new Date(date) : undefined),
    eventEnd: zod.string().transform((date) => date ? new Date(date) : undefined),
    scheduleStart: zod.string().transform((date) => new Date(date)),
    scheduleEnd: zod.string().transform((date) => new Date(date)),
});

const AssignPoints = zod.object({
    points: zod.string().transform((id) => parseInteger(id)),
    reason: zod.string(),
    eventId: zod.string().transform((id) => id ? parseInteger(id) : undefined),
    submit: zod.literal('Submit'),
})

const AssignTeamPoints = AssignPoints.extend({
    type: zod.string().transform((id) => parseInteger(id)),
});

const AssignPlayerPoints = AssignPoints.extend({
    type: zod.literal(['player']),
    userId: zod.string().transform((id) => parseInteger(id)),
});

const AssignPointsData = zod.union([AssignPlayerPoints, AssignTeamPoints]);

const PointsQuery = zod.object({ type: zod.union([ScoreType, zod.undefined()]) });

export default function (db: DatabaseClient, csrf: Csrf) {
    const router = Router();

    router.use((request: Request, response: Response, next: NextFunction) => {
        const context = getContext(request, 'LOGGED_IN');
        if (!context.isAdmin) return response.status(403).send('Unauthorised');
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
        const body = LanData.parse(request.body);

        await createLan(db, body);
        response.redirect('/admin/lans');
    });

    router.get('/lans/:lanId', async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        const lan = await getLan(db, Number(request.params.lanId));

        if (!lan) throw new UserError('Lan not found.');

        response.render('admin/lans/lan', { ...context, lan });
    });

    router.post('/lans/:lanId', csrf.protect, async (request: Request, response: Response) => {
        const body = LanData.parse(request.body);
        const lan = await getLan(db, Number(request.params.lanId));

        if (!lan) throw new UserError('Lan not found.');

        await updateLan(db, lan, body);
        response.redirect('/admin/lans');
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
            csrf: csrf.generateToken(request),
            events: await getMinimalEvents(db, context.currentLan),
            users: await getMinimalUsers(db, context.currentLan),
        });
    });

    router.post('/assign', csrf.protect, async (request: Request, response: Response) => {
        const context = getContext(request, 'LOGGED_IN');

        if (context.currentLan?.isEnded) {
            throw new UserError('You can\'t submit any more scores, this LAN has ended!');
        }

        const body = AssignPointsData.parse(request.body);

        let event: Event | undefined;
        if (body.eventId) {
            event = await getEvent(db, context.currentLan, body.eventId);
            if (!event) throw new Error(`Event ${body.eventId} not found`);
        }

        if (body.type === 'player') {
            const player = await getUser(db, context.currentLan, body.userId);
            if (!player) {
                if (await getUser(db, undefined, body.userId)) {
                    throw new Error(`Player ${body.userId} not part of ${context.currentLan.name} LAN`);
                } else {
                    throw new Error(`Player ${body.userId} not found`);
                }
            }

            await awardScore(
                db, context.currentLan, context.user, body.points, body.reason, event, player,
            );
        } else {
            const team = getTeam(context.currentLan, body.type);
            if (!team) throw new Error(`Team ${body.type} not found`);

            await awardScore(
                db, context.currentLan, context.user, body.points, body.reason, event, team,
            );
        }

        response.redirect('/admin/points');
    });

    return router;
}
