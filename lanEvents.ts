import { Client } from 'discord.js';

import { assignTeamRoles, unassignTeamRoles } from './discordApi.js';
import { getCurrentLan, getCurrentLanCached, updateLan, DatabaseClient, getLanUsers } from './database.js';
import { addDays, withLanStatus } from './util.js';

export async function startLan(db: DatabaseClient, discordClient: Client) {
    const currentLan = withLanStatus(await getCurrentLan(db));
    if (currentLan && currentLan.isActive && !currentLan.isStartProcessed) {
        console.log('LAN starting, assigning teams!');
        const users = await getLanUsers(db, currentLan);
        const assignedTeamCount = await assignTeamRoles(discordClient, currentLan, users);
        await updateLan(db, currentLan, { isStartProcessed: true });
        console.log(`Teams assigned for ${assignedTeamCount} users!`);
    }
}

export async function getIsLanStarted(db: DatabaseClient) {
    let currentLan = withLanStatus(await getCurrentLanCached(db));
    return function isLanStarted() {
        void getCurrentLanCached(db).then((lan) => currentLan = withLanStatus(lan));
        return Boolean(currentLan && currentLan.isActive && !currentLan.isStartProcessed);
    };
}

export async function endLan(db: DatabaseClient, discordClient: Client) {
    const currentLan = withLanStatus(await getCurrentLan(db));
    if (currentLan && currentLan.isEnded && !currentLan.isEndProcessed) {
        console.log('LAN ending, unassigning teams!');
        const unassignedTeamCount = await unassignTeamRoles(discordClient, currentLan);
        await updateLan(db, currentLan, { isEndProcessed: true });
        console.log(`Teams unassigned for ${unassignedTeamCount} users!`);
    }
}

export async function getIsLanEnded(db: DatabaseClient) {
    let currentLan = withLanStatus(await getCurrentLanCached(db));
    return function isLandEnded() {
        void getCurrentLanCached(db).then((lan) => currentLan = withLanStatus(lan));
        return Boolean(currentLan && new Date() > addDays(currentLan.eventEnd, 2) && !currentLan.isEndProcessed);
    };
}
