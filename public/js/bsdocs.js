// Blockscript lessons, quick-insert buttons and the cheat sheet (shown in the Engine v2 editor's Scripts tab).
// A lesson can bring its own parts ("kit"): [name, shape, [dx, dy, dz] from where you're looking, [size], color, material, extra]

export const LESSONS = [
  {
    title: '1. Say hello',
    text: ['A script is a list of things to do. "on start" runs once when someone joins your world.', 'say("...") shows a message on the screen. Text always goes inside quotes.', 'Press "Use this code", then Test your world.'],
    code: `on start {\n  say("Welcome to my world!")\n}`,
  },
  {
    title: '2. Touch a part',
    text: ['Scripts find parts by their NAME. Click a part, then type a name in Properties > Name.', '"on touch" runs every time a player walks into a part with that name.', 'This lesson adds a red part named Button for you.'],
    code: `on touch "Button" {\n  say("You pressed the button!")\n  sound("coin")\n}`,
    kit: [['Button', 'cyl', [0, 0.15, 0], [3, 0.3, 3], '#e63946', 'neon']],
  },
  {
    title: '3. Open a door',
    text: ['part("Door") gets the part named Door. Then you tell it what to do with a dot: .hide() .show() .color("red")', 'wait(3) pauses this script for 3 seconds. Everything else keeps running.', 'Hidden parts can be walked through.'],
    code: `on touch "Button" {\n  door = part("Door")\n  door.hide()\n  say("The door is open for 3 seconds!")\n  wait(3)\n  door.show()\n}`,
    kit: [['Button', 'cyl', [-4, 0.15, 0], [3, 0.3, 3], '#e63946', 'neon'], ['Door', 'box', [3, 3, 0], [6, 6, 1], '#8b5a2b', 'planks']],
  },
  {
    title: '4. Keep score',
    text: ['A variable is a name that remembers a value. score = 0 makes one.', 'score += 1 adds 1 to it. board("Score", score) shows it at the top of the screen.', 'Every script in your world shares the same variables.'],
    code: `score = 0\nboard("Score", score)\n\non touch "Gem" {\n  score += 1\n  board("Score", score)\n  sound("coin")\n}`,
    kit: [['Gem', 'pyramid', [0, 1.5, 0], [2, 2, 2], '#4cc9f0', 'neon']],
  },
  {
    title: '5. If and else',
    text: ['"if" does something only when a thing is true. "else" is for when it is not.', 'true and false are values too. == means "is the same as". You can also use != < > <= >= and, or, not.', 'Grab the key first, then try the gate.'],
    code: `hasKey = false\n\non touch "Key" {\n  hasKey = true\n  part("Key").hide()\n  say("You got the key!")\n}\n\non touch "Gate" {\n  if hasKey {\n    part("Gate").hide()\n    say("The gate opens.")\n  } else {\n    say("It's locked. Find the key!")\n  }\n}`,
    kit: [['Key', 'cone', [-5, 1.5, 2], [1.5, 2, 1.5], '#ffd23f', 'neon'], ['Gate', 'box', [4, 3, 0], [6, 6, 1], '#8d99ae', 'metal']],
  },
  {
    title: '6. Move parts with code',
    text: ['.move(x, y, z, seconds) slides a part from where it is. .moveTo goes to an exact spot.', 'x is east/west, y is up/down, z is north/south. Players standing on a moving part ride along.', '.turn(x, y, z, seconds) turns it and .spin(x, y, z) keeps it spinning (degrees a second). .stop() stops it.'],
    code: `on touch "Lift" {\n  lift = part("Lift")\n  lift.move(0, 10, 0, 2)   // up 10 in 2 seconds\n  wait(4)\n  lift.move(0, -10, 0, 2)  // and back down\n  wait(2)\n}\n\non start {\n  part("Fan").spin(0, 180, 0)\n}`,
    kit: [['Lift', 'box', [-4, 0.5, 0], [5, 1, 5], '#3a86ff', 'metal'], ['Fan', 'box', [5, 3, 0], [8, 0.5, 1], '#ff7b25', 'plastic']],
  },
  {
    title: '7. Loops and random',
    text: ['"every 0.5 { }" runs again and again, every half second.', '"repeat 5 { }" runs 5 times. "while x < 10 { }" runs as long as it is true.', 'A list holds many values: colors[0] is the first one. random(0, 4) picks a whole number from 0 to 4.'],
    code: `colors = ["red", "yellow", "green", "blue", "purple"]\n\nevery 0.5 {\n  part("Disco").color(colors[random(0, 4)])\n}\n\non touch "Disco" {\n  repeat 3 {\n    launch(0, 14, 0)   // bounce the player up\n    wait(0.6)\n  }\n}`,
    kit: [['Disco', 'box', [0, 0.25, 0], [8, 0.5, 8], '#9b5de5', 'neon']],
  },
  {
    title: '8. Your own functions',
    text: ['"fn" makes your own command, so you write something once and use it many times.', 'The names in ( ) are its inputs. "return" gives a value back.', 'Functions work in every script of your world.'],
    code: `fn flash(p, times) {\n  repeat times {\n    p.color("white")\n    wait(0.15)\n    p.color("red")\n    wait(0.15)\n  }\n}\n\nfn double(n) {\n  return n * 2\n}\n\non touch "Alarm" {\n  flash(part("Alarm"), 4)\n  say("4 doubled is " + double(4))\n}`,
    kit: [['Alarm', 'ball', [0, 1.5, 0], [3, 3, 3], '#e63946', 'neon']],
  },
  {
    title: '9. Many parts at once',
    text: ['parts("Lamp") gives a list of EVERY part named Lamp.', '"for lamp in ..." does something with each one. "for i in 1..5" counts from 1 to 5.', 'len(list) is how many are in a list.'],
    code: `on touch "Switch" {\n  lamps = parts("Lamp")\n  for lamp in lamps {\n    lamp.color("yellow")\n    lamp.glow(1)\n    wait(0.2)\n  }\n  say(len(lamps) + " lamps are on!")\n}`,
    kit: [['Switch', 'cyl', [0, 0.15, 3], [2, 0.3, 2], '#5fc76b', 'neon'], ['Lamp', 'ball', [-5, 3, -2], [1.5, 1.5, 1.5], '#8d99ae', 'smooth'], ['Lamp', 'ball', [0, 3, -2], [1.5, 1.5, 1.5], '#8d99ae', 'smooth'], ['Lamp', 'ball', [5, 3, -2], [1.5, 1.5, 1.5], '#8d99ae', 'smooth']],
  },
  {
    title: '10. A real game: beat the clock',
    text: ['This puts everything together: variables, if, every, functions and the player.', 'player.x, player.y and player.z are where the player is. teleport(x, y, z) moves them, kill() sends them back, win() finishes an obby.', 'Change the numbers and make it yours!'],
    code: `timeLeft = 20\nrunning = false\n\nfn reset() {\n  timeLeft = 20\n  running = false\n  board("Time", "touch Start")\n}\nreset()\n\non touch "Start" {\n  if not running {\n    running = true\n    say("Go! Reach the Finish in 20 seconds!")\n    speed(1.5)\n  }\n}\n\nevery 1 {\n  if running {\n    timeLeft -= 1\n    board("Time", timeLeft)\n    if timeLeft <= 0 {\n      say("Too slow!")\n      speed(1)\n      kill()\n      reset()\n    }\n  }\n}\n\non touch "Finish" {\n  if running {\n    say("You made it with " + timeLeft + " seconds left!")\n    speed(1)\n    reset()\n    win()\n  }\n}`,
    kit: [['Start', 'box', [-8, 0.15, 0], [3, 0.3, 3], '#5fc76b', 'neon'], ['Finish', 'box', [10, 0.15, 0], [3, 0.3, 3], '#ffd23f', 'neon']],
  },
  {
    title: '11. Fixing mistakes',
    text: ['Everyone makes mistakes in code. Blockscript tells you the LINE and what it expected.', 'Under the editor it says "No mistakes" or shows the first one. Most are a missing " or } or ).', 'While you Test, print(...) writes to the little log in the corner, so you can see what your variables are. Mistakes that happen while playing show there too.', 'A loop that never stops must have a wait() inside, or the game stops it.'],
    code: `on start {\n  lives = 3\n  print("lives is", lives)   // shows in the log while testing\n\n  while lives > 0 {\n    lives -= 1\n    print("now", lives)\n    wait(1)                   // loops that keep going need a wait\n  }\n  say("Done!")\n}`,
  },
];

