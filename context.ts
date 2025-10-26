import { Request } from 'express';

import { UserExtended, LanWithTeams, LanExtended } from './schema';
import { Helpers } from './helpers';

export type Context = {
    currentPath: string;
    currentUrl: string;
    discordAuthUrl: string;
    user: UserExtended | undefined;
    isAdmin: boolean;
    currentLan: LanExtended | undefined;
    lans: LanWithTeams[];
    helpers: Helpers;
}

type ContextWithLan = Context & {
    currentLan: LanWithTeams;
}

type ContextLoggedIn = ContextWithLan & {
    user: UserExtended;
}

export function getContext(request: Request): Context;
export function getContext(request: Request, mode: 'WITH_LAN'): ContextWithLan;
export function getContext(request: Request, mode: 'LOGGED_IN'): ContextLoggedIn;
export function getContext(request: Request, mode?: 'WITH_LAN' | 'LOGGED_IN'): Context | ContextLoggedIn | ContextLoggedIn {
    return request.context;
}
