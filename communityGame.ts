import { eq } from 'drizzle-orm';
import lodash from 'lodash';
import { Server } from 'socket.io';

import {
    list,
    getCurrentLanCached,
    getIncompleteCommunityEvents,
    getTimeslotActivities,
    getScoresDetails,
    DatabaseClient,
} from './database.js';
import { Event, EventTimeslot, EventWithTimeslots, GameActivity, Score } from './schema.js';
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
} from './util.js';
import { EVENT_TIMESLOT_MINUTES, EVENT_TIMESLOT_THRESHOLD } from './constants.js';

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

    const missingTimeslots: Date[] = [];
    const erroneousTimeslots: EventTimeslot[] = [];
    let currentIndex = 0;
    for (const timeslotTime of timeslotTimes) {
        let timeslot = event.timeslots[currentIndex];
        while (timeslot && timeslot.time < timeslotTime) {
            erroneousTimeslots.push(event.timeslots[currentIndex]!);
            currentIndex++;
            timeslot = event.timeslots[currentIndex];
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

export async function scoreCommunityGames(db: DatabaseClient, io: Server): Promise<void> {
    const currentLan = withLanStatus(await getCurrentLanCached(db));
    if (!currentLan) return;
    if (!currentLan.isActive) return;

    console.log('Scoring community games:');
    try {
        let scores: Score[] = [];

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

                let eventScoreCount = 0;
                const inserts = scoresToAdd.map(({ userId, timeslot }) => ({
                    lanId: currentLan.id,
                    type: 'CommunityGame',
                    userId: userId,
                    points: event.gamePoints,
                    eventId: event.id,
                    timeslotId: timeslot.id,
                    createdAt: timeslot.time,
                } as const));
                if (inserts.length > 0) {
                    const inserted = await list(tx.insert(Score).values(inserts).onConflictDoNothing().returning());
                    scores = scores.concat(inserted);
                    eventScoreCount += inserted.length;
                }

                await tx.update(EventTimeslot).set({ isProcessed: true }).where(eq(EventTimeslot.eventId, event.id));

                if (new Date() > getEventEnd(event)) {
                    await tx.update(Event).set({ isProcessed: true }).where(eq(Event.id, event.id));
                }

                console.log(`Created ${eventScoreCount} scores processing ${timeslots.length} timeslots for ${event.name}`);
            });
        }

        io.emit('NEW_SCORES', await getScoresDetails(db, currentLan, scores));
    } catch (error) {
        console.error('Failed to score community games:', error);
    }
}

export function getIsNextSlotReady() {
    let nextSlot = roundToNextMinutes(new Date(), EVENT_TIMESLOT_MINUTES);
    return function isNextSlotReady() {
        const now = new Date();
        if (now > nextSlot) {
            nextSlot = roundToNextMinutes(now, EVENT_TIMESLOT_MINUTES);
            return true;
        }
        return false;
    };
}
