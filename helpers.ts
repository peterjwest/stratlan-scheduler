import {
    formatDate,
    formatTime,
    formatName,
    formatScoreType,
    getTeam,
    getTeamBackground,
    groupEvents,
    getScheduleHours,
    getEventScheduleStyles,
    isUserError,
} from './util';
import { getAvatarUrl } from './discordApi';

const helpers = {
    formatDate,
    formatTime,
    formatName,
    formatScoreType,
    getTeam,
    getTeamBackground,
    getAvatarUrl,
    groupEvents,
    getScheduleHours,
    getEventScheduleStyles,
    isUserError,
}

export type Helpers = typeof helpers;
export default helpers;
