# TODO:

- Webserver
  - Schedule page
  - Dashboard page
- Heroku or AWS

Data model:
- Event
  - isOfficial
  - ownerId
  - startDate
  - endDate
  - gameId

- Activity (must be online status)
  - userId
  - gameId
  - gameName
  - startDate
  - endDate

Every 10 minutes, check every active Event (+1 min to end) against activities in the last 10 minutes, grouped by userId. If time per userId > 5 mins

Achievements:
You can tag your friend who already has the achievement:
/steam-username username
/check-achievements
/set-teammate @username

https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=440&key=12B147D46A513F406504BE202991C520&steamid=76561197961493121

npx drizzle-kit generate --name=add_users
npx drizzle-kit migrate

Notes:
- If someone becomes Staff, they will need to login again to get admin access
