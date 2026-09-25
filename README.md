# Blockyard

A block game website. Play built-in levels, build your own in the editor, share them with a code, and publish them so anyone can find them on Discover. There's also an early 3D obby mode.

It runs for free on Cloudflare. You don't install anything: you upload the files to GitHub and Cloudflare runs them. It works on school laptops and Chromebooks because it's just a website.

## What's in this folder

```
blockyard/
  wrangler.jsonc     Cloudflare settings (project name + database)
  src/worker.js      The server: saves published levels, plays, likes, reports
  schema.sql         The database tables (the server creates them by itself; this is just for reading)
  public/            The website
    index.html       The page
    admin.html       Your admin page for removing bad levels
    css/style.css    How everything looks
    js/main.js       Pages, menus, sharing, publishing
    js/format.js     The level format and the list of every block type
    js/engine2d.js   2D physics and rules (jumping, portals, enemies...)
    js/render2d.js   Drawing for the 2D game
    js/play2d.js     The game loop, controls, camera, score screen
    js/editor.js     The level editor
    js/levels.js     The built-in levels
    js/engine3d.js   The 3D beta engine
    js/levels3d.js   The 3D levels
    js/audio.js      Sound effects
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

- Open your site. The Games page should load.
- Open `https://blockyard.<your-account-name>.workers.dev/api/health`. It should say `{"ok":true,"db":true}`.
- Build a tiny level, press **Publish**, then open **Discover**. Your level should be there.

### 4. Turn on your admin page

This lets you hide or delete levels people report.

1. In Cloudflare, open your `blockyard` Worker → **Settings** → **Variables and Secrets** → **Add**.
2. Type: **Secret**. Name: `ADMIN_KEY`. Value: a long password only you know.
3. Save and deploy.
4. Go to `https://blockyard.<your-account-name>.workers.dev/admin.html` and type that password.

Optional: add another secret called `SALT` with any random text. It makes the anonymous visitor IDs harder to guess.

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

**3D beta:** a basic obby with WASD, jumping, lava, checkpoints and a goal. No 3D editor yet.

## Free limits

Loading the website is free and unlimited on Cloudflare. The server part (publishing, Discover, plays, likes) gets 100,000 requests a day free, and the database has its own free limits. That's plenty for you and your friends. If Blockyard ever gets really popular, Cloudflare's paid plan is $5 a month.

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

**I lost my edit key.** Published levels are saved in Your games with a secret edit key, in the browser you published from. If you clear that browser's data, you can't update that level anymore, but you can still publish a new copy.