// quick-insert buttons: [label, code]
export const SNIPPETS = [
  ['on start', 'on start {\n  \n}\n'], ['on touch', 'on touch "Name" {\n  \n}\n'], ['on leave', 'on leave "Name" {\n  \n}\n'], ['every', 'every 1 {\n  \n}\n'],
  ['on die', 'on die {\n  \n}\n'], ['say', 'say("Hello!")\n'], ['wait', 'wait(1)\n'], ['if / else', 'if x > 0 {\n  \n} else {\n  \n}\n'],
  ['repeat', 'repeat 5 {\n  \n}\n'], ['for', 'for i in 1..10 {\n  \n}\n'], ['function', 'fn name(a, b) {\n  return a + b\n}\n'], ['get a part', 'p = part("Name")\n'],
  ['move part', 'part("Name").move(0, 5, 0, 1)\n'], ['hide / show', 'part("Name").hide()\nwait(2)\npart("Name").show()\n'], ['color', 'part("Name").color("red")\n'], ['score board', 'board("Score", score)\n'],
  ['teleport', 'teleport(500, 5, 500)\n'], ['random', 'n = random(1, 6)\n'],
  ['on use', 'on use {\n  c = near("Name", 4)\n  if c { c.hide() }\n}\n'], ['prompt', 'every 0.2 {\n  if near("Name", 4) { prompt("Pick up") } else { prompt("") }\n}\n'], ['button', 'button("Boost")\non press "Boost" {\n  speed(2)\n  wait(5)\n  speed(1)\n}\n'],
  ['get in a car', 'for p in parts("Car") { p.solid(false) }\nteleport(part("Seat").x, part("Seat").y - 1, part("Seat").z)\nface(90)\nfor p in parts("Car") { p.follow() }\ndrive(30, 100, 1)\n'], ['save / load', 'money = load("money", 0)\nsave("money", money)\n'],
];

