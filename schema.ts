import {
    integer, pgTable, boolean, varchar, json, date, timestamp, index, pgEnum, check, unique, primaryKey
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

import { NullToUndefined } from './util';
import { SCORE_TYPES, INTRO_CHALLENGE_TYPES } from './constants';

export const User = pgTable('User', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    discordId: varchar().notNull().unique(),
    discordUsername: varchar().notNull(),
    discordNickname: varchar(),
    discordAvatarId: varchar(),
    accessToken: varchar(),
    steamId: varchar(),
    steamUsername: varchar(),
    steamAvatar: varchar(),
    seatPickerName: varchar(),
});
export type User = NullToUndefined<typeof User.$inferSelect>;
export type UserExtended = User & { team: Team | undefined, isEnrolled: boolean };
export type UserExtendedWithGroups = UserExtended & { groups: Group[] };

export const userRelations = relations(User, ({ many }) => ({
    userLans: many(UserLan),
    roles: many(UserRole),
}));


export const UserRole = pgTable('UserRole', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer().references(() => User.id).notNull(),
    role: varchar().notNull(),
});
export type UserRole = NullToUndefined<typeof UserRole.$inferSelect>;

export const userRoleRelations = relations(UserRole, ({ one }) => ({
    user: one(User, {
        fields: [UserRole.userId],
        references: [User.id],
    }),
}));

export const Group = pgTable('Group', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull().unique(),
});
export type Group = NullToUndefined<typeof Group.$inferSelect>;
export type GroupWithMembers = Group & { members: UserExtended[] };

export const UserGroup = pgTable('UserGroup', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer().references(() => User.id).notNull(),
    groupId: integer().references(() => Group.id).notNull(),
});
export type UserGroup = NullToUndefined<typeof UserGroup.$inferSelect>;

export const Session = pgTable('Session', {
    sid: varchar().primaryKey().notNull(),
    sess: json().notNull(),
    expire: timestamp().notNull(),
}, (table) => [
    index('Session_expire_idx').on(table.expire),
]);
export type Session = NullToUndefined<typeof Session.$inferSelect>;

export const Team = pgTable('Team', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull(),
    lanId: integer().references(() => Lan.id).notNull(),
}, (table) => [
    unique('Team_name_and_lan_unique').on(table.name, table.lanId),
]);
export type Team = NullToUndefined<typeof Team.$inferSelect>;
export type TeamWithMembers = Team & { members: UserExtended[] };

export const teamRelations = relations(Team, ({ one }) => ({
    lan: one(Lan, {
        fields: [Team.lanId],
        references: [Lan.id],
    }),
}));


export const UserLan = pgTable('UserLan', {
    userId: integer().references(() => User.id).notNull(),
    lanId: integer().references(() => Lan.id).notNull(),
    teamId: integer().references(() => Team.id),
}, (table) => [
    primaryKey({ columns: [table.userId, table.lanId] }),
    unique('UserLan_teamId_lanId_userId_unique').on(table.teamId, table.lanId, table.userId),
]);
export type UserLan = NullToUndefined<typeof UserLan.$inferSelect>;

export const userLanRelations = relations(UserLan, ({ one }) => ({
    user: one(User, {
        fields: [UserLan.userId],
        references: [User.id],
    }),
    team: one(Team, {
        fields: [UserLan.teamId],
        references: [Team.id],
    }),
}));

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
    hiddenCodeId: integer().references(() => HiddenCode.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
}, (table) => [
    // TODO: More constraints
    check(
        "Team_teamId_or_userId",
        sql`(${table.teamId} IS NOT NULL AND ${table.userId} IS NULL) OR (${table.teamId} IS NULL AND ${table.userId} IS NOT NULL)`,
    ),
]);
export type Score = NullToUndefined<typeof Score.$inferSelect>;
export type ScoreExtended = Score & {
    team: Team | undefined,
    event: Event | undefined,
    assigner: User | undefined,
    user: User | undefined,
};

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
    isCancelled: boolean().notNull().default(false),
    gameId: integer().references(() => Game.id),
    points: integer().notNull().default(0),
    timeslotCount: integer().notNull().default(0),
    createdBy: integer().references(() => User.id),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
});
export type Event = NullToUndefined<typeof Event.$inferSelect>;
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
export type EventTimeslot = NullToUndefined<typeof EventTimeslot.$inferSelect>;

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
    seatPickerCode: varchar(),
    scheduleStart: date({ mode: 'date' }).notNull(),
    scheduleEnd: date({ mode: 'date' }).notNull(),
    eventStart: timestamp({ withTimezone: true }),
    eventEnd: timestamp({ withTimezone: true }),
});
export type Lan = NullToUndefined<typeof Lan.$inferSelect>;
export type LanWithTeams = Lan & { teams: Team[] };
export type LanExtended = Lan & {
    teams: Team[],
    isStarted: boolean,
    isEnded: boolean,
    isActive: boolean,
    progress: number,
};

export const lanRelations = relations(Lan, ({ many }) => ({
    teams: many(Team),
}));

export const GameActivity = pgTable('GameActivity', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    lanId: integer().references(() => Lan.id).notNull(),
    userId: integer().references(() => User.id).notNull(),
    gameId: integer().references(() => Game.id).notNull(),
    startTime: timestamp({ withTimezone: true }).notNull(),
    endTime: timestamp({ withTimezone: true }),
});
export type GameActivity = NullToUndefined<typeof GameActivity.$inferSelect>;
export type GameActivityWithTeam = GameActivity & { teamId: number | undefined };

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
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull().unique(),
});
export type Game = NullToUndefined<typeof Game.$inferSelect>;

export const GameIdentifier = pgTable('GameIdentifier', {
    id: varchar().primaryKey().notNull(),
    gameId: integer().references(() => Game.id).notNull(),
});
export type GameIdentifier = NullToUndefined<typeof GameIdentifier.$inferSelect>;

export const IntroChallengeTypeEnum = pgEnum('IntroChallengeType', INTRO_CHALLENGE_TYPES);

export const IntroChallenge = pgTable('IntroChallenge', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    lanId: integer().references(() => Lan.id).notNull(),
    type: IntroChallengeTypeEnum().notNull(),
    userId: integer().references(() => User.id).notNull(),
    scoreId: integer().references(() => Score.id),
});
export type IntroChallenge = NullToUndefined<typeof IntroChallenge.$inferSelect>;

export const Cache = pgTable('Cache', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar().notNull().unique(),
    value: json().notNull(),
});
export type Cache = NullToUndefined<typeof Cache.$inferSelect>;

export const HiddenCode = pgTable('HiddenCode', {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    number: integer().notNull(),
    name: varchar().notNull().unique(),
    lanId: integer().references(() => Lan.id).notNull(),
    code: varchar().notNull(),
}, (table) => [
    unique('HiddenCode_number_and_lan_unique').on(table.number, table.lanId),
    unique('HiddenCode_code_and_lan_unique').on(table.code, table.lanId),
]);
export type HiddenCode = NullToUndefined<typeof HiddenCode.$inferSelect>;
export type HiddenCodeExtended = HiddenCode & { url: string };

export default {
    User,
    userRelations,
    UserRole,
    userRoleRelations,
    Group,
    UserGroup,
    Session,
    Team,
    teamRelations,
    UserLan,
    userLanRelations,
    Score,
    scoreRelations,
    Event,
    eventRelations,
    EventTimeslot,
    eventTimeslotRelations,
    Lan,
    lanRelations,
    GameActivity,
    gameActivityRelations,
    Game,
    GameIdentifier,
    IntroChallenge,
    Cache,
    HiddenCode,
};
