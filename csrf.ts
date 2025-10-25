import { Request } from 'express';
import { csrfSync, CsrfSynchronisedProtection, CsrfTokenGenerator } from 'csrf-sync';

export type Csrf = {
    protect: CsrfSynchronisedProtection,
    generateToken: CsrfTokenGenerator,
}

export default function getCsrf(): Csrf {
    const csrf = csrfSync({
        getTokenFromRequest: (request: Request) => request.body.csrf,
    });
    return {
        protect: csrf.csrfSynchronisedProtection,
        generateToken: csrf.generateToken,
    }
}
