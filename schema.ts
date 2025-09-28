import { integer, pgTable, boolean, varchar, json, date, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

import { SCORE_TYPES } from './constants';

export const User = pgTable('User', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    teamId: integer().references(() => Team.id),
    discordId: varchar().notNull().unique(),
    discordUsername: varchar().notNull(),
    discordNickname: varchar(),
    discordAvatarId: varchar(),
    accessToken: varchar(),
    steamId: varchar(),
    steamUsername: varchar(),
    steamAvatar: varchar(),
    isAdmin: boolean().notNull(),
});
export type User = typeof User.$inferSelect;

export const usersRelations = relations(User, ({ many }) => ({
    assignedScores: many(Score),
}));

export const Session = pgTable('Session', {
    sid: varchar().primaryKey().notNull(),
    sess: json().notNull(),
    expire: timestamp().notNull(),
}, (table) => [
    index('expire_idx').on(table.expire),
]);
export type Session = typeof Session.$inferSelect;

export const Team = pgTable('Team', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull().unique(),
});
export type Team = typeof Team.$inferSelect;

export const ScoreTypeEnum = pgEnum('ScoreType', SCORE_TYPES);

export const Score = pgTable('Score', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    teamId: integer().references(() => Team.id),
    type: ScoreTypeEnum().notNull(),
    userId: integer().references(() => User.id),
    assignerId: integer().references(() => User.id),
    points: integer(),
    reason: varchar({ length: 256 }),
    eventId: integer().references(() => Event.id),
    timeslotId: integer().references(() => EventTimeslot.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
});
// Constraint - (Type: Awarded + Assigner)
// Constraint - (Type: CommunityGame + CommunityGameSlot + Player + not Achievement + not OneTimeCode)
// Constraint - (Type: OneTimeCode + OneTimeCode + Player + not CommunityGameSlot + not Achievement)
// Constraint - (Type: Achievement + Achievement + Player + not CommunityGameSlot + not OneTimeCode)

export type Score = typeof Score.$inferSelect;

export const scoreRelations = relations(Score, ({ one }) => ({
    user: one(User, {
        fields: [Score.userId],
        references: [User.id],
    }),
    assigner: one(User, {
        fields: [Score.assignerId],
        references: [User.id],
    }),
    event: one(Event, {
        fields: [Score.eventId],
        references: [Event.id],
    }),
    timeslot: one(EventTimeslot, {
        fields: [Score.timeslotId],
        references: [EventTimeslot.id],
    }),
}));

export const Event = pgTable('Event', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull(),
    description: varchar().notNull(),
    startTime: timestamp({ withTimezone: true }).notNull(),
    duration: integer().notNull(),
    isOfficial: boolean().notNull(),
    gameId: varchar().references(() => Game.id),
    points: integer().notNull().default(0),
    timeslotCount: integer().notNull().default(0),
    createdBy: integer().references(() => User.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
});
export type Event = typeof Event.$inferSelect;
export type EventWithTimeslots = Event & { timeslots: EventTimeslot[] };

export const eventRelations = relations(Event, ({ one, many }) => ({
    user: one(User, {
        fields: [Event.createdBy],
        references: [User.id],
    }),
    timeslots: many(EventTimeslot),
}));

export const EventTimeslot = pgTable('EventTimeslot', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    eventId: integer().references(() => Event.id).notNull(),
    time: timestamp({ withTimezone: true }).notNull(),
});
export type EventTimeslot = typeof EventTimeslot.$inferSelect;

export const eventTimeslotRelations = relations(EventTimeslot, ({ one }) => ({
    event: one(Event, {
        fields: [EventTimeslot.eventId],
        references: [Event.id],
    }),
}));

export const Lan = pgTable('Lan', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull(),
    startDate: date({ mode: 'date' }).notNull(),
    endDate: date({ mode: 'date' }).notNull(),
});
export type Lan = typeof Lan.$inferSelect;

export const GameActivity = pgTable('GameActivity', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer().references(() => User.id).notNull(),
    gameId: varchar().references(() => Game.id).notNull(),
    startTime: timestamp({ withTimezone: true }).notNull(),
    endTime: timestamp({ withTimezone: true }),
});
export type GameActivity = typeof GameActivity.$inferSelect;
export type GameActivityWithTeam = GameActivity & { teamId: number | null };

export const gameActivityRelations = relations(GameActivity, ({ one }) => ({
    user: one(User, {
        fields: [GameActivity.userId],
        references: [User.id],
    }),
    game: one(Game, {
        fields: [GameActivity.gameId],
        references: [Game.id],
    }),
}));

export const Game = pgTable('Game', {
    id: varchar().primaryKey().notNull(),
    name: varchar().notNull(),
});
export type Game = typeof Game.$inferSelect;

export default {
    User,
    usersRelations,
    Session,
    Team,
    Score,
    scoreRelations,
    Event,
    eventRelations,
    EventTimeslot,
    eventTimeslotRelations,
    Lan,
    GameActivity,
    gameActivityRelations,
    Game,
};
