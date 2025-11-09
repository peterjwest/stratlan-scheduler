import { getDatabaseClient, getCurrentLan } from './database';
import { loginClient } from './discordApi';
import { DISCORD_TOKEN } from './environment';
import { updateGroups } from './teams';

const isRemote = process.argv[2] === '--remote';

const db = await getDatabaseClient(isRemote);
const discordClient = loginClient(DISCORD_TOKEN);
const currentLan = await getCurrentLan(db);

if (!currentLan) {
    throw new Error('Current LAN not found');
}

await updateGroups(db, discordClient, currentLan);

await discordClient.destroy();
await db.disconnect();
