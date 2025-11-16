# TODO:

Objectives:
- Event start
  - Assign Discord roles
  - Assign team after start
- Codes for events
- Stress testing
  - Indexes
  - Cache assets
- Issues
  - Prevent moving events off the edge of the schedule
- Dashboard page
  - Fancy scores
  - Show highest recent scores
- Schedule
  - Click to see more
  - Warn about changing event after start???
    - Improve handling of existing timeslots
  - Colour code by location
  - Clip events and minimum visual length
- Show player scores
  - Show recent score animation
- Privacy policy
- Cookie policy

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
