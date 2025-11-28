import {
    formatDate,
    formatDateShort,
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
    getEventEnd,
    absoluteUrl,
} from './util';
import { getAvatarUrl } from './discordApi';
import { routeUrl } from './routes';

const helpers = {
    formatDate,
    formatDateShort,
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
    getEventEnd,
    absoluteUrl,
    routeUrl,
}

export type Helpers = typeof helpers;
export default helpers;