// the cheat sheet: [heading, [[code, what it does], ...]]
export const REFERENCE = [
  ['When things happen', [['on start { }', 'once, when a player joins'], ['on touch "Name" { }', 'a player walks into that part'], ['on leave "Name" { }', 'a player stops touching it'], ['every 2 { }', 'again and again, every 2 seconds'], ['on die { }  on coin { }  on checkpoint { }  on jump { }  on land { }', 'when that happens to the player']]],
  ['Values', [['score = 0', 'make or change a variable (shared by all scripts)'], ['let x = 5', 'a variable only for this { } block'], ['x += 1   x -= 1   x *= 2   x /= 2', 'change a number'], ['"text"  12.5  true  false  nil', 'text, numbers, yes/no, nothing'], ['[1, 2, 3]   list[0]   len(list)   push(list, 4)   pop(list)', 'lists (the first spot is 0)'], ['"Score: " + score', 'glue text and numbers together']]],
  ['Choices and loops', [['if a == b { } else if a > b { } else { }', 'choose'], ['==  !=  <  >  <=  >=  and  or  not', 'compare'], ['repeat 10 { }', 'do it 10 times'], ['while x < 10 { }', 'keep going while true'], ['for i in 1..10 { }   for p in list { }', 'count, or go through a list'], ['break   continue', 'leave a loop / skip to the next round'], ['fn name(a, b) { return a + b }', 'your own command'], ['wait(1.5)', 'pause this script (not the game)']]],
  ['Parts', [['part("Name")', 'the part with that name'], ['parts("Name")', 'a list of all parts with that name'], ['p.move(x, y, z, secs)   p.moveTo(x, y, z, secs)', 'slide it'], ['p.turn(x, y, z, secs)   p.turnTo(x, y, z, secs)', 'turn it (degrees)'], ['p.spin(x, y, z)   p.stop()', 'keep spinning (degrees a second) / stop'], ['p.hide()   p.show()   p.solid(false)', 'gone and walk-through / back / only walk-through'], ['p.color("red")   p.color("#ff8800")', 'red orange yellow green blue purple pink white black gray brown cyan lime gold'], ['p.glow(1)   p.see(0.5)   p.size(x, y, z)', 'glow, see-through (0 to 1), new size'], ['p.x  p.y  p.z  p.sx  p.sy  p.sz  p.rx  p.ry  p.rz  p.hidden  p.name  p.color()', 'read things about it']]],
  ['The player', [['player.x  player.y  player.z', 'where they are'], ['player.coins  player.deaths  player.time', 'their numbers'], ['teleport(x, y, z)', 'move them'], ['launch(x, y, z)', 'throw them (y is up)'], ['speed(2)   jump(1.5)   gravity(0.5)', '1 is normal'], ['kill()   win()   checkpoint()', 'back to the checkpoint / finish the obby / save here']]],
  ['Screen, sound, math', [['say("Hi")', 'a message on screen'], ['board("Score", 5)', 'a number at the top (board("Score") removes it)'], ['print(a, b)', 'write to the test log'], ['sound("coin")', 'coin jump win die pop badge bounce checkpoint speed'], ['random(1, 6)   random()', 'a whole number 1 to 6 / a number 0 to 1'], ['time()', 'seconds since the world started'], ['abs floor ceil round min max sqrt sin cos', 'math (sin and cos use degrees)'], ['str(5)   num("5")   type(x)', 'turn into text / a number / what kind it is']]],
  ['Use key, cars, held things (update 20)', [['on use { }', 'the player pressed Use (F, or the Use button on a phone)'], ['near("Can", 4)', 'the closest part named Can within 4 studs, or nil'], ['near(p, 4)   dist(p)', 'is part p that close? / how far is it?'], ['sees(p, 40)   looking(p, 50)', 'can part p see the player (no wall between, 40 studs)? / is p on the player\'s screen?'], ['prompt("Pick up")', 'the hint next to the Use key (prompt("") hides it)'],
    ['p.follow()', 'glue a part to the player where it is now (a car you sat in)'], ['p.follow(right, up, forward)', 'glue it at that spot (a tool in the hand, a lamp)'], ['p.unfollow()', 'let it go'],
    ['drive(34, 95, 1)', 'walking becomes driving: top speed, how fast it turns, seat height'], ['sail(18, 85)', 'the same, but it floats on water'], ['walk()', 'back on foot'], ['face(90)', 'look east (0 north, 180 south). A car drives the way you face'],
    ['player.vel  .facing  .driving  .swimming  .grounded', 'speed, direction and what the player is doing']]],
  ['Buttons, other players, the look, saving (update 20)', [['button("Boost")   on press "Boost" { }', 'a button on the screen (keys 1 to 9). button("Boost", false) removes it'],
    ['send("blast", 5)   on message "blast" { }', 'tell every player\'s script in this server. Inside: from = [name, x, y, z], value, mine'],
    ['on crown { }   on uncrown { }', 'you got / lost the crown (World tab: Crown)'], ['player.crowned   crowned()   crownTime()', 'do I have it / who has it / seconds left'],
    ['dark(0.8)   mono(true)', 'dim the sun and sky (lamps still shine) / take the color away'],
    ['save("money", 12)   load("money", 0)', 'remember a value on this device (hangouts only; obbies always start fresh)'],
    ['let x = 5 inside fn', 'names without let are shared by the whole world: use let inside functions so they can\'t clash']]],
  ['Limits (they keep worlds safe and fast)', [['20 scripts, 20,000 letters each', ''], ['Loops that never wait are stopped', 'put wait() in long loops'], ['Scripts can only change the world', 'no internet, no files, nothing outside the game']]],
];
