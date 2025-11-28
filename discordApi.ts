import { setTimeout } from 'node:timers/promises';

import lodash from 'lodash';
import zod from 'zod';
import { REST, Routes, Activity, Client, Events, GuildMember, GatewayIntentBits, Partials, Collection } from 'discord.js';

import { User, UserTeams, Lan, LanTeams, Team } from './schema';
import { withLanStatus, fromNulls } from './util';
import { DISCORD_GUILD_ID } from './environment';
import {
    getCurrentLanCached,
    startGameActivities,
    endGameActivities,
    getOrCreateGames,
    getUserByDiscordId,
    getOrCreateIntroChallenge,
    DatabaseClient,
} from './database';

export const DiscordUser = zod.object({
    id: zod.string(),
    username: zod.string(),
    avatar: zod.union([zod.string(), zod.undefined()]),
    global_name: zod.union([zod.string(), zod.undefined()]),
});
export type DiscordUser = zod.infer<typeof DiscordUser>;

export const DiscordGuildMember = zod.object({
    user: DiscordUser,
    nick: zod.union([zod.string(), zod.undefined()]),
    roles: zod.array(zod.string()),
    mute: zod.boolean(),
    joined_at: zod.string(),
    deaf: zod.boolean(),
});
export type DiscordGuildMember = zod.infer<typeof DiscordGuildMember>;

export const Role = zod.object({
    id: zod.string(),
    name: zod.string(),
});
export type Role = zod.infer<typeof Role>;

const OAuthResponse = zod.object({
    token_type: zod.string(),
    access_token: zod.string(),
    expires_in: zod.number(),
    refresh_token: zod.string(),
    scope: zod.string(),
});
type OAuthResponse = zod.infer<typeof OAuthResponse>;

export type ApplicationActivity = Activity & {
    applicationId: string,
}

export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
    const rest = new REST({ authPrefix: 'Bearer' }).setToken(accessToken);
    return DiscordUser.parse(fromNulls(await rest.get(Routes.user())));
}

export async function getDiscordGuildMembers(
    discordClient: Client, guildId: string,
): Promise<DiscordGuildMember[]> {
    return zod.array(DiscordGuildMember).parse(fromNulls(await discordClient.rest.get(
        Routes.guildMembers(guildId),
        { query: new URLSearchParams({ limit: '1000' }) },
    )));
}

export async function getDiscordGuildMember(
    discordClient: Client, guildId: string, userId: string,
): Promise<DiscordGuildMember> {
    return DiscordGuildMember.parse(fromNulls(await discordClient.rest.get(Routes.guildMember(guildId, userId))));
}

export async function getGuildRoles(discordClient: Client, guildId: string) {
    const roles = zod.array(Role).parse(await discordClient.rest.get(
        Routes.guildRoles(guildId),
    ));
    return lodash.keyBy(roles, 'id');
}

export async function getGuild(discordClient: Client, guildId: string) {
    return zod.object({ name: zod.string() }).parse(await discordClient.rest.get(Routes.guild(guildId)));
}

export function mapRoleIds(roles: { [key: string]: Role }, roleIds: string[]) {
    return roleIds.map((roleId) => roles[roleId]!.name);
}

export async function getDiscordAccessToken(
    clientId: string, clientSecret: string, redirectUrl: string, code: string,
) {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUrl,
            scope: 'identify',
        }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const authData = OAuthResponse.parse(await tokenResponse.json());
    return authData.access_token;
}

export function getAvatarUrl(user: User, size: 32 | 64 | 128 = 128) {
    if (!user.discordAvatarId) return;
    return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatarId}.webp?size=${size}`;
}

export function getActivityIds(activities: Activity[]) {
    return activities.map((activity) => activity.applicationId).filter((id): id is string => Boolean(id));
}

export async function loginClient(discordToken: string) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildPresences,
            GatewayIntentBits.GuildMembers,
        ],
        partials: [Partials.GuildMember, Partials.User],
    });

    client.once(Events.ClientReady, readyClient => console.log(`Logged in to Discord as ${readyClient.user.tag}`));
    await client.login(discordToken);
    return client;
}

export function watchPresenceUpdates(db: DatabaseClient, discordClient: Client) {
    discordClient.on(Events.PresenceUpdate, async (oldPresence, newPresence) => {
        const currentLan = withLanStatus(await getCurrentLanCached(db));
        if (!currentLan) return;

        const user = await getUserByDiscordId(db, newPresence.userId);
        if (!user) return;

        const activities = newPresence.activities.filter(
            (activity): activity is ApplicationActivity => Boolean(activity.applicationId),
        );

        if (activities.length > 0) {
            await getOrCreateIntroChallenge(db, 'GameActivity', currentLan, user);
        }

        if (!currentLan.isActive) return;

        const games = await getOrCreateGames(db, activities);
        await endGameActivities(db, user, games);

        await startGameActivities(db, currentLan, user, games, new Date())
    });
}

export function addTeamRoles(teams: Team[], roles: Collection<string, Role>) {
    const rolesByName = Object.fromEntries(roles.entries().map((([id, role]) => [role.name, id])));
    return teams.map((team) => {
        const role = rolesByName[team.name];
        if (!role) {
            throw new Error(`Team role "${team.name}" not found`);
        }
        return { ...team, role };
    });
}

export function addUserMembers(users: Array<User & UserTeams>, members: Collection<string, GuildMember>) {
    return users.map((user) => {
        const member = members.get(user.discordId);
        if (!member) {
            throw new Error(`Discord member ${user.discordId} not found`);
        }
        return { ...user, member };
    });
}

export async function assignTeamRoles(discordClient: Client, lan: Lan & LanTeams, baseUsers: Array<User & UserTeams>) {
    const guild = discordClient.guilds.cache.get(DISCORD_GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const teams = addTeamRoles(lan.teams, guild.roles.cache);
    const users = addUserMembers(baseUsers, await guild.members.fetch());

    let assignedTeamCount = 0;
    for (const user of users) {
        for (const team of teams) {
            const hasTeam = user.team?.id === team.id;
            if (user.member.roles.cache.has(team.role) !== hasTeam) {
                if (hasTeam) {
                    await user.member.roles.add(team.role);
                    assignedTeamCount++;
                } else {
                    await user.member.roles.remove(team.role);
                }
                await setTimeout(100);
            }
        }
    }
    return assignedTeamCount;
}

export async function assignTeamRole(discordClient: Client, lan: Lan & LanTeams, user: User & UserTeams) {
    const guild = discordClient.guilds.cache.get(DISCORD_GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const teams = addTeamRoles(lan.teams, guild.roles.cache);
    const member = await guild.members.fetch(user.discordId);

    for (const team of teams) {
        const hasTeam = user.team?.id === team.id;
        if (member.roles.cache.has(team.role) !== hasTeam) {
            if (hasTeam) {
                await member.roles.add(team.role);
            } else {
                await member.roles.remove(team.role);
            }
            await setTimeout(100);
        }
    }
}

export async function unassignTeamRoles(discordClient: Client, lan: Lan & LanTeams) {
    const guild = discordClient.guilds.cache.get(DISCORD_GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const teams = addTeamRoles(lan.teams, guild.roles.cache);
    const members = await guild.members.fetch()

    let assignedTeamCount = 0;
    for (const member of members.values()) {
        for (const team of teams) {
            if (member.roles.cache.has(team.role)) {
                assignedTeamCount++;
                await member.roles.remove(team.role);
                await setTimeout(100);
            }
        }
    }
    return assignedTeamCount;
}
