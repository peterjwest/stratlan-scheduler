import { promisify } from 'node:util';

import { Router, Request, Response, RequestHandler } from 'express';
import zod from 'zod';
import { Client } from 'discord.js';
import lodash from 'lodash';

import { Lan, LanTeams } from './schema.js';
import { regenerateSession, saveSession, destroySession, withLanStatus, discordDataToUser, UserError } from './util.js';
import { DatabaseClient, createOrUpdateUser, updateRoles, getCurrentLanCached } from './database.js';
import { getGuild, getGuildRoles, mapRoleIds, getDiscordAccessToken, getDiscordUser, getDiscordGuildMember, DiscordGuildMember } from './discordApi.js';
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID, DISCORD_RETURN_URL } from './environment.js';
import routes from './routes.js';

export default function (db: DatabaseClient, discordClient: Client, expressSession: RequestHandler) {
    const router = Router();

    router.get(routes.auth.login, async (request: Request, response) => {
        const query = zod.object({ code: zod.string() }).parse(request.query);

        // Check access token is valid by fetching user
        const accessToken = await getDiscordAccessToken(
            DISCORD_CLIENT_ID,
            DISCORD_CLIENT_SECRET,
            DISCORD_RETURN_URL,
            query.code,
        );
        const discordUser = await getDiscordUser(accessToken);

        let discordMember: DiscordGuildMember;
        try {
            discordMember = await getDiscordGuildMember(discordClient, DISCORD_GUILD_ID, discordUser.id);
        } catch (_error) {
            const guild = await getGuild(discordClient, DISCORD_GUILD_ID);
            throw new UserError(`You must be part of "${guild.name}" Discord to take part`);
        }
        const serverRoles = await getGuildRoles(discordClient, DISCORD_GUILD_ID);
        const roles = mapRoleIds(serverRoles, discordMember.roles);

        const user = await createOrUpdateUser(db, {
            ...discordDataToUser(discordUser, discordMember),
            accessToken,
        });
        await updateRoles(db, user, roles);

        await promisify(expressSession)(request, response);

        await regenerateSession(request);
        request.session.userId = user.id;
        await saveSession(request);

        response.redirect(request.cookies['login-redirect'] || routes.home);
    });

    router.get(routes.auth.logout, async (request, response) => {
        await destroySession(request);

        response.redirect(routes.home);
    });

    return router;
}

export async function getCurrentUserLan(
    db: DatabaseClient, request: Request, response: Response, isAdmin: boolean, lans: Array<Lan & LanTeams>,
): Promise<Lan & LanTeams | undefined> {
    const currentLan = await getCurrentLanCached(db);
    if (isAdmin) {
        // If there's no current LAN, admins get the last one as default
        if (!currentLan) return withLanStatus(lodash.last(lans));

        if (request.cookies['selected-lan']) {
            // Don't set a cookie for the default currentLan
            if (currentLan?.id === Number(request.cookies['selected-lan'])) {
                response.clearCookie('selected-lan', { path: '/' });
            } else {
                return withLanStatus(lans.find((lan) => lan.id === Number(request.cookies['selected-lan'])));
            }
        }
    }
    return withLanStatus(currentLan);
}
