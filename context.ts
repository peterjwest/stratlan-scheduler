import { Request } from 'express';

import { UserWithRoles, Team, LanWithTeams } from './schema';
import { Helpers } from './helpers';

export type Context = {
    currentPath: string;
    currentUrl: string;
    discordAuthUrl: string;
    user: UserWithRoles | undefined;
    team: Team | undefined;
    currentLan: LanWithTeams | undefined;
    lanStarted: boolean;
    lanEnded: boolean;
    lans: LanWithTeams[];
    helpers: Helpers;
}

type ContextWithLan = Context & {
    currentLan: LanWithTeams;
}

type ContextLoggedIn = ContextWithLan & {
    user: UserWithRoles;
}

export function getContext(request: Request): Context;
export function getContext(request: Request, mode: 'WITH_LAN'): ContextWithLan;
export function getContext(request: Request, mode: 'LOGGED_IN'): ContextLoggedIn;
export function getContext(request: Request, mode?: 'WITH_LAN' | 'LOGGED_IN'): Context | ContextLoggedIn | ContextLoggedIn {
    return request.context;
}
