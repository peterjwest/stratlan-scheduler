import {
    formatDate,
    formatHourAsTime,
    formatTime,
    formatDateTime,
    formatDay,
    formatTimestamp,
    formatName,
    formatScoreType,
    getTeam,
    getTeamBackground,
    groupEvents,
    getScheduleHours,
    getEventScheduleStyles,
    isUserError,
    round,
    createSecretCode,
} from './util';
import { getAvatarUrl } from './discordApi';

const helpers = {
    formatDate,
    formatHourAsTime,
    formatTime,
    formatDateTime,
    formatDay,
    formatTimestamp,
    formatName,
    formatScoreType,
    getTeam,
    getTeamBackground,
    getAvatarUrl,
    groupEvents,
    getScheduleHours,
    getEventScheduleStyles,
    isUserError,
    round,
    createSecretCode,
}

export type Helpers = typeof helpers;
export default helpers;
