// Blockyard 3D (beta): a tiny block-world obby engine using plain WebGL.
// Everything is 1x1x1 blocks. The player is a box that runs, jumps and respawns.
// It is deliberately basic: no editor yet, no textures, no moving parts.

export const B = { grass: 1, stone: 2, wood: 3, lava: 4, check: 5, goal: 6, bounce: 7, brick: 8 };
const TOP = { 1: [0.37, 0.78, 0.42], 2: [0.62, 0.65, 0.75], 3: [0.80, 0.56, 0.31], 4: [1.0, 0.42, 0.12], 5: [0.30, 0.86, 0.52], 6: [1.0, 0.82, 0.25], 7: [1.0, 0.36, 0.56], 8: [0.86, 0.38, 0.32] };
const SIDE = { 1: [0.70, 0.48, 0.28], 2: [0.62, 0.65, 0.75], 3: [0.72, 0.48, 0.25], 4: [1.0, 0.36, 0.1], 5: [0.62, 0.65, 0.75], 6: [0.95, 0.70, 0.18], 7: [0.45, 0.26, 0.60], 8: [0.80, 0.34, 0.29] };

const SKY = [0.49, 0.78, 1.0];
const GRAV = 32, JUMP = 11.5, SPEED = 6.5, BOUNCE = 17;
const HW = 0.3, HH = 1.8; // player half-width and height

/* ---------------- tiny matrix math (column-major, like WebGL wants) ---------------- */
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(e, c, up) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
}
function model(x, y, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1]);
}

