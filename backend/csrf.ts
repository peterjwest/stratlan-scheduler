import { csrfSync, CsrfSynchronisedProtection, CsrfTokenGenerator, CsrfSyncedToken } from 'csrf-sync';

export type Csrf = {
    protect: CsrfSynchronisedProtection,
    generateToken: CsrfTokenGenerator,
}

export default function getCsrf(): Csrf {
    const csrf = csrfSync({
        getTokenFromRequest: (request) => (request.body as { csrf?: CsrfSyncedToken }).csrf,
        getTokenFromState: (request) => request.session?.csrfToken,
        storeTokenInState: (request, token) => {
            if (request.session) request.session.csrfToken = token;
        },
    });
    return {
        protect: csrf.csrfSynchronisedProtection,
        generateToken: csrf.generateToken,
    };
}
