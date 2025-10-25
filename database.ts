import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, isNotNull, sql, asc, desc, or, and, gt, lt, gte, not, inArray, isNull } from 'drizzle-orm';
import { NodePgDatabase } from "drizzle-orm/node-postgres";

import schema, {
    User,
    UserWithRoles,
    UserRole,
    Team,
    Score,
    Event,
    EventTimeslot,
    EventWithTimeslots,
    Lan,
    LanWithTeams,
    Game,
    GameActivity,
    GameActivityWithTeam,
    IntroChallenge,
} from './schema';
import {
    TeamName,
    ScoreType,
    EVENT_TIMESLOT_MINUTES,
    IntroChallengeType,
    INTRO_CHALLENGE_TYPES,
    INTRO_CHALLENGE_POINTS,
} from './constants';
import { getTimeslotEnd, addDays, addMinutes, cacheCall } from './util';

export type DatabaseClient = NodePgDatabase<typeof schema>;

type UserData = {
    accessToken: string,
    discordUsername: string,
    discordNickname: string | null,
    discordAvatarId: string | null,
};

export function getDatabaseClient(postgresUrl: string): DatabaseClient {
    return drizzle(postgresUrl, { schema });
}

export async function getUser(db: DatabaseClient, id: number): Promise<UserWithRoles | undefined> {
    const user = await db.query.User.findFirst({ where: eq(User.id, id) });
    if (!user) return;

    const roles = await db.query.UserRole.findMany({ where: eq(UserRole.userId, id) });
    return { ...user, roles: roles.map((role) => role.role) }
}

export async function getEvent(db: DatabaseClient, lan: Lan, id: number): Promise<Event | undefined> {
    return db.query.Event.findFirst({ where: and(eq(Event.id, id), eq(Event.lanId, lan.id)) });
}

export async function getUserByDiscordId(db: DatabaseClient, discordId: string): Promise<User | undefined> {
    return db.query.User.findFirst({ where: eq(User.discordId, discordId) });
}

interface MinimalEvent {
    id: number;
    name: string;
}

export async function getMinimalEvents(db: DatabaseClient, lan: Lan): Promise<MinimalEvent[]> {
    return db.query.Event.findMany({ columns: { id: true, name: true }, where: eq(Event.lanId, lan.id) });
}

interface MinimalUser {
    id: number;
    discordUsername: string;
    discordNickname: string | null;
}

export async function getMinimalUsers(db: DatabaseClient, lan: Lan): Promise<MinimalUser[]> {
    return await db
        .select({ id: User.id, discordUsername: User.discordUsername, discordNickname: User.discordNickname })
        .from(User)
        .leftJoin(UserRole, eq(UserRole.userId, User.id))
        .where(eq(UserRole.role, lan.role || ''));
}

export async function createOrUpdateUserByDiscordId(
    db: DatabaseClient, discordId: string, data: UserData,
): Promise<User> {
    const existingUser = await getUserByDiscordId(db, discordId);
    if (existingUser) {
        return (await db.update(User).set(data).where(eq(User.id, existingUser.id)).returning())[0];
    }
    return (await db.insert(User).values({ discordId, ...data }).returning())[0];
}

export async function updateUser(db: DatabaseClient, userId: number, data: Partial<User>) {
    await db.update(User).set(data).where(eq(User.id, userId));
}

export async function updateRoles(db: DatabaseClient, user: User, roles: string[]) {
    await db.transaction(async (tx) => {
        await tx.delete(UserRole).where(eq(UserRole.userId, user.id));
        await tx.insert(UserRole).values(roles.map((role) => ({ userId: user.id, role })));
    });
}

export async function createTeams(db: DatabaseClient, lan: Lan, teamNames: readonly TeamName[]): Promise<Team[]> {
    const existingTeams = await db.query.Team.findMany();

    if (existingTeams.length === 0) {
        return db.insert(Team).values(teamNames.map((name) => ({ name, lanId: lan.id }))).returning();
    }

    const existingTeamNames = new Set(existingTeams.map((team) => team.name));
    if (existingTeamNames.difference(new Set(teamNames)).size > 0) {
        throw new Error('Incompatible teams have already been created on this database');
    }
    return existingTeams;
}

