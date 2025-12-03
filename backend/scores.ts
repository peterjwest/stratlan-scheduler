import { Server } from 'socket.io';
import lodash from 'lodash';

import { teamsWithPoints, getCurrentLanCached, DatabaseClient } from './database.js';
import { withLanStatus } from './util.js';

export async function sendScoreUpdates(db: DatabaseClient, io: Server) {
    const currentLan = withLanStatus(await getCurrentLanCached(db));

    if (currentLan) {
        const teams = await teamsWithPoints(db, currentLan);
        const maxPoints = lodash.max(teams.map((team) => team.points)) || 0;
        const lanProgress = currentLan.progress;
        io.emit('SCORE_UPDATE', { teams: lodash.keyBy(teams, 'id'), maxPoints, lanProgress });
    }
}
