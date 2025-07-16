import { REST, Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import expressSession from 'express-session';
import sessionStore from 'connect-pg-simple';
import SteamAuth from 'node-steam-openid';
import zod from 'zod';

import { regenerateSession, saveSession } from './util';
import setupCommands from './commands';
import environment from './environment';
import { getDatabaseClient, getUser, getOrCreateUserByDiscordId, updateUser } from './database';
import {
    getGuildRoles,
    mapRoleIds,
    getDiscordAccessToken,
    getDiscordUser,
    getDiscordGuildMember,
} from './discordApi';

const {
    PORT,
    SECURE_COOKIE,
    SESSION_SECRET,
    DISCORD_TOKEN,
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    DISCORD_GUILD_ID,
    STEAM_API_KEY,
    POSTGRES_URL,
} = environment;

const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days 😱
const HOST = `http://localhost:${PORT}`;
const MODERATOR_ROLES = new Set(['Staff', 'Moderator']);

declare module 'express-session' {
    interface SessionData {
        userId: number;
    }
}

const db = await getDatabaseClient(POSTGRES_URL);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.GuildMember, Partials.User],
});

client.once(Events.ClientReady, readyClient => console.log(`Logged in as ${readyClient.user.tag}`));

client.login(DISCORD_TOKEN);

// client.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
//     console.log('PresenceUpdate', oldPresence, newPresence);
// });

// client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
//     console.log('GuildMemberUpdate', oldMember, newMember);
// });

const rest = new REST().setToken(DISCORD_TOKEN);
await setupCommands(rest, DISCORD_CLIENT_ID, client);
const ROLES = await getGuildRoles(rest, DISCORD_GUILD_ID);

const app = express();

app.use(cookieParser());

const SessionStore = sessionStore(expressSession);

app.use(expressSession({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: true, secure: SECURE_COOKIE, maxAge: COOKIE_MAX_AGE },
  store: new SessionStore({ conString: POSTGRES_URL, tableName : 'sessions' }),
}));

app.get('/', (request, response) => {
    // TODO: Render details
    console.log(request.session);
	return response.sendFile('index.html', { root: '.' });
});

app.get('/login', async (request, response) => {
    const query = zod.object({ code: zod.string() }).parse(request.query);

    // Check access token is valid by fetching user
    const accessToken = await getDiscordAccessToken(
        DISCORD_CLIENT_ID,
        DISCORD_CLIENT_SECRET,
        `${HOST}/login`,
        query.code,
    );
    const discordUser = await getDiscordUser(accessToken);

    const discordMember = await getDiscordGuildMember(rest, DISCORD_GUILD_ID, discordUser.id);
    const roles = mapRoleIds(ROLES, discordMember.roles);

    const user = await getOrCreateUserByDiscordId(db, discordUser.id, {
        accessToken,
        discordUsername: discordUser.username,
        isAdmin: Boolean(roles.find((role) => MODERATOR_ROLES.has(role.name))),
    });

    await regenerateSession(request);
    request.session.userId = user.id;
    await saveSession(request);

    response.redirect('/');
});

const steamAuth = new SteamAuth({
    realm: HOST,
    returnUrl: `${HOST}/steam/authenticate`,
    apiKey: STEAM_API_KEY,
});

app.get('/steam', async (request, response) => {
    const user = request.session.userId ? await getUser(db, request.session.userId) : undefined;
    if (!user) throw new Error('Please login with Discord first');

    return response.redirect(await steamAuth.getRedirectUrl());
});

app.get('/steam/authenticate', async (request, response) => {
    const user = request.session.userId ? await getUser(db, request.session.userId) : undefined;
    if (!user) throw new Error('Please login with Discord first');

    const steamUser = await steamAuth.authenticate(request);
    await updateUser(db, user.id, {
        steamId: steamUser.steamid,
        steamUsername: steamUser.username,
        steamAvatar: steamUser.avatar.large,
    });

    response.redirect('/');
});

app.listen(PORT, () => console.log(`Server listening at ${HOST}`));
