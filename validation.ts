
import zod from 'zod';

import { ScoreType } from './constants';

const dateType = (
    zod.string()
    .transform((date) => new Date(date))
    .refine((value) => !isNaN(Number(value)), {
        error: 'Expected a valid datetime'
    })

);
const dateTypeOptional = (
    zod.string()
    .transform((date) => date ? new Date(date) : undefined)
    .refine((value) => value === undefined || !isNaN(Number(value)), {
        error: 'Expected a valid datetime'
    })
);

const integerType = (
    zod.string()
    .transform((id) => parseInt(id, 10))
    .refine((value) => Number.isInteger(value), {
        error: 'Expected an integer'
    })
);

const integerTypeOptional = (
    zod.string()
    .transform((id) => id === '' ? undefined : parseInt(id, 10))
    .refine((value) => value === undefined || Number.isInteger(value), {
        error: 'Expected an integer'
    })
);

export const LanData = zod.object({
    name: zod.string(),
    role: zod.string(),
    seatPickerCode: zod.string(),
    eventStart: dateTypeOptional,
    eventEnd: dateTypeOptional,
    scheduleStart: dateType,
    scheduleEnd: dateType,
});
export type LanData = zod.infer<typeof LanData>;

export const EventData = zod.object({
    name: zod.string(),
    description: zod.string(),
    startTime: dateType,
    duration: integerType,
    gameId: integerTypeOptional,
    points: integerType,
    isCancelled: zod.union([zod.literal('on'), zod.literal('')]).optional().transform((value) => value === 'on'),
});
export type EventData = zod.infer<typeof EventData>;

export const BaseAssignPoints = zod.object({
    points: integerType,
    reason: zod.string(),
    eventId: integerTypeOptional,
});
const AssignTeamPoints = BaseAssignPoints.extend({
    type: zod.literal('team'),
    teamId: integerType,
});
const AssignPlayerPoints = BaseAssignPoints.extend({
    type: zod.literal('player'),
    userId: integerType,
});
export const AssignPointsData = zod.union([AssignPlayerPoints, AssignTeamPoints]);
export type AssignPointsData = zod.infer<typeof AssignPointsData>;

export const PointsQuery = zod.object({ type: zod.union([ScoreType, zod.undefined()]) });
export type PointsQuery = zod.infer<typeof PointsQuery>;
