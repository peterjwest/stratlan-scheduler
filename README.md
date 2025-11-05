# TODO:

Objectives:
- Issues
  - Allow multiple games per event
  - Prevent moving events off the edge of the schedule
- Dashboard page
  - Score over time algorithm
  - Fancy scores
  - Show latest scores
  - Show highest recent
- Schedule
  - Warn about changing event after start???
    - Existing timeslots?
  - Create event
  - Delete event
  - Schedule commands
  - Discord integration / sync
  - Colour code by location
  - Clip events and minimum visual length
- QR code setup
  - Set event optional
  - Assign points
  - Print page
- Admin
  - Scores page
    - Users page ordered by score
    - User page with score listing
    - Pagination?
  - Team managepage
    - Randomise
    - Assign team roles button
- Fix session storage for anonymous users (?)
- Privacy policy
- Cookie policy

## LATER:

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

https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=440&key=12B147D46A513F406504BE202991C520&steamid=76561197961493121

pnpm start
pnpm run db:generate --name=add_users
pnpm run db:migrate

Notes:
- If someone becomes Staff, they will need to login again to get admin access
