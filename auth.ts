import { Router, Request, Response } from 'express';
import zod from 'zod';
import { Client } from 'discord.js';
import lodash from 'lodash';

import { LanWithTeams } from './schema';
import { getContext } from './context';
import { regenerateSession, saveSession, destroySession } from './util';
import {
    DatabaseClient,
    createOrUpdateUserByDiscordId,
    updateRoles,
    getOrCreateIntroChallenge,
    getCurrentLanCached,
    isAdmin,
} from './database';
import { getGuildRoles, mapRoleIds, getDiscordAccessToken, getDiscordUser, getDiscordGuildMember } from './discordApi';
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID } from './environment';
import { DISCORD_RETURN_URL } from './constants';

export default function (db: DatabaseClient, discordClient: Client) {
    const router = Router();

    router.get('/login', async (request, response) => {
        const context = getContext(request);
        const query = zod.object({ code: zod.string() }).parse(request.query);

        // Check access token is valid by fetching user
        const accessToken = await getDiscordAccessToken(
            DISCORD_CLIENT_ID,
            DISCORD_CLIENT_SECRET,
            DISCORD_RETURN_URL,
            query.code,
        );
        const discordUser = await getDiscordUser(accessToken);

        const discordMember = await getDiscordGuildMember(discordClient, DISCORD_GUILD_ID, discordUser.id);
        const serverRoles = await getGuildRoles(discordClient, DISCORD_GUILD_ID);
        const roles = mapRoleIds(serverRoles, discordMember.roles);

        const user = await createOrUpdateUserByDiscordId(db, discordUser.id, {
            accessToken,
            discordUsername: discordUser.username,
            discordNickname: discordMember.nick || discordUser.global_name,
            discordAvatarId: discordUser.avatar,
        });
        await updateRoles(db, user, roles);

        await regenerateSession(request);
        request.session.userId = user.id;
        await saveSession(request);

        if (context.currentLan) {
            // TODO: Create UserLan if eligible
            await getOrCreateIntroChallenge(db, 'Login', context.currentLan, user);
        }

        response.redirect(request.cookies['login-redirect'] || '/');
    });

    router.get('/logout', async (request, response) => {
        await destroySession(request);

        response.redirect('/');
    });

    return router;
}

export async function getCurrentUserLan(
    db: DatabaseClient, request: Request, response: Response, userId: number | undefined, lans: LanWithTeams[],
) {
    const currentLan = await getCurrentLanCached(db);
    if (userId && await isAdmin(db, userId)) {
        // If there's no current LAN, admins get the last one as default
        if (!currentLan) return lodash.last(lans);

        if (request.cookies['selected-lan']) {
            // Don't set a cookie for the default currentLan
            if (currentLan?.id === Number(request.cookies['selected-lan'])) {
                response.clearCookie('selected-lan', { path: '/' });
            } else {
                return lans.find((lan) => lan.id === Number(request.cookies['selected-lan']));
            }
        }
    }
    return currentLan;
}
