# TODO:

Objectives:
- Dashboard page
  - Teams
- Assign teams (Red vs. Blue)
- Check LAN eligibility
- Schedule
  - CRUD
  - Schedule commands
  - Discord integration / sync
  - LTG integration
  - Colour code by location
- Full screen mode
- Assign points
  - Set event optional
  - Better player select
- QR code setup
  - Set event optional
  - Assign points
  - Print page
- Capture activities
  - Model: Activity (must be online status)
    - userId
    - gameId
    - gameName
    - startDate
    - endDate
  - Every 10 minutes, check every active Event (+1 min to end) against activities in the last 10 minutes, grouped by userId. If time per userId > 5 mins
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

https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=440&key=12B147D46A513F406504BE202991C520&steamid=76561197961493121

pnpm start
pnpm run db:generate --name=add_users
pnpm run db:migrate

Notes:
- If someone becomes Staff, they will need to login again to get admin access
