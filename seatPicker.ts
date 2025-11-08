import { setTimeout } from 'node:timers/promises';
import zod from 'zod';
import puppeteer, { Page } from 'puppeteer';

import { DiscordGuildMember } from './discordApi';
import { DatabaseClient } from './database';
import { getCache, setCache } from './cache';
import { Lan } from './schema';
import { withinThreshold, isEdgeSubstring, normaliseName } from './util';
import {
    DISCORD_LOGIN_URL,
    DISCORD_HOMEPAGE_URL,
    DISCORD_ASSET_URL,
    SEATPICKER_LOGIN_URL,
    SEATPICKER_URL,
    SEATPICKER_SEATING_URL,
} from './constants';
import { SEATPICKER_DISCORD_USERNAME, SEATPICKER_DISCORD_PASSWORD } from './environment';

const PAGE_LOAD_TIMEOUT = 1000 * 15; // 15 seconds

const DiscordSessionToken = zod.union([zod.string(), zod.undefined()]);

export type SeatPickerUser = {
    name: string,
    groups: string[],
    discord?: DiscordGuildMember,
}

async function randomDelay(average: number) {
    return setTimeout(average + (Math.random() - 0.5) * 100);
}

async function discordLogin(db: DatabaseClient, page: Page) {
    await page.goto(DISCORD_LOGIN_URL);

    await page.waitForSelector(
        'input[name="email"]',
        { timeout: PAGE_LOAD_TIMEOUT },
    );

    await randomDelay(400);
    await page.type('input[name="email"]', SEATPICKER_DISCORD_USERNAME, { delay: 5 });
    await randomDelay(150);
    await page.type('input[name="password"]', SEATPICKER_DISCORD_PASSWORD, { delay: 5 });
    await randomDelay(150);
    await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation(),
    ]);
    await randomDelay(150);
    await page.goto(DISCORD_ASSET_URL);

    const token = DiscordSessionToken.parse(await page.evaluate(() => {
        const entry = localStorage.getItem('token');
        return entry ? JSON.parse(entry) : undefined;
    }));
    if (!token) throw new Error('Failed to log in to Discord!');
    await setCache(db, 'SESSION_TOKEN', token);
}

async function discordResumeSession(db: DatabaseClient, page: Page): Promise<boolean> {
    const token = await getCache(db, 'SESSION_TOKEN');

    if (!token) return false;

    await page.goto(DISCORD_ASSET_URL);
    await randomDelay(150);
    await page.evaluate((token) => localStorage.setItem('token', JSON.stringify(token)), token);

    await page.goto(DISCORD_HOMEPAGE_URL);
    await page.waitForSelector('#login', { timeout: PAGE_LOAD_TIMEOUT });

    return page.evaluate((DISCORD_LOGIN_URL) => {
        return document.querySelector('#login')?.textContent !== DISCORD_LOGIN_URL;
    }, DISCORD_LOGIN_URL);
}

export async function getSeatPickerData(db: DatabaseClient, lan: Lan): Promise<SeatPickerUser[]> {
    if (!lan.seatPickerCode) throw new Error('LAN has no seatPickerCode');

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    const success = await discordResumeSession(db, page);

    if (!success) {
        await discordLogin(db, page);
    }

    await page.goto(SEATPICKER_LOGIN_URL);
    await page.waitForResponse(
        (response) => response.url() === SEATPICKER_URL,
        { timeout: PAGE_LOAD_TIMEOUT },
    );

    await randomDelay(500);
    await page.goto(`${SEATPICKER_SEATING_URL}/${lan.seatPickerCode}`);
    await page.waitForSelector('.seating-plan', { timeout: PAGE_LOAD_TIMEOUT });

    const data: SeatPickerUser[] = await page.evaluate(() => {
        const tempElement = document.createElement('div');
        return Array.from(document.querySelectorAll('[data-bs-content]')).map((element: HTMLElement) => {
            tempElement.innerHTML = element.dataset.bsContent!;
            const name = tempElement.querySelector(':scope > span')!.textContent;
            const groups = Array.from(tempElement.querySelectorAll('.badge')).map((group) => group.textContent);
            return { name, groups };
        });
    });

    await browser.close();

    return data;
}

export function matchSeatPickerUsers(seatPickerUsers: SeatPickerUser[], discordMembers: DiscordGuildMember[]) {
    const discordMembersNormalised = discordMembers.map((member) => ({
        member,
        names: (
            [member.user.username, member.user.global_name, member.nick]
            .filter((name) => name)
            .map(normaliseName)
        ),
    }));

    for (const user of seatPickerUsers) {
        if (user.discord) continue;

        const seatPickerName = normaliseName(user.name);

        const matches = discordMembersNormalised.filter((data) => {
            return data.names.find((name) => {
                return withinThreshold(name, seatPickerName, 0.5) && isEdgeSubstring(name, seatPickerName);
            });
        });
        if (matches.length === 1) user.discord = matches[0]!.member;
    }
}
