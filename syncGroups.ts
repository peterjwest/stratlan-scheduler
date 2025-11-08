import { getDatabaseClient, getCurrentLan } from './database';
import { loginClient } from './discordApi';
import { DISCORD_TOKEN, DATABASE_URL } from './environment';
import { updateGroups } from './teams';

const db = await getDatabaseClient(DATABASE_URL);
const discordClient = loginClient(DISCORD_TOKEN);
const currentLan = await getCurrentLan(db);

if (!currentLan) {
    throw new Error('Current LAN not found');
}

await updateGroups(db, discordClient, currentLan);
