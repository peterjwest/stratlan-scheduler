import { eq, and } from 'drizzle-orm';
import zod from 'zod';

import { Cache } from './schema';
import { get, DatabaseClient } from './database';

const SessionTokenCache = zod.string();
export type SessionTokenCache = zod.infer<typeof SessionTokenCache>;

const CACHE_TYPES = {
    SESSION_TOKEN: SessionTokenCache,
} as const;

type CacheTypes = {
  [Property in keyof typeof CACHE_TYPES]: zod.infer<(typeof CACHE_TYPES)[keyof typeof CACHE_TYPES]>;
};

export async function getCache<Key extends keyof CacheTypes>(db: DatabaseClient, name: Key): Promise<CacheTypes[Key] | undefined> {
    const cache = await get(db.query.Cache.findFirst({ where: and(eq(Cache.name, name)) }));
    return cache ? CACHE_TYPES[name].parse(cache.value) as CacheTypes[Key] : undefined;
}

export async function setCache<Key extends keyof CacheTypes>(db: DatabaseClient, name: Key, value: CacheTypes[Key]): Promise<void> {
    await db.insert(Cache).values({ name, value }).onConflictDoUpdate({
        target: Cache.name,
        set: { value },
    });
}
