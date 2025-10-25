import { integer, pgTable, boolean, varchar, json, date, timestamp, index, pgEnum, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

import { SCORE_TYPES, INTRO_CHALLENGE_TYPES } from './constants';

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
});
export type User = typeof User.$inferSelect;
export type UserWithRoles = User & { roles: string[] };

export const usersRelations = relations(User, ({ many }) => ({
    assignedScores: many(Score),
}));

export const UserRole = pgTable('UserRole', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer().references(() => User.id).notNull(),
    role: varchar().notNull(),
});
export type UserRole = typeof UserRole.$inferSelect;

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
    lanId: integer().references(() => Lan.id).notNull(),
    teamId: integer().references(() => Team.id),
    type: ScoreTypeEnum().notNull(),
    userId: integer().references(() => User.id),
    assignerId: integer().references(() => User.id),
    points: integer(),
    reason: varchar({ length: 256 }),
    eventId: integer().references(() => Event.id),
    timeslotId: integer().references(() => EventTimeslot.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
}, (table) => [
      check(
        "teamId_or_userId",
        sql`(${table.teamId} IS NOT NULL AND ${table.userId} IS NULL) OR (${table.teamId} IS NULL AND ${table.userId} IS NOT NULL)`,
    ),
]);
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
    lanId: integer().references(() => Lan.id).notNull(),
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
    role: varchar(),
    scheduleStart: date({ mode: 'date' }).notNull(),
    scheduleEnd: date({ mode: 'date' }).notNull(),
    eventStart: timestamp({ withTimezone: true }),
    eventEnd: timestamp({ withTimezone: true }),
});
export type Lan = typeof Lan.$inferSelect;

export const GameActivity = pgTable('GameActivity', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    lanId: integer().references(() => Lan.id).notNull(),
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

export const IntroChallengeTypeEnum = pgEnum('IntroChallengeType', INTRO_CHALLENGE_TYPES);

export const IntroChallenge = pgTable('IntroChallenge', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    lanId: integer().references(() => Lan.id).notNull(),
    type: IntroChallengeTypeEnum().notNull(),
    userId: integer().references(() => User.id).notNull(),
    scoreId: integer().references(() => Score.id),
});
export type IntroChallenge = typeof IntroChallenge.$inferSelect;

export default {
    User,
    usersRelations,
    UserRole,
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
    IntroChallenge,
};
