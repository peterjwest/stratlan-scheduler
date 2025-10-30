
import zod from 'zod';

import { parseInteger } from './util';
import { ScoreType } from './constants';

export const LanData = zod.object({
    name: zod.string(),
    role: zod.string(),
    eventStart: zod.string().transform((date) => date ? new Date(date) : undefined),
    eventEnd: zod.string().transform((date) => date ? new Date(date) : undefined),
    scheduleStart: zod.string().transform((date) => new Date(date)),
    scheduleEnd: zod.string().transform((date) => new Date(date)),
});
export type LanData = zod.infer<typeof LanData>;

export const EventData = zod.object({
    name: zod.string(),
    description: zod.string(),
    startTime: zod.string().transform((date) => date ? new Date(date) : undefined),
    duration: zod.string().transform((value) => parseInt(value, 10)),
    gameId: zod.string().transform((id) => id ? id : undefined),
    points: zod.string().transform((value) => parseInt(value, 10)),
});
export type EventData = zod.infer<typeof EventData>;

export const BaseAssignPoints = zod.object({
    points: zod.string().transform((id) => parseInteger(id)),
    reason: zod.string(),
    eventId: zod.string().transform((id) => id ? parseInteger(id) : undefined),
    submit: zod.literal('Submit'),
});
const AssignTeamPoints = BaseAssignPoints.extend({
    type: zod.string().transform((id) => parseInteger(id)),
});
const AssignPlayerPoints = BaseAssignPoints.extend({
    type: zod.literal(['player']),
    userId: zod.string().transform((id) => parseInteger(id)),
});
export const AssignPointsData = zod.union([AssignPlayerPoints, AssignTeamPoints]);
export type AssignPointsData = zod.infer<typeof AssignPointsData>;

export const PointsQuery = zod.object({ type: zod.union([ScoreType, zod.undefined()]) });
export type PointsQuery = zod.infer<typeof PointsQuery>;
