// THE DOOR (colabroom.com/test): the house lights.
//
// A dark room before the show. A truss, five lamps on it, a stage floor, and
// smoke. The smoke is a real fluid, worked out on the graphics card, and the
// lamps light only the smoke that is there: stir it through a beam with a
// finger and the beam shows it. The password is the house lights going down.
// If it is right the room is dark for a beat, every lamp finds the name, and
// the smoke is pushed out from it; what is left on the stage is two ways in.
// If it is wrong the lights do not come up.
//
// Nothing here knows the password. It is asked of one address, below.
(function () {
  'use strict';

  // THE ONE ADDRESS. The page POSTs {"password": "..."} here and is given
  // {"ios_url", "android_url"} (200), or told no. Nothing else on this page
  // talks to anything.
  var ENDPOINT = 'https://gzcoclsfvazfhcheefhz.supabase.co/functions/v1/tester-door';

  var KEPT = 'colabroom.door.open';     // this browser session only; never the password
  var FRESH = 9 * 60 * 1000;            // the Android link lives ten minutes; trust it for nine
  var PATIENCE = 14000;                 // how long the door is waited on, in milliseconds
  var REST = 75;                        // untouched this many seconds, the room holds still
  var END = 2.6;                        // the opening: a beat of dark, then about 1.8 seconds

  var root = document.documentElement;
  root.classList.remove('no-js');
  // Inside somebody else's page there is a room and no door: a password is
  // never typed into a frame.
  var framed = false;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  if (framed) root.classList.add('framed');
  var q = new URLSearchParams(location.search);
  // The demo and every parameter below it answer only on this machine, so the
  // published page can never be opened without the password.
  var local = location.protocol === 'file:' ||
    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /\.localhost$/.test(location.hostname);
  var arg = function (name) { return local ? q.get(name) : null; };
  var demo = arg('demo');                 // '1' any password; 'wrong', 'closed', 'locked'
  var shot = demo ? arg('state') : null;  // hold one state still, to be photographed
  var held = !!shot || (demo && arg('hold') === '1');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || arg('motion') === 'reduce';
  if (reduce) root.classList.add('reduce');
  if (held) root.classList.add('held');

  var $ = function (id) { return document.getElementById(id); };
  var form = $('ask'), pw = $('pw'), go = $('go'), see = $('see'), said = $('said'), aside = $('aside');
  var ways = $('ways'), ios = $('ios'), android = $('android');
  var line = $('line'), nameEl = $('name'), sign = $('sign'), floorEl = $('floor');
  var canvas = $('fog');

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function span(t, a, b) { return clamp01((t - a) / (b - a)); }
  function outCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function inOut(x) { return x * x * (3 - 2 * x); }
  function mix(a, b, x) { return a + (b - a) * x; }

  // ------------------------------------------------------------ one clock
  // Everything that happens in time reads this clock, so a moment can be
  // replayed exactly (the local demo steps it by hand to film the room).
  var clock = 0;
  var timers = [];
  function after(seconds, fn) { var t = { at: clock + seconds, fn: fn }; timers.push(t); return t; }
  function cancel(t) { var i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }
  function runTimers() {
    for (var i = 0; i < timers.length; i += 1) {
      if (timers[i].at <= clock) { var t = timers.splice(i, 1)[0]; i -= 1; t.fn(); }
    }
  }

  // ------------------------------------------------------------ the phone
  function phone() {
    var forced = arg('os');
    if (forced) return forced === 'none' ? '' : forced;
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios'; // an iPad
    return '';
  }

  function safe(url) {
    if (demo && typeof url === 'string' && url.charAt(0) === '#') return url;
    try { return new URL(url).protocol === 'https:' ? url : null; } catch (e) { return null; }
  }

  // Lays out the ways in. The phone in the hand is first and is the fog
  // pill; the other stays, outlined. With no phone in the hand, both are.
  // The door may hand back only one of the two; then there is one.
  function setWays(links) {
    var i = safe(links.ios_url), a = safe(links.android_url);
    if (!i && !a) return false;
    ios.hidden = !i; android.hidden = !a;
    if (i) ios.href = i;
    if (a) android.href = a;
    ios.setAttribute('aria-label', 'Get CoLabRoom for iPhone');
    android.setAttribute('aria-label', 'Get CoLabRoom for Android');
    var mine = phone();
    var both = !!(i && a);
    ios.classList.toggle('other', both && mine === 'android');
    android.classList.toggle('other', both && mine === 'ios');
    var level = both && !mine;
    ways.classList.toggle('level', level);
    floorEl.classList.toggle('level', level);
    if (mine === 'android') ways.insertBefore(android, ios); // reading order too
    return true;
  }

  // ------------------------------------------------------------ the show
  // What the room is at one moment. beam: how bright the lamps. wander: how
  // far they roam from the name. house: the smoke's own glow in the dark.
  // flood: the wash from over the stage. clear: how far the smoke has been
  // let go from the middle of the stage.
  var LOOKS = {
    waiting:  { house: 1.0,  beam: 1.0,  wander: 1.0,  flood: 0,    clear: 0 },
    checking: { house: 0.34, beam: 0.12, wander: 0.5,  flood: 0,    clear: 0 },
    wrong:    { house: 0.40, beam: 0.085, wander: 0.5, flood: 0,    clear: 0 },
    locked:   { house: 0.40, beam: 0.085, wander: 0.5, flood: 0,    clear: 0 },
    closed:   { house: 0.30, beam: 0.05, wander: 0.4,  flood: 0,    clear: 0 },
    open:     { house: 0.72, beam: 0.92, wander: 0.78, flood: 0.12, clear: 1 }
  };

  // THE OPENING, as a score: what everything is T seconds after the yes.
  //   0.00  the lamps go out, the form leaves
  //   0.28  dark: the name alone. A breath.
  //   0.75  all five lamps snap onto the name, a little past full, and settle
  //   0.85  the smoke is pushed out from the name (a real push, in the fluid)
  //   1.45  the ways in rise, one after the other
  function score(T, from) {
    var down = inOut(span(T, 0, 0.28));
    var up = span(T, 0.75, 0.9);
    var bloom = outCubic(up);
    var settle = inOut(span(T, 0.9, 2.3));
    return {
      house: mix(mix(from.house, 0.04, down), mix(1.0, 0.72, settle), inOut(span(T, 0.75, 1.5))),
      beam: mix(from.beam, 0, down) * (1 - up) + bloom * mix(1.42, 0.92, settle),
      wander: mix(from.wander * (1 - down), 0.78, inOut(span(T, 1.5, 2.6))),
      flood: bloom * mix(1.0, 0.12, settle),
      clear: inOut(span(T, 0.85, 2.1)),
      form: 1 - inOut(span(T, 0, 0.26)),
      dark: down * (1 - bloom),
      c1: outCubic(span(T, 1.45, 2.0)),
      c2: outCubic(span(T, 1.62, 2.17)),
      lit: T >= 0.75
    };
  }

  var state = 'waiting';
  var now = { house: 1, beam: 1, wander: 1, flood: 0, clear: 0 };
  var openedAt = 0, openFrom = null;
  var lampClock = 0;
  var extra = { form: 1, dark: 0, c1: 0, c2: 0 };
  var shown = {};

  function setState(s) {
    state = s;
    root.setAttribute('data-state', s);
    stir();
    wake();
  }

  // ------------------------------------------------------------ the room
  // Measured in the height of the glass: x runs 0 to aspect, y runs 0 at the
  // top to 1 at the bottom.
  var room = { w: 1, h: 1, aspect: 1, name: { x: 0.5, y: 0.32 }, floor: 0.84, open: 9,
               calm: { x: 0.5, y: 0.6, rx: 0.4, ry: 0.12 }, wordsA: [0.5, 0.35, 0.3, 0.06], wordsB: [0.5, 0.6, 0.3, 0.06] };

  // ------------------------------------------------------------ the lamps
  // Five, hung along the truss. The three inner ones are aimed at the name
  // and wander either side of it, each at its own slow pace, so each finds
  // the name and loses it. The two at the ends are aimed across the stage,
  // past the name and below it, and sweep through the others: the beams
  // cross and uncross. No two share a period, so the picture does not
  // repeat within an evening.
  var LAMPS = [
    { u: -0.88, end: true,  sway: 0.24, every: 31, at: 1.1,  breath: 14, lung: 2.2, gain: 0.82 },
    { u: -0.45, end: false, sway: 0.30, every: 19, at: 0.42, breath: 11, lung: 0.9, gain: 1 },
    { u: 0,     end: false, sway: 0.22, every: 27, at: 2.1,  breath: 17, lung: 1.5, gain: 1 },
    { u: 0.45,  end: false, sway: 0.31, every: 23, at: 3.6,  breath: 13, lung: 0.3, gain: 1 },
    { u: 0.88,  end: true,  sway: 0.24, every: 37, at: 4.3,  breath: 19, lung: 4.0, gain: 0.82 }
  ];
  var N = LAMPS.length;
  var TRUSS_Y = 0.058, CAN = 0.036, WIDTH = 0.060;
  var lampData = new Float32Array(N * 4);   // lens x, lens y, aim, strength

  function aimLamps() {
    var a = room.aspect, cx = 0.5 * a;
    var rig = Math.min(0.455 * a, 0.62);
    var spread = Math.min(1, now.wander * 1.25);
    var reach = Math.min(0.30 * a, 0.26), drop = 0.26;
    var onName = 0;
    for (var i = 0; i < N; i += 1) {
      var L = LAMPS[i];
      var px = cx + L.u * rig, py = TRUSS_Y;
      var side = L.u < 0 ? -1 : 1;
      // On a low, wide glass the name sits right under the truss; the lamps
      // are aimed below it there, so the beams still cross and reach the floor.
      var ny = Math.max(room.name.y, TRUSS_Y + 0.34);
      var tx = room.name.x * a + (L.end ? -side * reach * spread : 0);
      var ty = ny + (L.end ? drop * spread : 0);
      var toName = Math.atan2(room.name.x * a - px, ny - py);
      var base = Math.atan2(tx - px, ty - py);
      var aim = base + L.sway * now.wander * Math.sin(lampClock * 2 * Math.PI / L.every + L.at);
      var strength = L.gain * now.beam * (0.76 + 0.24 * Math.sin(lampClock * 2 * Math.PI / L.breath + L.lung));
      lampData[i * 4] = px + CAN * Math.sin(aim);
      lampData[i * 4 + 1] = py + CAN * Math.cos(aim);
      lampData[i * 4 + 2] = aim;
      lampData[i * 4 + 3] = strength;
      var w = (aim - toName) / (WIDTH * 1.25);
      onName += strength * Math.exp(-w * w);
    }
    return onName;
  }

  // ------------------------------------------------------------ the hand
  // A press puffs the smoke outward like a breath; a drag pushes it along
  // the path; a hard swipe throws it. Several fingers at once. A mouse
  // moving stirs it faintly. The listeners are passive and on the window:
  // nothing is swallowed, and the field, the pill and the links are left
  // entirely alone.
  var fingers = {};
  var pushes = [];          // this frame's pushes: {x, y, r, fx, fy}
  var puffs = [];           // breaths still being let out: {x, y, r, rate, until}
  var wakes = [];           // the last few touches, for the simple wake
  var lastStir = -100, lastTouch = -100;
  var pointer = { x: 0.5, y: 0.5 };

  function stir() { lastStir = clock; }

  function control(target) {
    return !!(target && target.closest && target.closest('.field, .pill, a, button, input, label'));
  }

  function puff(x, y, size, rate, seconds) {
    puffs.push({ x: x, y: y, r: size, rate: rate, until: clock + seconds });
    if (puffs.length > 6) puffs.shift();
    wakes.push({ x: x, y: y, born: clock, power: 1 });
    if (wakes.length > 6) wakes.shift();
    stir(); lastTouch = clock; wake();
  }

  function fingerDown(id, x, y) {
    fingers[id] = { x: x, y: y, t: clock, live: performance.now() };
    puff(x, y, 0.06, 24, 0.17);
  }

  // x, y in fractions of the glass; gain 1 for a finger, less for a mouse
  // that is only passing over.
  function fingerMove(id, x, y, gain) {
    var f = fingers[id];
    var live = performance.now();
    if (!f) { fingers[id] = { x: x, y: y, t: clock, live: live, hover: true }; return; }
    var dt = held ? Math.max(1 / 120, clock - f.t) : Math.min(0.1, Math.max(0.008, (live - f.live) / 1000));
    var dx = (x - f.x) * room.aspect, dy = y - f.y;
    f.x = x; f.y = y; f.t = clock; f.live = live;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-5) return;
    var speed = Math.min(3.2, dist / dt);                 // heights of the glass a second
    var hard = clamp01((speed - 0.5) / 1.8);              // a hard swipe throws wider
    var take = Math.min(1, 13 * dt) * gain * (0.9 + 0.7 * hard);
    pushes.push({ x: x, y: y, r: 0.06 + 0.05 * hard, air: gain > 0.5 ? 5 + 9 * hard : 0,
      fx: dx / dist * speed * take, fy: -dy / dist * speed * take });
    if (pushes.length > 24) pushes.shift();
    if (gain > 0.5) {
      var last = wakes[wakes.length - 1];
      if (!last || clock - last.born > 0.09) {
        wakes.push({ x: x, y: y, born: clock, power: 0.5 + 0.5 * hard });
        if (wakes.length > 6) wakes.shift();
      }
      lastTouch = clock;
    }
    stir(); wake();
  }

  function fingerUp(id) { delete fingers[id]; }

  function listen() {
    var W = function () { return window.innerWidth; }, H = function () { return window.innerHeight; };
    var o = { passive: true };
    window.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' || control(e.target)) return;
      fingerDown('p' + e.pointerId, e.clientX / W(), e.clientY / H());
    }, o);
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      pointer.x = e.clientX / W(); pointer.y = e.clientY / H();
      var id = 'p' + e.pointerId;
      var pressed = e.buttons > 0 && fingers[id] && !fingers[id].hover;
      if (!pressed && fingers[id] && !fingers[id].hover) { delete fingers[id]; }
      fingerMove(id, pointer.x, pointer.y, pressed ? 1 : 0.16);
    }, o);
    var lift = function (e) { if (e.pointerType !== 'touch') fingerUp('p' + e.pointerId); };
    window.addEventListener('pointerup', lift, o);
    window.addEventListener('pointercancel', lift, o);
    // Fingers: the touch events keep coming while the page scrolls or
    // zooms, which is what lets this listen without ever blocking either.
    window.addEventListener('touchstart', function (e) {
      if (control(e.target)) return;
      for (var i = 0; i < e.changedTouches.length; i += 1) {
        var t = e.changedTouches[i];
        fingerDown('t' + t.identifier, t.clientX / W(), t.clientY / H());
      }
    }, o);
    window.addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i += 1) {
        var t = e.changedTouches[i];
        if (fingers['t' + t.identifier]) fingerMove('t' + t.identifier, t.clientX / W(), t.clientY / H(), 1);
      }
    }, o);
    var off = function (e) {
      for (var i = 0; i < e.changedTouches.length; i += 1) fingerUp('t' + e.changedTouches[i].identifier);
    };
    window.addEventListener('touchend', off, o);
    window.addEventListener('touchcancel', off, o);
  }

  // Local demo only (?touch=1): a press, a drag and a hard swipe, played by
  // the clock, so the stirred smoke can be photographed and filmed.
  var SCRIPT = arg('touch') ? (function () {
    var s = [], at = parseFloat(arg('touchat') || '1') || 0;
    var path = function (id, t0, t1, fn) {
      var steps = Math.max(2, Math.round((t1 - t0) * 60));
      s.push({ t: at + t0, kind: 'down', id: id, p: fn(0) });
      for (var i = 1; i <= steps; i += 1) s.push({ t: at + t0 + (t1 - t0) * i / steps, kind: 'move', id: id, p: fn(i / steps) });
      s.push({ t: at + t1 + 0.001, kind: 'up', id: id });
    };
    // a press, up where the beams cross
    path('a', 0.0, 0.05, function () { return [0.34, 0.21]; });
    // a slow drag through the beams, in an arc over the name
    path('b', 1.5, 2.9, function (k) { return [0.16 + 0.68 * k, 0.40 - 0.27 * Math.sin(k * Math.PI)]; });
    // a hard swipe back across them, right to left
    path('c', 4.6, 4.78, function (k) { return [0.92 - 0.8 * k, 0.30 - 0.1 * k]; });
    // and a second press, on the right
    path('d', 6.4, 6.45, function () { return [0.70, 0.17]; });
    return s;
  })() : null;
  var scriptAt = 0;
  function runScript() {
    if (!SCRIPT) return;
    while (scriptAt < SCRIPT.length && SCRIPT[scriptAt].t <= clock) {
      var e = SCRIPT[scriptAt]; scriptAt += 1;
      if (e.kind === 'down') fingerDown(e.id, e.p[0], e.p[1]);
      else if (e.kind === 'move') fingerMove(e.id, e.p[0], e.p[1], 1);
      else fingerUp(e.id);
    }
  }

  // ------------------------------------------------------------ the shaders
  var VERT = 'attribute vec2 a;varying vec2 v;void main(){v=a*0.5+0.5;gl_Position=vec4(a,0.,1.);}';
  var HEAD = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nvarying vec2 v;\n';

  // The room's own geometry and the resting shape of the smoke: shared by
  // the fluid (which is drawn back toward it, slowly) and by the plain wake.
  var ROOM = [
    'uniform sampler2D uNoise;uniform float uAspect;uniform float uTime;uniform float uFloor;',
    'uniform float uClear;uniform vec2 uName;',
    // Smooth noise from one small texture: one look-up.
    'float vn(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return texture2D(uNoise,(i+f+0.5)/256.0).r;}',
    'float vn2(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return texture2D(uNoise,(i+f+0.5)/256.0).g;}',
    // Billows: big soft masses with air between them, rolling slowly up.
    'float billow(vec2 p,float t){',
    ' vec2 q=p*5.0+vec2(0.03*t,0.07*t);',
    ' vec2 w=vec2(vn(q*0.45+vec2(3.1,-0.019*t)),vn2(q*0.45+vec2(-7.3,0.015*t)))-0.5;',
    ' q+=2.6*w;',
    ' float n=(vn(q)+0.58*vn2(q*2.07+vec2(11.0,0.03*t))+0.36*vn(q*4.3-vec2(0.02*t,5.0))+0.22*vn2(q*8.9+vec2(0.03*t,2.0)))/2.16;',
    ' return smoothstep(0.33,0.70,n);}',
    // Where the smoke lies when nobody has touched it: thick and low along
    // the floor, thinner in the air, more in the wings and under the rig.
    'float rest(vec2 p,float t){',
    ' float x=p.x/uAspect;float y=p.y;',
    ' float bank=smoothstep(uFloor-0.34,uFloor+0.05,y);bank*=bank;',
    ' float wings=smoothstep(0.16,0.5,abs(x-0.5));',
    ' float rig=1.0-smoothstep(0.0,0.26,y);',
    ' float shape=0.52+0.85*bank+0.30*wings*(0.35+0.65*y)+0.10*rig;',
    ' float d=shape*(0.30+1.15*billow(p,t));',
    // Let go from the middle of the stage once the room is open; the wings,
    // the floor and the air under the rig keep theirs.
    ' vec2 c=(p-vec2(uName.x,uName.y+0.20))/vec2(0.24+0.36*uAspect,0.46);',
    ' float hole=exp(-pow(dot(c,c),1.4));',
    ' float kept=max(0.06,max(smoothstep(uFloor-0.10,uFloor+0.06,y)*0.72,(1.0-smoothstep(0.02,0.16,y))*0.6));',
    ' return d*mix(1.0,mix(1.0,kept,hole),uClear);}'
  ].join('\n');

  // THE LIGHT. Five lamps and the flood. A beam is a cone from its lens; what
  // it gives a place is what is left of it after the smoke it came through.
  // r: light arriving (for smoke to scatter). g: the same, unshadowed (the
  // faintest beam in clear air). b: the pool where a beam lands on the floor.
  var LIGHT = [
    'uniform vec4 uLamp[5];uniform float uWidth;uniform float uFlood;',
    '#ifdef SHADOW',
    'uniform sampler2D uShade;uniform float uSigma;',
    'float shade(vec2 q){return texture2D(uShade,vec2(q.x/uAspect,1.0-q.y)).r;}',
    '#endif',
    'vec3 lightAt(vec2 p){',
    ' float lit=0.0;float air=0.0;float pool=0.0;',
    ' float land=1.0-0.8*smoothstep(uFloor+0.01,uFloor+0.13,p.y);',
    ' for(int i=0;i<5;i++){',
    '  vec4 L=uLamp[i];vec2 ray=p-L.xy;float dist=length(ray);',
    '  float ang=atan(ray.x,ray.y)-L.z;float wide=dist*sin(ang)/(uWidth*dist+0.011);float w2=wide*wide+step(1.5,abs(ang))*99.0;',
    '  float cone=exp(-w2*w2*w2)+0.05*exp(-0.10*w2);',
    '  float fall=1.0/(1.0+0.85*dist*dist);',
    '  float got=L.w*cone*fall*land*smoothstep(0.0,0.02,ray.y+0.012);',
    '  float T=1.0;',
    '#ifdef SHADOW',
    '  float od=0.0;',
    '  for(int s=0;s<8;s++){od+=shade(L.xy+ray*((float(s)+0.5)/8.0));}',
    '  T=exp(-uSigma*od*dist/8.0);',
    '#endif',
    '  lit+=got*T;air+=got;',
    '  float reach=(uFloor+0.04-L.y)/max(cos(L.z),0.25);',
    '  vec2 hit=L.xy+reach*vec2(sin(L.z),cos(L.z));',
    '  float size=0.03+uWidth*reach*0.85;vec2 e=(p-hit)/vec2(size,size*0.20);',
    '  pool+=L.w*T*exp(-dot(e,e))/(1.0+1.25*reach*reach);',
    ' }',
    // The flood: the wash from over the middle of the stage.
    ' vec2 fr=p-vec2(0.5*uAspect,-0.18);float fd=length(fr);float fw=atan(fr.x,fr.y)/0.60;',
    ' float wash=uFlood*exp(-fw*fw)/(1.0+1.4*fd*fd);',
    ' lit+=0.85*wash;air+=0.5*wash;',
    ' return vec3(lit,air,pool);}'
  ].join('\n');


  var SH = {
    advectVel: HEAD + [
      'uniform sampler2D uVel;uniform vec2 uAsp;uniform float uDt;uniform float uDamp;',
      'void main(){vec2 vel=texture2D(uVel,v).xy;vec2 b=v-uDt*vel*uAsp;',
      ' gl_FragColor=vec4(texture2D(uVel,b).xy*uDamp,0.0,1.0);}'
    ].join('\n'),

    // Where the air has carried things: how far each place's smoke has been
    // moved from where it lay. The wisps are drawn that far along, so what a
    // hand stirs curls and trails as smoke does, and then eases back.
    carry: HEAD + [
      'uniform sampler2D uVel;uniform sampler2D uGone;uniform vec2 uAsp;uniform float uDt;uniform float uKeep;',
      'void main(){vec2 vel=texture2D(uVel,v).xy;vec2 b=v-uDt*vel*uAsp;',
      ' vec2 g=texture2D(uGone,b).xy*uKeep+uDt*vel;g*=min(1.0,0.20/max(length(g),0.0001));',
      ' gl_FragColor=vec4(g,0.0,1.0);}'
    ].join('\n'),

    curl: HEAD + [
      'uniform sampler2D uVel;uniform vec2 uTexel;',
      'void main(){',
      ' float l=texture2D(uVel,v-vec2(uTexel.x,0.0)).y;float r=texture2D(uVel,v+vec2(uTexel.x,0.0)).y;',
      ' float b=texture2D(uVel,v-vec2(0.0,uTexel.y)).x;float t=texture2D(uVel,v+vec2(0.0,uTexel.y)).x;',
      ' gl_FragColor=vec4(0.5*((r-l)-(t-b)),0.0,0.0,1.0);}'
    ].join('\n'),

    // Curl kept alive (gently: curls the size of a hand, never threads), the
    // smoke's own lift, and the hand.
    force: HEAD + [
      'uniform sampler2D uVel;uniform sampler2D uCurl;uniform sampler2D uDen;uniform sampler2D uWide;',
      'uniform vec2 uTexel;uniform float uDt;uniform float uConf;uniform float uBuoy;uniform float uAspect;uniform float uMax;',
      'uniform vec4 uSplat[8];uniform vec2 uPush[8];',
      'void main(){',
      ' vec2 vel=texture2D(uVel,v).xy;',
      ' float l=abs(texture2D(uCurl,v-vec2(uTexel.x,0.0)).x);float r=abs(texture2D(uCurl,v+vec2(uTexel.x,0.0)).x);',
      ' float b=abs(texture2D(uCurl,v-vec2(0.0,uTexel.y)).x);float t=abs(texture2D(uCurl,v+vec2(0.0,uTexel.y)).x);',
      ' float c=texture2D(uCurl,v).x;',
      ' vec2 g=0.5*vec2(r-l,t-b);g/=length(g)+0.0001;',
      ' vel+=uConf*uDt*c*vec2(g.y,-g.x);',
      ' vel.y+=uBuoy*uDt*(texture2D(uDen,v).r-texture2D(uWide,v).r);',
      ' for(int i=0;i<8;i++){vec4 s=uSplat[i];vec2 d=(v-s.xy)*vec2(uAspect,1.0);',
      '  vel+=uPush[i]*exp(-dot(d,d)/(s.z*s.z));}',
      ' float sp=length(vel);vel*=min(1.0,uMax/max(sp,0.0001));',
      ' gl_FragColor=vec4(vel,0.0,1.0);}'
    ].join('\n'),

    // A breath is air let into the room: the smoke is pushed out all round.
    divergence: HEAD + [
      'uniform sampler2D uVel;uniform vec2 uTexel;uniform float uAspect;uniform float uCell;',
      'uniform vec4 uSplat[8];',
      'void main(){',
      ' float l=texture2D(uVel,v-vec2(uTexel.x,0.0)).x;float r=texture2D(uVel,v+vec2(uTexel.x,0.0)).x;',
      ' float b=texture2D(uVel,v-vec2(0.0,uTexel.y)).y;float t=texture2D(uVel,v+vec2(0.0,uTexel.y)).y;',
      ' float div=0.5*(r-l+t-b);',
      ' for(int i=0;i<8;i++){vec4 s=uSplat[i];vec2 d=(v-s.xy)*vec2(uAspect,1.0);',
      '  div-=s.w*uCell*exp(-dot(d,d)/(s.z*s.z));}',
      ' gl_FragColor=vec4(div,0.0,0.0,1.0);}'
    ].join('\n'),

    // The room is open at its edges: air can leave.
    pressure: HEAD + [
      'uniform sampler2D uPre;uniform sampler2D uDiv;uniform vec2 uTexel;',
      'float pr(vec2 u){return texture2D(uPre,u).x*step(0.0,u.x)*step(u.x,1.0)*step(0.0,u.y)*step(u.y,1.0);}',
      'void main(){',
      ' float s=pr(v-vec2(uTexel.x,0.0))+pr(v+vec2(uTexel.x,0.0))+pr(v-vec2(0.0,uTexel.y))+pr(v+vec2(0.0,uTexel.y));',
      ' gl_FragColor=vec4((s-texture2D(uDiv,v).x)*0.25,0.0,0.0,1.0);}'
    ].join('\n'),

    gradient: HEAD + [
      'uniform sampler2D uPre;uniform sampler2D uVel;uniform vec2 uTexel;',
      'float pr(vec2 u){return texture2D(uPre,u).x*step(0.0,u.x)*step(u.x,1.0)*step(0.0,u.y)*step(u.y,1.0);}',
      'void main(){',
      ' float l=pr(v-vec2(uTexel.x,0.0));float r=pr(v+vec2(uTexel.x,0.0));',
      ' float b=pr(v-vec2(0.0,uTexel.y));float t=pr(v+vec2(0.0,uTexel.y));',
      ' gl_FragColor=vec4(texture2D(uVel,v).xy-0.5*vec2(r-l,t-b),0.0,1.0);}'
    ].join('\n'),

    // The smoke is carried by the air the hand has moved and by the room's
    // own slow drift; it spreads a little; a breath heaps it aside; and it is
    // drawn back, slowly, toward where smoke lies in this room.
    smoke: HEAD + ROOM + [
      'uniform sampler2D uVel;uniform sampler2D uDen;uniform vec2 uAsp;uniform vec2 uTexel;',
      'uniform float uDt;uniform float uLive;uniform float uUp;uniform float uDown;uniform float uSpread;uniform float uSet;',
      'uniform vec4 uSplat[8];',
      'vec2 drift(vec2 p,float t){',
      ' float a=2.3*p.x+0.7*sin(0.11*t);float b=1.9*p.y+0.13*t;float c=4.1*p.x-0.17*t+1.3;float e=3.7*p.y+0.09*t;',
      ' float dx=2.3*cos(a)*cos(b)+2.05*cos(c)*sin(e);float dy=-1.9*sin(a)*sin(b)+1.85*sin(c)*cos(e);',
      ' return 0.0055*vec2(dy,dx)+vec2(0.0,0.007);}',
      'void main(){',
      ' vec2 p=vec2(v.x*uAspect,1.0-v.y);',
      ' float goal=rest(p,uTime);',
      ' if(uSet>0.5){gl_FragColor=vec4(goal,0.0,0.0,1.0);return;}',
      ' vec2 vel=texture2D(uVel,v).xy*uLive+drift(p,uTime);',
      ' vec2 b=v-uDt*vel*uAsp;',
      ' float d=texture2D(uDen,b).r;',
      ' float n=0.25*(texture2D(uDen,b+vec2(uTexel.x,0.0)).r+texture2D(uDen,b-vec2(uTexel.x,0.0)).r+texture2D(uDen,b+vec2(0.0,uTexel.y)).r+texture2D(uDen,b-vec2(0.0,uTexel.y)).r);',
      ' d=mix(d,n,min(0.5,uSpread+0.07*length(vel)));',
      // A breath moves smoke, it does not take it away: what leaves the middle
      // is heaped in a soft lip round it, where a lamp can find it.
      ' for(int i=0;i<8;i++){vec4 s=uSplat[i];vec2 q=(v-s.xy)*vec2(uAspect,1.0);',
      '  float r2=dot(q,q)/(s.z*s.z);float r=sqrt(r2)-1.5;',
      '  d*=1.0+min(0.4,s.w*uDt*0.2)*(0.55*exp(-r*r/0.34)-exp(-r2));}',
      ' d+=(goal-d)*(goal>d?uUp:uDown);',
      ' gl_FragColor=vec4(max(d,0.0),0.0,0.0,1.0);}'
    ].join('\n'),

    blur: HEAD + [
      'uniform sampler2D uSrc;uniform vec2 uStep;',
      'void main(){',
      ' float s=texture2D(uSrc,v).r*0.227027;',
      ' s+=(texture2D(uSrc,v+uStep*1.384615).r+texture2D(uSrc,v-uStep*1.384615).r)*0.316216;',
      ' s+=(texture2D(uSrc,v+uStep*3.230769).r+texture2D(uSrc,v-uStep*3.230769).r)*0.070270;',
      ' gl_FragColor=vec4(s,0.0,0.0,1.0);}'
    ].join('\n'),

    light: HEAD + '#define SHADOW\n' + ROOM + LIGHT + [
      'void main(){vec2 p=vec2(v.x*uAspect,1.0-v.y);gl_FragColor=vec4(lightAt(p),1.0);}'
    ].join('\n')
  };

  // THE PICTURE: the room as it is seen. The smoke, at three softnesses, lit
  // by what the lamps give it; a far layer behind that the hand cannot
  // reach; the floor and what lands on it; the truss, the lamps and their
  // lenses; the wings. One blue-white haze: every colour is made from the
  // brand's blues.
  function pictureSource(wakeOnly) {
    return HEAD + (wakeOnly ? '#define WAKE\n' : '') + ROOM + LIGHT + [
      'uniform sampler2D uDen;uniform sampler2D uSoft;uniform sampler2D uWide;uniform sampler2D uLight;uniform sampler2D uVel;uniform sampler2D uGone;',
      'uniform float uHouse;uniform float uOpen;uniform vec2 uPar;uniform vec4 uCalm;uniform float uCalmK;',
      'uniform vec4 uTouch[6];uniform vec4 uWordsA;uniform vec4 uWordsB;',
      'const vec3 INK=vec3(0.0118,0.0314,0.0706);',
      'const vec3 DEEP=vec3(0.035,0.150,0.560);',
      'const vec3 BLUE=vec3(0.169,0.435,1.000);',
      'const vec3 PALE=vec3(0.560,0.740,1.000);',
      'const vec3 WHITE=vec3(0.840,0.910,1.000);',
      'float seg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a;vec2 ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);return length(pa-ba*h);}',
      'float grain(vec2 c){vec3 p3=fract(vec3(c.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}',
      'void main(){',
      ' vec2 st=vec2(v.x,1.0-v.y);vec2 p=vec2(st.x*uAspect,st.y);float X=p.x-0.5*uAspect;',
      '#ifdef WAKE',
      // The plain wake: no fluid; the smoke parts round the last few touches.
      ' vec2 q=p;float gone=0.0;',
      ' for(int i=0;i<6;i++){vec4 t=uTouch[i];vec2 r=p-t.xy;float g=t.z*exp(-dot(r,r)/(t.w*t.w));',
      '  q-=normalize(r+vec2(0.0001))*g*0.07;gone+=g;}',
      ' float d=rest(q,uTime)*(1.0-0.72*min(gone,1.0));float ds=d;float dw=0.9*d;vec2 f1=vec2(vn(p*8.0+vec2(0.05*uTime,0.11*uTime)),vn2(p*8.0+vec2(5.0-0.04*uTime,0.09*uTime)))-0.5;',
      ' vec3 L=lightAt(p);',
      ' float mirror=0.0;vec2 air=vec2(0.0);vec2 carried=vec2(0.0);float torn=0.0;',
      '#else',
      ' vec2 air=texture2D(uVel,v).xy*vec2(1.0,-1.0);vec2 carried=texture2D(uGone,v).xy*vec2(1.0,-1.0);',
      // Where the air has pulled one place far from the next, smoke is mixed
      // to a soft haze; it is never drawn out into lines.
      ' float torn=(length(texture2D(uGone,v+vec2(0.0,0.02)).xy*vec2(1.0,-1.0)-carried)+length(texture2D(uGone,v+vec2(0.02/uAspect,0.0)).xy*vec2(1.0,-1.0)-carried))/0.02;',
      ' torn=smoothstep(0.5,1.8,torn);',
      // Smoke has no clean edge: what is looked up is frayed a little, finely.
      ' vec2 f1=vec2(vn(p*8.0+vec2(0.05*uTime,0.11*uTime)),vn2(p*8.0+vec2(5.0-0.04*uTime,0.09*uTime)))-0.5;',
      ' vec2 f2=vec2(vn2(p*19.0+vec2(0.07*uTime,0.16*uTime)),vn(p*19.0+vec2(9.0,0.13*uTime)))-0.5;',
      ' vec2 fray=(0.030*f1+0.011*f2)*vec2(1.0/uAspect,1.0);',
      ' float d=texture2D(uDen,v+fray).r;float ds=texture2D(uSoft,v+0.5*fray).r;float dw=texture2D(uWide,v).r;',
      // The beams are drawn sharp here; the card's small picture of the light
      // says only how much of each the smoke upstream has taken.
      ' vec3 Lt=texture2D(uLight,v).rgb;vec3 L=lightAt(p);',
      ' L.r=L.g*clamp(Lt.r/max(Lt.g,0.002),0.0,1.0);L.b*=clamp(Lt.b/max(L.b,0.002),0.0,1.0);',
      ' float under=st.y-uFloor;',
      ' vec2 mv=vec2(v.x,1.0-(uFloor-2.4*under));',
      ' vec3 Lm=texture2D(uLight,mv).rgb;',
      ' float mirror=(Lm.r*texture2D(uSoft,mv).r*1.3+0.3*Lm.g)*step(0.0,under);',
      '#endif',
      // The far layer: slower, softer, out of the hand's reach.
      ' vec2 fp=p+uPar*0.014;',
      ' float far=vn(fp*1.9+vec2(0.012*uTime,0.020*uTime))*vn2(fp*1.05+vec2(4.0-0.008*uTime,7.0+0.007*uTime));',
      ' far=smoothstep(0.05,0.50,far)*(0.40+0.60*st.y)*mix(1.0,0.28,uClear);',
      // Thinner behind the words, never gone.
      ' vec2 cc=(st-uCalm.xy)/uCalm.zw;float calm=1.0-uCalmK*exp(-pow(dot(cc,cc),1.3));',
      // THE WISPS: what the fluid's grid is too coarse to hold. Soft strands at
      // the glass's own fineness, curling as they rise and drawn out along the
      // air the hand has moved. Soft-edged always: smoke, never a crease.
      ' vec2 wq=(p-carried-0.03*air)*vec2(1.0,0.74);',
      ' wq+=0.15*(vec2(vn(wq*2.6+vec2(1.7,0.05*uTime)),vn2(wq*2.6+vec2(-4.2,0.04*uTime)))-0.5)+0.06*f1;',
      // Each finer layer is turned against the last, so no grain of the noise lines up.
      ' vec2 w1=mat2(0.80,0.60,-0.60,0.80)*wq;vec2 w2=mat2(0.28,0.96,-0.96,0.28)*wq;vec2 w3=mat2(-0.45,0.89,-0.89,-0.45)*wq;',
      ' float wisp=0.40*vn(w1*9.0+vec2(0.05*uTime,0.09*uTime))+0.30*vn2(w2*19.0+vec2(-0.08*uTime,0.12*uTime))+0.19*vn(w3*41.0+vec2(6.0,0.19*uTime))+0.11*vn2(w1*83.0+vec2(0.21*uTime,3.0));',
      ' wisp=smoothstep(0.26,0.76,wisp);wisp*=wisp;wisp=mix(wisp,0.30,0.85*torn);',
      // Smoke that has just been stirred is thrown up into the light.
      ' float dens=(0.86*d+0.14*ds)*(0.30+2.1*wisp)*(1.0+1.5*smoothstep(0.02,0.55,length(air)));',
      ' float body=(1.0-exp(-0.55*dens))*calm;',
      // A thin even haze hangs in the whole room, so a beam is one shaft from
      // lens to floor; the smoke and its wisps are what move through it.
      ' float inbeam=(1.0-exp(-0.55*dens-0.10-0.10*wisp))*calm;',
      // Smoke is seen where a lamp is on it. In the dark it is all but ink.
      ' float amb=0.11*uHouse+0.02;',
      ' float smoke=body*amb+inbeam*2.3*L.r+far*calm*(0.02*uHouse+0.035+0.20*L.r)+0.08*(1.0-exp(-dw))*L.r*calm+(0.02+0.05*uClear)*L.g;',
      // THE FLOOR: one line low on the glass, the pools where beams land,
      // and a sheen of the light above it.
      ' float below=st.y-uFloor;float onFloor=smoothstep(-0.002,0.004,below);',
      ' float line=exp(-below*below/0.0000032)*(0.16+0.6*L.b+0.25*L.g);',
      ' float boards=onFloor*(0.60*L.b+0.30*mirror*exp(-below*7.0)+0.07*exp(-below*5.0));',
      // THE RIG: a truss across the top, five cans on it, a lens in each.
      ' float y=st.y;',
      ' float chords=max(1.0-smoothstep(0.0024,0.0036,abs(y-0.020)),1.0-smoothstep(0.0024,0.0036,abs(y-0.052)));',
      ' float zz=abs(fract(X/0.064)-0.5)*2.0;',
      ' float web=(1.0-smoothstep(0.045,0.10,abs((y-0.020)/0.032-zz)))*step(0.020,y)*step(y,0.052);',
      ' float truss=max(chords,0.92*web);',
      ' float cans=0.0;float lens=0.0;float glow=0.0;',
      ' for(int i=0;i<5;i++){vec4 Lp=uLamp[i];vec2 dir=vec2(sin(Lp.z),cos(Lp.z));vec2 pivot=Lp.xy-' + CAN.toFixed(4) + '*dir;',
      '  vec2 pa=p-pivot;float hh=clamp(dot(pa,dir)/0.030,0.0,1.0);',
      '  cans=max(cans,1.0-smoothstep(-0.0008,0.0010,length(pa-dir*0.030*hh)-mix(0.0085,0.0125,hh)));',
      '  cans=max(cans,1.0-smoothstep(0.0026,0.0038,seg(p,vec2(pivot.x,0.050),pivot)));',
      '  float r=length((p-Lp.xy+0.003*dir));',
      '  lens+=(0.10+1.9*Lp.w)*exp(-r*r/0.000050);',
      '  glow+=Lp.w*(0.50*exp(-r*r/0.0011)+0.10*exp(-r*r/0.0075));}',
      ' float metal=max(truss,cans);',
      // THE WINGS: dark cloth either side of a wide stage.
      ' float past=abs(X)-uOpen;float wing=smoothstep(0.0,0.012,past);',
      ' float fold=0.5+0.5*sin(past*150.0+1.3*sin(y*2.3+past*9.0)+0.6*sin(y*7.0));',
      ' float cloth=wing*(0.07+0.30*fold*fold*fold*(0.30*uHouse+0.5*ds*uHouse+1.4*L.g))*(1.0-0.55*smoothstep(0.0,0.22,past))*smoothstep(0.0,0.02,past);',
      ' float edge=0.0;',
      ' float lum=smoke*(1.0-0.90*metal)*(1.0-0.88*wing)+(boards+line)*(1.0-wing)+0.20*metal*(1.0-wing)+cloth+edge+lens+glow;',
      // Behind the words the light is held to what words can be read against:
      // a lamp may cross them, it may not wash them out.
      ' vec2 wa=abs((st-uWordsA.xy)*vec2(uAspect,1.0))-uWordsA.zw*vec2(uAspect,1.0);',
      ' vec2 wb=abs((st-uWordsB.xy)*vec2(uAspect,1.0))-uWordsB.zw*vec2(uAspect,1.0);',
      ' float da=length(max(wa,0.0))+min(max(wa.x,wa.y),0.0);float db=length(max(wb,0.0))+min(max(wb.x,wb.y),0.0);',
      ' float held=1.0-smoothstep(0.0,0.07,min(da,db));',
      ' lum=mix(lum,0.56*(1.0-exp(-lum/0.56)),held);',
      ' float light=1.0-exp(-1.18*lum);',
      ' vec3 colour=light*mix(DEEP,BLUE,smoothstep(0.04,0.50,light));',
      ' colour=mix(colour,light*PALE,smoothstep(0.50,1.05,light));',
      ' colour=mix(colour,light*WHITE,smoothstep(1.3,3.6,lum));',
      ' vec2 vg=(st-0.5)*vec2(1.0,1.12);float dim=1.0-0.64*smoothstep(0.26,0.84,dot(vg,vg)*1.9);',
      ' colour*=dim;',
      ' float top=min(1.0,max(colour.r,max(colour.g,colour.b)));',
      ' vec3 outc=INK*(1.0-top)+colour;',
      // No contour in the dark blues: the least grain that hides the steps.
      ' float n=grain(gl_FragCoord.xy)+grain(gl_FragCoord.xy+vec2(37.0,17.0))-1.0;',
      ' gl_FragColor=vec4(outc+n/255.0,1.0);}'
    ].join('\n');
  }

  // ------------------------------------------------------------ the engine
  // The ladder, by itself, from the top:
  //   0  the fluid, full grid
  //   1  the fluid, a smaller grid
  //   2  the plain wake (no fluid: the smoke parts round the last touches)
  //   3  the still picture
  var gl = null, isGL2 = false, fmt = null, level = 3, P = {}, T = null, noiseTex = null, quad = null;
  var scale = 1, grid = null;
  var forced = arg('level') !== null ? parseInt(arg('level'), 10) : -1;
  var cost = { frames: 0, slow: 0, sum: 0, n: 0, checked: 0, log: [] };

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }
  var vertShader = null;
  function program(src) {
    var p = gl.createProgram();
    gl.attachShader(p, vertShader); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, src));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i += 1) {
      var name = gl.getActiveUniform(p, i).name;
      u[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u };
  }

  function target(w, h, soft) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, soft ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, soft ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, gl.RGBA, fmt.type, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: tex, fbo: fbo, w: w, h: h, ok: ok };
  }
  function pair(w, h, soft) {
    var a = target(w, h, soft), b = target(w, h, soft);
    return { read: a, write: b, w: w, h: h, swap: function () { var t = this.read; this.read = this.write; this.write = t; } };
  }
  function drop(t) { if (!t) return; if (t.read) { drop(t.read); drop(t.write); return; } gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }

  // Can this card keep numbers finer than a byte in a picture it draws to?
  // The fluid needs it. If not, the plain wake.
  function floats() {
    var f = null;
    if (isGL2) {
      if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;
      f = { internal: gl.RGBA16F, type: gl.HALF_FLOAT };
    } else {
      var hf = gl.getExtension('OES_texture_half_float');
      if (!hf || !gl.getExtension('OES_texture_half_float_linear')) return null;
      gl.getExtension('EXT_color_buffer_half_float');
      f = { internal: gl.RGBA, type: hf.HALF_FLOAT_OES };
    }
    fmt = f;
    var t = target(4, 4, true), ok = t.ok;
    drop(t);
    return ok ? f : null;
  }

  function startGL() {
    if (arg('gl') === 'off' || forced === 3) return false;
    try {
      var opts = { alpha: false, antialias: false, depth: false, stencil: false,
        powerPreference: 'default', preserveDrawingBuffer: held };
      gl = canvas.getContext('webgl2', opts);
      isGL2 = !!gl;
      if (!gl) gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      if (!gl) return false;
      vertShader = compile(gl.VERTEX_SHADER, VERT);
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);

      // One small texture of noise, the same every time, for everything soft.
      var size = 256, bytes = new Uint8Array(size * size * 4), seed = 20261117;
      for (var i = 0; i < bytes.length; i += 1) {
        seed = (seed + 0x6D2B79F5) | 0;
        var m = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        m = (m + Math.imul(m ^ (m >>> 7), 61 | m)) ^ m;
        bytes[i] = ((m ^ (m >>> 14)) >>> 0) & 255;
      }
      noiseTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, noiseTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

      var hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      var fine = hp && hp.precision > 0;
      var can = fine && arg('float') !== 'off' ? floats() : null;
      level = can ? 0 : 2;
      if (forced >= 0) level = Math.max(level, Math.min(2, forced));
      build();
      canvas.addEventListener('webglcontextlost', function (e) {
        e.preventDefault(); stopDrawing();
      });
      return true;
    } catch (e) {
      if (window.console) console.warn('The room could not be drawn; the still picture is shown.', e);
      gl = null; level = 3;
      return false;
    }
  }

  // Builds what this level needs. Called again when the level steps down or
  // the glass changes shape.
  function build() {
    if (level < 2) {
      if (!P.smoke) {
        for (var k in SH) P[k] = program(SH[k]);
        P.picture = program(pictureSource(false));
      }
    } else if (!P.wake) {
      P.wake = program(pictureSource(true));
    }
    layoutGL(true);
  }

  function layoutGL(fresh) {
    if (!gl) return;
    var w = window.innerWidth, h = window.innerHeight;
    // The picture: never at the screen's full density. A fog has no detail
    // that fine, and the phone's battery is not ours to spend.
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var budget = (w >= 1000 ? 1500000 : 800000) * (level === 0 ? 1 : level === 1 ? 0.6 : 0.5) * scale;
    var s = Math.min(dpr, Math.sqrt(budget / (w * h)));
    var cw = Math.max(2, Math.round(w * s)), ch = Math.max(2, Math.round(h * s));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    if (level >= 2) { if (T) { for (var k in T) drop(T[k]); T = null; } return; }
    // The fluid's grid: modest. Air at 100 cells across a phone, smoke at 200.
    var cells = (level === 0 ? (w >= 1000 ? 30000 : 22000) : 9000);
    var gh = Math.round(Math.sqrt(cells / room.aspect)), gw = Math.round(gh * room.aspect);
    gw = Math.max(24, gw); gh = Math.max(24, gh);
    if (!fresh && grid && Math.abs(grid.w - gw) / gw < 0.12 && Math.abs(grid.h - gh) / gh < 0.12) return;
    if (T) for (var j in T) drop(T[j]);
    grid = { w: gw, h: gh };
    var dw = gw * 2, dh = gh * 2;
    T = {
      vel: pair(gw, gh, true), gone: pair(gw, gh, true), curl: target(gw, gh, false), div: target(gw, gh, false), pre: pair(gw, gh, false),
      den: pair(dw, dh, true),
      softA: target(dw >> 1, dh >> 1, true), soft: target(dw >> 1, dh >> 1, true),
      wideA: target(dw >> 2, dh >> 2, true), wide: target(dw >> 2, dh >> 2, true),
      light: target(dw, dh, true)
    };
    settle();
  }

  var unit = 0;
  function use(prog) { gl.useProgram(prog.p); unit = 0; return prog.u; }
  function tex(loc, t) {
    if (loc == null) return;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex || t); gl.uniform1i(loc, unit); unit += 1;
  }
  function draw(to) {
    if (to) { gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo); gl.viewport(0, 0, to.w, to.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function roomUniforms(u) {
    tex(u.uNoise, noiseTex);
    gl.uniform1f(u.uAspect, room.aspect);
    gl.uniform1f(u.uTime, clock + 40);
    gl.uniform1f(u.uFloor, room.floor);
    gl.uniform1f(u.uClear, now.clear);
    gl.uniform2f(u.uName, room.name.x * room.aspect, room.name.y);
  }
  function lightUniforms(u) {
    gl.uniform4fv(u.uLamp, lampData);
    gl.uniform1f(u.uWidth, WIDTH);
    gl.uniform1f(u.uFlood, now.flood);
  }

  var splatData = new Float32Array(32), pushData = new Float32Array(16);
  function gatherSplats() {
    var n = 0, i;
    for (i = 0; i < 32; i += 1) splatData[i] = 0;
    for (i = 0; i < 16; i += 1) pushData[i] = 0;
    for (i = puffs.length - 1; i >= 0; i -= 1) {
      var b = puffs[i];
      if (b.until <= clock) { puffs.splice(i, 1); continue; }
      if (n >= 4) continue;
      splatData[n * 4] = b.x; splatData[n * 4 + 1] = 1 - b.y; splatData[n * 4 + 2] = b.r; splatData[n * 4 + 3] = b.rate;
      n += 1;
    }
    // The pushes of this frame: the newest few; older ones folded into them.
    while (pushes.length > 8 - n) { var old = pushes.shift(); pushes[0].fx += old.fx * 0.5; pushes[0].fy += old.fy * 0.5; }
    for (i = 0; i < pushes.length; i += 1) {
      var s = pushes[i];
      splatData[n * 4] = s.x; splatData[n * 4 + 1] = 1 - s.y; splatData[n * 4 + 2] = s.r; splatData[n * 4 + 3] = s.air || 0;
      pushData[n * 2] = s.fx; pushData[n * 2 + 1] = s.fy;
      n += 1;
    }
    pushes.length = 0;
  }

  // The smoke as it lies at rest, set at once: the first living frame is
  // already the finished room.
  function settle() {
    if (!T) return;
    var u = use(P.smoke);
    roomUniforms(u);
    gl.uniform1f(u.uSet, 1);
    tex(u.uVel, T.vel.read); tex(u.uDen, T.den.read);
    draw(T.den.write); T.den.swap();
    soften();
  }

  function soften() {
    var u = use(P.blur);
    tex(u.uSrc, T.den.read); gl.uniform2f(u.uStep, 1 / T.den.w, 0); draw(T.softA);
    unit = 0; tex(u.uSrc, T.softA); gl.uniform2f(u.uStep, 0, 1 / T.softA.h); draw(T.soft);
    unit = 0; tex(u.uSrc, T.soft); gl.uniform2f(u.uStep, 1.6 / T.soft.w, 0); draw(T.wideA);
    unit = 0; tex(u.uSrc, T.wideA); gl.uniform2f(u.uStep, 0, 1.6 / T.wideA.h); draw(T.wide);
  }

  var asleep = false;
  function stepFluid(dt) {
    var u, i;
    var awake = clock - lastStir < 9;
    gatherSplats();
    if (awake) {
      asleep = false;
      var tx = 1 / grid.w, ty = 1 / grid.h;
      u = use(P.advectVel);
      tex(u.uVel, T.vel.read); gl.uniform2f(u.uAsp, 1 / room.aspect, 1);
      gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uDamp, Math.exp(-dt * 0.6));
      draw(T.vel.write); T.vel.swap();

      u = use(P.curl);
      tex(u.uVel, T.vel.read); gl.uniform2f(u.uTexel, tx, ty);
      draw(T.curl);

      u = use(P.force);
      tex(u.uVel, T.vel.read); tex(u.uCurl, T.curl); tex(u.uDen, T.den.read); tex(u.uWide, T.wide);
      gl.uniform2f(u.uTexel, tx, ty); gl.uniform1f(u.uDt, dt);
      gl.uniform1f(u.uConf, 3.4); gl.uniform1f(u.uBuoy, 0.10);
      gl.uniform1f(u.uAspect, room.aspect); gl.uniform1f(u.uMax, 2.6);
      gl.uniform4fv(u.uSplat, splatData); gl.uniform2fv(u.uPush, pushData);
      draw(T.vel.write); T.vel.swap();

      u = use(P.divergence);
      tex(u.uVel, T.vel.read); gl.uniform2f(u.uTexel, tx, ty);
      gl.uniform1f(u.uAspect, room.aspect); gl.uniform1f(u.uCell, 1 / grid.h);
      gl.uniform4fv(u.uSplat, splatData);
      draw(T.div);

      u = use(P.pressure);
      gl.uniform2f(u.uTexel, tx, ty);
      var rounds = level === 0 ? 12 : 8;
      for (i = 0; i < rounds; i += 1) {
        unit = 0; tex(u.uPre, T.pre.read); tex(u.uDiv, T.div);
        draw(T.pre.write); T.pre.swap();
      }

      u = use(P.gradient);
      tex(u.uPre, T.pre.read); tex(u.uVel, T.vel.read); gl.uniform2f(u.uTexel, tx, ty);
      draw(T.vel.write); T.vel.swap();

      u = use(P.carry);
      tex(u.uVel, T.vel.read); tex(u.uGone, T.gone.read); gl.uniform2f(u.uAsp, 1 / room.aspect, 1);
      gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uKeep, Math.exp(-dt / 3.2));
      draw(T.gone.write); T.gone.swap();
    } else if (!asleep) {
      // Settled: the air is still. The fluid sleeps; only the room's own
      // slow drift goes on.
      asleep = true;
      gl.clearColor(0, 0, 0, 1);
      [T.vel.read, T.vel.write, T.pre.read, T.pre.write].forEach(function (t) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clear(gl.COLOR_BUFFER_BIT);
      });
    }

    u = use(P.smoke);
    roomUniforms(u);
    tex(u.uVel, T.vel.read); tex(u.uDen, T.den.read);
    gl.uniform2f(u.uAsp, 1 / room.aspect, 1); gl.uniform2f(u.uTexel, 1 / T.den.w, 1 / T.den.h);
    gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uLive, awake ? 1 : 0); gl.uniform1f(u.uSet, 0);
    var opening = state === 'opening';
    gl.uniform1f(u.uUp, 1 - Math.exp(-dt / 11));
    // Heaped smoke is let lie a while after a hand has been through it.
    gl.uniform1f(u.uDown, 1 - Math.exp(-dt / (opening ? 0.9 : clock - lastTouch < 12 ? 10 : 3.2)));
    gl.uniform1f(u.uSpread, Math.min(0.5, dt * 0.5));
    gl.uniform4fv(u.uSplat, splatData);
    draw(T.den.write); T.den.swap();
    soften();
  }

  var touchData = new Float32Array(24);
  function render() {
    if (!gl) return;
    var u;
    if (level < 2) {
      u = use(P.light);
      roomUniforms(u); lightUniforms(u);
      tex(u.uShade, T.soft); gl.uniform1f(u.uSigma, 0.5);
      draw(T.light);
      u = use(P.picture);
      roomUniforms(u); lightUniforms(u);
      tex(u.uDen, T.den.read); tex(u.uSoft, T.soft); tex(u.uWide, T.wide); tex(u.uLight, T.light); tex(u.uVel, T.vel.read); tex(u.uGone, T.gone.read);
    } else {
      u = use(P.wake);
      roomUniforms(u); lightUniforms(u);
      for (var i = 0; i < 6; i += 1) {
        var t = wakes[i], age = t ? clock - t.born : 99;
        var strength = t ? t.power * Math.min(1, age / 0.12) * Math.exp(-age / 1.5) : 0;
        touchData[i * 4] = t ? t.x * room.aspect : 0; touchData[i * 4 + 1] = t ? t.y : 0;
        touchData[i * 4 + 2] = strength; touchData[i * 4 + 3] = 0.07 + (t ? 0.05 * Math.min(1, age) : 0);
      }
      gl.uniform4fv(u.uTouch, touchData);
    }
    gl.uniform4f(u.uWordsA, room.wordsA[0], room.wordsA[1], room.wordsA[2], room.wordsA[3]);
    gl.uniform4f(u.uWordsB, room.wordsB[0], room.wordsB[1], room.wordsB[2], room.wordsB[3]);
    gl.uniform1f(u.uHouse, now.house);
    gl.uniform1f(u.uOpen, room.open);
    gl.uniform2f(u.uPar, pointer.x - 0.5, pointer.y - 0.5);
    gl.uniform4f(u.uCalm, room.calm.x, room.calm.y, room.calm.rx, room.calm.ry);
    gl.uniform1f(u.uCalmK, 0.56 * (1 - 0.4 * now.clear));
    draw(null);
  }

  // ------------------------------------------------------------ the glass
  function measure() {
    var w = window.innerWidth, h = window.innerHeight;
    room.w = w; room.h = h; room.aspect = w / h;
    var r = nameEl.getBoundingClientRect();
    if (r.width) { room.name.x = (r.left + r.width / 2) / w; room.name.y = (r.top + r.height / 2) / h; }
    var f = floorEl.getBoundingClientRect();
    var l = line.getBoundingClientRect();
    // The words the light is held behind: the mark, the name and the line.
    var sg = sign.getBoundingClientRect();
    if (r.width) room.wordsA = [(r.left + r.right) / 2 / w, (sg.top + l.bottom) / 2 / h, r.width / 2 / w, (l.bottom - sg.top) / 2 / h];
    if (f.height) {
      room.wordsB = [(f.left + f.right) / 2 / w, (f.top + f.bottom) / 2 / h, f.width / 2 / w, f.height / 2 / h];
      // The stage floor: one line, low, clear of everything that is pressed.
      room.floor = Math.max(0.80, Math.min(0.92, (f.bottom + Math.max(26, 0.035 * h)) / h));
      var top = r.top + r.height * 0.1, bottom = f.bottom + 10;
      room.calm.x = (f.left + f.width / 2) / w; room.calm.y = (top + bottom) / 2 / h;
      room.calm.rx = (Math.max(f.width, r.width) / 2 + 60) / w; room.calm.ry = ((bottom - top) / 2 + 44) / h;
    }
    // Wings only where the glass is wide enough to have them.
    room.open = room.aspect > 1.25 ? Math.min(0.5 * room.aspect - 0.10, 0.84) : 9;
  }

  function css(el, name, value) {
    if (shown[name] === value) return;
    shown[name] = value; el.style.setProperty(name, value);
  }

  var litShown = -1, litAt = -1;
  function paint(onName) {
    // The name takes the light that is on it; held dark in the beat before
    // the lamps find it, and lit whole when they do.
    var lit = clamp01(0.16 * now.house + 0.5 * onName + 0.5 * now.flood) * (1 - 0.92 * extra.dark);
    // Written when it has moved enough to see and not more than ten times a
    // second (every frame only in the opening): each write redraws the name.
    var swift = state === 'opening' || held;
    if (swift || (Math.abs(lit - litShown) >= 0.03 && clock - litAt >= 0.1)) {
      litShown = lit; litAt = clock;
      css(sign, '--lit', lit.toFixed(2));
    }
    css(root, '--form', extra.form.toFixed(3));
    css(root, '--c1', extra.c1.toFixed(3));
    css(root, '--c2', extra.c2.toFixed(3));
    render();
  }

  function take(look) { for (var k in now) if (k in look) now[k] = look[k]; }

  function applyScore(Tm) {
    var s = score(Tm, openFrom || LOOKS.checking);
    take(s);
    extra.form = s.form; extra.dark = s.dark; extra.c1 = s.c1; extra.c2 = s.c2;
    if (s.lit && !line.classList.contains('in')) { line.textContent = 'You’re in.'; line.classList.add('in'); }
    if (s.c1 > 0 && ways.hidden) {
      // The form is gone from here: focus goes to the line that says so, at
      // once, so it is never left on nothing.
      var had = form.contains(document.activeElement) || document.activeElement === document.body;
      ways.hidden = false; form.hidden = true; measure();
      if (had && !held) line.focus({ preventScroll: true });
    }
    // The parting: air let in at the name, so the smoke is pushed out from
    // it. No drawn ring; the fluid does it.
    if (Tm >= 0.85 && Tm < 1.75) {
      var k = Math.sin(Math.PI * span(Tm, 0.85, 1.75));
      puffs.length = 0;
      puffs.push({ x: room.name.x, y: room.name.y + 0.10, r: 0.15 + 0.05 * Math.min(2, room.aspect), rate: 5.5 * k, until: clock + 0.05 });
      wakes.length = 0;
      wakes.push({ x: room.name.x, y: room.name.y + 0.1, born: clock - 0.3, power: 0 });
    }
    stir();
  }

  // One step of everything, dt seconds long.
  function frame(dt, show) {
    clock += dt;
    runTimers();
    runScript();
    if (state === 'opening') {
      var Tm = clock - openedAt;
      applyScore(Math.min(Tm, END));
      if (Tm >= END) arrived();
    } else {
      // Everything else eases toward what its state asks for: the lamps go
      // down quickly and come back slowly.
      var want = LOOKS[state] || LOOKS.waiting;
      for (var k in now) {
        var rate = want[k] < now[k] ? 5.5 : (state === 'waiting' ? 0.8 : 2.2);
        now[k] += (want[k] - now[k]) * (1 - Math.exp(-dt * rate));
      }
    }
    lampClock += dt;
    var onName = aimLamps();
    if (gl && level < 2) stepFluid(dt);
    else { pushes.length = 0; }
    if (show) paint(onName);
  }

  // ------------------------------------------------------------ the pace
  // Every frame while the smoke is moving or the room is opening; thirty a
  // second once the air has settled (asked for by a timer, so the screen is
  // not woken at every refresh to be told no); nothing at all once the room
  // has gone untouched for REST seconds, until it is touched again; none
  // while the tab is hidden; none under reduced motion or on the still
  // picture.
  var raf = 0, last = 0, pause = 0;
  var live = false;   // is anything being drawn at all
  var resting = false, seen = 0;

  // Anything that happens to the room: a hand, a key, a change of state.
  function wake() {
    seen = clock;
    if (resting) { resting = false; root.classList.remove('resting'); last = 0; }
    if (pause) { clearTimeout(pause); pause = 0; }
    if (live && !raf && !document.hidden && !held) raf = requestAnimationFrame(tick);
  }

  function next(gap) {
    if (gap > 0) {
      pause = setTimeout(function () { pause = 0; if (live && !raf && !document.hidden) raf = requestAnimationFrame(tick); }, Math.max(0, gap * 1000 - 8));
    } else raf = requestAnimationFrame(tick);
  }

  function tick(t) {
    raf = 0;
    if (document.hidden || !live) return;
    var busy = state === 'opening' || state === 'checking' || clock - lastStir < 9;
    var gap = busy ? 0 : 0.033;
    if (!last) last = t - 16;
    var dt = (t - last) / 1000;
    last = t;
    watch(dt, busy, gap);
    frame(Math.min(dt, 1 / 24), true);
    if (!busy && timers.length === 0 && clock - seen > REST) {
      // The last frame stays on the glass. Nothing runs until a touch.
      resting = true; root.classList.add('resting');
      return;
    }
    next(gap);
  }

  // The first second of frames is measured, and after that every few
  // seconds of moving smoke; a device that cannot keep up is stepped down
  // the ladder, by itself.
  function watch(dt, busy, gap) {
    if (!gl || forced >= 0) return;
    if (arg('slow')) dt = parseFloat(arg('slow')) / 1000;
    cost.frames += 1;
    if (cost.frames <= 8) return;                      // the first frames compile and settle
    var first = cost.checked === 0;
    if (!first && !busy) return;
    cost.sum += dt; cost.n += 1;
    // Under thirty frames a second, or, while the room is paced, well late
    // for the pace it was given: a sixty-hertz phone idling is not a slow one.
    if (dt > Math.max(0.034, gap + 0.02)) cost.slow += 1;
    var enough = first ? cost.sum >= 1 : cost.n >= 150;
    if (!enough) return;
    // More than half the frames late: one stumble while the page loads is
    // not a slow phone, a second of them is.
    var late = cost.slow / cost.n;
    cost.log.push({ level: level, mean: Math.round(cost.sum / cost.n * 1000), late: late });
    cost.checked += 1; cost.sum = 0; cost.n = 0; cost.slow = 0;
    if (late > 0.5) stepDown();
  }

  function stepDown() {
    if (level >= 3) return;
    level += 1;
    cost.checked = 0; cost.frames = 0;                 // measure the new level's first second too
    root.setAttribute('data-level', String(level));
    if (level === 3) { stopDrawing(); return; }
    try { build(); } catch (e) { level = 3; stopDrawing(); }
  }

  // From here the room is the still picture. Whatever was under way is
  // finished plainly, and anything waiting on the clock still gets its turn.
  function stopDrawing() {
    live = false; gl = null; level = 3;
    root.classList.remove('gl');
    root.setAttribute('data-level', '3');
    preloadOpen();
    if (state === 'opening') { take(LOOKS.open); arrived(); }
    if (timers.length && !held) pump();
  }

  function preloadOpen() {
    // The still room's second picture, fetched before it is needed.
    var a = room.aspect, cut = a >= 1 ? 'wide' : a >= 0.6 ? 'mid' : 'tall';
    var img = new Image(); img.src = 'assets/the-door/open-' + cut + '.webp';
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; if (pause) clearTimeout(pause); pause = 0; last = 0; }
    else { last = 0; stale(); wake(); }
  });
  var resizing = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizing);
    resizing = setTimeout(function () { measure(); layoutGL(false); if (held) paint(aimLamps()); wake(); }, 140);
  }, { passive: true });

  // ------------------------------------------------------------ the words
  function say(words) {
    if (!words) { said.classList.remove('on'); said.textContent = ''; return; }
    said.textContent = words;
    said.classList.add('on');
  }

  function busyNow(on) {
    go.setAttribute('aria-disabled', on ? 'true' : 'false');
    pw.readOnly = on;
    aside.textContent = on ? 'One moment.' : '';
  }

  // Asks the door. Calls back with the links, or with why not: 'wrong',
  // 'closed', 'locked' (and when it lifts), or 'unreachable'. The password
  // goes nowhere else and is kept nowhere.
  function ask(password, yes, no) {
    if (framed) { no('unreachable'); return; }
    if (demo === 'hang') return hang(no);
    if (demo) {
      after(1.4, function () {
        if (demo === 'wrong') no('wrong');
        else if (demo === 'closed') no('closed');
        else if (demo === 'locked') no('locked', new Date(Math.ceil(Date.now() / 3600000) * 3600000).toISOString());
        else yes({ ios_url: '#iphone-placeholder', android_url: '#android-placeholder' });
      });
      return;
    }
    // A door that has not answered in a quarter of a minute is not going to:
    // the lights never stay down on a request that hangs.
    var done = false, stop = window.AbortController ? new AbortController() : null;
    var gaveUp = setTimeout(function () {
      if (done) return;
      done = true;
      if (stop) stop.abort();
      no('unreachable');
    }, PATIENCE);
    var answer = function (fn) { return function (a, b) { if (done) return; done = true; clearTimeout(gaveUp); fn(a, b); }; };
    yes = answer(yes); no = answer(no);
    fetch(ENDPOINT, {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password }),
      signal: stop ? stop.signal : undefined
    }).then(function (res) {
      return res.json().then(function (body) { return { status: res.status, body: body || {} }; },
        function () { return { status: res.status, body: {} }; });
    }).then(function (r) {
      var b = r.body;
      if (r.status === 200 && (safe(b.ios_url) || safe(b.android_url))) {
        yes({ ios_url: b.ios_url || null, android_url: b.android_url || null });
      } else if (r.status === 401 || (r.status === 400 && b.error === 'invalid')) no('wrong');
      else if (r.status === 429) no('locked', b.retry_at);
      else if (r.status === 403 && b.closed) no('closed');
      else no('unreachable');
    }, function () { no('unreachable'); });
  }

  // Local demo only (?demo=hang): a door that never answers.
  function hang(no) { setTimeout(function () { no('unreachable'); }, PATIENCE); }

  function lifted(when) {
    var d = when ? new Date(when) : null;
    if (!d || isNaN(d.getTime())) return 'Too many tries. Try again later.';
    var clockTime;
    try { clockTime = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { clockTime = ''; }
    return clockTime ? 'Too many tries. Try again after ' + clockTime + '.' : 'Too many tries. Try again later.';
  }

  var back = null;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state === 'checking' || state === 'opening') return;
    if (back) { cancel(back); back = null; }
    if (!pw.value) {
      pw.setAttribute('aria-invalid', 'true');
      say('The password first.');
      pw.focus();
      return;
    }
    pw.removeAttribute('aria-invalid');
    say('');
    busyNow(true);
    setState('checking');           // the house lights go down
    var asked = clock;
    ask(pw.value, function (links) {
      // Never less than a breath of dark before the answer.
      var wait = Math.max(0, 0.7 - (clock - asked));
      if (reduce || !live) open(links); else after(wait, function () { open(links); });
    }, function (why, when) {
      refuse(why, when);
    });
    if (!live && !held) pump();
  });

  function refuse(why, when) {
    busyNow(false);
    setState(why === 'closed' ? 'closed' : why === 'locked' ? 'locked' : 'wrong');   // and do not come up
    if (why === 'wrong') pw.setAttribute('aria-invalid', 'true');
    say(why === 'wrong' ? 'Not that one. Try again.'
      : why === 'closed' ? 'The doors are closed for now.'
      : why === 'locked' ? lifted(when)
      : 'The door didn’t answer. Try again.');
    // A small puff rolls off the field.
    var f = pw.getBoundingClientRect();
    if (f.width && why === 'wrong') puff((f.left + f.width / 2) / room.w, (f.bottom + 4) / room.h, 0.045, 11, 0.14);
    if (!held) { pw.focus(); if (why === 'wrong') pw.select(); }
    if (why === 'wrong' || why === 'unreachable') {
      back = after(2.8, function () { back = null; if (state === 'wrong') setState('waiting'); });
    }
    if (!live && !held) pump();
  }

  // With nothing being drawn (the still picture) the clock is still needed
  // for the few things that wait: it is pumped only while something does.
  var pumping = 0;
  function pump() {
    if (pumping) return;
    var prev = performance.now();
    pumping = setInterval(function () {
      var t = performance.now();
      clock += (t - prev) / 1000; prev = t;
      runTimers();
      if (!timers.length) { clearInterval(pumping); pumping = 0; }
    }, 100);
  }

  pw.addEventListener('focus', wake);
  pw.addEventListener('input', function () {
    wake();
    if (said.textContent) { say(''); pw.removeAttribute('aria-invalid'); }
    if (state === 'wrong') { if (back) { cancel(back); back = null; } setState('waiting'); }
  });

  see.addEventListener('click', function () {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    see.setAttribute('aria-pressed', show ? 'true' : 'false');
    see.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  go.addEventListener('click', function (e) {
    if (go.getAttribute('aria-disabled') === 'true') e.preventDefault();
  });

  var keptAt = 0;

  function open(links) {
    busyNow(false);
    if (!setWays(links)) { refuse('unreachable'); return; }
    keptAt = Date.now();
    try {
      sessionStorage.setItem(KEPT, JSON.stringify({ ios_url: links.ios_url, android_url: links.android_url, at: keptAt }));
    } catch (e) { /* private mode: asked again next time */ }
    pw.value = '';
    if (reduce || !live) {
      // The still picture and a simple fade: nothing travels.
      extra.form = 0;
      arrived();
      take(LOOKS.open);
      paint(aimLamps());
      return;
    }
    openFrom = { house: now.house, beam: now.beam, wander: now.wander };
    openedAt = clock;
    setState('opening');
  }

  // The room is open: the ordinary page from here.
  function arrived() {
    state = 'open';
    root.setAttribute('data-state', 'open');
    extra.form = 0; extra.dark = 0; extra.c1 = 1; extra.c2 = 1;
    form.hidden = true; ways.hidden = false;
    line.textContent = 'You’re in.'; line.classList.add('in');
    css(root, '--form', '0'); css(root, '--c1', '1'); css(root, '--c2', '1');
    measure();
    // Said once, and the next Tab is the first way in.
    if (!held && (document.activeElement === document.body || form.contains(document.activeElement))) line.focus({ preventScroll: true });
  }

  // The Android link is good for ten minutes. When the links have aged, the
  // room asks again rather than hand over a dead one.
  function stale() {
    if (state !== 'open' || demo || !keptAt || Date.now() - keptAt < FRESH) return false;
    try { sessionStorage.removeItem(KEPT); } catch (e) { /* nothing kept */ }
    keptAt = 0;
    ways.hidden = true; form.hidden = false;
    ios.removeAttribute('href'); android.removeAttribute('href');
    line.textContent = 'Where music lives.'; line.classList.remove('in');
    extra.form = 1; extra.c1 = 0; extra.c2 = 0;
    css(root, '--form', '1'); css(root, '--c1', '0'); css(root, '--c2', '0');
    setState('waiting');
    measure();
    say('The password again.');
    pw.focus();
    return true;
  }
  ways.addEventListener('click', function (e) { if (stale()) e.preventDefault(); });
  setInterval(function () { if (!document.hidden) stale(); }, 30000);

  // ------------------------------------------------------------ begin
  var kept = null;
  try { kept = JSON.parse(sessionStorage.getItem(KEPT) || 'null'); } catch (e) { kept = null; }
  if (kept && !(Date.now() - kept.at < FRESH)) kept = null;

  function begin() {
    measure();
    live = !reduce && startGL();
    if (live) { measure(); layoutGL(true); root.classList.add('gl'); root.setAttribute('data-level', String(level)); listen(); }
    else preloadOpen();

    if (held) { hold(); return; }

    if (kept && setWays(kept)) {
      keptAt = kept.at;
      take(LOOKS.open);
      arrived();
      if (live) settle();
    }
    if (live) { paint(aimLamps()); wake(); }
  }

  // Local demo only: the room is stepped by hand, never by the screen, so
  // any moment can be reached exactly and photographed.
  function advance(seconds, fps) {
    var step = 1 / (fps || 60), n = Math.max(1, Math.round(seconds / step));
    for (var i = 0; i < n; i += 1) frame(step, i === n - 1);
  }
  function hold() {
    var lamps = parseFloat(arg('lamps') || '0') || 0;
    lampClock = lamps;
    var t = parseFloat(arg('t') || '0') || 0;
    var submit = function () { pw.value = 'backstage'; form.dispatchEvent(new Event('submit', { cancelable: true })); };
    advance(1.5);
    if (shot === 'checking') { submit(); advance(0.9 + t); }
    else if (shot === 'wrong' || shot === 'closed' || shot === 'locked') {
      demo = shot; submit(); pw.value = shot === 'wrong' ? 'backstage' : ''; advance(1.4 + 0.9 + t);
    }
    else if (shot === 'opening' || shot === 'open') {
      demo = '1'; submit();
      if (reduce || !live) { advance(1.5); }
      else { advance(1.4 + 1 / 60); advance(Math.max(1 / 60, shot === 'open' ? END + 1.2 + t : t)); }
    }
    else if (t > 0) advance(t);
    paint(aimLamps());
    if (window.console) console.info('the door: level ' + level + (gl ? '' : ' (still)'));
    // Left for the local harness that films the room.
    window.theDoor = {
      advance: function (s, fps) { advance(s, fps); return clock; },
      submit: submit,
      state: function () { return { state: state, level: level, clock: clock, gl: !!gl, grid: grid, canvas: [canvas.width, canvas.height], cost: cost.log }; },
      look: function (k, val) { now[k] = val; },
      still: function (type, quality) { paint(aimLamps()); return canvas.toDataURL(type || 'image/webp', quality || 0.86); },
      time: function (frames) {
        // The cost of a frame: every pass and the picture, finished on the
        // card (a pixel is read back to be sure), averaged.
        var px = new Uint8Array(4), t0 = performance.now();
        for (var i = 0; i < frames; i += 1) { lastStir = clock; frame(1 / 60, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
        return (performance.now() - t0) / frames;
      },
      // The brightest and the mean light behind a box of the page (CSS px).
      behind: function (x, y, w, h) {
        var k = canvas.width / window.innerWidth, j = canvas.height / window.innerHeight;
        var X = Math.max(0, Math.floor(x * k)), W = Math.max(1, Math.min(canvas.width - X, Math.ceil(w * k)));
        var H = Math.max(1, Math.ceil(h * j)), Y = Math.max(0, canvas.height - Math.floor(y * j) - H);
        var px = new Uint8Array(W * H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(X, Y, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        var lin = function (c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        var top = [0, 0, 0], topL = -1, sum = 0;
        for (var i = 0; i < px.length; i += 4) {
          var L = 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
          sum += L;
          if (L > topL) { topL = L; top = [px[i], px[i + 1], px[i + 2]]; }
        }
        return { brightest: top, mean: sum / (px.length / 4), lit: parseFloat(sign.style.getPropertyValue('--lit')) };
      },
      renderer: function () {
        var d = gl && gl.getExtension('WEBGL_debug_renderer_info');
        return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
      }
    };
  }

  if (document.fonts && document.fonts.ready) {
    var began = false;
    var once = function () { if (!began) { began = true; begin(); } };
    document.fonts.ready.then(once);
    setTimeout(once, 1200);
  } else {
    begin();
  }
})();
