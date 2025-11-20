import { getDatabaseClient, getCurrentLan } from './database';
import { loginClient } from './discordApi';
import { DISCORD_TOKEN, REMOTE_DISCORD_GUILD_ID, DISCORD_GUILD_ID } from './environment';
import { updateGroups } from './teams';

const isRemote = process.argv[2] === '--remote';

const db = await getDatabaseClient(isRemote);
const discordClient = await loginClient(DISCORD_TOKEN);
const currentLan = await getCurrentLan(db);

if (!currentLan) {
    throw new Error('Current LAN not found');
}

let guildId = DISCORD_GUILD_ID;
if (isRemote) {
    if (!REMOTE_DISCORD_GUILD_ID) throw new Error('Env variable REMOTE_DISCORD_GUILD_ID required');
    guildId = REMOTE_DISCORD_GUILD_ID;
}

await updateGroups(db, discordClient, currentLan, guildId);

await discordClient.destroy();
await db.disconnect();
