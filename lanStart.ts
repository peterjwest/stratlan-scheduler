import { setTeams } from 'discordApi';
import { getCurrentLan, getCurrentLanCached, updateLan, DatabaseClient, getLanUsers } from './database';
import { withLanStatus } from './util';
import { Client } from 'discord.js';

export async function startLan(db: DatabaseClient, discordClient: Client) {
    const currentLan = withLanStatus(await getCurrentLan(db));
    if (currentLan && currentLan.isActive && !currentLan.isStartProcessed) {
        console.log('LAN starting, assigning teams!');
        const users = await getLanUsers(db, currentLan);
        const assignedTeamCount = await setTeams(discordClient, currentLan, users);
        await updateLan(db, currentLan, { isStartProcessed: true });
        console.log(`Teams assigned for ${assignedTeamCount} users!`);
    }
}

export async function getIsLanStarted(db: DatabaseClient) {
    let currentLan = withLanStatus(await getCurrentLanCached(db));
    return function isLanStarted() {
        getCurrentLanCached(db).then((lan) => currentLan = withLanStatus(lan));
        return Boolean(currentLan && currentLan.isActive && !currentLan.isStartProcessed);
    };
}
