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
} from './util.js';
import { getAvatarUrl } from './discordApi.js';
import { routeUrl } from './routes.js';

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
    routeUrl,
};

export type Helpers = typeof helpers;
export default helpers;
