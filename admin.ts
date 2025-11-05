import { Router, Request, Response, NextFunction } from 'express';
import { Client } from 'discord.js';
import lodash from 'lodash';

import { Csrf } from './csrf';
import { getContext } from 'context';
import { formatScoreType, getTeam, UserError, Required } from './util';
import { Event } from './schema';
import { getSeatPickerData, matchSeatPickerUsers, SeatPickerUser } from './seatPicker';
import { getDiscordGuildMembers } from './discordApi';
import { DISCORD_GUILD_ID } from './environment';
import {
    getUser,
    getMinimalUsers,
    createOrUpdateSeatPickerUsers,
    createGroups,
    replaceUserGroups,
    getEvent,
    getMinimalEvents,
    updateEvent,
    getGames,
    getScores,
    awardScore,
    getLans,
    getLan,
    createLan,
    updateLan,
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

    router.post('/lans/:lanId/groups', csrf.protect, async (request: Request, response: Response) => {
        const lan = await getLan(db, Number(request.params.lanId));
        if (!lan) throw new UserError('Lan not found.');

        const seatPickerUsers = await getSeatPickerData(db, lan);
        const guildMembers = await getDiscordGuildMembers(discordClient, DISCORD_GUILD_ID);

        matchSeatPickerUsers(seatPickerUsers, guildMembers);

        const matchedUserData = seatPickerUsers.filter((data): data is Required<SeatPickerUser> => Boolean(data.discord));
        const users = await createOrUpdateSeatPickerUsers(db, matchedUserData.map((data) => ({
            discordId: data.discord.user.id,
            discordUsername: data.discord.user.username,
            discordNickname: data.discord.nick || data.discord.user.global_name,
            discordAvatarId: data.discord.user.avatar,
            seatPickerName: data.name,
        })));

        const groupNames = lodash.uniq(lodash.flatten(matchedUserData.map((data) => data.groups)));
        const groups = await createGroups(db, groupNames);

        const usersByDiscordId = lodash.keyBy(users, 'discordId');
        const groupsByName = lodash.keyBy(groups, 'name');
        const userGroups = matchedUserData.map((data) => ({
            user: usersByDiscordId[data.discord.user.id]!,
            groups: data.groups.map((name) => groupsByName[name]!),
        }));

        await replaceUserGroups(db, userGroups);

        response.redirect(`/admin/lans/${lan.id}`);
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

        let event: Event | undefined;
        if (data.eventId) {
            event = await getEvent(db, context.currentLan, data.eventId);
            if (!event) throw new Error(`Event ${data.eventId} not found`);
        }

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

    return router;
}
