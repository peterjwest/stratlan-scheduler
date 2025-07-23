import { integer, pgTable, boolean, varchar, json, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

import { SCORE_TYPES } from './constants';

export const User = pgTable('users', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    teamId: integer().references(() => Team.id),
    discordId: varchar().notNull().unique(),
    discordUsername: varchar().notNull(),
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

export const Session = pgTable('sessions', {
    sid: varchar().primaryKey().notNull(),
    sess: json().notNull(),
    expire: timestamp().notNull(),
}, (table) => [
    index('expire_idx').on(table.expire),
]);
export type Session = typeof Session.$inferSelect;

export const Team = pgTable('teams', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull().unique(),
});
export type Team = typeof Team.$inferSelect;

export const ScoreTypeEnum = pgEnum('ScoreType', SCORE_TYPES);

export const Score = pgTable('scores', {
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

export default {
    User,
    usersRelations,
    Session,
    Team,
    Score,
    scoreRelations,
};
