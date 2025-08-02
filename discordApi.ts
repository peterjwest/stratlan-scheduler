import lodash from 'lodash';
import zod from 'zod';
import { REST, Routes, Activity } from 'discord.js';
import { User } from './schema';

export const DiscordUser = zod.object({
  id: zod.string(),
  username: zod.string(),
  avatar: zod.union([zod.string(), zod.null()]),
  global_name: zod.union([zod.string(), zod.null()]),
  premium_type: zod.number(),
});
export type DiscordUser = zod.infer<typeof DiscordUser>;

export const DiscordGuildMember = zod.object({
    nick: zod.union([zod.string(), zod.null()]),
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


export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
    const rest = new REST({ authPrefix: 'Bearer' }).setToken(accessToken);
    return DiscordUser.parse(await rest.get(Routes.user()));
}

export async function getDiscordGuildMember(rest: REST, guildId: string, userId: string): Promise<DiscordGuildMember> {
    return DiscordGuildMember.parse(await rest.get(Routes.guildMember(guildId, userId)));
}

export async function getGuildRoles(rest: REST, guildId: string) {
    const roles = zod.array(Role).parse(await rest.get(
        Routes.guildRoles(guildId),
    ));
    return lodash.keyBy(roles, 'id');
}

export function mapRoleIds(roles: { [key: string]: Role }, roleIds: string[]) {
    return roleIds.map((roleId) => roles[roleId]);
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
