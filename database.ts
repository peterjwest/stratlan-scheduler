import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alias } from 'drizzle-orm/pg-core';
import { eq, isNotNull, sql, asc, desc, or, and, gt, lt, gte, not, inArray, isNull } from 'drizzle-orm';

import schema, {
    User,
    UserExtended,
    UserRole,
    UserLan,
    Team,
    Score,
    ScoreExtended,
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
import { LanData, EventData } from './validation';
import {
    TeamName,
    ScoreType,
    EVENT_TIMESLOT_MINUTES,
    IntroChallengeType,
    INTRO_CHALLENGE_TYPES,
    INTRO_CHALLENGE_POINTS,
    MODERATOR_ROLES,
} from './constants';
import { getTimeslotEnd, addDays, cacheCall, getTeam, fromNulls, toNulls } from './util';

export type DatabaseClient = NodePgDatabase<typeof schema>;

type UserData = {
    accessToken: string,
    discordUsername: string,
    discordNickname: string | undefined,
    discordAvatarId: string | undefined,
};

export function getDatabaseClient(postgresUrl: string): DatabaseClient {
    return drizzle(postgresUrl, { schema });
}

export async function getUserWithLan(
    db: DatabaseClient, lan: LanWithTeams, id: number,
): Promise<UserExtended | undefined> {

    const data = fromNulls((
        await db.select({ user: User, userLan: UserLan })
        .from(User)
        .leftJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
        .where(eq(User.id, id))
    )[0]);

    if (!data) return;
    return {
        ...data.user,
        team: lan && getTeam(lan, data.userLan?.teamId),
        isEnrolled: Boolean(data.userLan),
    };
}

export async function getUser(
    db: DatabaseClient, lan: LanWithTeams | undefined, userId: number,
): Promise<UserExtended | undefined> {

    if (lan) return getUserWithLan(db, lan, userId);

    const data = fromNulls((
        await db.select({ user: User })
        .from(User)
        .where(eq(User.id, userId))
    )[0]);

    if (!data) return;
    return { ...data.user, team: undefined, isEnrolled: false };
}

export async function checkIsAdmin(db: DatabaseClient, userId: number | undefined): Promise<boolean> {
    if (!userId) return false;
    return (
        await db.select({ id: UserRole.id })
        .from(UserRole)
        .where(and(eq(UserRole.userId, userId), inArray(UserRole.role, MODERATOR_ROLES)))
    ).length > 0;
}

export async function checkIsEligible(db: DatabaseClient, user: User, lan: Lan): Promise<boolean> {
    return (
        await db.select({ id: UserRole.id })
        .from(UserRole)
        .where(and(
            eq(UserRole.userId, user.id),
            or(eq(UserRole.role, lan.role || ''), inArray(UserRole.role, MODERATOR_ROLES))
        ))
    ).length > 0;
}

export async function getEvent(db: DatabaseClient, lan: Lan, eventId: number): Promise<Event | undefined> {
    return fromNulls(await db.query.Event.findFirst({ where: and(eq(Event.id, eventId), eq(Event.lanId, lan.id)) }));
}

export async function updateEvent(db: DatabaseClient, event: Event, data: EventData) {
    console.log(toNulls(data));
    await db.update(Event).set(toNulls(data)).where(eq(Event.id, event.id));
}

export async function getUserByDiscordId(db: DatabaseClient, discordId: string): Promise<User | undefined> {
    return fromNulls(await db.query.User.findFirst({ where: eq(User.discordId, discordId) }));
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
    discordNickname: string | undefined;
}

export async function getMinimalUsers(db: DatabaseClient, lan: Lan): Promise<MinimalUser[]> {
    return fromNulls(
        await db
        .select({ id: User.id, discordUsername: User.discordUsername, discordNickname: User.discordNickname })
        .from(User)
        .leftJoin(UserLan, eq(UserLan.userId, User.id))
        .where(eq(UserLan.lanId, lan.id))
    );
}

export async function createOrUpdateUserByDiscordId(
    db: DatabaseClient, discordId: string, data: UserData,
): Promise<User> {
    const existingUser = await getUserByDiscordId(db, discordId);
    if (existingUser) {
        return fromNulls((await db.update(User).set(toNulls(data)).where(eq(User.id, existingUser.id)).returning())[0]!);
    }
    return fromNulls((await db.insert(User).values({ discordId, ...data }).returning())[0]!);
}

export async function updateUser(db: DatabaseClient, userId: number, data: Partial<User>) {
    await db.update(User).set(toNulls(data)).where(eq(User.id, userId));
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
    return fromNulls((await db.insert(Score).values({
        type: 'Awarded',
        lanId: lan.id,
        teamId: team?.id,
        userId: user?.id,
        assignerId: assigner.id,
        points: points,
        reason: reason,
        eventId: event?.id,
    }).returning())[0]!);
}

export async function getScores(db: DatabaseClient, lan: LanWithTeams, type: ScoreType | undefined): Promise<ScoreExtended[]> {
    if (!lan) return [];

    const conditions = [eq(Score.lanId, lan.id), or(isNotNull(Score.teamId), isNotNull(UserLan.teamId))];
    if (type) conditions.push(eq(Score.type, type));

    const Assigner = alias(User, 'Assigner');
    const data = fromNulls(
        await db.select({ score: Score, event: Event, assigner: Assigner, user: User, userLan: UserLan })
        .from(Score)
        .leftJoin(Event, eq(Score.eventId, Event.id))
        .leftJoin(Assigner, eq(Score.assignerId, Assigner.id))
        .leftJoin(User, eq(Score.userId, User.id))
        .leftJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
        .orderBy(desc(Score.createdAt))
        .where(and(...conditions))
    );

    return data.map((item) => {
        return {
            ...item.score,
            team: getTeam(lan, item.userLan?.teamId || item.score.teamId),
            event: item.event,
            assigner: item.assigner,
            user: item.user && item.user,
        }
    });
}

export async function getTeamPoints(db: DatabaseClient, lan: Lan, team: Team): Promise<number> {
    const results = (
        await db.select({ total: sql`sum(${Score.points})`.mapWith(Number) })
        .from(Score)
        .leftJoin(User, eq(User.id, Score.userId))
        .leftJoin(UserLan, eq(UserLan.userId, User.id))
        .where(and(
            eq(Score.lanId, lan.id),
            or(eq(Score.teamId, team.id), eq(UserLan.teamId, team.id)),
        ))
    );
    return results[0]!.total || 0;
}

export async function getUserPoints(db: DatabaseClient, lan: Lan, user: User): Promise<number> {
    const results = (
        await db.select({ total: sql`sum(${Score.points})`.mapWith(Number) })
        .from(Score)
        .where(and(eq(Score.userId, user.id), eq(Score.lanId, lan.id)))
    );
    return results[0]!.total || 0;
}

export async function getEvents(db: DatabaseClient, lan: Lan): Promise<Event[]> {
    return fromNulls(await db.query.Event.findMany({
        where: and(
            eq(Event.isOfficial, true),
            eq(Event.lanId, lan.id)
        ),
        orderBy: [asc(Event.startTime)],
    }));
};

export async function getCurrentLan(db: DatabaseClient): Promise<LanWithTeams | undefined> {
    return fromNulls(await db.query.Lan.findFirst({
        where: gte(Lan.scheduleEnd, addDays(new Date(), -3)),
        orderBy: [asc(Lan.scheduleEnd)],
        with: { teams: true },
    }));
}

export const [getCurrentLanCached, clearCurrentLanCache] = cacheCall(getCurrentLan);

export async function getLans(db: DatabaseClient): Promise<LanWithTeams[]> {
    return fromNulls(await db.query.Lan.findMany({ orderBy: [asc(Lan.scheduleEnd)], with: { teams: true } }));
}

export const [getLansCached, clearLansCache] = cacheCall(getLans);

export async function getLan(db: DatabaseClient, lanId: number): Promise<LanWithTeams | undefined> {
    return fromNulls(await db.query.Lan.findFirst({ where: eq(Lan.id, lanId), with: { teams: true } }));
}

export async function createLan(db: DatabaseClient, data: Omit<Lan, 'id'>) {
    await db.insert(Lan).values({
        ...data,
        eventStart: data.eventStart || null,
        eventEnd: data.eventEnd || null,
    });

    clearCurrentLanCache();
    clearLansCache();
}

export async function updateLan(db: DatabaseClient, lan: Lan, data: LanData) {
    await db.update(Lan).set(toNulls(data)).where(eq(Lan.id, lan.id));

    clearCurrentLanCache();
    clearLansCache();
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

    return (await db.insert(Game).values({ id: gameId, name: gameName }).returning())[0]!;
}

export async function getGames(db: DatabaseClient): Promise<Game[]> {
    return db.query.Game.findMany();
}

export async function getGameActivity(
    db: DatabaseClient, gameId: string, startTime: Date,
): Promise<GameActivity | undefined> {
    return fromNulls(await db.query.GameActivity.findFirst({
        where: and(eq(GameActivity.gameId, gameId), eq(GameActivity.startTime, startTime)),
    }));
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
    return fromNulls(
        await db.select({
            id: GameActivity.id,
            lanId: GameActivity.lanId,
            userId: GameActivity.userId,
            teamId: UserLan.teamId,
            gameId: GameActivity.gameId,
            startTime: GameActivity.startTime,
            endTime: GameActivity.endTime,
        })
        .from(GameActivity)
        .leftJoin(User, eq(User.id, GameActivity.userId))
        .leftJoin(UserLan, and(eq(UserLan.userId, User.id), eq(UserLan.lanId, lan.id)))
        .where(and(
            eq(GameActivity.gameId, event.gameId),
            lt(GameActivity.startTime, getTimeslotEnd(eventTimeslot)),
            or(isNull(GameActivity.endTime), gt(GameActivity.endTime, eventTimeslot.time)),
        ))
    );
}

export async function getTimeslot(db: DatabaseClient, timeslotId: number): Promise<EventTimeslot | undefined> {
    return db.query.EventTimeslot.findFirst({ where: eq(EventTimeslot.id, timeslotId) });
}

export async function getIncompleteCommunityEvents(db: DatabaseClient, lan: Lan): Promise<EventWithTimeslots[]> {
    return fromNulls(await db.query.Event.findMany({
        where: and(
            eq(Event.lanId, lan.id),
            isNotNull(Event.gameId),
            gt(Event.points, sql`0`),
            gt(sql`NOW()`, Event.startTime),
            lt(Event.timeslotCount, sql`FLOOR(${Event.duration} / ${EVENT_TIMESLOT_MINUTES})`),
        ),
        with: { timeslots: { orderBy: [asc(EventTimeslot.time)] }},
    }));
}

export async function getOrCreateIntroChallenge(
    db: DatabaseClient, type: IntroChallengeType, lan: Lan, user: User,
): Promise<IntroChallenge> {
    const challenge = fromNulls(await db.query.IntroChallenge.findFirst({
        where: and(eq(IntroChallenge.type, type), eq(IntroChallenge.userId, user.id)),
    }));
    if (challenge) return challenge;
    return fromNulls((await db.insert(IntroChallenge).values({ lanId: lan.id, userId: user.id, type: type }).returning())[0]!);
}

type IntroChallengeMap = {
    [Key in IntroChallengeType]?: IntroChallenge
};

export async function getIntroChallenges(db: DatabaseClient, lan: Lan, user: User | undefined): Promise<IntroChallengeMap> {
    const challenges: IntroChallengeMap = Object.fromEntries(INTRO_CHALLENGE_TYPES.map((type) => [type, undefined]));
    if (user && lan) {
        const introChallenges = fromNulls(await db.query.IntroChallenge.findMany({
            where: and(eq(IntroChallenge.userId, user.id), eq(IntroChallenge.lanId, lan.id)),
        }));
        for (const introChallenge of introChallenges) {
            challenges[introChallenge.type] = introChallenge;
        }
    }
    return challenges;
}

export async function claimChallenge(db: DatabaseClient, lan: Lan, user: User, challengeId: number) {
    const introChallenge = fromNulls(await db.query.IntroChallenge.findFirst({
        where: and(
            eq(IntroChallenge.lanId, lan.id),
            eq(IntroChallenge.userId, user.id),
            eq(IntroChallenge.id, challengeId),
        ),
    }));
    if (!introChallenge) throw new Error('Challenge not completed yet');

    const score = fromNulls((await db.insert(Score).values({
        type: 'IntroChallenge',
        lanId: lan.id,
        userId: user.id,
        points: INTRO_CHALLENGE_POINTS[introChallenge.type],
    }).returning())[0]!);

    await db.update(IntroChallenge).set({ scoreId: score.id }).where(eq(IntroChallenge.id, challengeId));
}

export async function getOrCreateUserLan(db: DatabaseClient, user: User, lan: Lan): Promise<UserLan> {
    const userLan = fromNulls(await db.query.UserLan.findFirst({
        where: and(eq(UserLan.userId, user.id), eq(UserLan.lanId, lan.id)),
    }));
    if (userLan) return userLan;

    return fromNulls((await db.insert(UserLan).values({ userId: user.id, lanId: lan.id }).returning())[0]!);
}
