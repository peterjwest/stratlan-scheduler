import { eq } from 'drizzle-orm' ;
import lodash from 'lodash';

import { DatabaseClient, getIncompleteCommunityEvents, getTimeslotActivities } from './database';
import { Event, EventTimeslot, EventWithTimeslots, GameActivity, Score } from './schema';
import { getEventEnd, minDate, diffMinutes, getTimeslotTimes, getTimeslotEnd, datesEqual, maxDate, roundToNextMinutes } from './util';
import { EVENT_TIMESLOT_MINUTES, EVENT_TIMESLOT_THRESHOLD } from './constants';

export function sumTimeslotActivities(timeslot: EventTimeslot, activities: GameActivity[]) {
    return lodash.sum(activities.map((activity) => {
        const start = maxDate(activity.startTime, timeslot.time);
        const end = activity.endTime ? minDate(activity.endTime, getTimeslotEnd(timeslot)) : getTimeslotEnd(timeslot);
        return (end.getTime() - start.getTime()) / 1000 / 60;
    }));
}

export function getExpectedTimeslots(event: EventWithTimeslots) {
    const currentDuration = diffMinutes(event.startTime, minDate(new Date(), getEventEnd(event)));
    return Math.floor(currentDuration / EVENT_TIMESLOT_MINUTES);
}

export function getMissingTimeslots(event: EventWithTimeslots, expectedTimeslots: number) {
    const timeslotTimes = getTimeslotTimes(event, expectedTimeslots);

    let missingTimeslots: Date[] = [];
    let erroneousTimeslots: EventTimeslot[] = [];
    let currentIndex = 0;
    for (const timeslotTime of timeslotTimes) {
        while (event.timeslots[currentIndex]?.time < timeslotTime) {
            erroneousTimeslots.push(event.timeslots[currentIndex]);
            currentIndex++;
        }
        if (event.timeslots[currentIndex] && datesEqual(event.timeslots[currentIndex].time, timeslotTime)) {
            currentIndex++;
        } else {
            missingTimeslots.push(timeslotTime);
        }
    }
    while (currentIndex < event.timeslots.length) {
        erroneousTimeslots.push(event.timeslots[currentIndex]);
        currentIndex++;
    }

    console.warn(`Warning: unexpected timeslots:\n  ${erroneousTimeslots.map((timeslot) => JSON.stringify(timeslot)).join('\n  ')}`)

    return missingTimeslots;
}

export async function scoreCommunityGames(db: DatabaseClient): Promise<void> {
    console.log('Processing community games:');
    try {
        const events = await getIncompleteCommunityEvents(db);
        if (events.length === 0) console.log('No games to process');
        for (const event of events) {
            console.log(`Processing game ${event.name}`);
            await db.transaction(async (tx) => {
                const expectedTimeslots = getExpectedTimeslots(event);
                const missingTimeslots = getMissingTimeslots(event, expectedTimeslots);

                const timeslots = await tx.insert(EventTimeslot).values(missingTimeslots.map((timeslot) => ({
                    eventId: event.id,
                    time: timeslot,
                }))).returning();

                let scoresAdded = 0;

                for (const timeslot of timeslots) {
                    const activitiesByUser = Object.values(lodash.groupBy(await getTimeslotActivities(db, event, timeslot), 'userId'));
                    for (const activities of activitiesByUser) {
                        const total = sumTimeslotActivities(timeslot, activities);

                        if (total > EVENT_TIMESLOT_MINUTES * EVENT_TIMESLOT_THRESHOLD) {
                            const { teamId, userId } = activities[0];
                            await tx.insert(Score).values({
                                teamId: teamId,
                                type: 'CommunityGame',
                                userId: userId,
                                points: event.points,
                                timeslotId: timeslot.id,
                                createdAt: timeslot.time,
                            });
                            scoresAdded++;
                        }
                    }
                }

                await tx.update(Event).set({ timeslotCount: expectedTimeslots }).where(eq(Event.id, event.id));

                console.log(`Scored ${scoresAdded} player timeslots for ${event.name}`);
            });
        }



    } catch (error) {
        console.error('Failed to score community games:', error);
    }
}

export async function startScoringCommunityGames(db: DatabaseClient): Promise<() => void> {
    await scoreCommunityGames(db);

    let nextSlot = roundToNextMinutes(new Date(), EVENT_TIMESLOT_MINUTES);
    const interval = setInterval(async () => {
        let now = new Date();
        if (now > nextSlot) {
            nextSlot = roundToNextMinutes(now, EVENT_TIMESLOT_MINUTES);
            await scoreCommunityGames(db);
        }
    }, 60 * 1000);
    return () => clearInterval(interval);
}
