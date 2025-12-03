
import zod from 'zod';

import { ScoreType } from './constants.js';

const dateType = (
    zod.string()
    .transform((date) => new Date(date))
    .refine((value) => !isNaN(Number(value)), {
        error: 'Expected a valid datetime',
    })
);

const integerType = (
    zod.string()
    .transform((id) => parseInt(id, 10))
    .refine((value) => Number.isInteger(value), {
        error: 'Expected an integer',
    })
);

const integerTypeOptional = (
    zod.string()
    .transform((id) => id === '' ? undefined : parseInt(id, 10))
    .refine((value) => value === undefined || Number.isInteger(value), {
        error: 'Expected an integer',
    })
);

const positiveIntegerTypeOptional = (
    zod.string()
    .transform((id) => id === '' ? undefined : parseInt(id, 10))
    .refine((value) => value === undefined || Number.isInteger(value), {
        error: 'Expected an integer',
    })
    .refine((value) => value === undefined || value > 0, {
        error: 'Must be greater than zero',
    })
);

export const LanData = zod.object({
    name: zod.string(),
    role: zod.string(),
    seatPickerCode: zod.string(),
    eventStart: dateType,
    eventEnd: dateType,
    scheduleStart: dateType,
    scheduleEnd: dateType,
    isStartProcessed: zod.boolean().optional(),
    isEndProcessed: zod.boolean().optional(),
});
export type LanData = zod.infer<typeof LanData>;

export const EventData = zod.object({
    name: zod.string(),
    description: zod.string(),
    startTime: dateType,
    duration: integerType,
    gameId: integerTypeOptional,
    gamePoints: integerType,
    eventPoints: integerType,
});
export type EventData = zod.infer<typeof EventData>;

export const HiddenCodeData = zod.object({
    name: zod.string(),
});
export type HiddenCodeData = zod.infer<typeof HiddenCodeData>;

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

export const PointsQuery = zod.object({
    type: zod.optional(ScoreType),
    page: positiveIntegerTypeOptional.optional(),
});
export type PointsQuery = zod.infer<typeof PointsQuery>;

export const DuplicateGameData = zod.object({ gameId: integerType });
export type DuplicateGameData = zod.infer<typeof DuplicateGameData>;

export const EventQuery = zod.object({
    returnTo: zod.union([zod.literal('schedule'), zod.literal('')]).optional(),
});
export type EventQuery = zod.infer<typeof EventQuery>;
