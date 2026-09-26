# Blockyard

A block game website in 2D and 3D. Play built-in levels and obbies, hang out with other players in 3D worlds and chat, build levels and worlds with your friends at the same time, publish them, earn coins, and trade closet items.

It runs for free on Cloudflare. You don't install anything: you upload the files to GitHub and Cloudflare runs them. It works on school laptops and Chromebooks because it's just a website.

## What's in this folder

```
blockyard/
  wrangler.jsonc       Cloudflare settings (name, database, live rooms, admin name)
  schema.sql           The database tables (the server makes them by itself; this is just for reading)
  src/
    worker.js          The server: accounts, games, projects, servers, daily board, admin
    econ.js            Coins, the shop, trades, and paying out for checked runs
    room.js            Live rooms: 3D servers with chat, building together, checking runs
    util.js            Small helpers
  public/              The website
    index.html         The page
    css/style.css      How everything looks
    js/main.js         Starts everything
    js/app.js          Shared bits: pages, pop-ups, toasts
    js/pages/          One file per page: home, play, worlds, create, closet, profile, admin, account
    js/format.js       The 2D level format and every 2D block type
    js/engine2d.js     2D physics and rules
    js/render2d.js     2D drawing
    js/play2d.js       The 2D game loop
    js/editor.js       The 2D editor
    js/levels.js       Built-in 2D levels
    js/endless.js      Endless Rush and daily courses
    js/replay.js       Records runs so the server can check them
    js/world.js        The 3D world format and every 3D block type
    js/physics3d.js    3D movement and rules (the server uses the same file to check runs)
    js/gl.js           The 3D renderer (plain WebGL, made for Blockyard)
    js/avatar3d.js     3D Pip and every hat
    js/play3d.js       Being in a 3D world: camera, players, chat, emotes
    js/build3d.js      The 3D builder
    js/worlds3d.js     Built-in 3D worlds (the Plaza and three obbies)
    js/thumb3d.js      The little world pictures on cards
    js/net.js          Talking to live rooms
    js/progress.js     Stars, badges, stats
    js/cosmetics.js    Everything in Pip's Closet and what it's worth
    js/art.js          Pip, hats and icons drawn in code
    js/audio.js        Sound effects and music
    js/api.js          Saving in the browser + talking to the server
```

