import  { RequestHandler } from 'express';
import expressSession from 'express-session';
import connectPgSimple from 'connect-pg-simple';

import { SECURE_COOKIE, SESSION_SECRET, DATABASE_URL } from './environment';
import { COOKIE_MAX_AGE } from './constants';

export function getExpressSession(): RequestHandler {
    const SessionStore = connectPgSimple(expressSession);
    return expressSession({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, secure: SECURE_COOKIE, maxAge: COOKIE_MAX_AGE },
        store: new SessionStore({ conString: DATABASE_URL, tableName: 'Session' }),
    });
}

export function getConditionalSession(expressSession: RequestHandler): RequestHandler {
    return (request, response, next) => {
        if ('connect.sid' in request.cookies) {
            return expressSession(request, response, next);
        }
        next();
    }
}
