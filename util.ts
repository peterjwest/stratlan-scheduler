import { promisify } from 'node:util';
import { Request } from 'express';
import lodash from 'lodash';

import { User, Team, Event } from './schema';

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
    throw new Error(`Expected an integer, got "${value}"`);
}

const DAYS = [
    'Sun',
    'Mon',
    'Tues',
    'Weds',
    'Thurs',
    'Fri',
    'Sat',
];

function padNumber(value: number) {
    return String(value).padStart(2, '0');
}

export function formatDate(dateTime: Date) {
    const time = `${padNumber(dateTime.getHours())}:${padNumber(dateTime.getMinutes())}:${padNumber(dateTime.getSeconds())}`;
    const day = DAYS[dateTime.getDay()];
    // const date = `${dateTime.getFullYear()}-${padNumber(dateTime.getMonth() + 1)}-${padNumber(dateTime.getDate())}`;
    return `${time} ${day}`;
}

export function formatName(user: User) {
    if (user.discordNickname) return `${user.discordNickname} (${user.discordUsername})`;
    return user.discordUsername;
}

export function getTeam(teams: Team[], teamId: number) {
    return teams.find((team) => team.id === teamId);
}

export function last<Type>(list: Type[]): Type | undefined {
    return list[list.length - 1];
}

export function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60000);
}

export function eventEnd(event: Event): Date {
    return addMinutes(event.startTime, event.duration);
}

export function groupEvents(events: Event[]): Event[][][] {
    if (events.length === 0) return [];

    let groups = [];
    let groupEnd = eventEnd(events[0]);
    let columns: Event[][] = [];
    for (const event of events) {
        if (event.startTime >= groupEnd) {
            groups.push(columns);
            columns = [];
            groupEnd = eventEnd(event);
        }
        for (let i = 0; i <= columns.length; i++) {
            if (i == columns.length) {
                columns.push([event]);
                break
            }
            const lastEvent = last(columns[i]);
            if (!lastEvent || event.startTime >= eventEnd(lastEvent)) {
                columns[i].push(event);
                break;
            }
        }
        if (eventEnd(event) > groupEnd) groupEnd = eventEnd(event);
    }
    groups.push(columns);
    return groups;
}
