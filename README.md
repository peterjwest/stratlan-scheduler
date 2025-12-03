# TODO:

- React instead of pug
- DRY CSS
- Use tabs
- Winner animation!
- "Now" marker on schedule

## Nice to have

- Indexes
- Cache assets
- XHR collect points
- Interstitial privacy policy page
- Release notes
- Add recompute scores button
- Show animation for your own scores
- Schedule
  - Colour code by location
- External URL for printing

## LATER:

- Disambiguate between identically named events
- Super admin
- User createdAt/modifiedAt
- Schedule
  - Schedule commands
  - Discord integration / sync
- Achievements
  - CRUD
  - Monitor achievements
    - Every 10 minutes, check achievements for anyone in a relevant game
    - If achievement time inside activity time, give points
  - Teammate command
    - /achievement-teammate @username
    - Check they have the achievement
    - If achievement time inside activity time, give points
    - Limit to player count??
    - How to tell groups??
- Scehdule
  - LTG integration
- Teams page
  - Audit trail for team changes

https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=440&key=12B147D46A513F406504BE202991C520&steamid=76561197961493121

pnpm start
pnpm run db:generate --name=add_users
pnpm run db:migrate

Notes:
- If someone becomes Staff, they will need to login again to get admin access

https://github.com/getsentry/sentry-javascript/discussions/15916
https://www.npmjs.com/package/helmet
