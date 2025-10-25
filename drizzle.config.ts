import { defineConfig } from 'drizzle-kit';

import { DATABASE_URL } from './environment';

export default defineConfig({
  dialect: 'postgresql',
  schema: './schema.ts',
  dbCredentials: { url: DATABASE_URL },
});
