# TODO:

Objectives:

- Before launch
  - Assign Discord roles (or get permissions)
  - Interstitial privacy policy page

- Auto reload schedule/dashboard
- Event start
  - Assign team after start
- Codes for events
- Stress testing
  - Indexes
  - Cache assets
- Dashboard page
  - Fancy scores
  - Show highest recent scores
- Schedule - click to see more
- User createdAt/modifiedAt

## Nice to have

- Release notes
- Add recompute scores button
- Show recent score animation
- Schedule
  - Colour code by location

## LATER:

- Super admin
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
