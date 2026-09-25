# Blockyard

A block game website. Play built-in levels, build your own in the editor, share them with a code, and publish them so anyone can find them on Discover. There's also an early 3D obby mode.

It runs for free on Cloudflare. You don't install anything: you upload the files to GitHub and Cloudflare runs them. It works on school laptops and Chromebooks because it's just a website.

## What's in this folder

```
blockyard/
  wrangler.jsonc     Cloudflare settings (project name + database)
  src/worker.js      The server: accounts, progress, published levels, daily board, admin
  schema.sql         The database tables (the server makes them by itself; this is just for reading)
  public/            The website
    index.html       The page
    css/style.css    How everything looks
    js/main.js       Screens, menus, accounts, closet, publishing, admin
    js/format.js     The level format and the list of every block type
    js/engine2d.js   2D physics and rules (jumping, portals, enemies...)
    js/render2d.js   Drawing for the 2D game
    js/art.js        Pip, the hats and the icons, all drawn in code
    js/play2d.js     The game loop, controls, camera, end screens
    js/editor.js     The level editor
    js/levels.js     The built-in levels (World 1 and World 2)
    js/progress.js   Stars, coins, achievements, saving your progress
    js/cosmetics.js  Everything in Pip's Closet
    js/endless.js    Builds Endless Rush and daily challenge courses
    js/replay.js     Records runs so the server can check them
    js/engine3d.js   The 3D beta engine
    js/levels3d.js   The 3D levels
    js/audio.js      Sound effects and music
    js/api.js        Saving in the browser + talking to the server
```

## Put it online (free, about 10 minutes)

### 1. Put the files on GitHub

1. Unzip `blockyard.zip`. On a Chromebook, open it in the Files app and copy the `blockyard` folder out.
2. Go to github.com, sign in, and click **New** to make a new repository. Name it `blockyard`. Leave it Public or pick Private, both work.
3. On the new empty repo page, click **uploading an existing file**.
4. Open the `blockyard` folder and drag everything **inside** it (`public`, `src`, `wrangler.jsonc`, `README.md`, `schema.sql`) onto the page. Don't drag the `blockyard` folder itself, or everything ends up one folder too deep.
5. Click **Commit changes**.

Check: on your repo's main page you should see `wrangler.jsonc` right there, not inside another folder.

### 2. Connect it to Cloudflare

1. Go to dash.cloudflare.com and make a free account.
2. In the left menu, open **Compute (Workers)** → **Workers & Pages** and click **Create**.
3. Pick **Import a repository**, connect your GitHub account, and choose the `blockyard` repo.
4. Set the project name to `blockyard` (it has to match `"name"` in `wrangler.jsonc`).
5. Leave the build command empty. The deploy command should be `npx wrangler deploy` (it usually fills this in for you).
6. Click **Deploy** and wait a minute or two.

Cloudflare reads `wrangler.jsonc`, creates the database for you (called `blockyard-db`), and puts your site at:

```
https://blockyard.<your-account-name>.workers.dev
```

### 3. Check it works

- Open your site. The title screen should load.
- Open `https://blockyard.<your-account-name>.workers.dev/api/health`. It should say `{"ok":true,"db":true,"accounts":true}`.
- Don't make an account yet. Do step 4 first.

### 4. Add two settings, then make your account

Do this **before anyone makes an account**.

1. Pick the username you want, for example `Liam`.
2. In Cloudflare, open your `blockyard` Worker, then **Settings**, then **Variables and Secrets**, then **Add**.
3. Type: **Secret**. Name: `SALT`. Value: any long random text, like a sentence mashed on the keyboard. It makes stored passwords much harder to crack. Set it once and **never change or delete it**, or every password stops working.
4. Add another: type **Text**, name `ADMIN_USERNAME`, value: the username from step 1. (More than one admin? Separate names with commas.) This makes that account the admin, who can hide or delete reported levels and ban players.
5. Save and deploy.
6. On your site, click **Log in**, then **Sign up**, and make the account with that exact username. Write down the recovery code it shows you.
7. Click your name: you'll see an **Admin** button.
8. Build a tiny level, press **Test** and beat it, then press **Publish**. Open **Discover**: your level should be there.

Only the server decides who is an admin, so nobody can fake it from their browser.

### Optional: longer winning runs

When someone publishes a level, the server replays their winning run to prove the level can be beaten. By default a winning run can be up to 2 minutes. Cloudflare's free plan only gives the server a tiny bit of computing time per request, so very long checks might fail. If you ever upgrade to the paid plan ($5 a month), you can add a variable `MAX_VERIFY_STEPS` set to `36000` to allow 5-minute runs.

## Making changes

