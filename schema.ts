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
    createdAt: timestamp().defaultNow(),
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
}));

export const Event = pgTable('Event', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull(),
    description: varchar().notNull(),
    startTime: timestamp().notNull(),
    duration: integer().notNull(),
    isOfficial: boolean().notNull(),
    createdBy: integer().references(() => User.id),
    createdAt: timestamp().defaultNow(),
});
export type Event = typeof Event.$inferSelect;

export const eventRelations = relations(Event, ({ one }) => ({
    user: one(User, {
        fields: [Event.createdBy],
        references: [User.id],
    }),
}));

export const Lan = pgTable('Lan', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull(),
    startDate: date({ mode: 'date' }).notNull(),
    endDate: date({ mode: 'date' }).notNull(),
});
export type Lan = typeof Lan.$inferSelect;


export default {
    User,
    usersRelations,
    Session,
    Team,
    Score,
    scoreRelations,
    Event,
    eventRelations,
    Lan,
};
