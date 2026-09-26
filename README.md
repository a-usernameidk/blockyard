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
