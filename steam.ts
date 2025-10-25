import SteamAuth from 'node-steam-openid';
import { Router } from 'express';

import { updateUser, DatabaseClient } from './database';
import environment from './environment';
import { getContext } from './util';

const { HOST, STEAM_API_KEY } = environment;

const steamAuth = new SteamAuth({
    realm: HOST,
    returnUrl: `${HOST}/steam/authenticate`,
    apiKey: STEAM_API_KEY,
});

export default function (db: DatabaseClient) {
    const router = Router();

    router.get('', async (request, response) => {
        response.redirect(await steamAuth.getRedirectUrl());
    });

    router.get('/authenticate', async (request, response) => {
        const context = getContext(request, 'LOGGED_IN');
        const steamUser = await steamAuth.authenticate(request);
        await updateUser(db, context.user.id, {
            steamId: steamUser.steamid,
            steamUsername: steamUser.username,
            steamAvatar: steamUser.avatar.large,
        });

        response.redirect('/');
    });

    return router;
}
