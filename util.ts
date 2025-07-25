import { promisify } from 'node:util';
import { Request } from 'express';
import lodash from 'lodash';

import { User } from './schema';

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
    const date = `${dateTime.getFullYear()}-${padNumber(dateTime.getMonth() + 1)}-${padNumber(dateTime.getDate())}`;
    return `${time} ${day} ${date}`;
}

export function formatName(user: User) {
    if (user.discordNickname) return `${user.discordNickname} (${user.discordUsername})`;
    return user.discordUsername;
}
