import { getDatabaseClient, getCurrentLan } from './database';
import { loginClient } from './discordApi';
import { DISCORD_TOKEN, GROUP_SYNC_DATABASE_URL } from './environment';
import { updateGroups } from './teams';

if (!GROUP_SYNC_DATABASE_URL) {
    throw new Error('Env variable GROUP_SYNC_DATABASE_URL required')
}

const db = await getDatabaseClient(GROUP_SYNC_DATABASE_URL, true);
const discordClient = loginClient(DISCORD_TOKEN);
const currentLan = await getCurrentLan(db);

if (!currentLan) {
    throw new Error('Current LAN not found');
}

await updateGroups(db, discordClient, currentLan);

await discordClient.destroy();
await db.disconnect();
