import { defineConfig } from 'drizzle-kit';

import environment from './environment';

export default defineConfig({
  dialect: 'postgresql',
  schema: './schema.ts',
  dbCredentials: { url: environment.DATABASE_URL },
});
