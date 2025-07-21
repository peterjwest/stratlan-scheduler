import querystring from 'node:querystring';

import { REST, Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import expressSession from 'express-session';
import sessionStore from 'connect-pg-simple';
import SteamAuth from 'node-steam-openid';
import zod from 'zod';

import { regenerateSession, saveSession, destroySession } from './util';
import setupCommands from './commands';
import environment from './environment';
import { createTeams, getDatabaseClient, getUser, getOrCreateUserByDiscordId, updateUser } from './database';
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
const TEAMS = ['Red', 'Blue'];
const DISCORD_RETURN_URL = `${HOST}/login`;
const DISCORD_AUTH_URL = 'https://discord.com/oauth2/authorize?' + querystring.encode({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: DISCORD_RETURN_URL,
    scope: 'identify',
});

/** Augments the session with userId */
declare module 'express-session' {
    interface SessionData {
        userId: number;
    }
}

const db = await getDatabaseClient(POSTGRES_URL);

await createTeams(db, TEAMS);

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

app.use(express.urlencoded());

app.set('view engine', 'pug');

app.get('/', async (request, response) => {
    const user = request.session.userId ? await getUser(db, request.session.userId) : undefined;
    response.render('index', { user, discordAuthUrl: DISCORD_AUTH_URL });
});

app.get('/login', async (request, response) => {
    const query = zod.object({ code: zod.string() }).parse(request.query);

    // Check access token is valid by fetching user
    const accessToken = await getDiscordAccessToken(
        DISCORD_CLIENT_ID,
        DISCORD_CLIENT_SECRET,
        DISCORD_RETURN_URL,
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

app.get('/logout', async (request, response) => {
    await destroySession(request);

    response.redirect('/');
});

const steamAuth = new SteamAuth({
    realm: HOST,
    returnUrl: `${HOST}/steam/authenticate`,
    apiKey: STEAM_API_KEY,
});

app.get('/steam', async (request, response) => {
    const user = request.session.userId ? await getUser(db, request.session.userId) : undefined;
    if (!user) return response.status(403).send('Please login with Discord first');

    return response.redirect(await steamAuth.getRedirectUrl());
});

app.get('/steam/authenticate', async (request, response) => {
    const user = request.session.userId ? await getUser(db, request.session.userId) : undefined;
    if (!user) return response.status(403).send('Please login with Discord first');

    const steamUser = await steamAuth.authenticate(request);
    await updateUser(db, user.id, {
        steamId: steamUser.steamid,
        steamUsername: steamUser.username,
        steamAvatar: steamUser.avatar.large,
    });

    response.redirect('/');
});

app.listen(PORT, () => {
    console.log(`Server listening at ${HOST}`);

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled rejection:', reason, promise);
    });
});