Every time you change a file on GitHub, Cloudflare puts the new version online by itself in about a minute.

- To edit a file: open it on github.com, click the pencil icon, change it, then **Commit changes**.
- To see what's happening: Cloudflare → your Worker → **Deployments**.

Some easy things to try:

- **Change how forms feel:** the `RUSH` and `ADV` numbers at the top of `public/js/engine2d.js` (jump height, gravity, speed).
- **Add a built-in level:** build it in the editor, press Share, copy the code, then add it to `public/js/levels.js` (easiest way: ask Claude to turn the code into rows for you).
- **Add a new block type:** add it to `TILES` in `format.js`, make it do something in `engine2d.js`, and draw it in `render2d.js`.
- **Change colors:** the `THEMES` list in `render2d.js`, and the top of `css/style.css`.
- **Block more words in names:** the `BLOCKED` list in `format.js`.
- **Change prices or add hats:** `public/js/cosmetics.js` (new hats also need drawing in `drawHat` in `art.js`).
- **Add achievements:** the `ACHIEVEMENTS` list in `public/js/progress.js`.
- **Add Endless pieces:** the `CHUNKS` list in `public/js/endless.js`. Keep them short and beatable.

## Game modes

**Adventure:** move left and right, jump, collect coins and keys, stomp walkers, reach the Goal.

**Rush:** you run right on your own and only use one button. Portals switch your form:

| Form | How it moves |
| --- | --- |
| Hopper | Tap to jump, hold to keep jumping |
| Jet | Hold to fly up, let go to drop |
| Roller | Tap to flip gravity while rolling |
| Flapper | Tap for a little hop, even in the air |
| Dart | Hold to zig up, let go to zag down |
| Springer | Hold longer to jump higher |
| Snapper | Tap to snap to the ceiling or floor |
| Glider | Tap to flip gravity in midair |

There are also gravity, speed and tiny/full-size portals, plus jump rings, flip rings and bounce pads.

**Endless Rush:** one life, a random course made from hand-built pieces, and it keeps getting faster. Coins and distance earn you coins for the closet.

**Daily challenge:** one course per day, the same for everyone (it changes at midnight UTC). Your best run goes on the leaderboard. The server replays it to make sure nobody cheats.

**3D beta:** a basic obby with WASD, jumping, lava, checkpoints and a goal. No 3D editor yet.

## Progress, accounts and the closet

- **Guests** can play everything. Progress saves in that browser.
- **Accounts** need just a username and a password, no email. Progress (stars, coins, items, achievements) syncs to the server, so it follows you between school and home. When a guest makes an account, their progress comes along.
- **Stars:** every built-in level has 3: beat it, grab all the coins (or beat it without falling), and beat the target time (Adventure) or beat it without dying (Rush).
- **Coins** come from coins you grab in built-in levels (each counts once), new stars, achievements, Endless Rush and daily challenges. Spend them in **Pip's Closet** on colors, hats and trails. Some items unlock from stars or achievements instead.
- **Forgot your password?** Use **Lost password** with the recovery code from sign-up. There's no email, so that code is the only way back in.
- To publish, like or report levels you need an account. Publishing also needs you to have **beaten your own level in Test**.

## Free limits

Loading the website is free and unlimited on Cloudflare. The server part (accounts, publishing, Discover, the daily board) gets 100,000 requests a day free, and the database has its own free limits. That's plenty for you and your friends. If Blockyard ever gets really popular, Cloudflare's paid plan is $5 a month.

## Help

**The deploy failed and the log mentions the database.**
1. In Cloudflare, go to **Storage & databases** → **D1**. If there's no `blockyard-db`, click **Create** and name it `blockyard-db`.
2. Open it and copy its **Database ID**.
3. On GitHub, edit `wrangler.jsonc` and add the ID under `"database_name"`, like this:
   ```
   "database_name": "blockyard-db",
   "database_id": "paste-the-id-here"
   ```
4. Commit. Cloudflare deploys again.

**`/api/health` says `"db":false`.** The database isn't connected. Do the steps above.

**Discover says online games aren't turned on.** The site can't reach `/api`. Make sure you opened the `workers.dev` address, not a copy of the files somewhere else.

**My school blocks `workers.dev`.** Some school filters do. Nothing in the game can fix that. Playing at home works, and share codes still work anywhere the site loads.

**Updating from the older version.** Just upload the new files over the old ones. The database adds the new tables by itself. Levels published before accounts existed stay up, and can still be updated from the browser that published them. Then do step 4 again: `ADMIN_USERNAME` replaces the old `ADMIN_KEY` (you can delete `ADMIN_KEY`). If you already set `SALT` before, keep the same value.
