# TODO:

Objectives:
- Show player team
- Fix all the dates
- Dashboard page
  - Teams
- Assign teams (Red vs. Blue)
- Check LAN eligibility
- Role check page
- Assign team roles button
- Schedule
  - CRUD
  - Schedule commands
  - Discord integration / sync
  - LTG integration
  - Colour code by location
- Full screen mode
- Score log pagination
- Assign points
  - Set event optional
  - Better player select
- Points for basic stuff:
  - Logging in Discord
  - Logging in with Steam
  - Playing a game
- QR code setup
  - Set event optional
  - Assign points
  - Print page
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
- Privacy policy
- Cookie policy

https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=440&key=12B147D46A513F406504BE202991C520&steamid=76561197961493121

pnpm start
pnpm run db:generate --name=add_users
pnpm run db:migrate

Notes:
- If someone becomes Staff, they will need to login again to get admin access
