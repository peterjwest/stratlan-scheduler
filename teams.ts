import { Client } from 'discord.js';
import lodash from 'lodash';

import { discordDataToUser, Required } from './util';
import { getSeatPickerData, matchSeatPickerUsers, SeatPickerUser } from './seatPicker';
import { getDiscordGuildMembers } from './discordApi';
import { Group, User, UserTeams, UserGroups, Lan, Team } from './schema';
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

export const GLOBAL_GROUP_ID = 0;

export async function updateGroups(db: DatabaseClient, discordClient: Client, lan: Lan, guildId: string) {
    const seatPickerUsers = lodash.uniqBy(await getSeatPickerData(db, lan), 'name');
    const guildMembers = await getDiscordGuildMembers(discordClient, guildId);

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

function getSubGroups(users: Array<User & UserGroups>): SubGroup[] {
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

export function getInitialGroupDistributions(
    groups: Group[], teams: Team[], users?: Array<User & UserTeams & UserGroups>,
) {
    const usersByGroup = lodash.mapValues(
        lodash.groupBy(
            lodash.flatMap(users || [], (user) =>
                [{ groupId: GLOBAL_GROUP_ID, user }, ...user.groups.map((group) => ({ groupId: group.id, user }))]
            ),
            'groupId',
        ),
        (entries) => entries.map(({ user }) => user),
    );

    return Object.fromEntries(
        getGroupIds(groups).map((groupId) => {
            const teamCounts = lodash.countBy(usersByGroup[groupId] || [], (user) => user.team?.id);
            return [
                groupId, Object.fromEntries(teams.map((team) => [team.id, teamCounts[team.id] || 0])),
            ];
        })
    ) as GroupDistribution;
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

export function getGroupIds(groups: Group[]) {
    return [GLOBAL_GROUP_ID, ...groups.map((group) => group.id)];
}

export function pickBestTeam(teams: Team[], groupDistributions: GroupDistribution, user: User & UserGroups) {
    const groupIds = getGroupIds(user.groups);
    const possibleChoices: Array<[Team, number]> = lodash.sortBy(lodash.shuffle(teams).map((team) => {
        return [team, lodash.sum(groupIds.map((groupId) => {
            return groupBalanceDiff(incrementDistribution(groupDistributions[groupId]!, team));
        }))];
    }), ([team, score]) => score);
    return possibleChoices[0]![0];
}

export function randomiseTeams(teams: Team[], groups: Group[], users: Array<User & UserTeams & UserGroups>) {
    const userTeams: Array<[User & UserTeams & UserGroups, Team]> = [];

    let subGroups = getSubGroups(lodash.shuffle(users));
    const groupDistributions = getInitialGroupDistributions(groups, teams);
    const usersById = lodash.keyBy(users, 'id');

    while (subGroups.length > 0) {
        subGroups = lodash.sortBy(
            subGroups,
            (subGroup) => -subGroup.groupIds.size,
            (subGroup) => -subGroup.userIds.length,
        );

        const subGroup = subGroups[0]!;
        const user = usersById[subGroup.userIds.pop()!]!;
        const chosenTeam = pickBestTeam(teams, groupDistributions, user);

        for (const groupId of getGroupIds(user.groups)) {
            groupDistributions[groupId] = incrementDistribution(groupDistributions[groupId]!, chosenTeam);
        }

        userTeams.push([user, chosenTeam]);
        subGroups = subGroups.filter((subGroup) => subGroup.userIds.length > 0);
    }

    return userTeams;
}

export function chooseTeam(
    teams: Team[], groups: Group[], users: Array<User & UserTeams & UserGroups>, userId: number,
) {
    const groupDistributions = getInitialGroupDistributions(groups, teams, users);
    return pickBestTeam(teams, groupDistributions, users.find((user) => user.id  === userId)!);
}
