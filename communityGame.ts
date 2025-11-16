import { eq, and, inArray } from 'drizzle-orm';
import lodash from 'lodash';

import { DatabaseClient, getCurrentLanCached, getIncompleteCommunityEvents, getTimeslotActivities } from './database';
import { Event, EventTimeslot, EventWithTimeslots, GameActivity, Score } from './schema';
import {
    getEventEnd,
    minDate,
    diffMinutes,
    getTimeslotTimes,
    getTimeslotEnd,
    datesEqual,
    maxDate,
    roundToNextMinutes,
    withLanStatus,
} from './util';
import { EVENT_TIMESLOT_MINUTES,
    EVENT_TIMESLOT_THRESHOLD, COMMUNITY_GAMES_SCORE_INTERVAL } from './constants';

export function sumTimeslotActivities(timeslot: EventTimeslot, activities: GameActivity[]) {
    return lodash.sum(activities.map((activity) => {
        const start = maxDate(activity.startTime, timeslot.time);
        const end = activity.endTime ? minDate(activity.endTime, getTimeslotEnd(timeslot)) : getTimeslotEnd(timeslot);
        return (end.getTime() - start.getTime()) / 1000 / 60;
    }));
}

export function getExpectedTimeslots(event: EventWithTimeslots) {
    const currentEnd = minDate(new Date(), getEventEnd(event));
    const currentDuration = diffMinutes(event.startTime, event.cancelledAt ? minDate(currentEnd, event.cancelledAt) : currentEnd);
    return Math.floor(currentDuration / EVENT_TIMESLOT_MINUTES);
}

export function getMissingTimeslots(event: EventWithTimeslots, expectedTimeslots: number) {
    const timeslotTimes = getTimeslotTimes(event, expectedTimeslots);

    let missingTimeslots: Date[] = [];
    let erroneousTimeslots: EventTimeslot[] = [];
    let currentIndex = 0;
    for (const timeslotTime of timeslotTimes) {
        while (event.timeslots[currentIndex]!?.time < timeslotTime) {
            erroneousTimeslots.push(event.timeslots[currentIndex]!);
            currentIndex++;
        }
        if (event.timeslots[currentIndex] && datesEqual(event.timeslots[currentIndex]!.time, timeslotTime)) {
            currentIndex++;
        } else {
            missingTimeslots.push(timeslotTime);
        }
    }
    while (currentIndex < event.timeslots.length) {
        erroneousTimeslots.push(event.timeslots[currentIndex]!);
        currentIndex++;
    }

    if (erroneousTimeslots.length) {
        const timeslotsJson = erroneousTimeslots.map((timeslot) => JSON.stringify(timeslot));
        console.warn(`Warning: unexpected timeslots:\n ${timeslotsJson.join('\n  ')}`);
    }

    return missingTimeslots;
}

export async function scoreCommunityGames(db: DatabaseClient): Promise<void> {
    const currentLan = withLanStatus(await getCurrentLanCached(db));
    if (!currentLan) return;
    if (!currentLan.isActive) return;

    console.log('Scoring community games:');
    try {
        const events = await getIncompleteCommunityEvents(db, currentLan);
        if (events.length === 0) console.log('No games to process');
        for (const event of events) {
            console.log(`Processing game ${event.name}`);
            await db.transaction(async (tx) => {
                const expectedTimeslots = getExpectedTimeslots(event);
                const missingTimeslots = getMissingTimeslots(event, expectedTimeslots);

                let timeslots = event.timeslots;
                if (missingTimeslots.length > 0) {
                    timeslots = timeslots.concat(await tx.insert(EventTimeslot).values(missingTimeslots.map((timeslot) => ({
                        eventId: event.id,
                        time: timeslot,
                    }))).returning());
                }
                timeslots = timeslots.filter((timeslot) => !timeslot.isProcessed);

                const scoresToAdd: Array<{ userId: number, timeslot: EventTimeslot }> = [];
                for (const timeslot of timeslots) {
                    const activities = await getTimeslotActivities(db, currentLan, event, timeslot);
                    const activitiesByUser = Object.values(lodash.groupBy(activities, 'userId'));
                    for (const activities of activitiesByUser) {
                        const total = sumTimeslotActivities(timeslot, activities);

                        if (total > EVENT_TIMESLOT_MINUTES * EVENT_TIMESLOT_THRESHOLD) {
                            const { userId } = activities[0]!;
                            scoresToAdd.push({ userId, timeslot });
                        }
                    }
                }

                let scoresAdded = 0;
                const inserts = scoresToAdd.map(({ userId, timeslot }) => ({
                    lanId: currentLan.id,
                    type: 'CommunityGame',
                    userId: userId,
                    points: event.points,
                    eventId: event.id,
                    timeslotId: timeslot.id,
                    createdAt: timeslot.time,
                } as const));
                if (inserts.length > 0) {
                    const inserted = await tx.insert(Score).values(inserts).onConflictDoNothing().returning();
                    scoresAdded += inserted.length;
                }

                await tx.update(EventTimeslot).set({ isProcessed: true }).where(eq(EventTimeslot.eventId, event.id));

                if (new Date() > getEventEnd(event)) {
                    await tx.update(Event).set({ isProcessed: true }).where(eq(Event.id, event.id));
                }

                console.log(`Created ${scoresAdded} scores processing ${timeslots.length} timeslots for ${event.name}`);
            });
        }
    } catch (error) {
        console.error('Failed to score community games:', error);
    }
}

export async function startScoringCommunityGames(db: DatabaseClient): Promise<() => void> {
    await scoreCommunityGames(db);

    let nextSlot = roundToNextMinutes(new Date(), EVENT_TIMESLOT_MINUTES);

    let timeout: NodeJS.Timeout | undefined;
    async function process() {
        let now = new Date();
        if (now > nextSlot) {
            nextSlot = roundToNextMinutes(now, EVENT_TIMESLOT_MINUTES);
            await scoreCommunityGames(db);
        }
        if (timeout) timeout = setTimeout(process, COMMUNITY_GAMES_SCORE_INTERVAL);
    }

    timeout = setTimeout(process, COMMUNITY_GAMES_SCORE_INTERVAL);
    return () => {
        clearTimeout(timeout);
        timeout = undefined;
    }
}
