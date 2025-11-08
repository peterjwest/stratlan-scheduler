import { Client } from 'discord.js';
import lodash from 'lodash';

import { discordDataToUser, Required } from './util';
import { getSeatPickerData, matchSeatPickerUsers, SeatPickerUser } from './seatPicker';
import { getDiscordGuildMembers } from './discordApi';
import { DISCORD_GUILD_ID } from './environment';
import { Group, UserExtendedWithGroups, Lan, Team } from './schema';
import { createOrUpdateSeatPickerUsers, createGroups, replaceUserGroups, DatabaseClient } from './database';

interface SubGroup {
  groupIds: Set<number>;
  userIds: number[];
}

interface GroupTeamDistribution {
    [key: string]: number;
}

interface GroupDistribution {
  [key: string]: GroupTeamDistribution;
}

const GLOBAL_GROUP_ID = 0;

export async function updateGroups(db: DatabaseClient, discordClient: Client, lan: Lan) {
    const seatPickerUsers = await getSeatPickerData(db, lan);
    const guildMembers = await getDiscordGuildMembers(discordClient, DISCORD_GUILD_ID);

    matchSeatPickerUsers(seatPickerUsers, guildMembers);

    const matchedUserData = seatPickerUsers.filter((data): data is Required<SeatPickerUser> => Boolean(data.discord));
    const users = await createOrUpdateSeatPickerUsers(db, matchedUserData.map((data) => ({
        ...discordDataToUser(data.discord.user, data.discord),
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
}

function getSubGroups(users: UserExtendedWithGroups[]): SubGroup[] {
    const subGroups: Map<string, SubGroup> = new Map();

    for (const user of users) {
        const groupIds = new Set([...user.groups.map((group) => group.id), GLOBAL_GROUP_ID]);
        const key = Array.from(groupIds).sort().join(',');

        if (!subGroups.has(key)) {
            subGroups.set(key, { groupIds, userIds: [] });
        }
        subGroups.get(key)!.userIds.push(user.id);
    }

    return Array.from(subGroups.values());
}

function getInitialGroupDistributions(groups: Group[], teams: Team[]) {
    const groupDistributions: GroupDistribution = {};
    for (const groupId of getGroupIds(groups)) {
        groupDistributions[groupId] = {};
        for (const team of teams) {
            groupDistributions[groupId][team.id] = 0;
        }
    }
    return groupDistributions;
}

function incrementDistribution(distribution: GroupTeamDistribution, assignedTeam: Team) {
    return { ...distribution, [assignedTeam.id]: distribution[assignedTeam.id]! + 1 };
}

function groupBalanceDiff(distribution: GroupTeamDistribution): number {
    const [largestTeamId, largestCount] = lodash.maxBy(Object.entries(distribution), ([teamId, count]) => count)!;
    return lodash.sum(Object.entries(distribution).map(([teamId, count]) => {
        if (teamId === largestTeamId) return 0;
        return largestCount - count;
    }));
}

function getGroupIds(groups: Group[]) {
    return [GLOBAL_GROUP_ID, ...groups.map((group) => group.id)];
}

export function randomiseTeams(teams: Team[], groups: Group[], users: UserExtendedWithGroups[]) {
    const userTeams: Array<[UserExtendedWithGroups, Team]> = [];

    let subGroups = getSubGroups(lodash.shuffle(users));
    const groupDistributions = getInitialGroupDistributions(groups, teams);
    const usersById = lodash.keyBy(users, 'id');

    while (subGroups.length > 0) {
        subGroups = lodash.sortBy(subGroups, (subGroup) => -subGroup.userIds.length);
        subGroups = lodash.sortBy(subGroups, (subGroup) => -subGroup.groupIds.size);
        const subGroup = subGroups[0]!;
        const user = usersById[subGroup.userIds.pop()!]!;
        const groupIds = getGroupIds(user.groups);

        const possibleChoices: Array<[Team, number]> = lodash.sortBy(lodash.shuffle(teams).map((team) => {
            return [team, lodash.sum(groupIds.map((groupId) => {
                return groupBalanceDiff(incrementDistribution(groupDistributions[groupId]!, team));
            }))];
        }), ([team, score]) => score);
        const [chosenTeam] = possibleChoices[0]!;

        for (const groupId of groupIds) {
            groupDistributions[groupId] = incrementDistribution(groupDistributions[groupId]!, chosenTeam);
        }

        userTeams.push([user, chosenTeam]);

        subGroups = subGroups.filter((subGroup) => subGroup.userIds.length > 0);
    }

    return userTeams;
}
