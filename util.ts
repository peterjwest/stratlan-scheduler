import { promisify } from 'node:util';
import { Request } from 'express';
import lodash from 'lodash';

import { User, UserWithRoles, Team, Event, Lan, EventTimeslot, LanWithTeams } from './schema';
import {
    SCHEDULE_START_TIME,
    SCHEDULE_END_TIME,
    EVENT_TIMESLOT_MINUTES,
    TEAM_BACKGROUND_CLASSES,
    TeamName,
    SCORE_TYPE_NAMES,
    ScoreType,
    MODERATOR_ROLES,
} from './constants';
import { Helpers } from './helpers';

type DayEvents = {
    day: string;
    events: Event[];
}

export class UserError extends Error { }

export function isUserError(error: any): error is UserError {
    return error instanceof UserError;
}

export async function regenerateSession(request: Request) {
    const data = lodash.omit(request.session, 'cookie');
    await promisify(request.session.regenerate.bind(request.session))();
    return Object.assign(request.session, data);
}

export async function saveSession(request: Request) {
    return promisify(request.session.save.bind(request.session))();
}

export async function destroySession(request: Request) {
    return promisify(request.session.destroy.bind(request.session))();
}

export function parseInteger(value: string, radix = 10) {
    const number = parseInt(value, radix);
    if (Number.isInteger(number)) return number;
    throw new Error(`Expected an integer, got '${value}'`);
}

const DAYS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
];

export function getDay(date: Date) {
    return DAYS[date.getDay()];
}

export function getDayStart(date: Date) {
    const dayStart = new Date(date);
    dayStart.setUTCHours(SCHEDULE_START_TIME, 0, 0, 0);
    return dayStart;
}

export function getDayEnd(date: Date) {
    const dayStart = new Date(date);
    dayStart.setUTCHours(SCHEDULE_END_TIME, 0, 0, 0);
    return dayStart;
}

export function getScheduleHours() {
    return Array(SCHEDULE_END_TIME - SCHEDULE_START_TIME).fill(null).map((_, i) => SCHEDULE_START_TIME + i);
}

function padTimeComponent(value: number) {
    return String(value).padStart(2, '0');
}

export function formatTime(time: Date | number, withSeconds = false) {
    if (typeof time === 'number') return `${padTimeComponent(time % 24)}:00`;
    const hours = padTimeComponent(time.getHours());
    const minutes = padTimeComponent(time.getMinutes());
    return `${hours}:${minutes}${withSeconds ? ':' + padTimeComponent(time.getSeconds()) : ''}`;
}

export function formatDate(date: Date) {
    return `${formatTime(date, true)} ${getDay(date)}`;
}

export function formatName(user: User) {
    return user.discordNickname || user.discordUsername;
}

export function formatScoreType(type: ScoreType) {
    return SCORE_TYPE_NAMES[type];
}

export function getTeam(teams: Team[], teamId: number): Team | undefined {
    return teams.find((team) => team.id === teamId);
}

export function getTeamBackground(team: Team): string | undefined {
    return TEAM_BACKGROUND_CLASSES[team.name as TeamName];
}

export function last<Type>(list: Type[]): Type | undefined {
    return list[list.length - 1];
}

export function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60000);
}

export function addDays(date: Date, days: number): Date {
    const added = new Date(date);
    added.setDate(added.getDate() + days);
    return added;
}

export function getEventEnd(event: Event): Date {
    return addMinutes(event.startTime, event.duration);
}

export function getTimeslotEnd(eventTimeslot: EventTimeslot): Date {
    return addMinutes(eventTimeslot.time, EVENT_TIMESLOT_MINUTES);
}

export function getTimeslotTimes(event: Event, timeslots: number): Date[] {
    const timeslotTimes: Date[] = []
    for (let time = event.startTime; timeslotTimes.length < timeslots; time = addMinutes(time, EVENT_TIMESLOT_MINUTES)) {
        timeslotTimes.push(time);
    }
    return timeslotTimes;
}

export function groupEvents(events: Event[]): Event[][][] {
    if (events.length === 0) return [];

    let groups = [];
    let groupEnd = getEventEnd(events[0]);
    let columns: Event[][] = [];
    for (const event of events) {
        if (event.startTime >= groupEnd) {
            groups.push(columns);
            columns = [];
            groupEnd = getEventEnd(event);
        }
        for (let i = 0; i <= columns.length; i++) {
            if (i == columns.length) {
                columns.push([event]);
                break
            }
            const lastEvent = last(columns[i]);
            if (!lastEvent || event.startTime >= getEventEnd(lastEvent)) {
                columns[i].push(event);
                break;
            }
        }
        if (getEventEnd(event) > groupEnd) groupEnd = getEventEnd(event);
    }
    groups.push(columns);
    return groups;
}