export async function awardScore(
    db: DatabaseClient,
    lan: Lan,
    assigner: User,
    points: number,
    reason: string | undefined,
    event: Event | undefined,
    teamOrUser: Team | User,
): Promise<Score> {
    let team: Team | undefined;
    let user: User | undefined;
    if ('name' in teamOrUser) {
        team = teamOrUser;
    } else {
        user = teamOrUser;
    }
    return (await db.insert(Score).values({
        type: 'Awarded',
        lanId: lan.id,
        teamId: team?.id,
        userId: user?.id,
        assignerId: assigner.id,
        points: points,
        reason: reason,
        eventId: event?.id,
    }).returning())[0];
}

export async function getScores(db: DatabaseClient, lan: Lan, type: ScoreType | undefined): Promise<Score[]> {
    if (!lan) return [];

    const conditions = [eq(Score.lanId, lan.id)];
    if (type) conditions.push(eq(Score.type, type));
    const scores = await db.query.Score.findMany({
        where: and(...conditions),
        with: { user: true, assigner: true, event: true },
        orderBy: [desc(Score.createdAt)],
    });
    for (const score of scores) {
        if (score.user) score.teamId = score.user.teamId;
    }
    return scores;
}

export async function getTeamPoints(db: DatabaseClient, lan: Lan, team: Team): Promise<number> {
    const results = (
        await db
            .select({ total: sql`sum(${Score.points})`.mapWith(Number) })
            .from(Score)
            .leftJoin(User, eq(User.id, Score.userId))
            .where(and(or(eq(Score.teamId, team.id), eq(User.teamId, team.id)), eq(Score.lanId, lan.id)))
    );
    return results[0].total || 0;
}

export async function getUserPoints(db: DatabaseClient, lan: Lan, user: User): Promise<number> {
    const results = (
        await db
            .select({ total: sql`sum(${Score.points})`.mapWith(Number) })
            .from(Score)
            .where(and(eq(Score.userId, user.id), eq(Score.lanId, lan.id)))
    );
    return results[0].total || 0;
}

export async function getEvents(db: DatabaseClient, lan: Lan): Promise<Event[]> {
    return db.query.Event.findMany({
        where: and(
            eq(Event.isOfficial, true),
            eq(Event.lanId, lan.id)
        ),
        orderBy: [asc(Event.startTime)],
    });
};

export async function getCurrentLan(db: DatabaseClient): Promise<LanWithTeams | undefined> {
    return db.query.Lan.findFirst({
        where: gte(Lan.scheduleEnd, addDays(new Date(), -3)),
        orderBy: [asc(Lan.scheduleEnd)],
        with: { teams: true },
    });
}

export const [getCurrentLanCached, clearCurrentLanCache] = cacheCall(getCurrentLan);

export async function getLans(db: DatabaseClient): Promise<LanWithTeams[]> {
    return db.query.Lan.findMany({ orderBy: [asc(Lan.scheduleEnd)], with: { teams: true }, });
}

export async function endFinishedActivities(db: DatabaseClient, user: User, activityIds: string[]): Promise<void> {
    await db.update(GameActivity).set({ endTime: sql`NOW()` }).where(and(
        eq(GameActivity.userId, user.id),
        not(inArray(GameActivity.gameId, activityIds)),
        isNull(GameActivity.endTime),
    ));
}

export async function getOrCreateGame(db: DatabaseClient, gameId: string, gameName: string): Promise<Game> {
    let game = await db.query.Game.findFirst({ where: eq(Game.id, gameId) });
    if (game) return game;

    return (await db.insert(Game).values({ id: gameId, name: gameName }).returning())[0];
}

export async function getGameActivity(
    db: DatabaseClient, gameId: string, startTime: Date,
): Promise<GameActivity | undefined> {
    return db.query.GameActivity.findFirst({
        where: and(eq(GameActivity.gameId, gameId), eq(GameActivity.startTime, startTime)),
    });
}

export async function createGameActivity(
    db: DatabaseClient, lan: Lan, user: User, gameId: string, gameName: string, startTime: Date,
) {
    const game = await getOrCreateGame(db, gameId, gameName);
    return (await db.insert(GameActivity).values({
        lanId: lan.id,
        userId: user.id,
        gameId: game.id,
        startTime: startTime,
    }).returning())[0];
}