/* ---------------- geometry ---------------- */
// Faces: [normal axis, direction, shade, 4 corners]
const FACES = [
  { d: [0, 1, 0], shade: 1.0, v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { d: [0, -1, 0], shade: 0.5, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { d: [1, 0, 0], shade: 0.8, v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { d: [-1, 0, 0], shade: 0.72, v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { d: [0, 0, 1], shade: 0.66, v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { d: [0, 0, -1], shade: 0.86, v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
function pushQuad(out, corners, col) {
  for (const i of [0, 1, 2, 0, 2, 3]) out.push(corners[i][0], corners[i][1], corners[i][2], col[0], col[1], col[2]);
}
function buildWorld(blocks, has) {
  const out = [];
  for (const [x, y, z, t] of blocks) {
    const check = ((x + y + z) & 1) ? 0.93 : 1;
    for (const f of FACES) {
      if (has(x + f.d[0], y + f.d[1], z + f.d[2])) continue;
      const base = f.d[1] === 1 ? TOP[t] : SIDE[t];
      const k = f.shade * check;
      const col = [base[0] * k, base[1] * k, base[2] * k];
      pushQuad(out, f.v.map((v) => [x + v[0], y + v[1], z + v[2]]), col);
    }
  }
  // a big sea far below, so you can tell up from down
  const S = 400, Y = -9;
  pushQuad(out, [[-S, Y, -S], [-S, Y, S], [S, Y, S], [S, Y, -S]], [0.33, 0.62, 0.92]);
  return new Float32Array(out);
}
function box(out, x0, y0, z0, x1, y1, z1, col) {
  for (const f of FACES) {
    const k = f.shade;
    pushQuad(out, f.v.map((v) => [v[0] ? x1 : x0, v[1] ? y1 : y0, v[2] ? z1 : z0]), [col[0] * k, col[1] * k, col[2] * k]);
  }
}
function buildPlayer(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const out = [];
  box(out, -0.28, 0, -0.14, -0.02, 0.75, 0.14, [0.23, 0.26, 0.45]);
  box(out, 0.02, 0, -0.14, 0.28, 0.75, 0.14, [0.23, 0.26, 0.45]);
  box(out, -0.32, 0.75, -0.18, 0.32, 1.35, 0.18, c);
  box(out, -0.48, 0.8, -0.12, -0.33, 1.32, 0.12, c);
  box(out, 0.33, 0.8, -0.12, 0.48, 1.32, 0.12, c);
  box(out, -0.22, 1.35, -0.22, 0.22, 1.8, 0.22, [1.0, 0.84, 0.35]);
  box(out, -0.14, 1.52, -0.23, -0.06, 1.64, -0.21, [0.11, 0.14, 0.25]);
  box(out, 0.06, 1.52, -0.23, 0.14, 1.64, -0.21, [0.11, 0.14, 0.25]);
  return new Float32Array(out);
}

const VS = `attribute vec3 aPos; attribute vec3 aCol;
uniform mat4 uProj, uView, uModel; varying vec3 vCol; varying float vDist;
void main(){ vec4 v = uView * uModel * vec4(aPos, 1.0); vDist = length(v.xyz); vCol = aCol; gl_Position = uProj * v; }`;
const FS = `precision mediump float; varying vec3 vCol; varying float vDist; uniform vec3 uFog;
void main(){ float f = smoothstep(35.0, 90.0, vDist); gl_FragColor = vec4(mix(vCol, uFog, f), 1.0); }`;

/* ---------------- the game ---------------- */
// level = { n, spawn: [x, y, z], blocks: [[x, y, z, type], ...] }
// ui = { onHud(text parts), onToast(text), onWin(stats) }
export function start3D(canvas, level, ui, color = '#ff6b35') {
  const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
  if (!gl) throw new Error('This browser cannot show 3D (WebGL is off or not supported).');

  const map = new Map();
  const key = (x, y, z) => (x + 1024) * 4194304 + (y + 1024) * 2048 + (z + 1024);
  let minY = Infinity;
  for (const b of level.blocks) { map.set(key(b[0], b[1], b[2]), b[3]); minY = Math.min(minY, b[1]); }
  const typeAt = (x, y, z) => map.get(key(x, y, z)) || 0;

  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog); gl.useProgram(prog);
  const loc = {
    pos: gl.getAttribLocation(prog, 'aPos'), col: gl.getAttribLocation(prog, 'aCol'),
    proj: gl.getUniformLocation(prog, 'uProj'), view: gl.getUniformLocation(prog, 'uView'),
    model: gl.getUniformLocation(prog, 'uModel'), fog: gl.getUniformLocation(prog, 'uFog'),
  };
  const mesh = (data) => { const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return { buf, n: data.length / 6 }; };
  const world = mesh(buildWorld(level.blocks, (x, y, z) => typeAt(x, y, z) !== 0));
  const body = mesh(buildPlayer(color));
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(SKY[0], SKY[1], SKY[2], 1);
  gl.uniform3fv(loc.fog, SKY);

  // state
  let spawn = level.spawn.slice();
  const P = { x: spawn[0], y: spawn[1], z: spawn[2], vx: 0, vy: 0, vz: 0, onGround: false, ground: 0, face: 0, coyote: 0 };
  const cam = { yaw: 0, pitch: 0.42, dist: 8 };
  const keys = {};
  let jumpQueued = 0, time = 0, deaths = 0, won = false, running = true, last = performance.now(), lastHud = '';
  let checkpointAt = null;

  function respawn() { P.x = spawn[0]; P.y = spawn[1]; P.z = spawn[2]; P.vx = P.vy = P.vz = 0; }
  function die() { deaths++; respawn(); ui.onDie && ui.onDie(); }

  function collide() {
    const x0 = Math.floor(P.x - HW), x1 = Math.floor(P.x + HW - 1e-4);
    const y0 = Math.floor(P.y), y1 = Math.floor(P.y + HH - 1e-4);
    const z0 = Math.floor(P.z - HW), z1 = Math.floor(P.z + HW - 1e-4);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const t = typeAt(x, y, z); if (t) return { x, y, z, t };
    }
    return null;
  }
  function moveAxis(axis, d) {
    if (!d) return;
    P[axis] += d;
    for (let k = 0; k < 3; k++) {
      const hit = collide(); if (!hit) return;
      if (hit.t === B.lava) { die(); return; }
      if (axis === 'y') {
        if (d < 0) { P.y = hit.y + 1; P.onGround = true; P.ground = hit.t; } else P.y = hit.y - HH;
        P.vy = 0;
      } else if (axis === 'x') { P.x = d > 0 ? hit.x - HW - 1e-4 : hit.x + 1 + HW + 1e-4; P.vx = 0; }
      else { P.z = d > 0 ? hit.z - HW - 1e-4 : hit.z + 1 + HW + 1e-4; P.vz = 0; }
    }
  }

  function step(dt) {
    time += dt;
    // input relative to the camera
    const fwd = (keys.KeyW || keys.ArrowUp || keys.tUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown || keys.tDown ? 1 : 0);
    const side = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const turn = (keys.ArrowRight || keys.KeyE || keys.tRight ? 1 : 0) - (keys.ArrowLeft || keys.KeyQ || keys.tLeft ? 1 : 0);
    cam.yaw -= turn * 2.4 * dt;
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    let mx = -sy * fwd + cy * side, mz = -cy * fwd - sy * side;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; P.face = Math.atan2(-mx, -mz); }
    const acc = P.onGround ? 40 : 14;
    P.vx += Math.max(-acc * dt, Math.min(acc * dt, mx * SPEED - P.vx));
    P.vz += Math.max(-acc * dt, Math.min(acc * dt, mz * SPEED - P.vz));
    P.coyote = P.onGround ? 0.1 : P.coyote - dt;
    if (jumpQueued > 0) jumpQueued -= dt;
    if (jumpQueued > 0 && P.coyote > 0) { P.vy = JUMP; jumpQueued = 0; P.coyote = 0; }
    P.vy = Math.max(-40, P.vy - GRAV * dt);
    P.onGround = false;
    moveAxis('y', P.vy * dt);
    moveAxis('x', P.vx * dt);
    moveAxis('z', P.vz * dt);
    if (P.onGround) {
      const t = P.ground;
      if (t === B.bounce) { P.vy = BOUNCE; P.onGround = false; }
      else if (t === B.check) {
        const cx = Math.floor(P.x), cz = Math.floor(P.z), key2 = cx + ',' + cz;
        if (checkpointAt !== key2) { checkpointAt = key2; spawn = [cx + 0.5, P.y, cz + 0.5]; ui.onToast && ui.onToast('Checkpoint'); }
      } else if (t === B.goal && !won) { won = true; ui.onWin && ui.onWin({ time, deaths }); }
    }
    if (P.y < minY - 12) die();
  }

  function resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw() {
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const target = [P.x, P.y + 1.3, P.z];
    const cp = Math.cos(cam.pitch);
    const dir = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp];
    // pull the camera in if a block is between it and the player
    let dist = cam.dist;
    for (let d = 0.6; d < cam.dist; d += 0.2) {
      if (typeAt(Math.floor(target[0] + dir[0] * d), Math.floor(target[1] + dir[1] * d), Math.floor(target[2] + dir[2] * d))) { dist = Math.max(1.2, d - 0.35); break; }
    }
    const eye = [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist];
    gl.uniformMatrix4fv(loc.proj, false, perspective(1.0, canvas.width / canvas.height, 0.1, 400));
    gl.uniformMatrix4fv(loc.view, false, lookAt(eye, target, [0, 1, 0]));
    for (const [m, mat] of [[world, model(0, 0, 0, 0)], [body, model(P.x, P.y, P.z, P.face)]]) {
      gl.uniformMatrix4fv(loc.model, false, mat);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
      gl.enableVertexAttribArray(loc.pos); gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc.col); gl.vertexAttribPointer(loc.col, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, m.n);
    }
  }

  let acc = 0;
  function frame(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (document.hidden) { for (const k in keys) keys[k] = false; requestAnimationFrame(frame); return; }
    if (!won) { acc += dt; while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; } }
    draw();
    const hud = `${time.toFixed(1)}s|${deaths}`;
    if (hud !== lastHud) { lastHud = hud; ui.onHud && ui.onHud({ time, deaths }); }
    requestAnimationFrame(frame);
  }

  // controls
  const kd = (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' && !e.repeat) jumpQueued = 0.12;
    if (e.code === 'KeyR') { respawn(); }
    keys[e.code] = true;
  };
  const ku = (e) => { keys[e.code] = false; };
  const blur = () => { for (const k in keys) keys[k] = false; };
  let drag = null;
  const pd = (e) => { drag = { x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } };
  const pm = (e) => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag.x) * 0.008;
    cam.pitch = Math.max(0.05, Math.min(1.3, cam.pitch + (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  };
  const pu = () => { drag = null; };
  const wh = (e) => { e.preventDefault(); cam.dist = Math.max(4, Math.min(16, cam.dist + e.deltaY * 0.01)); };
  addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', blur);
  canvas.addEventListener('pointerdown', pd); canvas.addEventListener('pointermove', pm);
  canvas.addEventListener('pointerup', pu); canvas.addEventListener('pointercancel', pu);
  canvas.addEventListener('wheel', wh, { passive: false });
  requestAnimationFrame(frame);

  return {
    press(name, on) { if (name === 'jump') { if (on) jumpQueued = 0.12; } else keys[name] = on; },
    restart() { spawn = level.spawn.slice(); checkpointAt = null; respawn(); time = 0; deaths = 0; won = false; },
    stop() {
      running = false;
      removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur);
      canvas.removeEventListener('pointerdown', pd); canvas.removeEventListener('pointermove', pm);
      canvas.removeEventListener('pointerup', pu); canvas.removeEventListener('pointercancel', pu);
      canvas.removeEventListener('wheel', wh);
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    },
  };
}