export function splitByDay(events: Event[], days: Date[]): DayEvents[] {
    return days.map((date) => ({
        day: getDay(date),
        events: events.filter((event) => event.startTime > getDayStart(date) && event.startTime < getDayEnd(date)),
    }));
}

export function getLanDays(lan: Lan): Date[] {
    let day = lan.scheduleStart;
    const days = [];
    while (day <= lan.scheduleEnd) {
        days.push(day);
        day = addDays(day, 1);
    }
    return days;
}

export function getEventScheduleStyles(event: Event, column: number, columns: number, minWidth: number) {
    const rangeMinutes = (SCHEDULE_END_TIME - SCHEDULE_START_TIME) * 60;
    let startMinutes = (event.startTime.getHours() - SCHEDULE_START_TIME) * 60 + event.startTime.getMinutes();
    if (startMinutes < 0) startMinutes += 24 * 60;

    const width = `${100 / columns}%`;
    const height = `${100 * event.duration / rangeMinutes}%`;
    const top = `${100 * startMinutes / rangeMinutes}%`;
    const left = `min(${100 * column / columns}%, calc(${column} * (100% - ${minWidth}px) / ${columns - 1}))`;

    return `min-width: ${minWidth}px; width: ${width}; height: ${height}; top: ${top}; left: ${left};`
}

export function datesEqual(a: Date, b: Date): boolean {
    return a.getTime() === b.getTime();
}

export function minDate(a: Date, b: Date): Date {
    return a < b ? a : b;
}

export function maxDate(a: Date, b: Date): Date {
    return a > b ? a : b;
}

export function diffMinutes(a: Date, b: Date): number {
    return (b.getTime() - a.getTime()) / 1000 / 60;
}

export function roundToNextMinutes(date = new Date(), minutes: number): Date {
    const multiplier = 1000 * 60 * minutes;
    return new Date(Math.ceil(date.getTime() / multiplier) * multiplier);
}

export function getUrl(path: string) {
    const url = new URL(path, 'https://example');
    return { path: url.pathname, query: url.searchParams, hash: url.hash };
}

export function hasEventStarted(lan: Lan | undefined): boolean {
    return Boolean(lan?.eventStart && new Date() > lan.eventStart);
}

export function isAdmin(user: UserWithRoles | undefined): boolean {
    return Boolean(user?.roles.find((role) => (MODERATOR_ROLES as readonly string[]).includes(role)));
}

export function isEligible(lan: Lan, user: UserWithRoles | undefined): boolean {
    return isAdmin(user) || Boolean(user?.roles.includes(lan.role || ''));
}

export function isLanEnded(lan: Lan) {
    return Boolean(lan.eventEnd && new Date() > lan.eventEnd);
}

export function isLanStarted(lan: Lan) {
    return Boolean(lan.eventStart && new Date() > lan.eventStart);
}

export function isLanActive(lan: Lan) {
    return isLanStarted(lan) && !isLanEnded(lan);
}

export type Context = {
    currentPath: string;
    discordAuthUrl: string;
    user: UserWithRoles | undefined;
    currentLan: LanWithTeams | undefined;
    lanStarted: boolean;
    lanEnded: boolean;
    lans: LanWithTeams[];
    helpers: Helpers;
}

type ContextWithLan = Context & {
    currentLan: LanWithTeams;
}

type ContextLoggedIn = ContextWithLan & {
    user: UserWithRoles;
}

export function getContext(request: Request): Context;
export function getContext(request: Request, mode: 'WITH_LAN'): ContextWithLan;
export function getContext(request: Request, mode: 'LOGGED_IN'): ContextLoggedIn;
export function getContext(request: Request, mode?: 'WITH_LAN' | 'LOGGED_IN'): Context | ContextLoggedIn | ContextLoggedIn {
    return request.context;
}

export function cacheCall<T extends (...args: any) => Promise<any>>(func: T): [T, () => void] {
    let cachedValue: T | undefined;
    let lastUpdate: Date | undefined;
    return [
        (async (...args: Parameters<typeof func>) => {
            if (!lastUpdate || new Date() > addMinutes(lastUpdate, 1)) {
                cachedValue = await func(...args),
                    lastUpdate = new Date();
            }
            return cachedValue;
        }) as T,
        () => lastUpdate = undefined,
    ];
}
