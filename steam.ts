import SteamAuth from 'node-steam-openid';
import { Router } from 'express';

import { updateUser, DatabaseClient } from './database.js';
import { HOST, STEAM_API_KEY } from './environment.js';
import { getContext } from './context.js';
import { absoluteUrl } from './util.js';
import routes from './routes.js';

const steamAuth = new SteamAuth({
    realm: HOST,
    returnUrl: absoluteUrl(HOST, routes.steam.authenticate),
    apiKey: STEAM_API_KEY,
});

export default function (db: DatabaseClient) {
    const router = Router();

    router.get(routes.steam.login, async (_request, response) => {
        response.redirect(await steamAuth.getRedirectUrl());
    });

    router.get(routes.steam.authenticate, async (request, response) => {
        const context = getContext(request, 'LOGGED_IN');
        const steamUser = await steamAuth.authenticate(request);
        await updateUser(db, context.user.id, {
            steamId: steamUser.steamid,
            steamUsername: steamUser.username,
            steamAvatar: steamUser.avatar.large,
        });

        response.redirect(routes.home);
    });

    return router;
}