export async function getOrCreateGameActivity(
    db: DatabaseClient, lan: Lan, user: User, gameId: string, gameName: string, startTime: Date,
) {
    const gameActivity = await getGameActivity(db, gameId, startTime);
    if (gameActivity) return gameActivity;
    await createGameActivity(db, lan, user, gameId, gameName, startTime);
}

export async function getTimeslotActivities(
    db: DatabaseClient, lan: Lan, event: Event, eventTimeslot: EventTimeslot,
): Promise<GameActivityWithTeam[]> {
    if (!event.gameId) return [];
    return db.select({
        id: GameActivity.id,
        lanId: GameActivity.lanId,
        userId: GameActivity.userId,
        teamId: User.teamId,
        gameId: GameActivity.gameId,
        startTime: GameActivity.startTime,
        endTime: GameActivity.endTime,
    }).from(GameActivity)
        .where(and(
            eq(GameActivity.gameId, event.gameId),
            lt(GameActivity.startTime, getTimeslotEnd(eventTimeslot)),
            or(isNull(GameActivity.endTime), gt(GameActivity.endTime, eventTimeslot.time)),
            eq(UserRole.role, lan.role || ''),
        ))
        .leftJoin(User, eq(User.id, GameActivity.userId))
        .leftJoin(UserRole, eq(UserRole.userId, User.id));
}

export async function getTimeslot(db: DatabaseClient, timeslotId: number): Promise<EventTimeslot | undefined> {
    return db.query.EventTimeslot.findFirst({ where: eq(EventTimeslot.id, timeslotId) });
}

export async function getIncompleteCommunityEvents(db: DatabaseClient, lan: Lan): Promise<EventWithTimeslots[]> {
    return db.query.Event.findMany({
        where: and(
            eq(Event.lanId, lan.id),
            isNotNull(Event.gameId),
            gt(Event.points, sql`0`),
            gt(sql`NOW()`, Event.startTime),
            lt(Event.timeslotCount, sql`FLOOR(${Event.duration} / ${EVENT_TIMESLOT_MINUTES})`),
        ),
        with: { timeslots: { orderBy: [asc(EventTimeslot.time)] } },
    });
}

export async function getOrCreateIntroChallenge(
    db: DatabaseClient, type: IntroChallengeType, lan: Lan, user: User,
): Promise<IntroChallenge> {
    const challenge = await db.query.IntroChallenge.findFirst({
        where: and(eq(IntroChallenge.type, type), eq(IntroChallenge.userId, user.id)),
    });
    if (challenge) return challenge;
    return (await db.insert(IntroChallenge).values({ lanId: lan.id, userId: user.id, type: type }).returning())[0];
}

type IntroChallengeMap = {
    [Key in IntroChallengeType]?: IntroChallenge
};

export async function getIntroChallenges(db: DatabaseClient, lan: Lan, user: User | undefined): Promise<IntroChallengeMap> {
    const challenges: IntroChallengeMap = Object.fromEntries(INTRO_CHALLENGE_TYPES.map((type) => [type, undefined]));
    if (user && lan) {
        const introChallenges = await db.query.IntroChallenge.findMany({
            where: and(eq(IntroChallenge.userId, user.id), eq(IntroChallenge.lanId, lan.id)),
        });
        for (const introChallenge of introChallenges) {
            challenges[introChallenge.type] = introChallenge;
        }
    }
    return challenges;
}

export async function claimChallenge(db: DatabaseClient, lan: Lan, user: User, challengeId: number) {
    const introChallenge = await db.query.IntroChallenge.findFirst({
        where: and(
            eq(IntroChallenge.lanId, lan.id),
            eq(IntroChallenge.userId, user.id),
            eq(IntroChallenge.id, challengeId),
        ),
    })
    if (!introChallenge) throw new Error('Challenge not completed yet');

    const score = (await db.insert(Score).values({
        type: 'IntroChallenge',
        lanId: lan.id,
        userId: user.id,
        points: INTRO_CHALLENGE_POINTS[introChallenge.type],
    }).returning())[0];

    await db.update(IntroChallenge).set({ scoreId: score.id }).where(eq(IntroChallenge.id, challengeId));
}
