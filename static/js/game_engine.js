/* ================================================================
   ShikshaSetu — Game Engine v4.0
   Grades 6-12 | Physics · Chemistry · Biology · Maths · Python
   ================================================================
   ARCHITECTURE OVERVIEW
   ─────────────────────
   • routeGame()         — entry point called by game.html after user clicks "Launch Mission"
   • dispatchXxx(grade)  — routes each subject to the correct game function for that grade
   • Each game function  — self-contained: manages its own canvas loop, input, scoring, timer
   • mcqEngine()         — shared MCQ renderer used by multiple subjects/grades
   • finishMission()     — called by every game when time/lives run out → shows results screen

   GLOBALS PROVIDED BY game.html (do NOT redeclare here)
   ───────────────────────────────────────────────────────
   • SUBJECT_RAW  — raw string e.g. "Physics"
   • SUBJECT      — lowercased e.g. "physics"
   • GRADE        — integer e.g. 10
   • score        — current session score (let, so we can write it)
   • showMissionComplete(score, accuracy, timeTaken) — defined in game.html
   • submitXP()   — defined in game.html

   MCQ ANS BUG FIX (v4.0)
   ────────────────────────
   All question banks had ans:0 (correct answer always option A).
   Fix: shuffleQuestion() shuffles opts array and recalculates ans index.
   Applied in mcqEngine via nextQ(), and in physicsShooter via nextQ().
================================================================ */

'use strict';

/* ─────────────────────────────────────────────
   SECTION 1 — CORE UTILITIES
   Shared by every game in this file
───────────────────────────────────────────── */

let score = 0;               // current session score — written by each game
let spawnInterval = null;    // holds setInterval ID for enemy/block spawners
let timerInterval = null;    // holds setInterval ID for countdown timers

/* initGame — called by game.html when player clicks "Launch Mission"
   Resets all HUD values then routes to correct game via routeGame() */
function initGame() {
  score = 0;
  updateHUD(0);
  updateHealth(100);
  updateProgress(0);
  updateCombo(1);
  routeGame();
}

/* finishMission — called by every game when it ends
   Clamps score to 0+, then hands off to game.html's showMissionComplete */
function finishMission(accuracy, timeTaken) {
  score = Math.max(0, Math.round(score));
  if (typeof showMissionComplete === 'function') {
    showMissionComplete(score, accuracy || 0, timeTaken || 0);
  }
}

/* HUD updaters — each safely checks the element exists before writing */
function updateHUD(s)      { const e = document.getElementById('scoreDisplay');  if (e) e.textContent = s; }
function updateProgress(p) { const b = document.getElementById('progressBar'),   l = document.getElementById('progressPct');  if (b) b.style.width = p + '%'; if (l) l.textContent = p + '%'; }
function updateHealth(p)   { const b = document.getElementById('healthBar'),     l = document.getElementById('healthPct');    if (b) b.style.width = p + '%'; if (l) l.textContent = p + '%'; }
function updateCombo(c)    { const e = document.getElementById('comboDisplay');  if (e) e.textContent = 'x' + c; }
function setLevelTitle(t)  { const e = document.getElementById('levelTitle');    if (e) e.textContent = t; }

/* updateTimer — formats seconds as MM:SS and writes to HUD */
function updateTimer(t) {
  const e = document.getElementById('timerDisplay');
  if (e) e.textContent = Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60);
}

/* showFloatingText — creates a DOM element that floats upward over the canvas
   col: CSS colour string, x/y: canvas-space coordinates */
function showFloatingText(text, x, y, col) {
  const canvas = document.getElementById('gameCanvas');
  const r  = canvas.getBoundingClientRect();
  const sx = r.width  / canvas.width;
  const sy = r.height / canvas.height;
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `
    position:fixed;
    left:${r.left + x * sx}px;
    top:${r.top + y * sy}px;
    transform:translate(-50%,-50%);
    color:${col};
    font-family:'Outfit',sans-serif;
    font-weight:800;
    font-size:14px;
    pointer-events:none;
    z-index:9999;
    text-shadow:0 0 10px ${col};
    animation:floatUp 1s ease-out forwards;
  `;
  /* Inject keyframe once into <head> */
  if (!document.getElementById('ftStyle')) {
    const s = document.createElement('style');
    s.id = 'ftStyle';
    s.textContent = '@keyframes floatUp{from{opacity:1;transform:translate(-50%,-50%)}to{opacity:0;transform:translate(-50%,-220%)}}';
    document.head.appendChild(s);
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

/* shakeCanvas — CSS transform shake effect for wrong answers */
function shakeCanvas(c) {
  let frame = 0;
  const id = setInterval(() => {
    c.style.transform = `translate(${(Math.random() - .5) * 10}px,${(Math.random() - .5) * 10}px)`;
    if (++frame > 8) { clearInterval(id); c.style.transform = ''; }
  }, 40);
}

/* gpos — converts a mouse/touch client position to canvas-space coordinates
   Handles canvas CSS scaling (canvas may be rendered at a different size than its pixel dimensions) */
function gpos(canvas, e) {
  const r   = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - r.left) * (canvas.width  / r.width),
    y: (src.clientY - r.top)  * (canvas.height / r.height)
  };
}

/* shuffleQuestion — takes a question object {q, opts, ans, fact?}
   Shuffles the opts array and recalculates ans to point to the same correct answer.
   Returns a NEW object — original bank entry is not mutated.
   THIS IS THE FIX for the "option A always correct" bug. */
function shuffleQuestion(q) {
  const correctText = q.opts[q.ans]; // save the text of the correct option
  const shuffled    = q.opts.slice().sort(() => Math.random() - 0.5);
  const newAns      = shuffled.indexOf(correctText);
  return { ...q, opts: shuffled, ans: newAns };
}


/* ─────────────────────────────────────────────
   SECTION 2 — ROUTER
   Determines which game to launch based on subject + grade
───────────────────────────────────────────── */

function routeGame() {
  const s = SUBJECT, g = GRADE;
  if      (s === 'physics')                                       dispatchPhysics(g);
  else if (s === 'chemistry')                                     dispatchChemistry(g);
  else if (s === 'biology')                                       dispatchBiology(g);
  else if (s === 'mathematics' || s === 'maths' || s === 'math') dispatchMaths(g);
  else if (s === 'python'      || s === 'coding')                 dispatchPython(g);
  else if (s === 'java')                                          dispatchJava(g);
  else if (s === 'html'        || s === 'html/css')               dispatchHTML(g);
  else dispatchPhysics(6);
}

function dispatchPhysics(g) {
  setLevelTitle('⚡ Physics — Grade ' + g);
  if      (g <= 7)  physicsArcade(g);       // Grade 6-7: Catch the correct block (arcade)
  else if (g === 8) physicsCircuit(g);      // Grade 8:   Circuit Builder (drag wire/resistors)
  else if (g === 9) physicsShooter(g);      // Grade 9:   Gravity Sniper shooter
  else if (g === 10) physicsWave(g);        // Grade 10:  Wave Oscilloscope sliders
  else              physicsMCQ(g);          // Grade 11-12: Particle Collider
}
function dispatchChemistry(g) {
  setLevelTitle('⚗️ Chemistry — Grade ' + g);
  if      (g <= 7)  chemLab(g);            // Grade 6-7: Potion drag-and-drop lab
  else if (g <= 9)  chemHeist(g);          // Grade 8-9: Periodic Table Spy Heist
  else if (g === 10) chemTitration(g);     // Grade 10:  Titration Simulator
  else              chemAdvanced(g);        // Grade 11-12: Molecule Forge
}
function dispatchBiology(g) {
  setLevelTitle('🧬 Biology — Grade ' + g);
  if      (g <= 7)  bioDefence(g);         // Grade 6-7: WBC Defender shooter
  else if (g === 8) bioDNA(g);             // Grade 8:   DNA Helix Builder
  else if (g === 9) bioMembrane(g);        // Grade 9:   Cell Membrane Gate (Allow/Block)
  else if (g === 10) bioMCQ(g);            // Grade 10:  Ecosystem Architect
  else              bioNeuron(g);           // Grade 11-12: Neuron Chain Reaction
}
function dispatchMaths(g) {
  setLevelTitle('📐 Maths — Grade ' + g);
  if      (g <= 7)  mathsNinja(g);         // Grade 6-7: Ninja blade bubbles
  else if (g === 8) mathsLaser(g);         // Grade 8:   Laser Geometry
  else if (g === 9) mathsCannon(g);        // Grade 9:   Quadratic Cannon
  else if (g === 10) mathsGraphSniper(g);  // Grade 10:  Graph Sniper (shoot points on function)
  else              mathsAdvanced(g);       // Grade 11-12: Calculus Coaster
}
function dispatchPython(g) {
  setLevelTitle('🐍 Python — Grade ' + g);
  if      (g <= 8)  pythonFill(g);         // Grade 7-8:  Fill in the blank
  else if (g === 9) codeRace(g,'python');  // Grade 9:    Code Race — syntax sprint
  else if (g === 10) debugDungeon(g,'python'); // Grade 10: Debug Dungeon
  else              compileRun(g,'python'); // Grade 11-12: Compile & Run terminal
}
function dispatchJava(g) {
  setLevelTitle('☕ Java — Grade ' + g);
  if      (g <= 8)  javaFill(g);           // Grade 6-8:  Fill-in-blank Java syntax
  else if (g === 9) codeRace(g,'java');    // Grade 9:    Code Race — Java sprint
  else if (g === 10) debugDungeon(g,'java');// Grade 10:   Debug Dungeon Java
  else if (g === 11) javaTowerDefense(g);  // Grade 11:   Java Tower Defense
  else              compileRun(g,'java');   // Grade 12:   Compile & Run terminal
}
function dispatchHTML(g) {
  setLevelTitle('🌐 HTML — Grade ' + g);
  if      (g <= 8)  htmlArchitect(g);      // Grade 6-8:  HTML Architect (drag tags to live preview)
  else if (g <= 10) codeRace(g,'html');    // Grade 9-10: Code Race HTML/CSS
  else              compileRun(g,'html');   // Grade 11-12: Compile & Run (browser render)
}


/* ─────────────────────────────────────────────
   SECTION 3 — SHARED MCQ ENGINE
   Used by: physicsMCQ, chemMCQ, chemAdvanced, bioMCQ, mathsBubble, mathsAdvanced
   Renders animated MCQ cards on a canvas with particle effects.

   Parameters:
   • canvas, ctx   — the game canvas and its 2d context
   • bank          — array of {q, opts:[str], ans:number, fact?:str}
   • g             — grade number (for display)
   • accentCol     — theme colour e.g. '#00C3FF'
   • label         — subject label e.g. 'Physics'
   • totalTime     — seconds for the round
───────────────────────────────────────────── */
function mcqEngine(canvas, ctx, bank, g, accentCol, label, totalTime) {
  let localScore = 0, lives = 3, time = totalTime || 90;
  let isOver = false, animId;
  let qIdx = 0, currentQ = null, selected = null, answered = false;
  let particles = [];

  /* nextQ — picks next question, shuffles its options so correct answer
     is NOT always option A (this is the fix for the original bug) */
  function nextQ() {
    const raw = bank[qIdx % bank.length];
    currentQ  = shuffleQuestion(raw); // ← shuffle opts, recalculate ans
    qIdx++;
    selected = null;
    answered = false;
  }

  /* burst — spawns celebration particles at (x,y) */
  function burst(x, y, col, n = 18) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - .5) * 10,
        vy: (Math.random() - .5) * 10,
        r: Math.random() * 4 + 2,
        life: 1, col
      });
    }
  }

  function draw() {
    /* Background gradient */
    const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gr.addColorStop(0, '#030c1a');
    gr.addColorStop(1, '#060820');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!currentQ) return;

    /* Progress bar at top */
    const prog = (qIdx / bank.length) * canvas.width;
    const pgr  = ctx.createLinearGradient(0, 0, prog, 0);
    pgr.addColorStop(0, accentCol);
    pgr.addColorStop(1, accentCol + '88');
    ctx.fillStyle = pgr;
    ctx.fillRect(0, 0, prog, 5);

    /* Question card */
    ctx.save();
    ctx.fillStyle   = 'rgba(10,5,30,0.92)';
    ctx.strokeStyle = accentCol + '55';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.roundRect(36, 28, canvas.width - 72, 90, 16);
    ctx.fill();
    ctx.stroke();
    /* Grade + subject label (top-right) */
    ctx.font      = '10px Outfit';
    ctx.fillStyle = accentCol + '88';
    ctx.textAlign = 'right';
    ctx.fillText('Gr.' + g + ' ' + label, canvas.width - 50, 50);
    /* Question text */
    ctx.font        = 'bold 15px Outfit';
    ctx.fillStyle   = '#fff';
    ctx.textAlign   = 'center';
    ctx.shadowBlur  = 6;
    ctx.shadowColor = accentCol + '66';
    ctx.fillText('Q' + qIdx + ':  ' + currentQ.q, canvas.width / 2, 82);
    ctx.shadowBlur = 0;
    ctx.restore();

    /* Fact banner shown after answering */
    if (answered && currentQ.fact) {
      ctx.save();
      ctx.fillStyle   = 'rgba(0,20,30,0.85)';
      ctx.strokeStyle = accentCol + '44';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.roundRect(36, 126, canvas.width - 72, 32, 10);
      ctx.fill();
      ctx.stroke();
      ctx.font      = '11px Outfit';
      ctx.fillStyle = accentCol;
      ctx.textAlign = 'center';
      ctx.fillText('💡 ' + currentQ.fact, canvas.width / 2, 146);
      ctx.restore();
    }

    /* Answer options */
    const startY  = (answered && currentQ.fact) ? 170 : 136;
    const optH    = 54, optGap = 12;
    currentQ.opts.forEach((opt, i) => {
      const oy = startY + i * (optH + optGap);
      let bg = 'rgba(255,255,255,0.04)', border = 'rgba(255,255,255,0.09)', textCol = '#bbb', icon = '';

      if (answered) {
        if (i === currentQ.ans) {
          bg = accentCol + '22'; border = accentCol; textCol = accentCol; icon = '✓ ';
        } else if (i === selected) {
          bg = 'rgba(255,45,155,0.12)'; border = '#FF2D9B'; textCol = '#FF2D9B'; icon = '✗ ';
        }
      } else if (i === selected) {
        bg = accentCol + '15'; border = accentCol + '80'; textCol = '#fff';
      }

      ctx.save();
      ctx.fillStyle   = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth   = 1.8;
      ctx.shadowBlur  = (answered && i === currentQ.ans) ? 20 : 0;
      ctx.shadowColor = accentCol;
      ctx.beginPath();
      ctx.roundRect(56, oy, canvas.width - 112, optH, 12);
      ctx.fill();
      ctx.stroke();

      /* Option letter circle (A / B / C / D) */
      ctx.fillStyle = (answered)
        ? (i === currentQ.ans ? accentCol : 'rgba(255,255,255,0.15)')
        : 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.arc(82, oy + optH / 2, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.font          = 'bold 12px Outfit';
      ctx.fillStyle     = '#fff';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.shadowBlur    = 0;
      ctx.fillText(String.fromCharCode(65 + i), 82, oy + optH / 2);

      /* Option text */
      ctx.font          = '13px Outfit';
      ctx.fillStyle     = textCol;
      ctx.textAlign     = 'left';
      ctx.textBaseline  = 'alphabetic';
      ctx.fillText(icon + opt, 106, oy + optH / 2 + 5);
      ctx.restore();
    });

    /* Particle effects */
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.x    += p.vx;
      p.y    += p.vy;
      p.life -= 0.025;
      if (p.life <= 0) particles.splice(i, 1);
      ctx.restore();
    }

    /* Lives display (hearts) */
    ctx.font         = '16px sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    let h = '';
    for (let i = 0; i < 3; i++) h += i < lives ? '❤️ ' : '🖤 ';
    ctx.fillText(h, 12, canvas.height - 10);
  }

  /* handleClick — checks if click lands inside any option rectangle */
  function handleClick(e) {
    if (!currentQ || answered) return;
    const { x, y } = gpos(canvas, e);
    const startY = 136, optH = 54, optGap = 12;

    for (let i = 0; i < currentQ.opts.length; i++) {
      const oy = startY + i * (optH + optGap);
      if (x >= 56 && x <= canvas.width - 56 && y >= oy && y <= oy + optH) {
        selected = i;
        answered = true;
        if (i === currentQ.ans) {
          localScore += 25;
          score = localScore;
          updateHUD(localScore);
          burst(canvas.width / 2, 220, accentCol);
          showFloatingText('✓ Correct! +25', canvas.width / 2, 150, accentCol);
          updateProgress(Math.min(100, Math.round((qIdx / bank.length) * 100)));
        } else {
          lives--;
          updateHealth(Math.max(0, (lives / 3) * 100));
          shakeCanvas(canvas);
          showFloatingText('✗ Wrong!', canvas.width / 2, 150, '#FF2D9B');
        }
        setTimeout(nextQ, 1700); // short pause so player can read the fact
        break;
      }
    }
  }

  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    handleClick({ clientX: t.clientX, clientY: t.clientY });
  }, { passive: false });

  /* Main render loop */
  function loop() {
    if (isOver) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw();
    animId = requestAnimationFrame(loop);
  }

  function end() {
    isOver = true;
    clearInterval(timerInterval);
    cancelAnimationFrame(animId);
    score = localScore;
    finishMission(
      Math.min(100, Math.round((localScore / (bank.length * 25)) * 100)),
      totalTime - time
    );
  }

  /* Countdown timer */
  timerInterval = setInterval(() => {
    time--;
    updateTimer(time);
    if (time <= 0 || lives <= 0) end();
  }, 1000);

  updateTimer(time);
  nextQ();
  loop();
}


/* ═══════════════════════════════════════════════════════
   SECTION 4 — PHYSICS GAMES
═══════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────
   PHYSICS ARCADE — Grade 6 & 7
   "Catch the correct answer" — falling blocks, player paddle at bottom.
   Questions are procedurally generated (randomised numbers).
   Correct block → points + combo. Wrong block → lose a life.
───────────────────────────────────────────── */
function physicsArcade(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* Question generator bank — each entry is a function that returns {q, ans, u}
     These generate fresh random numbers every call, so no two questions are identical */
  const BANKS = {
    6: [
      () => { const d = (~~(Math.random() * 9) + 1) * 10, t = ~~(Math.random() * 8) + 2, a = Math.round(d / t);    return { q: `Speed? d=${d}m t=${t}s`,        ans: a, u: 'm/s'  }; },
      () => { const m = ~~(Math.random() * 10) + 2,  a2 = ~~(Math.random() * 6) + 1, r = m * a2;                   return { q: `Force? m=${m}kg a=${a2}m/s²`,    ans: r, u: 'N'    }; },
      () => { const f = ~~(Math.random() * 20) + 5,  d2 = ~~(Math.random() * 10) + 1, r = f * d2;                  return { q: `Work? F=${f}N d=${d2}m`,          ans: r, u: 'J'    }; },
      () => { const m = ~~(Math.random() * 5) + 1,   v = ~~(Math.random() * 6) + 2, r = Math.round(.5 * m * v * v); return { q: `KE? m=${m}kg v=${v}m/s`,         ans: r, u: 'J'    }; }
    ],
    7: [
      () => { const u = ~~(Math.random() * 8) + 1, v = ~~(Math.random() * 10) + u + 2, t = ~~(Math.random() * 5) + 1, r = Math.round((v - u) / t); return { q: `Acc? u=${u} v=${v} t=${t}s`, ans: r, u: 'm/s²' }; },
      () => { const m = ~~(Math.random() * 8) + 2, h = ~~(Math.random() * 10) + 1, r = m * 10 * h;                return { q: `PE? m=${m}kg h=${h}m g=10`,       ans: r, u: 'J'    }; },
      () => { const p = ~~(Math.random() * 8) + 2, t = ~~(Math.random() * 6) + 1, r = p * t;                      return { q: `Work? P=${p}W t=${t}s`,           ans: r, u: 'J'    }; },
      () => { const f = ~~(Math.random() * 20) + 5, a = ~~(Math.random() * 6) + 2, r = Math.round(f / a);         return { q: `Mass? F=${f}N a=${a}m/s²`,        ans: r, u: 'kg'   }; }
    ]
  };
  const bank = BANKS[g] || BANKS[6];

  /* Player paddle */
  let player = { x: canvas.width / 2 - 55, y: canvas.height - 55, w: 110, h: 20, speed: 9 };

  /* Game state */
  let blocks      = [];      // falling answer blocks
  let particles   = [];      // celebration/death particles
  let stars       = [];      // background starfield
  let lives       = 3;
  let gameTime    = 60 + (g - 6) * 5;
  let combo       = 1;
  let streak      = 0;
  let localScore  = 0;
  let isOver      = false;
  let animId;
  let qText       = '';      // currently displayed question

  /* Generate 160 background stars with random properties */
  for (let i = 0; i < 160; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.8,
      spd: Math.random() * 0.4 + 0.1,
      a: Math.random()
    });
  }

  /* spawnBlock — generates a new question and spawns 3 blocks (1 correct, 2 wrong)
     across 3 equal columns. Speed increases slightly with score and grade. */
  function spawnBlock() {
    const t   = bank[~~(Math.random() * bank.length)](); // generate fresh question
    const off = ~~(Math.random() * 12) + 3;              // offset for wrong answers
    const opts = [
      { label: `${t.ans} ${t.u}`,                  ok: true  },
      { label: `${t.ans + off} ${t.u}`,             ok: false },
      { label: `${Math.max(1, t.ans - off)} ${t.u}`, ok: false }
    ].sort(() => Math.random() - 0.5); // shuffle so correct is not always first
    qText = t.q;
    const sw = canvas.width / 3;
    opts.forEach((o, i) => {
      blocks.push({
        x: i * sw + sw / 2 - 55,
        y: -60,
        w: 110, h: 52,
        label: o.label,
        ok:    o.ok,
        spd:   2 + localScore * 0.007 + (g - 6) * 0.25
      });
    });
  }

  /* burst — particle explosion at (x,y) in colour col */
  function burst(x, y, col, n = 22) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random() - .5) * 9, vy: (Math.random() - .5) * 9, r: Math.random() * 4 + 2, life: 1, col });
    }
  }

  function draw() {
    /* Background */
    const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gr.addColorStop(0, '#04010f');
    gr.addColorStop(1, '#0f0830');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Animated starfield */
    stars.forEach(s => {
      s.a = 0.3 + 0.7 * Math.abs(Math.sin(Date.now() * 0.001 + s.x));
      ctx.globalAlpha = s.a;
      ctx.fillStyle   = '#fff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      s.y += s.spd;
      if (s.y > canvas.height) s.y = 0;
    });
    ctx.globalAlpha = 1;

    /* Question bar at top */
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, canvas.width, 48);
    ctx.font        = 'bold 14px "Courier New"';
    ctx.fillStyle   = '#FFD700';
    ctx.textAlign   = 'center';
    ctx.shadowBlur  = 8;
    ctx.shadowColor = '#FFD700';
    ctx.fillText('Q: ' + qText, canvas.width / 2, 30);
    ctx.shadowBlur = 0;
    ctx.restore();

    /* Falling blocks — green = correct, red = wrong */
    blocks.forEach(b => {
      ctx.save();
      const bgr = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      if (b.ok) { bgr.addColorStop(0, '#00C84A'); bgr.addColorStop(1, '#006E28'); }
      else       { bgr.addColorStop(0, '#E7223A'); bgr.addColorStop(1, '#8B000F'); }
      ctx.shadowBlur  = 12;
      ctx.shadowColor = b.ok ? '#00F5A0' : '#FF2D9B';
      ctx.fillStyle   = bgr;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.fillStyle     = '#fff';
      ctx.font          = 'bold 13px Outfit';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.shadowBlur    = 0;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
      ctx.restore();
    });

    /* Player paddle */
    ctx.save();
    ctx.shadowBlur  = 24;
    ctx.shadowColor = '#00C3FF';
    const pg = ctx.createLinearGradient(player.x, 0, player.x + player.w, 0);
    pg.addColorStop(0,   '#00C3FF');
    pg.addColorStop(0.5, '#00F5A0');
    pg.addColorStop(1,   '#00C3FF');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(player.x, player.y, player.w, player.h, 8);
    ctx.fill();
    ctx.restore();

    /* Particles */
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.col;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.x += p.vx; p.y += p.vy; p.life -= 0.025;
      if (p.life <= 0) particles.splice(i, 1);
      ctx.restore();
    }

    /* Lives (hearts) */
    ctx.font         = '16px sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    let h = '';
    for (let i = 0; i < 3; i++) h += i < lives ? '❤️ ' : '🖤 ';
    ctx.fillText(h, 10, canvas.height - 10);

    /* Combo multiplier */
    if (combo > 1) {
      ctx.save();
      ctx.font        = `bold ${13 + combo * 2}px Outfit`;
      ctx.fillStyle   = '#FFD700';
      ctx.textAlign   = 'right';
      ctx.shadowBlur  = 12;
      ctx.shadowColor = '#FFD700';
      ctx.fillText('COMBO ×' + combo + ' 🔥', canvas.width - 10, canvas.height - 10);
      ctx.restore();
    }
  }

  /* update — moves blocks downward, checks collisions with paddle */
  function update() {
    blocks.forEach((b, i) => {
      b.y += b.spd;

      /* Collision: block hits paddle */
      if (b.y + b.h >= player.y && b.y <= player.y + player.h &&
          b.x + b.w >= player.x && b.x <= player.x + player.w) {
        if (b.ok) {
          streak++;
          combo = Math.min(5, 1 + ~~(streak / 2));
          const pts = 10 * combo;
          localScore += pts;
          score = localScore;
          burst(b.x + b.w / 2, b.y, '#FFD700');
          showFloatingText('+' + pts, b.x + b.w / 2, b.y, '#FFD700');
        } else {
          lives--;
          streak = 0;
          combo  = 1;
          burst(b.x + b.w / 2, b.y, '#FF2D9B');
          shakeCanvas(canvas);
        }
        blocks.splice(i, 1);
        updateHUD(localScore);
        updateHealth(Math.max(0, (lives / 3) * 100));
        updateCombo(combo);
        return;
      }

      /* Block leaves bottom of screen without being caught */
      if (b.y > canvas.height) blocks.splice(i, 1);
    });
  }

  /* Keyboard input — arrow keys move paddle */
  let keys = {};
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });

  /* Touch drag — finger drags paddle horizontally */
  let isDrag = false, dragX = 0, pX = 0;
  canvas.addEventListener('touchstart', e => { isDrag = true; dragX = e.touches[0].clientX; pX = player.x; }, { passive: true });
  canvas.addEventListener('touchmove',  e => { if (isDrag) { const dx = e.touches[0].clientX - dragX; player.x = Math.max(0, Math.min(canvas.width - player.w, pX + dx)); } });
  canvas.addEventListener('touchend',   () => { isDrag = false; });

  /* Input loop — runs in its own rAF chain */
  function handleInput() {
    if (keys['ArrowLeft']  && player.x > 0)                        player.x -= player.speed;
    if (keys['ArrowRight'] && player.x + player.w < canvas.width)  player.x += player.speed;
    if (!isOver) requestAnimationFrame(handleInput);
  }

  function loop() {
    if (isOver) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw();
    update();
    animId = requestAnimationFrame(loop);
  }

  function end() {
    isOver = true;
    clearInterval(spawnInterval);
    clearInterval(timerInterval);
    cancelAnimationFrame(animId);
    score = localScore;
    finishMission(Math.min(100, ~~((localScore / 150) * 100)), 0);
  }

  /* Start game */
  spawnInterval = setInterval(spawnBlock, 1400);
  timerInterval = setInterval(() => { gameTime--; updateTimer(gameTime); if (gameTime <= 0 || lives <= 0) end(); }, 1000);
  updateTimer(gameTime);
  spawnBlock(); // spawn first batch immediately
  handleInput();
  loop();
}


/* ─────────────────────────────────────────────
   PHYSICS SHOOTER — Grade 8 & 9
   Grade 8: Ohm's Law, waves, light — floating target bubbles
   Grade 9: Gravity Sniper — aim for targets, account for "bullet drop"
   Player clicks/touches to aim cannon and fire projectiles.
───────────────────────────────────────────── */
function physicsShooter(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* Question banks — note: opts are shuffled at runtime by nextQ() via shuffleQuestion() */
  const BANK = {
    8: [
      { q: 'V=12V R=4Ω → I=?',             opts: ['3 A',    '48 A',  '4 A'],    ans: 0, fact: "Ohm's Law: I=V/R=12/4=3A" },
      { q: 'Series R1=3Ω R2=5Ω → Total=?', opts: ['8 Ω',   '15 Ω',  '2 Ω'],    ans: 0, fact: 'Series: R=R1+R2=8Ω' },
      { q: 'Parallel R1=4Ω R2=4Ω → Total=?',opts: ['2 Ω',  '8 Ω',   '4 Ω'],    ans: 0, fact: 'Parallel: 1/R=1/4+1/4 → R=2Ω' },
      { q: 'Sound travels fastest in:',      opts: ['Solids','Liquids','Gases'],  ans: 0, fact: 'Speed: Solids > Liquids > Gases' },
      { q: 'Law of Reflection: ∠i = ?',     opts: ['∠r',   '90°',   '∠refraction'], ans: 0, fact: 'Angle of incidence = Angle of reflection' },
      { q: 'f=200Hz λ=1.5m → Wave speed=?', opts: ['300 m/s','133 m/s','250 m/s'], ans: 0, fact: 'v=fλ=200×1.5=300 m/s' }
    ],
    9: [
      { q: 'Object falls 5s (g=9.8). v=?',  opts: ['49 m/s', '45 m/s', '9.8 m/s'],    ans: 0, fact: 'v=u+gt=0+9.8×5=49 m/s' },
      { q: "Newton's 2nd Law: F=?",         opts: ['ma',    'mv',     'm/a'],           ans: 0, fact: 'Force = mass × acceleration' },
      { q: 'Momentum =?',                   opts: ['mass×velocity','force×time','mass×acc'], ans: 0, fact: 'p=mv (unit: kg·m/s)' },
      { q: 'Escape velocity from Earth≈',   opts: ['11.2 km/s','9.8 km/s','340 m/s'],  ans: 0, fact: 'Escape velocity=√(2GM/R)≈11.2 km/s' },
      { q: 'Convex lens:',                  opts: ['Converges light','Diverges light','No effect'], ans: 0, fact: 'Convex (converging) lens focuses rays at focal point' },
      { q: 'Buoyancy = ?',                  opts: ['Weight of fluid displaced','Weight of object','Mass×g'], ans: 0, fact: 'Buoyant force = weight of displaced fluid' }
    ]
  };
  const rawBank = BANK[g] || BANK[8];

  let localScore = 0, lives = 3, gameTime = 75 + (g - 8) * 5, isOver = false, animId;
  let targets = [], bullets = [], particles = [], qIdx = 0, currentQ = null;

  /* Cannon sits at bottom-centre, player can aim by moving mouse/touch */
  let cannon = { x: canvas.width / 2, y: canvas.height - 28, angle: -Math.PI / 2 };

  /* nextQ — shuffles options so correct answer is random each time */
  function nextQ() {
    const raw  = rawBank[qIdx % rawBank.length];
    currentQ   = shuffleQuestion(raw); // ← MCQ shuffle fix applied here too
    qIdx++;
    const cols = ['#00C3FF', '#FF2D9B', '#FFD700'];
    targets = currentQ.opts.map((opt, i) => ({
      x:      90 + i * (canvas.width - 120) / currentQ.opts.length + (canvas.width - 120) / currentQ.opts.length / 2,
      y:      70 + Math.random() * 50,
      r:      44,
      label:  opt,
      ok:     i === currentQ.ans,
      wobble: Math.random() * Math.PI * 2,
      col:    cols[i]
    }));
  }

  function fire() {
    bullets.push({ x: cannon.x, y: cannon.y - 18, angle: cannon.angle, spd: 10, r: 7, col: '#00F5A0' });
  }

  function burst(x, y, col, n = 16) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random() - .5) * 10, vy: (Math.random() - .5) * 10, r: Math.random() * 4 + 2, life: 1, col });
    }
  }

  function draw() {
    /* Background with faint grid — sci-fi targeting aesthetic */
    const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gr.addColorStop(0, '#030c20'); gr.addColorStop(1, '#080025');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.strokeStyle = 'rgba(0,195,255,.04)'; ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += 40)  { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    ctx.restore();

    /* Dashed aim-line from cannon muzzle */
    ctx.save();
    ctx.strokeStyle = 'rgba(0,245,160,.18)'; ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(cannon.x, cannon.y - 18);
    for (let d = 0; d < 200; d += 10) {
      ctx.lineTo(cannon.x + Math.cos(cannon.angle) * d, cannon.y + Math.sin(cannon.angle) * d - 18);
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.restore();

    /* Question panel */
    if (currentQ) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.beginPath(); ctx.roundRect(canvas.width / 2 - 260, 6, 520, 44, 12); ctx.fill();
      ctx.font = 'bold 14px Outfit'; ctx.fillStyle = '#FFD700'; ctx.textAlign = 'center';
      ctx.shadowBlur = 8; ctx.shadowColor = '#FFD700';
      ctx.fillText('🎯 ' + currentQ.q, canvas.width / 2, 33); ctx.shadowBlur = 0;
      ctx.restore();
    }

    /* Floating target bubbles */
    targets.forEach(t => {
      t.wobble += 0.04;
      const wy = Math.sin(t.wobble) * 4;
      ctx.save();
      ctx.shadowBlur  = 18; ctx.shadowColor = t.col;
      ctx.fillStyle   = t.col + '44'; ctx.strokeStyle = t.col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(t.x, t.y + wy, t.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = 'bold 11px Outfit'; ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.label, t.x, t.y + wy);
      ctx.restore();
    });

    /* Cannon body */
    ctx.save();
    ctx.translate(cannon.x, cannon.y); ctx.rotate(cannon.angle + Math.PI / 2);
    ctx.shadowBlur = 20; ctx.shadowColor = '#00F5A0';
    ctx.fillStyle  = '#007A50'; ctx.beginPath(); ctx.roundRect(-14, 2, 28, 18, 4); ctx.fill();
    ctx.fillStyle  = '#00F5A0'; ctx.beginPath(); ctx.roundRect(-9, -32, 18, 36, 4); ctx.fill();
    ctx.restore();

    /* Bullets */
    bullets.forEach(b => {
      ctx.save();
      ctx.fillStyle = b.col; ctx.shadowBlur = 12; ctx.shadowColor = b.col;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    /* Particles */
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.col;
      ctx.shadowBlur = 8; ctx.shadowColor = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      p.x += p.vx; p.y += p.vy; p.life -= 0.025;
      if (p.life <= 0) particles.splice(i, 1);
      ctx.restore();
    }

    /* Hearts */
    ctx.font = '16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let h = '';
    for (let i = 0; i < 3; i++) h += i < lives ? '❤️ ' : '🖤 ';
    ctx.fillText(h, 10, canvas.height - 10);
  }

  /* update — moves bullets, checks collisions with targets */
  function update() {
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      b.x += Math.cos(b.angle) * b.spd;
      b.y += Math.sin(b.angle) * b.spd;

      let hit = false;
      for (let ti = targets.length - 1; ti >= 0; ti--) {
        const t  = targets[ti];
        const dx = b.x - t.x, dy = b.y - t.y;
        if (Math.sqrt(dx * dx + dy * dy) < b.r + t.r) {
          if (t.ok) {
            localScore += 20; score = localScore;
            updateHUD(localScore);
            burst(t.x, t.y, t.col);
            showFloatingText('+20', t.x, t.y, '#00F5A0');
            showFloatingText('💡 ' + currentQ.fact, canvas.width / 2, canvas.height - 60, '#00C3FF');
            updateProgress(Math.min(100, ~~((qIdx / rawBank.length) * 100)));
            setTimeout(nextQ, 700);
          } else {
            lives--;
            updateHealth(Math.max(0, (lives / 3) * 100));
            burst(t.x, t.y, '#FF2D9B', 10);
            shakeCanvas(canvas);
          }
          targets.splice(ti, 1);
          hit = true;
          break;
        }
      }
      /* Remove bullet if it hit something or left screen */
      if (hit || b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
        bullets.splice(bi, 1);
      }
    }
  }

  /* Input — mouse moves cannon angle, click/touch fires */
  canvas.addEventListener('mousemove', e => {
    const { x, y } = gpos(canvas, e);
    cannon.angle = Math.atan2(y - canvas.height + 28, x - cannon.x);
  });
  canvas.addEventListener('click', e => {
    const { x } = gpos(canvas, e);
    cannon.x = Math.max(30, Math.min(canvas.width - 30, x));
    fire();
  });
  canvas.addEventListener('touchstart', e => {
    const { x, y } = gpos(canvas, e.touches[0]);
    cannon.x = Math.max(30, Math.min(canvas.width - 30, x));
    cannon.angle = Math.atan2(y - canvas.height + 28, x - cannon.x);
    fire();
  }, { passive: true });
  document.addEventListener('keydown', e => { if (e.code === 'Space') { fire(); e.preventDefault(); } });

  function loop() {
    if (isOver) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(); update();
    animId = requestAnimationFrame(loop);
  }

  function end() {
    isOver = true;
    clearInterval(timerInterval);
    cancelAnimationFrame(animId);
    score = localScore;
    finishMission(Math.min(100, ~~((localScore / 120) * 100)), 0);
  }

  timerInterval = setInterval(() => { gameTime--; updateTimer(gameTime); if (gameTime <= 0 || lives <= 0) end(); }, 1000);
  updateTimer(gameTime);
  nextQ();
  loop();
}


/* ─────────────────────────────────────────────
   PHYSICS MCQ — Grade 10, 11, 12
   Standard MCQ cards. Questions cover class 10/11/12 NCERT physics topics.
   Options are shuffled so correct answer is never always option A.
───────────────────────────────────────────── */
function chemLab(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* Grade 6: simple solution/acid/base tasks */
  const TASKS_G6 = [
    { inst: '💧 Make Salt Water',    hint: 'Drag Water + Salt into beaker',      needs: ['Water','Salt'],          mixed: [], res: { r:173,g:216,b:230, label:'🧂 Salt Solution!',  fact:'Salt dissolves in water = SOLUTION' } },
    { inst: '🍋 Acid Test',          hint: 'Lemon Juice + Litmus Paper',         needs: ['Lemon Juice','Litmus Paper'], mixed: [], res: { r:255,g:80,b:80,   label:'🔴 ACID (pH<7)!', fact:'Lemon juice turns litmus RED → ACIDIC' } },
    { inst: '🧼 Base Test',          hint: 'Soap + Litmus Paper',                needs: ['Soap','Litmus Paper'],    mixed: [], res: { r:147,g:112,b:219, label:'🔵 BASE (pH>7)!',   fact:'Soap turns litmus BLUE → BASIC' } },
    { inst: '🏖️ Suspension',         hint: 'Sand + Water into beaker',           needs: ['Sand','Water'],          mixed: [], res: { r:194,g:178,b:128, label:'🌀 Suspension!',    fact:"Sand doesn't dissolve — SUSPENSION!" } },
    { inst: '⚗️ Neutralisation',     hint: 'Vinegar + Soap',                     needs: ['Vinegar','Soap'],        mixed: [], res: { r:100,g:220,b:160, label:'✨ Neutral! pH≈7',   fact:'Acid + Base → Salt + Water = NEUTRALISATION!' } }
  ];
  /* Grade 7: atom and molecule building */
  const TASKS_G7 = [
    { inst: '⚛️ Build Hydrogen (H)',  hint: '1 Proton + 1 Electron',             needs: ['Proton','Electron'],      mixed: [], res: { r:100,g:180,b:255, label:'H — Hydrogen! Z=1', fact:'Simplest atom: 1 proton + 1 electron' } },
    { inst: '💧 Water Molecule H₂O',  hint: 'H Atom + H Atom2 + O Atom',        needs: ['H Atom','H Atom2','O Atom'], mixed: [], res: { r:80,g:170,b:255, label:'H₂O — Water!',   fact:'2 Hydrogen + 1 Oxygen = Water (covalent)' } },
    { inst: '🌬️ Carbon Dioxide CO₂', hint: 'Carbon + O Atom + O Atom2',         needs: ['Carbon','O Atom','O Atom2'], mixed: [], res: { r:180,g:180,b:200, label:'CO₂ formed!',   fact:'Carbon + 2 Oxygen → CO₂' } },
    { inst: '🧪 Ionic Compound NaCl', hint: 'Na Ion + Cl Ion',                   needs: ['Na Ion','Cl Ion'],        mixed: [], res: { r:240,g:240,b:220, label:'NaCl — Ionic!',    fact:'Metal + Non-metal = Ionic compound' } }
  ];
  const TASKS = g <= 6 ? TASKS_G6 : TASKS_G7;

  /* Chemical bottle definitions — each has a colour, icon, and display name */
  const CHEMS_G6 = [
    { name:'Water',       r:77,  g2:166,b:255, icon:'💧', col:'#4da6ff' },
    { name:'Salt',        r:240, g2:240,b:240, icon:'🧂', col:'#e8e8e8' },
    { name:'Sand',        r:194, g2:178,b:128, icon:'🏖️', col:'#c2b280' },
    { name:'Lemon Juice', r:255, g2:215,b:0,   icon:'🍋', col:'#FFD700' },
    { name:'Soap',        r:221, g2:160,b:221, icon:'🧼', col:'#DDA0DD' },
    { name:'Vinegar',     r:255, g2:220,b:150, icon:'🍶', col:'#ffdc96' },
    { name:'Litmus Paper',r:200, g2:200,b:255, icon:'📄', col:'#c8c8ff' },
    { name:'Baking Soda', r:240, g2:240,b:240, icon:'🥄', col:'#f0f0f0' }
  ];
  const CHEMS_G7 = [
    { name:'Proton',  r:255,g2:80, b:80,  icon:'⊕',  col:'#FF5050' },
    { name:'Electron',r:80, g2:150,b:255, icon:'⊖',  col:'#5096FF' },
    { name:'O Atom',  r:255,g2:80, b:80,  icon:'O',  col:'#FF5050' },
    { name:'O Atom2', r:255,g2:100,b:80,  icon:'O',  col:'#FF6450' },
    { name:'Carbon',  r:80, g2:80, b:80,  icon:'C',  col:'#505050' },
    { name:'H Atom',  r:100,g2:200,b:255, icon:'H',  col:'#64C8FF' },
    { name:'H Atom2', r:100,g2:210,b:255, icon:'H',  col:'#64D2FF' },
    { name:'Na Ion',  r:255,g2:200,b:80,  icon:'Na⁺',col:'#FFC850' },
    { name:'Cl Ion',  r:80, g2:220,b:80,  icon:'Cl⁻',col:'#50DC50' },
    { name:'Neutron', r:180,g2:180,b:180, icon:'◉',  col:'#B4B4B4' }
  ];
  const CDEFS = g <= 6 ? CHEMS_G6 : CHEMS_G7;

  /* Bottle grid layout — 4 on left column, 4 on right column */
  const BW = 68, BH = 64, LX = 14, RX = canvas.width - BW - 14;
  let chems = CDEFS.slice(0, 8).map((c, i) => ({
    ...c,
    x: i < 4 ? LX : RX,  y: 55 + (i % 4) * (BH + 10),
    ox: i < 4 ? LX : RX, oy: 55 + (i % 4) * (BH + 10), // ox/oy = original (home) position
    hover: 0,
    bob: Math.random() * Math.PI * 2
  }));

  /* Task state */
  let taskIdx = 0;
  let task    = JSON.parse(JSON.stringify(TASKS[0])); // deep copy so mixed[] doesn't pollute bank

  /* Beaker dimensions and state */
  const BKX = canvas.width / 2 - 82, BKY = 62, BKW = 164, BKH = 224;
  let bk = {
    x: BKX, y: BKY, w: BKW, h: BKH,
    lvl: 0, tlvl: 0,                  // current liquid level (animated toward target)
    lr: 60, lg: 120, lb: 200,         // current liquid colour (animated toward target)
    tr: 60, tg: 120, tb: 200,
    glow: 0, glowCol: '#00C3FF',
    label: '', la: 0,                  // result label (fades in after completion)
    done: false, wave: 0
  };

  let localScore = 0, lives = 3, gameTime = 90 + (g - 6) * 15, isOver = false, animId;
  let bubbles = [], smoke = [], drag = null, dox = 0, doy = 0, dropGlow = 0, shake = 0;
  let factText = '', factAlpha = 0, factLife = 0;

  /* spawnBubbles / spawnSmoke — visual feedback on correct/wrong ingredient */
  function spawnBubbles(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      bubbles.push({ x: x + (Math.random() - .5) * 60, y: y + Math.random() * 15, r: Math.random() * 5 + 2, spd: Math.random() * 1.8 + 0.6, wobble: Math.random() * Math.PI * 2, life: 1, col });
    }
  }
  function spawnSmoke(x, y, n) {
    for (let i = 0; i < n; i++) {
      smoke.push({ x: x + (Math.random() - .5) * 30, y, vx: (Math.random() - .5) * 2, vy: -(Math.random() * 2.5 + 1), r: Math.random() * 12 + 6, life: 1 });
    }
  }

  /* addToBK — called when a bottle is dropped onto the beaker */
  function addToBK(c) {
    if (task.needs.includes(c.name) && !task.mixed.includes(c.name)) {
      /* Correct ingredient not yet added */
      task.mixed.push(c.name);
      bk.tlvl = Math.min(BKH - 20, bk.tlvl + (BKH - 20) / task.needs.length);
      spawnBubbles(bk.x + bk.w / 2, bk.y + bk.h - bk.lvl, c.col, 20);

      if (task.needs.every(n => task.mixed.includes(n))) {
        /* All ingredients added — brew complete! */
        bk.tr = task.res.r; bk.tg = task.res.g; bk.tb = task.res.b;
        bk.label = task.res.label; bk.glow = 1;
        bk.glowCol = `rgb(${task.res.r},${task.res.g},${task.res.b})`;
        bk.done = true;
        localScore += 35; score = localScore;
        updateHUD(localScore);
        updateProgress(~~(((taskIdx + 1) / TASKS.length) * 100));
        factText = task.res.fact; factAlpha = 0; factLife = 3.5;
        showFloatingText('+35 XP!', canvas.width / 2, BKY - 45, '#00F5A0');
        setTimeout(nextTask, 2400);
      } else {
        showFloatingText('✓ ' + c.name, bk.x + bk.w / 2, bk.y - 15, '#FFD700');
      }
    } else if (task.mixed.includes(c.name)) {
      showFloatingText('Already added!', canvas.width / 2, BKY - 20, '#9B8FC0');
    } else {
      /* Wrong ingredient */
      lives--;
      updateHealth(Math.max(0, (lives / 3) * 100));
      shake = 14;
      spawnSmoke(bk.x + bk.w / 2, bk.y + 20, 18);
      showFloatingText('❌ Wrong!', canvas.width / 2, 52, '#FF2D9B');
    }
  }

  function nextTask() {
    taskIdx++;
    if (taskIdx >= TASKS.length) { end(); return; }
    task = JSON.parse(JSON.stringify(TASKS[taskIdx]));
    bk.tlvl = 0; bk.tr = 60; bk.tg = 120; bk.tb = 200;
    bk.label = ''; bk.la = 0; bk.done = false; bk.glow = 0;
    bubbles = []; smoke = [];
  }

  /* ── Drawing helpers ── */
  function drawBg() {
    const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gr.addColorStop(0, '#050818'); gr.addColorStop(1, '#060a14');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /* drawBottle — renders a single chemical bottle with label, icon, liquid fill */
  function drawBottle(c) {
    const bob = Math.sin(Date.now() * 0.002 + c.bob) * 2;
    const fw = BW - 10, fh = BH - 8;
    ctx.save();
    ctx.translate(c.x + BW / 2, c.y + BH / 2 + bob - c.hover * 4);
    ctx.shadowBlur  = 8 + c.hover * 10;
    ctx.shadowColor = c.col;
    /* Bottle silhouette */
    ctx.beginPath();
    ctx.moveTo(-fw/2, fh/2);
    ctx.lineTo(fw/2, fh/2);
    ctx.quadraticCurveTo(fw/2+4, 0, fw*.28, -fh*.15);
    ctx.lineTo(fw*.22, -fh*.5);
    ctx.lineTo(-fw*.22, -fh*.5);
    ctx.lineTo(-fw*.28, -fh*.15);
    ctx.quadraticCurveTo(-fw/2-4, 0, -fw/2, fh/2);
    ctx.closePath();
    const gr = ctx.createLinearGradient(-fw/2, -fh/2, fw/2, fh/2);
    gr.addColorStop(0,   `rgba(${c.r},${c.g2},${c.b},.18)`);
    gr.addColorStop(0.4, `rgba(${c.r},${c.g2},${c.b},.35)`);
    gr.addColorStop(1,   `rgba(${c.r},${c.g2},${c.b},.22)`);
    ctx.fillStyle   = gr;
    ctx.fill();
    ctx.strokeStyle = `rgba(${c.r},${c.g2},${c.b},.65)`;
    ctx.lineWidth   = 1.8;
    ctx.stroke();
    /* Liquid inside bottle */
    ctx.save();
    ctx.clip();
    const lq = ctx.createLinearGradient(0, fh*.05, 0, fh/2);
    lq.addColorStop(0, `rgba(${c.r},${c.g2},${c.b},.5)`);
    lq.addColorStop(1, `rgba(${c.r},${c.g2},${c.b},.85)`);
    ctx.fillStyle = lq;
    ctx.fillRect(-fw/2, fh*.05, fw, fh*.5);
    ctx.restore();
    /* Icon */
    ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.icon, 0, -fh * 0.22);
    /* Name label */
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.roundRect(-BW/2+2, fh*.22, BW-4, 15, 3); ctx.fill();
    ctx.font = 'bold 8px Outfit'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.fillText(c.name.slice(0, 11), 0, fh*.22+7.5);
    ctx.restore();
  }

  /* drawBeaker — renders the central beaker with animated liquid */
  function drawBeaker() {
    /* Smooth-lerp liquid level and colour toward targets */
    bk.lvl += (bk.tlvl - bk.lvl) * 0.04;
    bk.lr  += (bk.tr - bk.lr) * 0.03;
    bk.lg  += (bk.tg - bk.lg) * 0.03;
    bk.lb  += (bk.tb - bk.lb) * 0.03;
    if (bk.glow > 0) bk.glow = 0.6 + 0.4 * Math.sin(Date.now() * 0.006);
    bk.wave = Date.now() * 0.004;

    const { x, y, w, h } = bk;
    const topW = w * 0.85, topX = x + (w - topW) / 2;

    ctx.save();
    if (bk.glow > 0) { ctx.shadowBlur = 40 * bk.glow; ctx.shadowColor = bk.glowCol; }
    /* Drop-glow when dragging a bottle over beaker */
    if (dropGlow > 0) {
      const dg = ctx.createRadialGradient(x+w/2, y+h/2, 10, x+w/2, y+h/2, w);
      dg.addColorStop(0, `rgba(255,215,0,${dropGlow*.12})`);
      dg.addColorStop(1, 'transparent');
      ctx.fillStyle = dg;
      ctx.fillRect(x-18, y-18, w+36, h+36);
      dropGlow *= 0.92;
    }
    /* Beaker outline (trapezoid) */
    ctx.beginPath();
    ctx.moveTo(topX, y); ctx.lineTo(topX + topW, y);
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fillStyle   = 'rgba(180,220,255,.05)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.shadowBlur  = 0;

    /* Liquid fill */
    if (bk.lvl > 1) {
      const ly = y + h - bk.lvl;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(topX, y); ctx.lineTo(topX + topW, y);
      ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.clip();
      const lg = ctx.createLinearGradient(x, ly, x, y + h);
      lg.addColorStop(0, `rgba(${bk.lr|0},${bk.lg|0},${bk.lb|0},.55)`);
      lg.addColorStop(1, `rgba(${bk.lr|0},${bk.lg|0},${bk.lb|0},.9)`);
      ctx.fillStyle = lg;
      ctx.fillRect(x, ly, w, h);
      /* Animated wave on liquid surface */
      ctx.fillStyle = `rgba(${bk.lr|0},${bk.lg|0},${bk.lb|0},.95)`;
      ctx.beginPath();
      ctx.moveTo(x, ly);
      for (let xi = x; xi <= x + w; xi += 3) {
        ctx.lineTo(xi, ly + Math.sin(bk.wave + xi * 0.06) * 3);
      }
      ctx.lineTo(x + w, ly + 10); ctx.lineTo(x, ly + 10);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    /* Rim highlight */
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(topX - 6, y); ctx.lineTo(topX + topW + 6, y); ctx.stroke();

    /* Result label (fades in when brew is complete) */
    if (bk.label) {
      bk.la = Math.min(1, bk.la + 0.025);
      ctx.save();
      ctx.globalAlpha = bk.la;
      const lw = 162, lh = 24, lx2 = x + w/2 - lw/2, ly2 = y + h + 14;
      ctx.fillStyle   = `rgba(${bk.lr|0},${bk.lg|0},${bk.lb|0},.15)`;
      ctx.strokeStyle = `rgba(${bk.lr|0},${bk.lg|0},${bk.lb|0},.5)`;
      ctx.lineWidth   = 1.5;
      ctx.shadowBlur  = 12; ctx.shadowColor = bk.glowCol;
      ctx.beginPath(); ctx.roundRect(lx2, ly2, lw, lh, 12); ctx.fill(); ctx.stroke();
      ctx.font = 'bold 10px Outfit'; ctx.fillStyle = bk.glowCol;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 0;
      ctx.fillText(bk.label, x + w/2, ly2 + lh/2);
      ctx.restore();
    }
    ctx.restore();
  }

  /* drawUI — renders task panel, progress chips, fact banner, hearts */
  function drawUI() {
    /* Task instruction panel */
    ctx.save();
    ctx.fillStyle   = 'rgba(10,6,30,.88)';
    ctx.strokeStyle = 'rgba(100,150,255,.35)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.roundRect(90, 7, canvas.width - 180, 48, 12); ctx.fill(); ctx.stroke();
    ctx.font = 'bold 13px Outfit'; ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center'; ctx.shadowBlur = 6; ctx.shadowColor = 'rgba(255,215,0,.4)';
    ctx.fillText(task.inst, canvas.width / 2, 26);
    ctx.font = '10px Outfit'; ctx.fillStyle = '#9B8FC0'; ctx.shadowBlur = 0;
    ctx.fillText(task.hint, canvas.width / 2, 42);
    ctx.restore();

    /* Ingredient progress chips */
    const cw = 90, cg = 8, cy = canvas.height - 42;
    const tot = task.needs.length * cw + (task.needs.length - 1) * cg;
    const sx  = canvas.width / 2 - tot / 2;
    task.needs.forEach((n, i) => {
      const done = task.mixed.includes(n), cx2 = sx + i * (cw + cg);
      ctx.save();
      ctx.shadowBlur  = done ? 16 : 0; ctx.shadowColor = '#00F5A0';
      ctx.fillStyle   = done ? 'rgba(0,245,160,.2)' : 'rgba(255,255,255,.04)';
      ctx.strokeStyle = done ? 'rgba(0,245,160,.6)' : 'rgba(255,255,255,.15)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.roundRect(cx2, cy, cw, 26, 10); ctx.fill(); ctx.stroke();
      ctx.font = 'bold 9px Outfit'; ctx.fillStyle = done ? '#00F5A0' : '#9B8FC0';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 0;
      ctx.fillText((done ? '✓ ' : '○ ') + n.slice(0, 10), cx2 + cw/2, cy + 13);
      ctx.restore();
    });

    /* Task progress dots (one per task) */
    const dr = 7, dg2 = 16, tx = canvas.width - 14 - TASKS.length * (dr*2+dg2) + dg2, ty = 20;
    TASKS.forEach((_, i) => {
      ctx.save();
      ctx.shadowBlur  = i === taskIdx ? 12 : 0; ctx.shadowColor = '#FFD700';
      ctx.fillStyle   = i < taskIdx ? '#00F5A0' : i === taskIdx ? '#FFD700' : 'rgba(255,255,255,.15)';
      ctx.beginPath(); ctx.arc(tx + i * (dr*2+dg2), ty, dr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    /* Fact banner (fades in/out after a correct brew) */
    if (factLife > 0) {
      factLife  -= 0.012;
      factAlpha  = Math.min(1, factAlpha + 0.04);
      if (factLife < 0.5) factAlpha = factLife * 2;
      ctx.save();
      ctx.globalAlpha = factAlpha;
      ctx.fillStyle   = 'rgba(0,245,160,.1)'; ctx.strokeStyle = 'rgba(0,245,160,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(90, canvas.height - 76, canvas.width - 180, 32, 10); ctx.fill(); ctx.stroke();
      ctx.font = 'bold 10px Outfit'; ctx.fillStyle = '#00F5A0';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💡 ' + factText, canvas.width / 2, canvas.height - 60);
      ctx.restore();
    }

    /* Lives (hearts) */
    ctx.font = '16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let h = '';
    for (let i = 0; i < 3; i++) h += i < lives ? '❤️ ' : '🖤 ';
    ctx.fillText(h, 10, canvas.height - 8);
  }

  /* Main render loop with optional canvas shake */
  function loop() {
    if (isOver) return;
    let ox = 0, oy = 0;
    if (shake > 0) { ox = (Math.random() - .5) * shake; oy = (Math.random() - .5) * shake; shake *= 0.78; if (shake < 0.4) shake = 0; }
    ctx.save();
    if (shake > 0) ctx.translate(ox, oy);
    ctx.clearRect(-20, -20, canvas.width + 40, canvas.height + 40);

    drawBg();
    drawBeaker();
    chems.forEach(c => { if (c !== drag) drawBottle(c); }); // draw dragged bottle on top

    /* Render bubbles */
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.wobble += 0.05; b.x += Math.sin(b.wobble) * 0.8; b.y -= b.spd; b.life -= 0.014;
      if (b.life <= 0) { bubbles.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = b.life * 0.8;
      ctx.strokeStyle = b.col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    /* Render smoke (wrong ingredient) */
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      s.x += s.vx; s.y += s.vy; s.r *= 1.02; s.life -= 0.018;
      if (s.life <= 0) { smoke.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = s.life * 0.4;
      ctx.fillStyle = 'rgba(220,80,80,1)';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    /* Render dragged bottle semi-transparent on top of everything */
    if (drag) {
      dropGlow = Math.max(dropGlow, 0.7);
      ctx.save(); ctx.globalAlpha = 0.75; drawBottle(drag); ctx.restore();
    }

    drawUI();
    ctx.restore();
    animId = requestAnimationFrame(loop);
  }

  /* Input — drag & drop bottles */
  function onDown(e) {
    const { x, y } = gpos(canvas, e);
    chems.forEach(c => {
      if (x >= c.ox && x <= c.ox + BW && y >= c.oy && y <= c.oy + BH) {
        drag = c; dox = x - c.x; doy = y - c.y;
      }
    });
  }
  function onMove(e) {
    const { x, y } = gpos(canvas, e);
    chems.forEach(c => {
      const cx2 = c.ox + BW/2, cy2 = c.oy + BH/2;
      const d = Math.hypot(x - cx2, y - cy2);
      c.hover = Math.min(1, Math.max(0, c.hover + (d < BW * 0.7 ? 0.1 : -0.1)));
    });
    if (drag) { drag.x = x - dox; drag.y = y - doy; }
  }
  function onUp(e) {
    if (!drag) return;
    const { x, y } = gpos(canvas, e);
    if (x > BKX - 18 && x < BKX + BKW + 18 && y > BKY && y < BKY + BKH) addToBK(drag);
    drag.x = drag.ox; drag.y = drag.oy; // snap back to home position
    drag = null;
  }
  canvas.addEventListener('mousedown',  onDown);
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseup',    onUp);
  canvas.addEventListener('touchstart', onDown, { passive: true });
  canvas.addEventListener('touchmove',  e => { onMove(e); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend',   e => { onUp({ ...e, touches: e.changedTouches }); });

  function end() {
    isOver = true;
    clearInterval(timerInterval);
    cancelAnimationFrame(animId);
    score = localScore;
    finishMission(~~((localScore / (TASKS.length * 35)) * 100), 0);
  }

  timerInterval = setInterval(() => { gameTime--; updateTimer(gameTime); if (lives <= 0 || gameTime <= 0) end(); }, 1000);
  updateTimer(gameTime);
  loop();
}


/* ─────────────────────────────────────────────
   CHEM HEIST — Grade 8 & 9
   🕵️ PERIODIC TABLE SPY HEIST
   A spotlight sweeps the periodic table like a security camera.
   Player must move their cursor/finger to the correct element
   WITHOUT touching the spotlight beam.
   Wrong element OR touching spotlight = alarm + life lost.
───────────────────────────────────────────── */
function chemHeist(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* Questions — element to find, its position on the periodic table grid, and a fun fact */
  const QUESTS_G8 = [
    { q: 'Steal the alkali metal in Period 3',   target: 'Na', symbol:'Na', col:'#FFD700', row:2, col2:0,  fact:'Na (Sodium) — Group 1, Period 3, Z=11' },
    { q: 'Find the noble gas in Period 2',       target: 'Ne', symbol:'Ne', col:'#00C3FF', row:1, col2:17, fact:'Ne (Neon) — Group 18, Period 2, full outer shell' },
    { q: 'Grab the halogen in Period 3',         target: 'Cl', symbol:'Cl', col:'#FF8C00', row:2, col2:16, fact:'Cl (Chlorine) — Group 17, Period 3, Z=17' },
    { q: 'Steal the lightest alkaline earth',    target: 'Be', symbol:'Be', col:'#7CFC00', row:1, col2:1,  fact:'Be (Beryllium) — Group 2, Period 2, lightest alkaline earth' },
    { q: 'Get the Period 2 nitrogen group element',target:'N', symbol:'N',  col:'#FF2D9B', row:1, col2:14, fact:'N (Nitrogen) — Group 15, Period 2, 78% of air' },
    { q: 'Find the most reactive halogen',       target: 'F',  symbol:'F',  col:'#00F5A0', row:1, col2:16, fact:'F (Fluorine) — most electronegative element, Group 17 Period 2' }
  ];
  const QUESTS_G9 = [
    { q: 'Steal the element with Z=26 (magnetic)', target:'Fe',symbol:'Fe',col:'#FF6450',row:3,col2:6,  fact:'Fe (Iron) — Z=26, Period 4, transition metal, used in magnets' },
    { q: 'Find the semiconductor in Group 14',   target:'Si', symbol:'Si', col:'#00C3FF', row:2,col2:13, fact:'Si (Silicon) — metalloid, Z=14, backbone of electronics' },
    { q: 'Grab the most abundant metal in crust',target:'Al', symbol:'Al', col:'#FFD700', row:2,col2:12, fact:'Al (Aluminium) — Z=13, most abundant metal in Earth\'s crust' },
    { q: 'Steal the radioactive alkali metal',   target:'Fr', symbol:'Fr', col:'#FF2D9B', row:6,col2:0,  fact:'Fr (Francium) — Z=87, most radioactive alkali metal' },
    { q: 'Find the element named after Curie',   target:'Cm', symbol:'Cm', col:'#7CFC00', row:9,col2:7,  fact:'Cm (Curium) — Z=96, named after Marie & Pierre Curie' },
    { q: 'Get the Period 4 noble gas',           target:'Kr', symbol:'Kr', col:'#00F5A0', row:3,col2:17, fact:'Kr (Krypton) — Z=36, Period 4, noble gas' }
  ];
  const QUESTS = g <= 8 ? QUESTS_G8 : QUESTS_G9;

  let localScore = 0, lives = 3, gameTime = 80 + (g - 8) * 10, isOver = false, animId;
  let qIdx = 0, currentQ = null, phase = 'hunt', alarmTimer = 0, successTimer = 0;
  let spotAngle = 0, spotSpd = 0.012 + (g - 8) * 0.006; // spotlight rotation speed increases with grade
  let cursorX = canvas.width / 2, cursorY = canvas.height / 2;
  let caught = false, foundIt = false, particles = [];

  /* Simplified periodic table grid: 18 columns × 7 rows (+ 2 lanthanide/actinide rows) */
  const CELL_W = (canvas.width - 20) / 18;
  const CELL_H = 24;
  const TABLE_Y = 52;

  /* A minimal element map: [row, col] for each symbol (0-indexed) */
  const ELEM_POS = {
    H:{r:0,c:0},He:{r:0,c:17},
    Li:{r:1,c:0},Be:{r:1,c:1},B:{r:1,c:12},C:{r:1,c:13},N:{r:1,c:14},O:{r:1,c:15},F:{r:1,c:16},Ne:{r:1,c:17},
    Na:{r:2,c:0},Mg:{r:2,c:1},Al:{r:2,c:12},Si:{r:2,c:13},P:{r:2,c:14},S:{r:2,c:15},Cl:{r:2,c:16},Ar:{r:2,c:17},
    K:{r:3,c:0},Ca:{r:3,c:1},Fe:{r:3,c:6},Cu:{r:3,c:10},Zn:{r:3,c:11},Br:{r:3,c:16},Kr:{r:3,c:17},
    Rb:{r:4,c:0},Sr:{r:4,c:1},Ag:{r:4,c:10},I:{r:4,c:16},Xe:{r:4,c:17},
    Cs:{r:5,c:0},Ba:{r:5,c:1},Au:{r:5,c:10},Hg:{r:5,c:11},At:{r:5,c:16},Rn:{r:5,c:17},
    Fr:{r:6,c:0},Ra:{r:6,c:1},
    Cm:{r:9,c:7}
  };

  /* Colour-coding by group */
  const GROUP_COLS = {
    0:'#FF5050',1:'#FF8C00',12:'#FFD700',13:'#A0C070',14:'#50C870',
    15:'#50B0C8',16:'#5090E0',17:'#8050E0',17.5:'#505050',default:'#606060'
  };

  function nextQ() {
    if (qIdx >= QUESTS.length) { end(); return; }
    currentQ   = QUESTS[qIdx]; qIdx++;
    phase      = 'hunt'; caught = false; foundIt = false;
    alarmTimer = 0; successTimer = 0;
  }

  function burst(x, y, col, n = 20) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random()-0.5)*8, vy: (Math.random()-0.5)*8, r: Math.random()*4+2, life:1, col });
    }
  }

  /* getCellRect — returns pixel rect for a given [row, col] in the periodic table */
  function getCellRect(r, c) {
    const rowY = r <= 6 ? TABLE_Y + r * (CELL_H + 2) : TABLE_Y + (r - 1) * (CELL_H + 2) + 20;
    return { x: 10 + c * CELL_W, y: rowY, w: CELL_W - 2, h: CELL_H };
  }

  /* isInSpotlight — returns true if point (px,py) is within the spotlight cone */
  function isInSpotlight(px, py) {
    const cx = canvas.width / 2, cy = canvas.height + 60;
    const dx = px - cx, dy = py - cy;
    const angle = Math.atan2(dy, dx);
    const diff  = Math.abs(((angle - spotAngle) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    return diff < 0.3;
  }

  function draw() {
    /* Dark vault background */
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Draw periodic table cells */
    Object.entries(ELEM_POS).forEach(([sym, pos]) => {
      const rect  = getCellRect(pos.r, pos.c);
      const isTarget = currentQ && sym === currentQ.target;
      ctx.save();
      ctx.fillStyle   = isTarget && foundIt ? currentQ.col + '88' : 'rgba(255,255,255,0.07)';
      ctx.strokeStyle = isTarget ? currentQ.col : 'rgba(255,255,255,0.15)';
      ctx.lineWidth   = isTarget ? 2 : 0.5;
      if (isTarget) { ctx.shadowBlur = 20; ctx.shadowColor = currentQ.col; }
      ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 3); ctx.fill(); ctx.stroke();
      ctx.font          = `bold ${sym.length > 2 ? 6 : 8}px monospace`;
      ctx.fillStyle     = isTarget ? currentQ.col : 'rgba(255,255,255,0.55)';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.shadowBlur    = 0;
      ctx.fillText(sym, rect.x + rect.w/2, rect.y + rect.h/2);
      ctx.restore();
    });

    /* Spotlight cone — rendered as a gradient triangle from bottom */
    const cx = canvas.width / 2, cy = canvas.height + 60;
    ctx.save();
    ctx.globalAlpha = caught ? 0.6 : 0.25;
    const coneLen = canvas.height + 80;
    const halfAngle = 0.28; // cone half-width in radians
    const sx1 = cx + Math.cos(spotAngle - halfAngle) * coneLen;
    const sy1 = cy + Math.sin(spotAngle - halfAngle) * coneLen;
    const sx2 = cx + Math.cos(spotAngle + halfAngle) * coneLen;
    const sy2 = cy + Math.sin(spotAngle + halfAngle) * coneLen;
    const spotGr = ctx.createLinearGradient(cx, cy, cx + Math.cos(spotAngle) * coneLen, cy + Math.sin(spotAngle) * coneLen);
    spotGr.addColorStop(0, caught ? 'rgba(255,50,50,0.9)' : 'rgba(255,240,150,0.9)');
    spotGr.addColorStop(1, 'rgba(255,240,150,0)');
    ctx.fillStyle = spotGr;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    /* Player cursor / thief icon */
    ctx.save();
    ctx.font = '20px sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(caught ? '😱' : '🕵️', cursorX, cursorY);
    ctx.restore();

    /* Particles */
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      p.x += p.vx; p.y += p.vy; p.life -= 0.03;
      if (p.life <= 0) particles.splice(i, 1);
      ctx.restore();
    }

    /* Mission briefing panel */
    if (currentQ) {
      ctx.save();
      ctx.fillStyle   = 'rgba(0,0,0,0.8)';
      ctx.strokeStyle = 'rgba(255,215,0,0.3)';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.roundRect(10, canvas.height - 56, canvas.width - 20, 46, 8); ctx.fill(); ctx.stroke();
      ctx.font        = 'bold 11px Outfit'; ctx.fillStyle = '#FFD700';
      ctx.textAlign   = 'center';
      ctx.fillText('🕵️ MISSION: ' + currentQ.q, canvas.width/2, canvas.height - 36);
      ctx.font        = '9px Outfit'; ctx.fillStyle = '#9B8FC0';
      ctx.fillText('Move to ' + currentQ.target + ' without touching the spotlight', canvas.width/2, canvas.height - 20);
      ctx.restore();
    }

    /* Alarm flash when caught */
    if (caught && alarmTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.sin(alarmTimer * 0.3) * 0.3;
      ctx.fillStyle   = 'rgba(255,0,0,1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      alarmTimer--;
    }

    /* Success flash */
    if (foundIt && successTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.sin(successTimer * 0.3) * 0.25;
      ctx.fillStyle   = currentQ ? currentQ.col : '#00F5A0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      successTimer--;
    }

    /* Hearts */
    ctx.font = '15px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let h = '';
    for (let i = 0; i < 3; i++) h += i < lives ? '❤️ ' : '🖤 ';
    ctx.fillText(h, 10, 20);
    ctx.font = 'bold 10px Outfit'; ctx.fillStyle = '#9B8FC0'; ctx.textAlign = 'right';
    ctx.fillText('Mission ' + qIdx + '/' + QUESTS.length, canvas.width - 10, 20);
  }

  /* update — rotates spotlight, checks if player cursor is in it */
  function update() {
    if (phase !== 'hunt') return;
    spotAngle = (spotAngle - spotSpd + Math.PI * 2) % (Math.PI * 2);

    /* Check if cursor/player is in spotlight */
    if (isInSpotlight(cursorX, cursorY) && !caught) {
      caught     = true;
      alarmTimer = 50;
      lives--;
      updateHealth(Math.max(0, (lives / 3) * 100));
      shakeCanvas(canvas);
      showFloatingText('🚨 CAUGHT!', canvas.width/2, canvas.height/2, '#FF2D9B');
      setTimeout(() => { caught = false; }, 2000);
    }

    /* Check if player has reached the target element */
    if (!caught && currentQ && !foundIt) {
      const pos  = ELEM_POS[currentQ.target];
      if (pos) {
        const rect = getCellRect(pos.r, pos.c);
        if (cursorX >= rect.x && cursorX <= rect.x + rect.w &&
            cursorY >= rect.y && cursorY <= rect.y + rect.h) {
          foundIt      = true;
          successTimer = 40;
          phase        = 'done';
          localScore  += 30;
          score        = localScore;
          updateHUD(localScore);
          burst(rect.x + rect.w/2, rect.y + rect.h/2, currentQ.col);
          showFloatingText('🕵️ STOLEN! +30', cursorX, cursorY - 30, currentQ.col);
          showFloatingText('💡 ' + currentQ.fact, canvas.width/2, canvas.height - 70, '#00C3FF');
          updateProgress(Math.min(100, ~~((qIdx / QUESTS.length) * 100)));
          setTimeout(nextQ, 2200);
        }
      }
    }
  }

  /* Track mouse and touch movement for the thief cursor */
  canvas.addEventListener('mousemove', e => {
    const p = gpos(canvas, e); cursorX = p.x; cursorY = p.y;
  });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const p = gpos(canvas, e.touches[0]); cursorX = p.x; cursorY = p.y;
  }, { passive: false });
  canvas.addEventListener('touchstart', e => {
    const p = gpos(canvas, e.touches[0]); cursorX = p.x; cursorY = p.y;
  }, { passive: true });

  function loop() {
    if (isOver) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(); update();
    animId = requestAnimationFrame(loop);
  }

  function end() {
    isOver = true;
    clearInterval(timerInterval);
    cancelAnimationFrame(animId);
    score = localScore;
    finishMission(Math.min(100, ~~((localScore / (QUESTS.length * 30)) * 100)), 0);
  }

  timerInterval = setInterval(() => { gameTime--; updateTimer(gameTime); if (gameTime <= 0 || lives <= 0) end(); }, 1000);
  updateTimer(gameTime);
  nextQ();
  loop();
}


/* ─────────────────────────────────────────────
   CHEM MCQ — Grade 10 (standard MCQ)
───────────────────────────────────────────── */
function bioDefence(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const QA_G6 = [
    { q:'Cell control center?',   a:'Nucleus',    w:['Mitochondria','Ribosome'], fact:'Nucleus contains DNA, controls cell activities' },
    { q:'Energy powerhouse?',     a:'Mitochondria',w:['Nucleus','Vacuole'],      fact:'Mitochondria produces ATP via cellular respiration' },
    { q:'Protein synthesis site?',a:'Ribosome',   w:['Nucleus','Cell Wall'],    fact:'Ribosomes translate mRNA into proteins' },
    { q:'Only in plant cells?',   a:'Cell Wall',  w:['Nucleus','Mitochondria'], fact:'Cellulose cell wall gives plants rigidity' },
    { q:'Stores water in plants?',a:'Vacuole',    w:['Ribosome','Lysosome'],    fact:'Large central vacuole stores water & nutrients' },
    { q:'Oxygen carrier in blood?',a:'RBC',       w:['WBC','Platelet'],         fact:'Haemoglobin in RBCs binds O₂ in lungs' },
    { q:'Immune defence cell?',   a:'WBC',        w:['RBC','Platelet'],         fact:'WBCs (leukocytes) destroy pathogens' },
    { q:'Blood pump organ?',      a:'Heart',      w:['Lungs','Kidney'],         fact:'Heart pumps ~5 L/min through blood vessels' }
  ];
  const QA_G7 = [
    { q:'Enzyme in saliva?',         a:'Amylase',         w:['Pepsin','Lipase'],           fact:'Salivary amylase breaks starch → maltose' },
    { q:'Protein digestion begins in?',a:'Stomach',       w:['Mouth','Small intestine'],   fact:'Pepsin (pH 2) digests proteins in stomach' },
    { q:'Site of photosynthesis?',   a:'Chloroplast',     w:['Mitochondria','Nucleus'],    fact:'Chlorophyll absorbs sunlight for photosynthesis' },
    { q:'Gas released in photosynthesis?',a:'Oxygen',     w:['CO₂','Nitrogen'],            fact:'6CO₂+6H₂O+light→C₆H₁₂O₆+6O₂' },
    { q:'Anaerobic respiration in yeast?',a:'Ethanol',    w:['Lactic acid','Water'],       fact:'Yeast: glucose→ethanol+CO₂ (fermentation)' },
    { q:'Nutrient absorption in?',   a:'Small intestine', w:['Stomach','Large intestine'],  fact:'Villi/microvilli in small intestine absorb nutrients' },
    { q:'Transpiration: water lost from?',a:'Leaves (stomata)',w:['Roots','Stems'],        fact:'Stomata open → water vapour escapes (transpiration)' }
  ];
  const QA = g <= 6 ? QA_G6 : QA_G7;

  let localScore = 0, lives = 3, gameTime = 75 + (g - 6) * 5, isOver = false, animId;
  let wave = 1, combo = 0;
  let pathogens = [], antibodies = [], particles = [], factBanners = [];
  let cell = { x: 58, y: canvas.height / 2, r: 28 }; // WBC position

  function spawnPathogens() {
    if (isOver) return;
    const qa   = QA[~~(Math.random() * QA.length)];
    const opts = [qa.a, ...qa.w].sort(() => Math.random() - 0.5); // shuffle so correct isn't always first
    const spread = (canvas.height - 80) / opts.length;
    opts.forEach((opt, i) => {
      pathogens.push({
        x: canvas.width + 20,
        y: 58 + i * spread + spread / 2,
        r: 32, spd: 1.2 + wave * 0.15,
        label: opt, ok: opt === qa.a,
        q: qa.q, fact: qa.fact,
        col:  ['#FF2D9B','#E7223A','#FF6B00','#8B00E8'][i % 4],
        icon: ['🦠','🧫','💀','🔴'][i % 4],
        wobble: Math.random() * Math.PI * 2
      });
    });
  }

  function fireAntibody() {
    antibodies.push({ x: cell.x + cell.r, y: cell.y, r: 8, spd: 8, col: '#00F5A0' });
  }

  function burst(x, y, col, n = 16) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random()-0.5)*8, vy: (Math.random()-0.5)*8, r: Math.random()*4+2, life:1, col });
    }
  }

  function draw() {
    const gr = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gr.addColorStop(0, '#001a0a'); gr.addColorStop(1, '#0a0020');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Ambient glow orbs */
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.globalAlpha = 0.03; ctx.fillStyle = '#00F5A0';
      ctx.beginPath(); ctx.arc(100 + i*150, 80 + Math.sin(Date.now()*.001+i)*30, 60, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    /* WBC cell */
    ctx.save();
    ctx.shadowBlur = 20; ctx.shadowColor = '#00F5A0';
    ctx.strokeStyle = '#00F5A0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cell.x, cell.y, cell.r + 6, 0, Math.PI * 2); ctx.stroke();
    const cg = ctx.createRadialGradient(cell.x, cell.y, 2, cell.x, cell.y, cell.r);
    cg.addColorStop(0, '#00F5A033'); cg.addColorStop(1, '#00F5A011');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cell.x, cell.y, cell.r, 0, Math.PI*2); ctx.fill();
    /* Nucleus inside WBC */
    ctx.fillStyle = '#00C3FF33'; ctx.strokeStyle = '#00C3FF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cell.x, cell.y, cell.r * 0.45, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.font = '9px Outfit'; ctx.fillStyle = '#00F5A0'; ctx.textAlign = 'center';
    ctx.fillText('WBC', cell.x, cell.y + cell.r + 14);

    /* Pathogens */
    pathogens.forEach(p => {
      p.wobble += 0.05;
      const wy = Math.sin(p.wobble) * 3;
      ctx.save();
      ctx.shadowBlur = 16; ctx.shadowColor = p.col;
      ctx.fillStyle   = p.col + '44'; ctx.strokeStyle = p.col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y + wy, p.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.icon, p.x, p.y + wy - 6);
      ctx.font = 'bold 10px Outfit'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.label, p.x, p.y + wy + p.r + 2);
      ctx.restore();
    });

    /* Antibodies */
    antibodies.forEach(a => {
      ctx.save(); ctx.fillStyle = a.col; ctx.shadowBlur = 12; ctx.shadowColor = a.col;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI*2); ctx.fill(); ctx.restore();
    });

    /* Particles */
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.col;
      ctx.shadowBlur = 8; ctx.shadowColor = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      p.x += p.vx; p.y += p.vy; p.life -= 0.025;
      if (p.life <= 0) particles.splice(i, 1);
      ctx.restore();
    }

    /* Fact banners */
    factBanners = factBanners.filter(f => f.life > 0);
    factBanners.forEach(f => {
      f.life -= 0.012;
      ctx.save(); ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = 'rgba(0,20,10,.8)';
      ctx.beginPath(); ctx.roundRect(canvas.width - 234, canvas.height - 52, 222, 34, 8); ctx.fill();
      ctx.font = '9px Outfit'; ctx.fillStyle = '#00F5A0'; ctx.textAlign = 'center';
      ctx.fillText('💡 ' + f.text.slice(0, 42), canvas.width - 123, canvas.height - 30);
      ctx.restore();
    });

    /* Question label at top */
    if (pathogens.length > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(80, 6, canvas.width - 160, 30, 8); ctx.fill();
      ctx.font = 'bold 11px Outfit'; ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center'; ctx.fillText('❓ ' + pathogens[0].q, canvas.width/2, 26);
      ctx.restore();
    }

    /* Lives + wave */
    ctx.font = '16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let h = '';
    for (let i = 0; i < 3; i++) h += i < lives ? '❤️ ' : '🖤 ';
    ctx.fillText(h, 10, canvas.height - 10);
    ctx.font = 'bold 10px Outfit'; ctx.fillStyle = 'rgba(255,215,0,.5)'; ctx.textAlign = 'right';
    ctx.fillText('Wave ' + wave, canvas.width - 10, canvas.height - 10);
  }

  function update() {
    /* Move antibodies, check collisions with pathogens */
    for (let ai = antibodies.length - 1; ai >= 0; ai--) {
      const a = antibodies[ai];
      a.x += a.spd;
      for (let pi = pathogens.length - 1; pi >= 0; pi--) {
        const p = pathogens[pi];
        const dx = a.x - p.x, dy = a.y - p.y;
        if (Math.sqrt(dx*dx + dy*dy) < a.r + p.r) {
          if (p.ok) {
            combo++;
            const pts = 15 + combo * 5;
            localScore += pts; score = localScore;
            burst(p.x, p.y, '#00F5A0');
            showFloatingText('+' + pts, p.x, p.y - 20, '#00F5A0');
            factBanners.push({ text: p.fact, life: 3.5 });
            updateHUD(localScore);
            updateCombo(Math.min(combo, 9));
          } else {
            combo = 0;
            burst(p.x, p.y, '#FF2D9B', 8);
          }
          pathogens.splice(pi, 1);
          antibodies.splice(ai, 1);
          break;
        }
      }
      if (ai < antibodies.length && antibodies[ai] && antibodies[ai].x > canvas.width) {
        antibodies.splice(ai, 1);
      }
    }
    /* Pathogens that reach the WBC cost a life */
    for (let pi = pathogens.length - 1; pi >= 0; pi--) {
      const p = pathogens[pi];
      p.x -= p.spd;
      if (p.x + p.r < cell.x + cell.r + 8) {
        lives--;
        updateHealth(Math.max(0, (lives / 3) * 100));
        burst(cell.x, cell.y, '#FF2D9B');
        pathogens.splice(pi, 1);
      }
    }
  }

  let keys = {};
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.code === 'Space') { fireAntibody(); e.preventDefault(); }
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });
  canvas.addEventListener('click',      fireAntibody);
  canvas.addEventListener('touchstart', fireAntibody, { passive: true });

  /* Arrow keys move the WBC up/down */
  function moveCell() {
    if (keys['ArrowUp']   && cell.y > cell.r + 50)                     cell.y -= 5;
    if (keys['ArrowDown'] && cell.y < canvas.height - cell.r)           cell.y += 5;
    if (!isOver) requestAnimationFrame(moveCell);
  }

  function loop() {
    if (isOver) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(); update();
    animId = requestAnimationFrame(loop);
  }

  function end() {
    isOver = true;
    clearInterval(spawnInterval);
    clearInterval(timerInterval);
    cancelAnimationFrame(animId);
    score = localScore;
    finishMission(Math.min(100, ~~((localScore / 300) * 100)), 0);
  }

  spawnInterval = setInterval(spawnPathogens, 3500);
  timerInterval = setInterval(() => {
    gameTime--; updateTimer(gameTime);
    if (gameTime % 20 === 0 && gameTime > 0) wave++;
    if (gameTime <= 0 || lives <= 0) end();
  }, 1000);
  spawnPathogens(); moveCell(); loop(); updateTimer(gameTime);
}


/* ─────────────────────────────────────────────
   BIO DNA — Grade 8 & 9
   DNA HELIX BUILDER
   Nucleotide bases fall from the top.
   Player's collector at the bottom must catch ONLY the correct
   complementary base (A↔T, G↔C).
   Wrong base = mutation alarm + shake. Correct 10 pairs = mission complete.
───────────────────────────────────────────── */
function bioDNA(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* Base pairing rules and question banks */
  const PAIRS_G8 = [
    { template:'A', correct:'T', wrong:['G','C','A'], fact:'Adenine pairs with Thymine (2 hydrogen bonds)' },
    { template:'T', correct:'A', wrong:['G','C','T'], fact:'Thymine pairs with Adenine (2 hydrogen bonds)' },
    { template:'G', correct:'C', wrong:['A','T','G'], fact:'Guanine pairs with Cytosine (3 hydrogen bonds)' },
    { template:'C', correct:'G', wrong:['A','T','C'], fact:'Cytosine pairs with Guanine (3 hydrogen bonds)' }
  ];
  /* Grade 9 adds RNA transcription questions */
  const PAIRS_G9 = [
    ...PAIRS_G8,
    { template:'A (DNA→RNA)', correct:'U', wrong:['T','G','C'], fact:'In RNA transcription: DNA Adenine → RNA Uracil' },
    { template:'T (DNA→RNA)', correct:'A', wrong:['U','G','C'], fact:'In RNA transcription: DNA Thymine → RNA Adenine' },
    { template:'G (DNA→RNA)', correct:'C', wrong:['A','U','T'], fact:'In RNA transcription: DNA Guanine → RNA Cytosine' },
    { template:'C (DNA→RNA)', correct:'G', wrong:['A','U','T'], fact:'In RNA transcription: DNA Cytosine → RNA Guanine' }
  ];
  const PAIRS = g <= 8 ? PAIRS_G8 : PAIRS_G9;
  const BASE_COLS = { A:'#FF5050', T:'#00C3FF', G:'#FFD700', C:'#00F5A0', U:'#FF2D9B' };

  let localScore = 0, lives = 3, gameTime = 90 + (g - 8) * 10, isOver = false, animId;
  let pairsBuilt = 0, totalPairs = 12, qIdx = 0, currentPair = null;
  let fallingBases = [], particles = [], helix = [];
  let collector = { x: canvas.width / 2 - 36, y: canvas.height - 36, w: 72, h: 20, speed: 8 };

  /* spawnBases — spawns 4 bases (1 correct, 3 wrong) in random horizontal positions */
  function spawnBases() {
    if (isOver) return;
    currentPair = PAIRS[qIdx % PAIRS.length];
    qIdx++;
    const allBases = [currentPair.correct, ...currentPair.wrong.slice(0, 3)];
    const shuffled  = allBases.sort(() => Math.random() - 0.5);
    const slotW     = (canvas.width - 40) / 4;
    shuffled.forEach((base, i) => {
      fallingBases.push({
        x:    20 + i * slotW + slotW / 2,
        y:    -30,
        r:    22,
        base,
        ok:   base === currentPair.correct,
        spd:  2.5 + (g - 8) * 0.5 + pairsBuilt * 0.08,
        col:  BASE_COLS[base] || '#9B8FC0',
        wobble: Math.random() * Math.PI * 2
      });
    });
  }

  function burst(x, y, col, n = 18) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random()-0.5)*9, vy: (Math.random()-0.5)*9, r: Math.random()*4+2, life: 1, col });
    }
  }

  /* addToHelix — stores a successfully caught pair for the visual helix */
  function addToHelix(base, col) {
    helix.push({ base, col, x: 80 + (pairsBuilt % 6) * 95, y: canvas.height - 80 - ~~(pairsBuilt / 6) * 30 });
    pairsBuilt++;
    if (pairsBuilt >= totalPairs) { setTimeout(end, 800); }
  }

  function draw() {
    /* Dark background */
    const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gr.addColorStop(0, '#000a14'); gr.addColorStop(1, '#000520');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Helical backbone guides (decorative) */
    ctx.save(); ctx.strokeStyle = 'rgba(0,195,255,0.1)'; ctx.lineWidth = 1.5;
    for (let y = 0; y < canvas.height; y += 4) {
      const x1 = canvas.width * 0.05 + Math.sin(y * 0.04) * 15;
      const x2 = canvas.width * 0.95 + Math.cos(y * 0.04) * 15;
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    }
    ctx.restore();

    /* Question / template strand */
    if (currentPair) {
      ctx.save();
      ctx.fillStyle   = 'rgba(0,0,0,0.7)';
      ctx.strokeStyle = 'rgba(255,215,0,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(canvas.width/2 - 200, 8, 400, 44, 10); ctx.fill(); ctx.stroke();
      ctx.font      = 'bold 13px Outfit'; ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.fillText('Template strand: ' + currentPair.template + ' → ?', canvas.width/2, 26);
      ctx.font      = '9px Outfit'; ctx.fillStyle = '#9B8FC0';
      ctx.fillText('Catch the correct complementary base!', canvas.width/2, 42);
      ctx.restore();
    }

    /* Falling bases */
    fallingBases.forEach(b => {
      b.wobble += 0.03; b.y += b.spd;
      ctx.save();
      ctx.shadowBlur  = 14; ctx.shadowColor = b.col;
      ctx.fillStyle   = b.col + '33'; ctx.strokeStyle = b.col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font      = 'bold 14px "Courier New"';
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.base, b.x, b.y);
      ctx.restore();
    });

    /* Collector platform */
    ctx.save();
    const cg = ctx.createLinearGradient(collector.x, 0, collector.x + collector.w, 0);
    cg.addColorStop(0,   '#00F5A0');
    cg.addColorStop(0.5, '#00C3FF');
    cg.addColorStop(1,   '#00F5A0');
    ctx.fillStyle   = cg;
    ctx.shadowBlur  = 18; ctx.shadowColor = '#00F5A0';
    ctx.beginPath(); ctx.roundRect(collector.x, collector.y, collector.w, collector.h, 8); ctx.fill();
    ctx.restore();

    /* Built helix display at bottom */
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(10, canvas.height - 98, canvas.width - 20, 56, 8); ctx.fill();
    helix.forEach((pair, i) => {
      const hx = 20 + i * ((canvas.width - 40) / totalPairs);
      ctx.shadowBlur  = 6; ctx.shadowColor = pair.col;
      ctx.fillStyle   = pair.col;
      ctx.beginPath(); ctx.arc(hx, canvas.height - 70, 8, 0, Math.PI*2); ctx.fill();
      ctx.font      = 'bold 7px monospace'; ctx.fillStyle = '#000';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 0;
      ctx.fillText(pair.base, hx, canvas.height - 70);
    });
    ctx.restore();

    /* Pairs counter */
    ctx.font = 'bold 11px Outfit'; ctx.fillStyle = '#00F5A0'; ctx.textAlign = 'right';
    ctx.fillText(`Pairs: ${pairsBuilt}/${totalPairs}`, canvas.width - 10, canvas.height - 110);

    /* Particles */
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      p.x += p.vx; p.y += p.vy; p.life -= 0.025;
      if (p.life <= 0) particles.splice(i, 1);
      ctx.restore();
    }

    /* Lives */
    ctx.font = '16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let h = '';
    for (let i = 0; i < 3; i++) h += i < lives ? '❤️ ' : '🖤 ';
    ctx.fillText(h, 10, canvas.height - 10);
  }

  function update() {
    for (let bi = fallingBases.length - 1; bi >= 0; bi--) {
      const b = fallingBases[bi];
      /* Collision with collector */
      if (b.y + b.r >= collector.y && b.y - b.r <= collector.y + collector.h &&
          b.x >= collector.x && b.x <= collector.x + collector.w) {
        if (b.ok) {
          localScore += 20; score = localScore;
          updateHUD(localScore);
          updateProgress(Math.min(100, ~~((pairsBuilt / totalPairs) * 100)));
          burst(b.x, collector.y, b.col);
          showFloatingText('+20 ✓', b.x, collector.y - 20, b.col);
          showFloatingText('💡 ' + currentPair.fact, canvas.width/2, 60, '#00C3FF');
          addToHelix(b.base, b.col);
          /* Remove all bases from this round */
          fallingBases.splice(0, fallingBases.length);
          setTimeout(spawnBases, 600);
          break;
        } else {
          /* Wrong base caught — mutation! */
          lives--;
          updateHealth(Math.max(0, (lives / 3) * 100));
          shakeCanvas(canvas);
          showFloatingText('🧬 MUTATION! Wrong base!', canvas.width/2, collector.y - 30, '#FF2D9B');
          fallingBases.splice(bi, 1);
        }
        continue;
      }
      /* Base reaches bottom without being caught */
      if (b.y - b.r > canvas.height) {
        if (b.ok) {
          /* Missed the correct base */
          showFloatingText('Missed!', b.x, canvas.height - 20, '#FF2D9B');
        }
        fallingBases.splice(bi, 1);
        /* Only respawn if no bases are left */
        if (fallingBases.length === 0) spawnBases();
      }
    }
  }

  /* Keyboard control */
  let keys = {};
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    ['ArrowLeft','ArrowRight'].includes(e.key) && e.preventDefault();
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const { x } = gpos(canvas, e.touches[0]);
    collector.x = Math.max(0, Math.min(canvas.width - collector.w, x - collector.w / 2));
  }, { passive: false });

  function handleInput() {
    if (keys['ArrowLeft'])  collector.x = Math.max(0, collector.x - collector.speed);
    if (keys['ArrowRight']) collector.x = Math.min(canvas.width - collector.w, collector.x + collector.speed);
    if (!isOver) requestAnimationFrame(handleInput);
  }

  function loop() {
    if (isOver) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(); update();
    animId = requestAnimationFrame(loop);
  }

  function end() {
    isOver = true;
    clearInterval(timerInterval);
    cancelAnimationFrame(animId);
    score = localScore;
    finishMission(Math.min(100, ~~((localScore / (totalPairs * 20)) * 100)), 0);
  }

  timerInterval = setInterval(() => { gameTime--; updateTimer(gameTime); if (gameTime <= 0 || lives <= 0) end(); }, 1000);
  updateTimer(gameTime);
  spawnBases(); handleInput(); loop();
}


/* ─────────────────────────────────────────────
   BIO MCQ — Grade 10-12
   Standard MCQ using the shared mcqEngine.
   Topics scale with grade: Genetics (10), Physiology (11), Ecology/Biotech (12)
───────────────────────────────────────────── */
function mathsNinja(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const BANKS = {
    6: [
      () => { const a=~~(Math.random()*12)+2, b=~~(Math.random()*12)+2;       return { q:`${a} × ${b} = ?`, ans:a*b }; },
      () => { const a=~~(Math.random()*50)+20, b=~~(Math.random()*20)+5;      return { q:`${a} + ${b} = ?`, ans:a+b }; },
      () => { const a=~~(Math.random()*60)+30, b=~~(Math.random()*20)+5;      return { q:`${a} − ${b} = ?`, ans:a-b }; },
      () => { const b=[2,3,4,5,6,10][~~(Math.random()*6)],a=b*(~~(Math.random()*12)+2); return { q:`${a} ÷ ${b} = ?`, ans:a/b }; },
      () => { const a=~~(Math.random()*40)+10, p=~~(Math.random()*8)+2; return { q:`${p}% of ${a} = ?`, ans:Math.round(a*p/100) }; }
    ],
    7: [
      () => { const a=~~(Math.random()*8)+2, b=~~(Math.random()*8)+1; return { q:`${a}x + ${b} = ${a*3+b}. x=?`, ans:3 }; },
      () => { const a=~~(Math.random()*10)+2, b=~~(Math.random()*5)+1; return { q:`${a}² + ${b} = ?`, ans:a*a+b }; },
      () => { const n=[4,9,16,25,36,49,64,81][~~(Math.random()*8)]; return { q:`√${n} = ?`, ans:Math.sqrt(n) }; },
      () => { const a=~~(Math.random()*12)+2, b=~~(Math.random()*12)+2, c=~~(Math.random()*6)+1; return { q:`${a}×${b}−${c}=?`, ans:a*b-c }; },
      () => { const d=[2,4,5,10][~~(Math.random()*4)], n=~~(Math.random()*(d-1))+1; return { q:`${n}/${d} of 120=?`, ans:Math.round(n/d*120) }; }
    ]
  };
  const bank = BANKS[g] || BANKS[6];

  let localScore = 0, lives = 3, gameTime = 70, isOver = false, animId;
  let combo = 0, streak = 0;
  let bubbles = [], slashes = [], particles = [], currentQ = null;

  /* genQ — generates a new question with 3 shuffled answer bubbles */
  function genQ() {
    const fn  = bank[~~(Math.random() * bank.length)];
    const q   = fn();
    const off1 = ~~(Math.random() * 5) + 1;
    const off2 = ~~(Math.random() * 8) + 3;
    const w1   = Math.round(q.ans + (Math.random() > 0.5 ? off1 : -off1));
    const w2   = Math.round(Math.max(0, q.ans + (Math.random() > 0.5 ? off2 : -off2)));
    const vals = [...new Set([Math.round(q.ans), w1, w2])];
    while (vals.length < 3) vals.push(Math.round(q.ans) + vals.length * 7);
    const shuffled = vals.slice(0, 3).sort(() => Math.random() - 0.5);
    currentQ = q;
    const cols = ['#FF2D9B','#00C3FF','#FFD700','#00F5A0'];
    bubbles = [];
    shuffled.forEach((val, i) => {
      bubbles.push({
        x: 80 + Math.random() * (canvas.width - 160),
        y: canvas.height + 60 + i * 40,
        r: 40, vy: -(1.2 + (g - 6) * 0.3),
        val, ok: val === Math.round(q.ans),
        col: cols[i % cols.length],
        wobble: Math.random() * Math.PI * 2,
        scale: 1, popped: false
      });
    });
  }

  /* slash — registers a slash at (x,y), checks if it hits any bubble */
  function slash(x, y) {
    slashes.push({ x, y, life: 1 });
    bubbles.forEach(b => {
      if (b.popped) return;
      const dx = x - b.x, dy = y - b.y;
      if (Math.sqrt(dx*dx + dy*dy) < b.r + 12) {
        b.popped = true;
        if (b.ok) {
          combo++; streak++;
          localScore += 10 + combo * 3; score = localScore;
          burst(b.x, b.y, b.col);
          showFloatingText('✓ +' + (10 + combo * 3), b.x, b.y - 20, '#00F5A0');
          updateHUD(localScore); updateCombo(Math.min(combo, 9));
          updateProgress(Math.min(100, ~~((localScore / 350) * 100)));
          setTimeout(genQ, 550);
        } else {
          lives--; combo = 0; streak = 0;
          burst(b.x, b.y, '#FF2D9B', 10);
          shakeCanvas(canvas);
          showFloatingText('✗ Wrong!', b.x, b.y - 20, '#FF2D9B');
          updateHealth(Math.max(0, (lives / 3) * 100));
        }
      }
    });
  }

  function burst(x, y, col, n = 20) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10, r: Math.random()*5+2, life:1, col });
    }
  }

  function draw() {
    const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gr.addColorStop(0, '#0a001a'); gr.addColorStop(1, '#001a2a');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Faint math symbols background */
    const syms = ['+','−','×','÷','=','²','√','π','%'];
    ctx.save(); ctx.globalAlpha = 0.04; ctx.fillStyle = '#FFD700'; ctx.font = '26px serif';
    for (let i = 0; i < 14; i++) {
      ctx.fillText(syms[i % syms.length], 30 + i*48, 50 + Math.sin(Date.now()*0.001+i)*18);
      ctx.fillText(syms[(i+3) % syms.length], 20 + i*48, canvas.height - 28 + Math.cos(Date.now()*0.001+i)*14);
    }
    ctx.restore();

    /* Question card */
    if (currentQ) {
      ctx.save();
      ctx.fillStyle   = 'rgba(255,215,0,.08)'; ctx.strokeStyle = 'rgba(255,215,0,.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(canvas.width/2 - 170, 10, 340, 56, 12); ctx.fill(); ctx.stroke();
      ctx.font      = 'bold 22px "Courier New"'; ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center'; ctx.shadowBlur = 10; ctx.shadowColor = '#FFD700';
      ctx.fillText(currentQ.q, canvas.width/2, 48); ctx.shadowBlur = 0;
      ctx.restore();
    }

    /* Bubbles — float upward, wobble side to side */
    bubbles.forEach(b => {
      if (b.popped) b.scale *= 1.15;
      b.wobble += 0.04; b.y += b.vy; b.x += Math.sin(b.wobble) * 0.4;
      ctx.save(); ctx.translate(b.x, b.y); ctx.scale(b.scale, b.scale);
      ctx.shadowBlur = 18; ctx.shadowColor = b.col;
      const bg = ctx.createRadialGradient(-b.r*.3,-b.r*.3,b.r*.1,0,0,b.r);
      bg.addColorStop(0, b.col + '55'); bg.addColorStop(0.7, b.col + '22'); bg.addColorStop(1, b.col + '00');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = b.col; ctx.lineWidth = 2.5; ctx.globalAlpha = b.popped ? 0.3 : 0.9;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = b.popped ? 0.2 : 1;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px "Courier New"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 0;
      ctx.fillText(b.val, 0, 0);
      ctx.restore();
    });
    /* Remove offscreen/popped bubbles */
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i].y < -80 || (bubbles[i].popped && bubbles[i].scale > 2.5)) bubbles.splice(i, 1);
    }

    /* Slash effects */
    slashes.forEach((s, i) => {
      s.life -= 0.06;
      if (s.life <= 0) { slashes.splice(i, 1); return; }
      ctx.save(); ctx.globalAlpha = s.life;
      ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 3 * s.life; ctx.shadowBlur = 12; ctx.shadowColor = '#FFD700';
      ctx.beginPath(); ctx.moveTo(s.x-18, s.y-18); ctx.lineTo(s.x+18, s.y+18);
      ctx.moveTo(s.x+18, s.y-18); ctx.lineTo(s.x-18, s.y+18); ctx.stroke();
      ctx.restore();
    });

    /* Particles */
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.col; ctx.shadowBlur = 6; ctx.shadowColor = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.025;
      if (p.life <= 0) particles.splice(i, 1);
      ctx.restore();
    }

    /* Ninja icon */
    ctx.font = '36px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('🥷', 50, canvas.height - 42 + Math.sin(Date.now() * 0.008) * 5);

    /* HUD */
    ctx.font = '15px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let h = '';
    for (let i = 0; i < 3; i++) h += i < lives ? '❤️ ' : '🖤 ';
    ctx.fillText(h, 10, canvas.height - 10);
    ctx.font = 'bold 11px Outfit'; ctx.fillStyle = 'rgba(255,215,0,.6)'; ctx.textAlign = 'right';
    ctx.fillText('Streak ' + streak, canvas.width - 10, canvas.height - 10);
  }

  function onSlash(e) { const { x, y } = gpos(canvas, e); slash(x, y); }
  canvas.addEventListener('click',      onSlash);
  canvas.addEventListener('mousemove',  e => { if (e.buttons) onSlash(e); });
  canvas.addEventListener('touchstart', e => { onSlash(e.touches[0]); e.preventDefault(); }, { passive: false });

  function loop() {
    if (isOver) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw();
    animId = requestAnimationFrame(loop);
  }

  function end() {
    isOver = true;
    clearInterval(timerInterval); cancelAnimationFrame(animId);
    score = localScore;
    finishMission(Math.min(100, ~~((localScore / 250) * 100)), 0);
  }

  timerInterval = setInterval(() => { gameTime--; updateTimer(gameTime); if (gameTime <= 0 || lives <= 0) end(); }, 1000);
  updateTimer(gameTime); genQ(); loop();
}


/* ─────────────────────────────────────────────
   MATHS LASER — Grade 8
   LASER GEOMETRY
   Player rotates a laser emitter dial to the correct angle.
   The laser beam must hit the answer target (bouncing off mirrors).
   Questions on Pythagoras, area, angles.
───────────────────────────────────────────── */
function mathsLaser(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* Questions — q = question text, opts = possible angles/answers, correctIdx = which option is right */
  const QUESTIONS = [
    { q:'Pythagoras: a=3 b=4. c=?',   opts:[5,7,6],        ans:0, fact:'c²=3²+4²=25 → c=5 (3-4-5 Pythagorean triple)' },
    { q:'Area of square side=8:',      opts:[64,16,32],     ans:0, fact:'Area=s²=8²=64 sq.units' },
    { q:'Angles in triangle sum to:',  opts:[180,360,90],   ans:0, fact:'Angle sum property: all triangles = 180°' },
    { q:'Volume of cube side=3:',      opts:[27,9,18],      ans:0, fact:'V=s³=3³=27 cubic units' },
    { q:'Perimeter of rectangle 5×3:', opts:[16,15,10],     ans:0, fact:'P=2(l+w)=2(5+3)=16 units' },
    { q:'Interior angle of regular hexagon:', opts:[120,60,135], ans:0, fact:'(n-2)×180/n = (6-2)×180/6 = 120°' }
  ];

  let localScore = 0, lives = 3, gameTime = 85, isOver = false, animId;
  let qIdx = 0, currentQ = null, laserAngle = 0, particles = [], answered = false;
  let targets = [];

  function nextQ() {
    const raw   = QUESTIONS[qIdx % QUESTIONS.length];
    /* Shuffle options (same shuffleQuestion logic inline since these have numeric opts) */
    const correctVal   = raw.opts[raw.ans];
    const shuffledOpts = raw.opts.slice().sort(() => Math.random() - 0.5);
    const newAns       = shuffledOpts.indexOf(correctVal);
    currentQ  = { ...raw, opts: shuffledOpts, ans: newAns };
    qIdx++;
    answered = false;
    laserAngle = Math.PI + 0.5; // start rotated away from targets

    /* Create targets spread horizontally at the top */
    const spacing = (canvas.width - 80) / currentQ.opts.length;
    targets = currentQ.opts.map((val, i) => ({
      x: 40 + i * spacing + spacing / 2,
      y: 80,
      r: 36,
      val,
      ok: i === currentQ.ans,
      col: ['#00C3FF','#FF2D9B','#FFD700'][i % 3],
      hit: false,
      hitAlpha: 0
    }));
  }

  function burst(x, y, col, n = 20) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10, r: Math.random()*5+2, life:1, col });
    }
  }

  /* getLaserEndpoint — traces the laser beam, reflecting off left/right walls once */
  function getLaserEndpoint() {
    const ox = canvas.width / 2, oy = canvas.height - 50;
    const dx = Math.cos(laserAngle), dy = Math.sin(laserAngle);
    const points = [{ x: ox, y: oy }];
    let cx = ox, cy = oy, cdx = dx, cdy = dy;
    /* Cast ray until it goes off screen (simple single bounce) */
    for (let step = 0; step < 2; step++) {
      if (cdx === 0 && cdy === 0) break;
      let tMin = 99999;
      let nx = cx + cdx * tMin, ny = cy + cdy * tMin;

      /* Check wall bounces */
      if (cdx !== 0) {
        const t = cdx > 0 ? (canvas.width - cx) / cdx : -cx / cdx;
        if (t > 0 && t < tMin) { tMin = t; }
      }
      if (cdy !== 0) {
        const t = cdy < 0 ? -cy / cdy : (canvas.height - cy) / cdy;
        if (t > 0 && t < tMin) { tMin = t; }
      }
      nx = cx + cdx * tMin; ny = cy + cdy * tMin;
      points.push({ x: nx, y: ny });
      if (ny <= 0 || ny >= canvas.height) break;
      /* Reflect horizontally */
      cdx = -cdx;
      cx = nx; cy = ny;
    }
    return points;
  }

  function draw() {
    const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gr.addColorStop(0, '#020814'); gr.addColorStop(1, '#080020');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Grid lines */
    ctx.save(); ctx.strokeStyle = 'rgba(0,195,255,.03)'; ctx.lineWidth = 0.5;
    for (let x2 = 0; x2 < canvas.width; x2 += 35) { ctx.beginPath(); ctx.moveTo(x2,0); ctx.lineTo(x2,canvas.height); ctx.stroke(); }
    for (let y2 = 0; y2 < canvas.height; y2 += 35) { ctx.beginPath(); ctx.moveTo(0,y2); ctx.lineTo(canvas.width,y2); ctx.stroke(); }
    ctx.restore();

    /* Question panel */
    if (currentQ) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.strokeStyle = 'rgba(0,195,255,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(canvas.width/2-230, 8, 460, 36, 8); ctx.fill(); ctx.stroke();
      ctx.font = 'bold 13px Outfit'; ctx.fillStyle = '#00C3FF'; ctx.textAlign = 'center';
      ctx.fillText('🔦 ' + currentQ.q, canvas.width/2, 31); ctx.restore();
    }

    /* Target bubbles */
    targets.forEach(t => {
      ctx.save();
      ctx.shadowBlur  = t.hit ? 30 : 14; ctx.shadowColor = t.col;
      ctx.fillStyle   = t.hit ? t.col + '88' : t.col + '33';
      ctx.strokeStyle = t.col; ctx.lineWidth = t.hit ? 3 : 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = 'bold 16px "Courier New"'; ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.val, t.x, t.y);
      ctx.restore();
    });

    /* Laser beam */
    const pts = getLaserEndpoint();
    ctx.save();
    const laserGr = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length-1].x, pts[pts.length-1].y);
    laserGr.addColorStop(0, '#FF0080');
    laserGr.addColorStop(1, '#FF0080aa');
    ctx.strokeStyle = '#FF0080'; ctx.lineWidth = 3; ctx.shadowBlur = 16; ctx.shadowColor = '#FF0080';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke(); ctx.restore();

    /* Emitter (rotatable disc at bottom-centre) */
    const ex = canvas.width / 2, ey = canvas.height - 50;
    ctx.save(); ctx.translate(ex, ey);
    ctx.shadowBlur = 20; ctx.shadowColor = '#FF0080';
    ctx.fillStyle  = '#300020'; ctx.strokeStyle = '#FF0080'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    /* Angle indicator line */
    ctx.strokeStyle = '#FF0080'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(laserAngle)*22, Math.sin(laserAngle)*22); ctx.stroke();
    ctx.restore();

    /* Angle dial instructions */
    ctx.font = '10px Outfit'; ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.textAlign = 'center';
    ctx.fillText('← → keys or drag to aim | Click to FIRE', canvas.width/2, canvas.height - 18);

    /* Particles */
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.col; ctx.shadowBlur = 8; ctx.shadowColor = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      p.x += p.vx; p.y += p.vy; p.life -= 0.025;
      if (p.life <= 0) particles.splice(i, 1);
      ctx.restore();
    }

    /* Lives */
    ctx.font = '16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let h = '';
    for (let i = 0; i < 3; i++) h += i < lives ? '❤️ ' : '🖤 ';
    ctx.fillText(h, 10, canvas.height - 10);
  }

  /* fire — checks which target the laser endpoint hits */
  function fire() {
    if (answered) return;
    const pts   = getLaserEndpoint();
    const endPt = pts[pts.length - 1];
    let hitAny  = false;
    targets.forEach(t => {
      const dx = endPt.x - t.x, dy = endPt.y - t.y;
      if (Math.sqrt(dx*dx + dy*dy) < t.r + 8) {
        hitAny = true; t.hit = true;
        if (t.ok) {
          answered = true;
          localScore += 25; score = localScore;
          updateHUD(localScore); burst(t.x, t.y, t.col);
          showFloatingText('🎯 Hit! +25', t.x, t.y, '#00F5A0');
          showFloatingText('💡 ' + currentQ.fact, canvas.width/2, canvas.height/2, '#00C3FF');
          updateProgress(Math.min(100, ~~((qIdx / QUESTIONS.length) * 100)));
          setTimeout(nextQ, 1200);
        } else {
          lives--;
          updateHealth(Math.max(0, (lives/3)*100));
          shakeCanvas(canvas);
          showFloatingText('✗ Wrong target!', t.x, t.y, '#FF2D9B');
          setTimeout(() => { t.hit = false; }, 600);
        }
      }
    });
    if (!hitAny) showFloatingText('Miss!', endPt.x, endPt.y, '#9B8FC0');
  }

  /* Input — left/right keys rotate laser; click fires */
  let keys = {};
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    ['ArrowLeft','ArrowRight'].includes(e.key) && e.preventDefault();
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });
  canvas.addEventListener('click', fire);
  canvas.addEventListener('touchstart', e => {
    const { x } = gpos(canvas, e.touches[0]);
    laserAngle = Math.atan2(-1, x - canvas.width/2) + (x < canvas.width/2 ? -0.3 : 0.3);
    fire();
  }, { passive: true });
  canvas.addEventListener('mousemove', e => {
    const { x, y } = gpos(canvas, e);
    laserAngle = Math.atan2(y - (canvas.height - 50), x - canvas.width/2);
  });

  function handleInput() {
    if (keys['ArrowLeft'])  laserAngle -= 0.04;
    if (keys['ArrowRight']) laserAngle += 0.04;
    if (!isOver) requestAnimationFrame(handleInput);
  }

  function loop() {
    if (isOver) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(); animId = requestAnimationFrame(loop);
  }

  function end() {
    isOver = true;
    clearInterval(timerInterval); cancelAnimationFrame(animId);
    score = localScore;
    finishMission(Math.min(100, ~~((localScore / (QUESTIONS.length * 25)) * 100)), 0);
  }

  timerInterval = setInterval(() => { gameTime--; updateTimer(gameTime); if (gameTime <= 0 || lives <= 0) end(); }, 1000);
  updateTimer(gameTime); nextQ(); handleInput(); loop();
}


/* ─────────────────────────────────────────────
   MATHS CANNON — Grade 9
   QUADRATIC CANNON
   A cannon on a hill fires a cannonball in a parabolic arc.
   The equation of the parabola is shown.
   Player sets the "power" (root value) and fires.
   The cannonball arc is drawn in real-time.
───────────────────────────────────────────── */
function mathsCannon(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* Quadratic equation questions */
  const QUESTIONS = [
    { q:'Solve x²−5x+6=0. Roots:',       roots:[2,3], fact:'Factor: (x-2)(x-3)=0 → x=2 and x=3' },
    { q:'Solve x²−7x+12=0. Roots:',      roots:[3,4], fact:'Factor: (x-3)(x-4)=0 → x=3 and x=4' },
    { q:'Sum of roots of x²−5x+6=0:',    roots:[5],   single:true, fact:'Sum = -b/a = 5 (Vieta\'s formula)' },
    { q:'Product of roots of x²−5x+6=0:',roots:[6],   single:true, fact:'Product = c/a = 6 (Vieta\'s formula)' },
    { q:'Solve x²−9=0. Positive root:',  roots:[3],   single:true, fact:'x²=9 → x=±3; positive root=3' },
    { q:'Solve x²−8x+15=0. Roots:',      roots:[3,5], fact:'Factor: (x-3)(x-5)=0 → x=3 and x=5' }
  ];

  let localScore = 0, lives = 3, gameTime = 90, isOver = false, animId;
  let qIdx = 0, currentQ = null, power = 1, maxPower = 8;
  let ball = null, targets = [], particles = [], answered = false;

  /* Hill and cannon position */
  const HILL_X = 80, HILL_Y = canvas.height - 80, CANNON_ANGLE = -Math.PI / 3;

  function nextQ() {
    currentQ = QUESTIONS[qIdx % QUESTIONS.length]; qIdx++;
    answered = false; ball = null;
    /* Place target(s) corresponding to the roots */
    targets = currentQ.roots.map((root, i) => ({
      x: HILL_X + root * 60,     // x position proportional to root value
      y: HILL_Y - 10,
      r: 28, val: root,
      col: ['#FFD700','#FF2D9B'][i],
      hit: false
    }));
  }

  function burst(x, y, col, n = 20) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10, r: Math.random()*4+2, life:1, col });
    }
  }

  function fireCannon() {
    if (answered || ball) return;
    const speed = 6 + power * 0.5;
    ball = {
      x: HILL_X + 20, y: HILL_Y - 20,
      vx: Math.cos(CANNON_ANGLE) * speed,
      vy: Math.sin(CANNON_ANGLE) * speed,
      r: 10, trail: [], col: '#FFD700'
    };
  }

  function draw() {
    /* Sky gradient */
    const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gr.addColorStop(0, '#0a0014'); gr.addColorStop(1, '#1a1040');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Ground */
    const ggr = ctx.createLinearGradient(0, HILL_Y, 0, canvas.height);
    ggr.addColorStop(0, '#1a3020'); ggr.addColorStop(1, '#0a1810');
    ctx.fillStyle = ggr; ctx.fillRect(0, HILL_Y, canvas.width, canvas.height - HILL_Y);

    /* Hill */
    ctx.save(); ctx.fillStyle = '#2a4030'; ctx.shadowBlur = 10; ctx.shadowColor = '#00F5A0';
    ctx.beginPath(); ctx.arc(HILL_X, HILL_Y, 40, Math.PI, 0); ctx.fill(); ctx.restore();

    /* Question panel */
    if (currentQ) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.strokeStyle = 'rgba(255,215,0,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(10, 8, canvas.width - 20, 44, 8); ctx.fill(); ctx.stroke();
      ctx.font = 'bold 13px Outfit'; ctx.fillStyle = '#FFD700'; ctx.textAlign = 'center';
      ctx.fillText('💥 ' + currentQ.q, canvas.width/2, 26);
      ctx.font = '10px Outfit'; ctx.fillStyle = '#9B8FC0';
      ctx.fillText('Set power with ← → keys, then press SPACE or click to fire!', canvas.width/2, 42);
      ctx.restore();
    }

    /* Targets (castles/flags at root positions) */
    targets.forEach(t => {
      ctx.save();
      ctx.shadowBlur = t.hit ? 30 : 12; ctx.shadowColor = t.col;
      ctx.fillStyle  = t.hit ? t.col + '88' : t.col + '44';
      ctx.strokeStyle = t.col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = 'bold 16px "Courier New"'; ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.val, t.x, t.y);
      /* Flag pole */
      ctx.strokeStyle = t.col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(t.x, t.y - t.r); ctx.lineTo(t.x, t.y - t.r - 20); ctx.stroke();
      ctx.fillStyle = t.col; ctx.beginPath(); ctx.moveTo(t.x, t.y - t.r - 20); ctx.lineTo(t.x + 12, t.y - t.r - 14); ctx.lineTo(t.x, t.y - t.r - 8); ctx.fill();
      ctx.restore();
    });

    /* Cannon */
    ctx.save();
    ctx.translate(HILL_X, HILL_Y - 10); ctx.rotate(CANNON_ANGLE);
    ctx.fillStyle = '#00F5A0'; ctx.shadowBlur = 10; ctx.shadowColor = '#00F5A0';
    ctx.beginPath(); ctx.roundRect(-5, -6, 42, 12, 4); ctx.fill();
    ctx.restore();

    /* Power meter */
    ctx.save();
    ctx.fillStyle   = 'rgba(0,0,0,0.5)'; ctx.strokeStyle = 'rgba(255,215,0,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(10, canvas.height - 50, 200, 20, 4); ctx.fill(); ctx.stroke();
    const pmGr = ctx.createLinearGradient(10, 0, 210, 0);
    pmGr.addColorStop(0, '#00F5A0'); pmGr.addColorStop(1, '#FF2D9B');
    ctx.fillStyle = pmGr;
    ctx.beginPath(); ctx.roundRect(10, canvas.height - 50, (power / maxPower) * 200, 20, 4); ctx.fill();
    ctx.font = '10px Outfit'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('POWER: ' + power, 110, canvas.height - 35);
    ctx.restore();

    /* Ball trail */
    if (ball) {
      ball.trail.forEach((p, i) => {
        ctx.save(); ctx.globalAlpha = (i / ball.trail.length) * 0.5;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill(); ctx.restore();
      });
      ctx.save(); ctx.fillStyle = '#FFD700'; ctx.shadowBlur = 14; ctx.shadowColor = '#FFD700';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Particles */
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      p.x += p.vx; p.y += p.vy; p.life -= 0.025;
      if (p.life <= 0) particles.splice(i, 1);
      ctx.restore();
    }

    /* Lives */
    ctx.font = '16px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let h = '';
    for (let i = 0; i < 3; i++) h += i < lives ? '❤️ ' : '🖤 ';
    ctx.fillText(h, 10, canvas.height - 10);
  }

  function update() {
    if (!ball) return;
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 20) ball.trail.shift();

    ball.vx *= 0.995; // air resistance
    ball.vy += 0.18;  // gravity
    ball.x  += ball.vx;
    ball.y  += ball.vy;

    /* Check target hits */
    targets.forEach(t => {
      if (t.hit) return;
      const dx = ball.x - t.x, dy = ball.y - t.y;
      if (Math.sqrt(dx*dx + dy*dy) < ball.r + t.r) {
        t.hit = true;
        burst(t.x, t.y, t.col);
        showFloatingText('💥 Hit root ' + t.val + '! +20', t.x, t.y - 30, t.col);
        localScore += 20; score = localScore; updateHUD(localScore);
        ball = null;
        /* Check if all roots hit */
        if (targets.every(tt => tt.hit)) {
          answered = true;
          showFloatingText('💡 ' + currentQ.fact, canvas.width/2, canvas.height/2, '#00C3FF');
          updateProgress(Math.min(100, ~~((qIdx / QUESTIONS.length) * 100)));
          setTimeout(nextQ, 1800);
        }
      }
    });

    /* Ball hits ground */
    if (ball && ball.y > HILL_Y + 10) {
      showFloatingText('Miss!', ball.x, ball.y, '#FF2D9B');
      ball = null;
    }
    /* Ball leaves screen */
    if (ball && (ball.x > canvas.width + 20 || ball.x < -20)) { ball = null; }
  }

  let keys = {};
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.code === 'Space') { fireCannon(); e.preventDefault(); }
    if (e.key === 'ArrowLeft')  { power = Math.max(1, power - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { power = Math.min(maxPower, power + 1); e.preventDefault(); }
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });
  canvas.addEventListener('click', e => {
    const { x } = gpos(canvas, e);
    power = Math.round(Math.max(1, Math.min(maxPower, (x / canvas.width) * maxPower)));
    fireCannon();
  });
  canvas.addEventListener('touchstart', e => {
    const { x } = gpos(canvas, e.touches[0]);
    power = Math.round(Math.max(1, Math.min(maxPower, (x / canvas.width) * maxPower)));
    fireCannon();
  }, { passive: true });

  function loop() {
    if (isOver) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(); update();
    animId = requestAnimationFrame(loop);
  }

  function end() {
    isOver = true;
    clearInterval(timerInterval); cancelAnimationFrame(animId);
    score = localScore;
    finishMission(Math.min(100, ~~((localScore / (QUESTIONS.length * 20)) * 100)), 0);
  }

  timerInterval = setInterval(() => { gameTime--; updateTimer(gameTime); if (gameTime <= 0 || lives <= 0) end(); }, 1000);
  updateTimer(gameTime); nextQ(); loop();
}


/* ─────────────────────────────────────────────
   MATHS BUBBLE MCQ — Grade 10 (MCQ via shared engine)
───────────────────────────────────────────── */


/* ═══════════════════════════════════════════════════════
   SECTION — PHYSICS: PARTICLE COLLIDER  (Grade 10-12)
   
   A circular accelerator track. Particles orbit the ring.
   A question label appears on each particle.
   Player clicks/taps the CORRECT particle to fire a beam and
   destroy it before it laps the ring again.
   Wrong particle → shield flicker + life lost.
   Difficulty scales: more particles, faster orbit per grade.
═══════════════════════════════════════════════════════ */
function physicsMCQ(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const BANKS = {
    10:[
      { q:"Snell's Law governs?",      correct:'Refraction',    wrong:['Reflection','Diffraction'],     fact:'n₁sinθ₁=n₂sinθ₂' },
      { q:'1 kWh in Joules?',          correct:'3.6×10⁶ J',    wrong:['3600 J','1000 J'],              fact:'1kWh=1000W×3600s=3.6MJ' },
      { q:'Magnetic force F=?',        correct:'qvBsinθ',       wrong:['qE','BIl'],                     fact:'Lorentz force: F=qvBsinθ' },
      { q:'Peak V from 220V rms?',     correct:'311 V',         wrong:['220 V','156 V'],                fact:'V_peak=V_rms×√2≈311V' },
      { q:'Photoelectric proves light=?', correct:'Particle',   wrong:['Pure wave','Magnetic field'],   fact:'Einstein: E=hf, light quanta' },
      { q:'Mirror f=20cm u=60cm v=?',  correct:'30 cm real',   wrong:['60 cm virtual','∞'],            fact:'1/v+1/u=1/f → v=30cm' },
    ],
    11:[
      { q:'First Law ΔU=?',            correct:'Q−W',           wrong:['Q+W','W−Q'],                   fact:'Energy conservation: ΔU=Q−W' },
      { q:'SHM acceleration a=?',      correct:'−ω²x',          wrong:['ω²x','kx/m'],                  fact:'Restoring: a=−ω²x' },
      { q:'Torque τ=?',                correct:'r×F',           wrong:['Fd/r','mr²α'],                 fact:'τ = r cross F' },
      { q:"Young's modulus = stress÷?",correct:'Strain',        wrong:['Force','Area'],                 fact:'E=σ/ε' },
      { q:'Bernoulli faster fluid→?',   correct:'Lower P',      wrong:['Higher P','Same P'],            fact:'P+½ρv²=const' },
      { q:'Adiabatic Q=?',             correct:'Zero',          wrong:['Max','Constant'],               fact:'Adiabatic: no heat exchange' },
    ],
    12:[
      { q:'De Broglie λ=?',            correct:'h/mv',          wrong:['h/mc²','hf'],                  fact:'λ=h/p wave-particle duality' },
      { q:"Einstein's E=?",            correct:'mc²',           wrong:['mv²','mgh'],                   fact:'Mass-energy equivalence' },
      { q:'Boron doped semiconductor?', correct:'p-type',       wrong:['n-type','intrinsic'],           fact:'Boron creates holes → p-type' },
      { q:'Highest binding E/nucleon?', correct:'Iron-56',      wrong:['Uranium-238','Hydrogen-1'],     fact:'Fe-56 peak ~8.8 MeV/nucleon' },
      { q:'NAND = NOT of?',            correct:'AND',           wrong:['OR','XOR'],                     fact:'NAND: 1,1→0; else→1' },
      { q:'Half-life ²³⁸U≈?',          correct:'4.5 Gyr',      wrong:['5730 yr','1620 yr'],            fact:'²³⁸U: 4.5×10⁹ yr' },
    ]
  };
  const bank = (BANKS[g] || BANKS[10]).slice();

  /* Ring geometry */
  const CX = canvas.width / 2, CY = canvas.height / 2 + 20;
  const RING_R = Math.min(canvas.width, canvas.height) * 0.36;

  let localScore = 0, lives = 3, gameTime = 80 + (g-10)*8;
  let isOver = false, animId;
  let particles = [], beams = [], sparks = [];
  let qIdx = 0, currentQ = null, shieldFlicker = 0;

  /* Particle on the ring: angle drives position */
  function spawnRound() {
    if (isOver) return;
    const raw  = bank[qIdx % bank.length]; qIdx++;
    currentQ   = raw;
    const all  = [raw.correct, ...raw.wrong].sort(() => Math.random()-0.5);
    const startAngle = Math.random() * Math.PI * 2;
    const speed      = (0.012 + (g-10)*0.004) * (Math.random()>0.5?1:-1);
    const cols       = ['#00C3FF','#FF2D9B','#FFD700'];
    particles = all.map((label, i) => ({
      angle: startAngle + i*(Math.PI*2/all.length),
      speed,
      label,
      ok: label === raw.correct,
      col: cols[i % cols.length],
      r: 28,
      pulse: Math.random()*Math.PI*2
    }));
  }

  function spawnSparks(x, y, col, n=20) {
    for (let i=0;i<n;i++) sparks.push({x,y,vx:(Math.random()-.5)*10,vy:(Math.random()-.5)*10,life:1,col,r:Math.random()*4+2});
  }

  function fireBeam(px, py, col) {
    beams.push({ x:CX, y:CY, tx:px, ty:py, life:1, col });
  }

  function draw() {
    /* Deep space background */
    const bg = ctx.createRadialGradient(CX,CY,20,CX,CY,canvas.width);
    bg.addColorStop(0,'#060820'); bg.addColorStop(1,'#020408');
    ctx.fillStyle = bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Outer ring track */
    ctx.save();
    ctx.strokeStyle = 'rgba(0,195,255,0.15)'; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.arc(CX,CY,RING_R,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,195,255,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(CX,CY,RING_R,0,Math.PI*2); ctx.stroke();
    ctx.restore();

    /* Centre collider core */
    const cg = ctx.createRadialGradient(CX,CY,4,CX,CY,28);
    cg.addColorStop(0,'#00C3FF'); cg.addColorStop(1,'transparent');
    ctx.save();
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(CX,CY,28,0,Math.PI*2); ctx.fill();
    if (shieldFlicker > 0) {
      ctx.globalAlpha = shieldFlicker*0.6;
      ctx.fillStyle = '#FF2D9B';
      ctx.beginPath(); ctx.arc(CX,CY,34,0,Math.PI*2); ctx.fill();
      shieldFlicker -= 0.05;
    }
    ctx.restore();

    /* Question label */
    if (currentQ) {
      ctx.save();
      ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.strokeStyle='rgba(0,195,255,0.35)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.roundRect(CX-220,14,440,40,10); ctx.fill(); ctx.stroke();
      ctx.font='bold 14px Outfit'; ctx.fillStyle='#FFD700'; ctx.textAlign='center';
      ctx.shadowBlur=8; ctx.shadowColor='#FFD700';
      ctx.fillText('COLLIDE → '+currentQ.q, CX, 39); ctx.shadowBlur=0;
      ctx.restore();
    }

    /* Particles orbiting the ring */
    particles.forEach(p => {
      p.angle += p.speed;
      p.pulse += 0.05;
      const px = CX + Math.cos(p.angle)*RING_R;
      const py = CY + Math.sin(p.angle)*RING_R;
      const glow = 0.7 + 0.3*Math.sin(p.pulse);

      ctx.save();
      /* Orbit trail */
      ctx.globalAlpha = 0.3*glow;
      ctx.fillStyle = p.col;
      for (let t=1;t<=6;t++) {
        const ta = p.angle - p.speed*t*3;
        ctx.beginPath();
        ctx.arc(CX+Math.cos(ta)*RING_R, CY+Math.sin(ta)*RING_R, (7-t)*1.2, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha=1;

      /* Particle bubble */
      ctx.shadowBlur=20*glow; ctx.shadowColor=p.col;
      ctx.fillStyle=p.col+'44'; ctx.strokeStyle=p.col; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(px,py,p.r,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.font='bold 9px Outfit'; ctx.fillStyle='#fff';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(p.label.slice(0,10), px, py);
      ctx.restore();
    });

    /* Beams (collision rays from centre) */
    for (let i=beams.length-1;i>=0;i--) {
      const b=beams[i];
      ctx.save(); ctx.globalAlpha=b.life;
      ctx.strokeStyle=b.col; ctx.lineWidth=4*b.life; ctx.shadowBlur=20; ctx.shadowColor=b.col;
      ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(b.tx,b.ty); ctx.stroke();
      ctx.restore(); b.life-=0.08;
      if(b.life<=0) beams.splice(i,1);
    }

    /* Sparks */
    for (let i=sparks.length-1;i>=0;i--) {
      const s=sparks[i];
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.shadowBlur=8; ctx.shadowColor=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
      s.x+=s.vx; s.y+=s.vy; s.life-=0.03; s.r*=0.97;
      if(s.life<=0) sparks.splice(i,1);
      ctx.restore();
    }

    /* Fact flash */

    /* HUD */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h, 10, canvas.height-10);
    ctx.font='bold 11px Outfit'; ctx.fillStyle='rgba(0,195,255,0.6)';
    ctx.textAlign='right'; ctx.fillText('Grade '+g+' Physics', canvas.width-10, canvas.height-10);
  }

  function handleTap(e) {
    if (!currentQ || isOver) return;
    const {x,y} = gpos(canvas,e);
    let hit = false;
    particles.forEach((p,i) => {
      const px = CX + Math.cos(p.angle)*RING_R;
      const py = CY + Math.sin(p.angle)*RING_R;
      const dx = x-px, dy = y-py;
      if (Math.sqrt(dx*dx+dy*dy) < p.r+14) {
        hit = true;
        if (p.ok) {
          localScore+=30; score=localScore; updateHUD(localScore);
          fireBeam(px,py,p.col);
          spawnSparks(px,py,p.col,28);
          showFloatingText('⚛️ Collide! +30', px, py-40, p.col);
          showFloatingText('💡 '+currentQ.fact, CX, CY+RING_R+28, '#00C3FF');
          updateProgress(Math.min(100,~~((qIdx/bank.length)*100)));
          particles=[];
          setTimeout(spawnRound, 900);
        } else {
          lives--; shieldFlicker=1;
          updateHealth(Math.max(0,(lives/3)*100));
          shakeCanvas(canvas);
          spawnSparks(px,py,'#FF2D9B',16);
          showFloatingText('✗ Wrong particle!', px, py-30, '#FF2D9B');
          particles.splice(i,1);
        }
      }
    });
  }

  canvas.addEventListener('click', handleTap);
  canvas.addEventListener('touchstart', e=>{e.preventDefault(); handleTap(e.touches[0]);},{passive:false});

  function loop() {
    if(isOver) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    draw(); animId=requestAnimationFrame(loop);
  }
  function end() {
    isOver=true; clearInterval(timerInterval); cancelAnimationFrame(animId);
    score=localScore; finishMission(Math.min(100,~~((localScore/(bank.length*30))*100)),0);
  }
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); spawnRound(); loop();
}


/* ═══════════════════════════════════════════════════════
   CHEMISTRY: MOLECULE FORGE  (Grade 10-12)

   A dark factory-floor. Functional group "crates" slide along
   a conveyor belt at the bottom. A target molecule skeleton is
   shown in the centre. Player drags the correct groups from
   the belt and snaps them to the highlighted attachment points.
   Wrong group → steam burst + life lost. Complete molecule → big XP.
═══════════════════════════════════════════════════════ */
function chemMCQ(g) { moleculeForge(g); }
function chemAdvanced(g) { moleculeForge(g); }

function moleculeForge(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* Each puzzle: a target molecule name, skeleton layout (attachment points),
     and a pool of functional group tiles the player must sort */
  const PUZZLES = {
    10:[
      { name:'Ethanol (C₂H₅OH)', slots:[
          {label:'C₂H₅−',x:0.38,y:0.42,needs:'Ethyl'},
          {label:'−OH',  x:0.62,y:0.42,needs:'Hydroxyl'}
        ], pool:['Ethyl','Hydroxyl','Methyl','Carboxyl','Amino'], fact:'Alcohol = alkyl + −OH group' },
      { name:'Acetic Acid (CH₃COOH)', slots:[
          {label:'CH₃−',x:0.35,y:0.42,needs:'Methyl'},
          {label:'−COOH',x:0.62,y:0.42,needs:'Carboxyl'}
        ], pool:['Methyl','Carboxyl','Hydroxyl','Ethyl','Amino'], fact:'Carboxylic acid: alkyl + −COOH' },
      { name:'Methylamine (CH₃NH₂)', slots:[
          {label:'CH₃−',x:0.35,y:0.42,needs:'Methyl'},
          {label:'−NH₂',x:0.62,y:0.42,needs:'Amino'}
        ], pool:['Methyl','Amino','Hydroxyl','Carboxyl','Ethyl'], fact:'Amine: alkyl + −NH₂ group' },
    ],
    11:[
      { name:'Ethyl Ethanoate (Ester)', slots:[
          {label:'CH₃−',x:0.3, y:0.4, needs:'Methyl'},
          {label:'−COO−',x:0.52,y:0.4, needs:'EsterLink'},
          {label:'−C₂H₅',x:0.72,y:0.4,needs:'Ethyl'}
        ], pool:['Methyl','EsterLink','Ethyl','Amino','Carboxyl','Hydroxyl'], fact:'Ester = acid + alcohol − water' },
      { name:'Glycine (Amino Acid)', slots:[
          {label:'H₂N−',x:0.28,y:0.4,needs:'Amino'},
          {label:'−CH₂−',x:0.5,y:0.4,needs:'Methylene'},
          {label:'−COOH',x:0.72,y:0.4,needs:'Carboxyl'}
        ], pool:['Amino','Methylene','Carboxyl','Ethyl','Hydroxyl','Methyl'], fact:'Glycine: simplest amino acid' },
    ],
    12:[
      { name:'Chloroethane (Haloalkane)', slots:[
          {label:'CH₃CH₂−',x:0.35,y:0.42,needs:'Ethyl'},
          {label:'−Cl',    x:0.62,y:0.42,needs:'Chloro'}
        ], pool:['Ethyl','Chloro','Bromo','Amino','Hydroxyl','Methyl'], fact:'Haloalkane: alkyl + halogen' },
      { name:'Benzaldehyde', slots:[
          {label:'C₆H₅−',x:0.35,y:0.42,needs:'Phenyl'},
          {label:'−CHO',  x:0.62,y:0.42,needs:'Aldehyde'}
        ], pool:['Phenyl','Aldehyde','Ketone','Hydroxyl','Carboxyl','Methyl'], fact:'Benzaldehyde: phenyl + aldehyde group' },
    ]
  };
  const puzzleSet = PUZZLES[g] || PUZZLES[10];

  const TILE_W=80, TILE_H=36;
  let pIdx=0, currentP=null, tiles=[], slots=[], drag=null, dox=0, doy=0;
  let localScore=0, lives=3, gameTime=100+(g-10)*10, isOver=false, animId;
  let smoke=[], sparks=[], beltX=0;

  const GROUP_COLS={
    'Ethyl':'#00C3FF','Methyl':'#FFD700','Hydroxyl':'#00F5A0','Carboxyl':'#FF2D9B',
    'Amino':'#7CFC00','EsterLink':'#FF8C00','Methylene':'#9B8FC0','Chloro':'#50E0FF',
    'Bromo':'#FF6450','Phenyl':'#E050FF','Aldehyde':'#FFA040','Ketone':'#40A0FF'
  };

  function loadPuzzle() {
    if (pIdx>=puzzleSet.length){end();return;}
    currentP = puzzleSet[pIdx]; pIdx++;
    /* Create slot objects from puzzle definition */
    slots = currentP.slots.map(s=>({
      ...s,
      px: s.x*canvas.width, py: s.y*canvas.height,
      w:80, h:36, filled:null
    }));
    /* Shuffle pool and lay out tiles on conveyor */
    const pool = currentP.pool.slice().sort(()=>Math.random()-0.5);
    tiles = pool.map((name,i)=>({
      name, col:GROUP_COLS[name]||'#9B8FC0',
      x: 40+i*(TILE_W+12), y: canvas.height-55,
      ox:40+i*(TILE_W+12), oy:canvas.height-55,
      w:TILE_W, h:TILE_H, placed:false
    }));
    smoke=[]; sparks=[];
  }

  function spawnSmoke(x,y){
    for(let i=0;i<14;i++) smoke.push({x,y,vx:(Math.random()-.5)*3,vy:-(Math.random()*2+1),r:10+Math.random()*10,life:1});
  }
  function spawnSparks(x,y,col){
    for(let i=0;i<18;i++) sparks.push({x,y,vx:(Math.random()-.5)*9,vy:(Math.random()-.5)*9,r:3+Math.random()*3,life:1,col});
  }

  function tryDrop(tile) {
    let dropped=false;
    slots.forEach(s=>{
      if(s.filled) return;
      const dx=tile.x+tile.w/2-s.px, dy=tile.y+tile.h/2-s.py;
      if(Math.abs(dx)<52 && Math.abs(dy)<30) {
        if(tile.name===s.needs) {
          s.filled=tile.name; tile.placed=true;
          spawnSparks(s.px,s.py,tile.col);
          showFloatingText('✓ '+tile.name, s.px, s.py-30, tile.col);
          /* Check all slots filled */
          if(slots.every(sl=>sl.filled)) {
            localScore+=40; score=localScore; updateHUD(localScore);
            updateProgress(~~((pIdx/puzzleSet.length)*100));
            showFloatingText('🧪 Molecule Built! +40', canvas.width/2, canvas.height/2-30, '#00F5A0');
            showFloatingText('💡 '+currentP.fact, canvas.width/2, canvas.height/2+10, '#00C3FF');
            setTimeout(loadPuzzle,1800);
          }
        } else {
          /* Wrong group on this slot */
          lives--; updateHealth(Math.max(0,(lives/3)*100));
          spawnSmoke(s.px,s.py);
          shakeCanvas(canvas);
          showFloatingText('❌ Wrong group!', s.px, s.py-30, '#FF2D9B');
        }
        dropped=true;
      }
    });
    if(!dropped){ tile.x=tile.ox; tile.y=tile.oy; }
  }

  function draw(){
    /* Factory-dark background */
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#0a0808'); bg.addColorStop(1,'#150c04');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Conveyor belt */
    beltX=(beltX+0.5)%40;
    ctx.save();
    ctx.fillStyle='rgba(80,60,40,0.8)';
    ctx.fillRect(0,canvas.height-70,canvas.width,70);
    ctx.strokeStyle='rgba(160,120,60,0.5)'; ctx.lineWidth=1.5;
    for(let x=-40+beltX;x<canvas.width;x+=40){
      ctx.beginPath(); ctx.moveTo(x,canvas.height-70); ctx.lineTo(x,canvas.height); ctx.stroke();
    }
    ctx.strokeStyle='rgba(200,160,80,0.4)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(0,canvas.height-70); ctx.lineTo(canvas.width,canvas.height-70); ctx.stroke();
    ctx.restore();

    /* Target molecule display area */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.strokeStyle='rgba(255,215,0,0.3)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(20,55,canvas.width-40,canvas.height-145,12); ctx.fill(); ctx.stroke();
    /* Molecule name */
    ctx.font='bold 13px Outfit'; ctx.fillStyle='#FFD700'; ctx.textAlign='center';
    ctx.shadowBlur=8; ctx.shadowColor='#FFD700';
    ctx.fillText('🧪 Build: '+currentP.name, canvas.width/2, 80); ctx.shadowBlur=0;
    /* Bond line connecting slots */
    if(slots.length>1){
      ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=3;
      ctx.beginPath();
      ctx.moveTo(slots[0].px+slots[0].w/2, slots[0].py);
      slots.slice(1).forEach(s=>ctx.lineTo(s.px+s.w/2,s.py));
      ctx.stroke();
    }
    ctx.restore();

    /* Slot receptacles */
    slots.forEach(s=>{
      const col=s.filled?(GROUP_COLS[s.filled]||'#9B8FC0'):'rgba(255,255,255,0.12)';
      ctx.save();
      ctx.fillStyle  =s.filled?col+'33':'rgba(255,255,255,0.06)';
      ctx.strokeStyle=s.filled?col:'rgba(255,255,255,0.25)';
      ctx.lineWidth  =s.filled?2.5:1.5;
      ctx.shadowBlur =s.filled?20:0; ctx.shadowColor=col;
      ctx.beginPath(); ctx.roundRect(s.px-40,s.py-18,80,36,8); ctx.fill(); ctx.stroke();
      ctx.font='bold 10px Outfit'; ctx.fillStyle=s.filled?col:'rgba(255,255,255,0.4)';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.shadowBlur=0;
      ctx.fillText(s.filled||s.label, s.px, s.py);
      ctx.restore();
    });

    /* Conveyor tiles */
    tiles.forEach(t=>{
      if(t.placed||t===drag) return;
      ctx.save();
      ctx.fillStyle=t.col+'33'; ctx.strokeStyle=t.col; ctx.lineWidth=1.8;
      ctx.shadowBlur=8; ctx.shadowColor=t.col;
      ctx.beginPath(); ctx.roundRect(t.x,t.y,t.w,t.h,8); ctx.fill(); ctx.stroke();
      ctx.font='bold 11px Outfit'; ctx.fillStyle='#fff';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.shadowBlur=0;
      ctx.fillText(t.name, t.x+t.w/2, t.y+t.h/2);
      ctx.restore();
    });

    /* Dragged tile on top */
    if(drag){
      ctx.save();
      ctx.fillStyle=drag.col+'55'; ctx.strokeStyle=drag.col; ctx.lineWidth=2.5;
      ctx.shadowBlur=22; ctx.shadowColor=drag.col;
      ctx.beginPath(); ctx.roundRect(drag.x,drag.y,drag.w,drag.h,8); ctx.fill(); ctx.stroke();
      ctx.font='bold 11px Outfit'; ctx.fillStyle='#fff';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.shadowBlur=0;
      ctx.fillText(drag.name, drag.x+drag.w/2, drag.y+drag.h/2);
      ctx.restore();
    }

    /* Smoke particles */
    for(let i=smoke.length-1;i>=0;i--){
      const s=smoke[i]; s.x+=s.vx; s.y+=s.vy; s.r*=1.03; s.life-=0.02;
      if(s.life<=0){smoke.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life*0.35; ctx.fillStyle='rgba(200,100,80,1)';
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.shadowBlur=8; ctx.shadowColor=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Title bar */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.beginPath();
    ctx.roundRect(0,0,canvas.width,50,0); ctx.fill();
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#FF8C00'; ctx.textAlign='center';
    ctx.fillText('⚗️ MOLECULE FORGE — Grade '+g+' Chemistry', canvas.width/2, 32);
    ctx.restore();

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h, 10, canvas.height-10);
  }

  function onDown(e){
    const {x,y}=gpos(canvas,e);
    for(const t of tiles){
      if(!t.placed && x>=t.x && x<=t.x+t.w && y>=t.y && y<=t.y+t.h){
        drag=t; dox=x-t.x; doy=y-t.y; return;
      }
    }
  }
  function onMove(e){
    if(!drag) return;
    const {x,y}=gpos(canvas,e);
    drag.x=x-dox; drag.y=y-doy;
  }
  function onUp(e){
    if(!drag) return;
    tryDrop(drag);
    drag=null;
  }
  canvas.addEventListener('mousedown',onDown);
  canvas.addEventListener('mousemove',onMove);
  canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:true});
  canvas.addEventListener('touchmove',e=>{onMove(e.touches[0]);e.preventDefault();},{passive:false});
  canvas.addEventListener('touchend',e=>{onUp(e.changedTouches[0]);});

  function loop(){
    if(isOver) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    draw(); animId=requestAnimationFrame(loop);
  }
  function end(){
    isOver=true; clearInterval(timerInterval); cancelAnimationFrame(animId);
    score=localScore; finishMission(Math.min(100,~~((localScore/(puzzleSet.length*40))*100)),0);
  }
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); loadPuzzle(); loop();
}


/* ═══════════════════════════════════════════════════════
   BIOLOGY: ECOSYSTEM ARCHITECT  (Grade 10-12)

   A top-down god-view ecosystem. Organism cards drop from above.
   Player must place them in the correct trophic layer:
   Producers → Primary consumers → Secondary → Apex predators.
   Food-chain arrows animate. Wrong placement = imbalance alarm.
   Difficulty: more organism types + time pressure per grade.
═══════════════════════════════════════════════════════ */
function bioMCQ(g) { ecosystemArchitect(g); }

function ecosystemArchitect(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  /* Trophic layers (bottom = producers, top = apex) */
  const LAYERS = [
    { name:'Producers (Autotrophs)',    y:0.78, col:'#00C84A', hint:'Plants, algae, phytoplankton' },
    { name:'Primary Consumers',         y:0.58, col:'#FFD700', hint:'Herbivores' },
    { name:'Secondary Consumers',       y:0.38, col:'#FF8C00', hint:'Omnivores / small carnivores' },
    { name:'Apex Predators',            y:0.18, col:'#FF2D9B', hint:'Top carnivores' },
  ];

  const ORGANISM_BANKS = {
    10:[
      {name:'Grass',      emoji:'🌿',layer:0,fact:'Producer: photosynthesises sunlight'},
      {name:'Phytoplankton',emoji:'🦠',layer:0,fact:'Marine producer: base of ocean food web'},
      {name:'Rabbit',     emoji:'🐇',layer:1,fact:'Primary consumer: herbivore eats grass'},
      {name:'Deer',       emoji:'🦌',layer:1,fact:'Primary consumer: grazes on plants'},
      {name:'Fox',        emoji:'🦊',layer:2,fact:'Secondary consumer: eats rabbits and rodents'},
      {name:'Snake',      emoji:'🐍',layer:2,fact:'Secondary consumer: eats rodents & frogs'},
      {name:'Eagle',      emoji:'🦅',layer:3,fact:'Apex predator: top of terrestrial food chain'},
      {name:'Shark',      emoji:'🦈',layer:3,fact:'Apex predator: top of marine food chain'},
    ],
    11:[
      {name:'Algae',      emoji:'🌱',layer:0,fact:'Aquatic producer, oxygenates water'},
      {name:'Oak Tree',   emoji:'🌳',layer:0,fact:'Producer: stores carbon in wood'},
      {name:'Caterpillar',emoji:'🐛',layer:1,fact:'Primary consumer: eats leaves'},
      {name:'Zooplankton',emoji:'🔬',layer:1,fact:'Primary consumer: eats phytoplankton'},
      {name:'Frog',       emoji:'🐸',layer:2,fact:'Secondary consumer: eats insects'},
      {name:'Tuna',       emoji:'🐟',layer:2,fact:'Secondary consumer: eats smaller fish'},
      {name:'Owl',        emoji:'🦉',layer:3,fact:'Apex predator: nocturnal hunter'},
      {name:'Killer Whale',emoji:'🐋',layer:3,fact:'Apex marine predator: eats seals, fish'},
    ],
    12:[
      {name:'Seagrass',   emoji:'🌿',layer:0,fact:'Marine producer: supports dugongs'},
      {name:'Cyanobacteria',emoji:'🦠',layer:0,fact:'Prokaryotic producer, nitrogen-fixer'},
      {name:'Sea Urchin', emoji:'🌊',layer:1,fact:'Primary consumer: grazes on seagrass'},
      {name:'Krill',      emoji:'🦐',layer:1,fact:'Primary consumer: eaten by whales, penguins'},
      {name:'Seal',       emoji:'🦭',layer:2,fact:'Secondary consumer: eats fish, squid'},
      {name:'Leopard',    emoji:'🐆',layer:2,fact:'Secondary consumer: eats herbivores'},
      {name:'Polar Bear', emoji:'🐻‍❄️',layer:3,fact:'Apex predator: hunts seals on ice'},
      {name:'Lion',       emoji:'🦁',layer:3,fact:'Apex predator: pride-hunting savannah king'},
    ]
  };

  const organisms = (ORGANISM_BANKS[g]||ORGANISM_BANKS[10]).slice().sort(()=>Math.random()-0.5);

  const CARD_W=72, CARD_H=64;
  let cards=[], placedCount=0;
  let localScore=0, lives=3, gameTime=100+(g-10)*10, isOver=false, animId;
  let drag=null, dox=0, doy=0, sparks=[], arrows=[];

  /* Spawn all organism cards falling from above at staggered positions */
  function initCards(){
    cards = organisms.map((org,i)=>({
      ...org,
      x: 30+((i%4))*(CARD_W+14),
      y: -CARD_H*2 - i*20,
      tx: 30+((i%4))*(CARD_W+14),
      ty: 60 + ~~(i/4)*(CARD_H+10),
      vy: 0.04,
      placed:false, correct:false,
      scale:1
    }));
  }

  function spawnSparks(x,y,col){
    for(let i=0;i<16;i++) sparks.push({x,y,vx:(Math.random()-.5)*8,vy:(Math.random()-.5)*8,life:1,col,r:3});
  }

  function getLayerY(layerIdx){
    return LAYERS[layerIdx].y * canvas.height;
  }

  function getLayerAtY(py){
    /* Which layer zone does py fall in? */
    for(let i=0;i<LAYERS.length;i++){
      const ly = LAYERS[i].y * canvas.height;
      if(py >= ly-36 && py <= ly+36) return i;
    }
    return -1;
  }

  function tryPlace(card){
    const cx = card.x + CARD_W/2, cy = card.y + CARD_H/2;
    const layerIdx = getLayerAtY(cy);
    if(layerIdx<0){ card.x=card.tx; card.y=card.ty; return; }

    card.placed = true;
    if(layerIdx===card.layer){
      card.correct = true; card.y = getLayerY(layerIdx)-CARD_H/2;
      localScore+=25; score=localScore; updateHUD(localScore);
      spawnSparks(cx, cy, LAYERS[layerIdx].col);
      showFloatingText('✅ +25', cx, cy-30, LAYERS[layerIdx].col);
      showFloatingText('💡 '+card.fact, canvas.width/2, canvas.height/2, '#00C3FF');
      updateProgress(Math.min(100,~~(((++placedCount)/organisms.length)*100)));
      if(placedCount>=organisms.length) setTimeout(end,1200);
    } else {
      card.placed=false; card.x=card.tx; card.y=card.ty;
      lives--; updateHealth(Math.max(0,(lives/3)*100));
      shakeCanvas(canvas);
      showFloatingText('❌ Wrong layer!', cx, cy-30, '#FF2D9B');
      showFloatingText('Hint: '+LAYERS[card.layer].hint, cx, cy, '#FFD700');
    }
  }

  function draw(){
    /* Sky-to-ground gradient */
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#001020'); bg.addColorStop(0.4,'#002818'); bg.addColorStop(1,'#003008');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Trophic layer bands */
    LAYERS.forEach((layer,i)=>{
      const ly=layer.y*canvas.height;
      ctx.save();
      ctx.fillStyle=layer.col+'18';
      ctx.fillRect(0,ly-32,canvas.width,64);
      ctx.strokeStyle=layer.col+'55'; ctx.lineWidth=1.5; ctx.setLineDash([8,6]);
      ctx.beginPath(); ctx.moveTo(0,ly); ctx.lineTo(canvas.width,ly); ctx.stroke();
      ctx.setLineDash([]);
      /* Layer label */
      ctx.font='bold 10px Outfit'; ctx.fillStyle=layer.col+'CC';
      ctx.textAlign='right'; ctx.textBaseline='middle';
      ctx.fillText(layer.name, canvas.width-10, ly);
      ctx.restore();
    });

    /* Food chain arrows between placed organisms */
    /* (animated, drawn between consecutive layer y positions) */
    for(let i=0;i<LAYERS.length-1;i++){
      const ly1=LAYERS[i].y*canvas.height, ly2=LAYERS[i+1].y*canvas.height;
      ctx.save(); ctx.globalAlpha=0.25;
      ctx.strokeStyle=LAYERS[i+1].col; ctx.lineWidth=1.5; ctx.setLineDash([4,5]);
      ctx.beginPath(); ctx.moveTo(canvas.width/2,ly1); ctx.lineTo(canvas.width/2,ly2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }

    /* Title bar */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.75)';
    ctx.fillRect(0,0,canvas.width,48);
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#7CFC00'; ctx.textAlign='center';
    ctx.shadowBlur=6; ctx.shadowColor='#7CFC00';
    ctx.fillText('🌍 ECOSYSTEM ARCHITECT — Drag organisms to correct trophic level', canvas.width/2, 30);
    ctx.shadowBlur=0; ctx.restore();

    /* Cards */
    cards.forEach(card=>{
      /* Animate fall-in */
      if(!card.placed && card.y<card.ty-2) card.y+=(card.ty-card.y)*0.06+1;

      if(card===drag) return;
      const col = card.correct ? LAYERS[card.layer].col : (card.placed?'#FF2D9B':'rgba(255,255,255,0.15)');
      ctx.save();
      ctx.fillStyle  =col+'33'; ctx.strokeStyle=col; ctx.lineWidth=card.correct?2.5:1.5;
      ctx.shadowBlur =card.correct?20:0; ctx.shadowColor=col;
      ctx.beginPath(); ctx.roundRect(card.x,card.y,CARD_W,CARD_H,10); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.font='28px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(card.emoji, card.x+CARD_W/2, card.y+CARD_H/2-8);
      ctx.font='bold 8px Outfit'; ctx.fillStyle='#fff';
      ctx.fillText(card.name, card.x+CARD_W/2, card.y+CARD_H-10);
      ctx.restore();
    });

    /* Dragged card */
    if(drag){
      ctx.save();
      ctx.fillStyle=drag.col?LAYERS[drag.layer].col+'44':'rgba(255,255,255,0.2)';
      ctx.strokeStyle=LAYERS[drag.layer].col; ctx.lineWidth=2.5;
      ctx.shadowBlur=24; ctx.shadowColor=LAYERS[drag.layer].col;
      ctx.beginPath(); ctx.roundRect(drag.x,drag.y,CARD_W,CARD_H,10); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.font='28px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(drag.emoji, drag.x+CARD_W/2, drag.y+CARD_H/2-8);
      ctx.font='bold 8px Outfit'; ctx.fillStyle='#fff';
      ctx.fillText(drag.name, drag.x+CARD_W/2, drag.y+CARD_H-10);
      ctx.restore();
    }

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.shadowBlur=6; ctx.shadowColor=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h, 10, canvas.height-10);
    ctx.font='bold 10px Outfit'; ctx.fillStyle='rgba(124,252,0,0.5)';
    ctx.textAlign='right';
    ctx.fillText('Placed: '+placedCount+'/'+organisms.length, canvas.width-10, canvas.height-10);
  }

  function onDown(e){
    const {x,y}=gpos(canvas,e);
    for(const c of cards){
      if(!c.placed && !c.correct && x>=c.x && x<=c.x+CARD_W && y>=c.y && y<=c.y+CARD_H){
        drag=c; dox=x-c.x; doy=y-c.y; break;
      }
    }
  }
  function onMove(e){
    if(!drag) return;
    const {x,y}=gpos(canvas,e);
    drag.x=x-dox; drag.y=y-doy;
  }
  function onUp(){
    if(!drag) return;
    tryPlace(drag); drag=null;
  }
  canvas.addEventListener('mousedown',onDown);
  canvas.addEventListener('mousemove',onMove);
  canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:true});
  canvas.addEventListener('touchmove',e=>{onMove(e.touches[0]);e.preventDefault();},{passive:false});
  canvas.addEventListener('touchend',()=>onUp());

  function loop(){
    if(isOver) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    draw(); animId=requestAnimationFrame(loop);
  }
  function end(){
    isOver=true; clearInterval(timerInterval); cancelAnimationFrame(animId);
    score=localScore; finishMission(Math.min(100,~~((localScore/(organisms.length*25))*100)),0);
  }
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); initCards(); loop();
}


/* ═══════════════════════════════════════════════════════
   MATHS: MATRIX MISSION  (Grade 10 — coordinates/log)
   A space mission control. Satellite panels drift across screen.
   Each panel shows a maths expression. Player fires targeting
   reticle at the panel showing the CORRECT answer to the
   displayed equation. Panels rotate slowly around the screen.
═══════════════════════════════════════════════════════ */
function mathsBubble(g) { mathsMission(g); }

function mathsMission(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const QUESTIONS = [
    { q:'Distance (0,0)→(3,4)=?', correct:'5',    wrong:['7','√25 ≈5.5'] },
    { q:'Midpoint (2,4)&(6,8)=?', correct:'(4,6)',wrong:['(3,5)','(8,12)'] },
    { q:'GP 2,6,18 ratio=?',      correct:'3',    wrong:['2','6'] },
    { q:'Sum 1..10=?',            correct:'55',   wrong:['45','50'] },
    { q:'log₁₀(1000)=?',         correct:'3',    wrong:['4','2'] },
    { q:'sin²θ+cos²θ=?',         correct:'1',    wrong:['0','2'] },
    { q:'Slope of y=3x−2=?',     correct:'3',    wrong:['−2','½'] },
    { q:'(a+b)²=?',               correct:'a²+2ab+b²',wrong:['a²+b²','2a+2b'] },
  ];

  let localScore=0, lives=3, gameTime=85, isOver=false, animId;
  let qIdx=0, currentQ=null, panels=[], bullets=[], sparks=[];
  let reticleX=canvas.width/2, reticleY=canvas.height/2;

  function spawnRound(){
    const raw=QUESTIONS[qIdx%QUESTIONS.length]; qIdx++;
    const correctVal=raw.correct;
    const all=[raw.correct,...raw.wrong].sort(()=>Math.random()-0.5);
    currentQ={q:raw.q, correct:correctVal};
    panels=all.map((val,i)=>{
      const angle=Math.random()*Math.PI*2;
      const dist=90+Math.random()*70;
      const cx=canvas.width/2+Math.cos(angle)*dist;
      const cy=canvas.height/2+Math.sin(angle)*dist;
      return {
        x:cx, y:cy,
        angle:Math.random()*Math.PI*2,
        orbitAngle:angle,
        orbitR:dist,
        orbitSpd:(0.008+Math.random()*0.006)*(Math.random()>0.5?1:-1),
        val, ok:val===correctVal,
        col:['#00C3FF','#FFD700','#FF2D9B'][i%3],
        w:80, h:36, pulse:Math.random()*Math.PI*2
      };
    });
    bullets=[];
  }

  function fire(){
    bullets.push({x:reticleX,y:reticleY,vx:0,vy:0,r:6,life:1});
  }

  function spawnSparks(x,y,col){
    for(let i=0;i<18;i++) sparks.push({x,y,vx:(Math.random()-.5)*9,vy:(Math.random()-.5)*9,life:1,col,r:3});
  }

  function draw(){
    /* Space background */
    const bg=ctx.createRadialGradient(canvas.width/2,canvas.height/2,10,canvas.width/2,canvas.height/2,canvas.width);
    bg.addColorStop(0,'#050820'); bg.addColorStop(1,'#020408');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Static star field */
    ctx.save(); ctx.fillStyle='rgba(255,255,255,0.6)';
    for(let i=0;i<80;i++){
      const sx=(i*137.5)%canvas.width, sy=(i*97.3)%canvas.height;
      ctx.beginPath(); ctx.arc(sx,sy,Math.random()<0.1?1.5:0.8,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();

    /* Mission control title */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,canvas.width,50);
    ctx.font='bold 13px Outfit'; ctx.fillStyle='#00C3FF'; ctx.textAlign='center';
    ctx.shadowBlur=8; ctx.shadowColor='#00C3FF';
    ctx.fillText('🛰️ MISSION CONTROL — Lock onto: '+currentQ.q, canvas.width/2,32);
    ctx.shadowBlur=0; ctx.restore();

    /* Orbiting panels */
    panels.forEach(p=>{
      p.orbitAngle+=p.orbitSpd;
      p.pulse+=0.05;
      p.x=canvas.width/2+Math.cos(p.orbitAngle)*p.orbitR;
      p.y=canvas.height/2+Math.sin(p.orbitAngle)*p.orbitR;
      const glow=0.7+0.3*Math.sin(p.pulse);
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.shadowBlur=14*glow; ctx.shadowColor=p.col;
      ctx.fillStyle=p.col+'33'; ctx.strokeStyle=p.col; ctx.lineWidth=2;
      ctx.beginPath(); ctx.roundRect(-p.w/2,-p.h/2,p.w,p.h,8); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.font='bold 11px Outfit'; ctx.fillStyle='#fff';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(p.val, 0, 0);
      /* Orbit trail dots */
      for(let t=1;t<=5;t++){
        const ta=p.orbitAngle-p.orbitSpd*t*4;
        const tx=Math.cos(ta)*p.orbitR-Math.cos(p.orbitAngle)*p.orbitR;
        const ty=Math.sin(ta)*p.orbitR-Math.sin(p.orbitAngle)*p.orbitR;
        ctx.globalAlpha=(6-t)/6*0.3;
        ctx.fillStyle=p.col;
        ctx.beginPath(); ctx.arc(tx,ty,3,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    });

    /* Crosshair reticle (follows mouse/touch) */
    ctx.save();
    ctx.strokeStyle='rgba(0,245,160,0.8)'; ctx.lineWidth=1.5; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.arc(reticleX,reticleY,22,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle='rgba(0,245,160,0.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(reticleX-34,reticleY); ctx.lineTo(reticleX+34,reticleY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(reticleX,reticleY-34); ctx.lineTo(reticleX,reticleY+34); ctx.stroke();
    ctx.restore();

    /* Bullets */
    bullets.forEach(b=>{
      ctx.save(); ctx.globalAlpha=b.life; ctx.fillStyle='#00F5A0';
      ctx.shadowBlur=12; ctx.shadowColor='#00F5A0';
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    });

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.shadowBlur=8; ctx.shadowColor=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h, 10, canvas.height-10);
  }

  function checkHit(x,y){
    panels.forEach((p,i)=>{
      const dx=x-p.x, dy=y-p.y;
      if(Math.abs(dx)<p.w/2+8 && Math.abs(dy)<p.h/2+8){
        if(p.ok){
          localScore+=25; score=localScore; updateHUD(localScore);
          spawnSparks(p.x,p.y,p.col);
          showFloatingText('🎯 Locked! +25',p.x,p.y-40,p.col);
          updateProgress(Math.min(100,~~((qIdx/QUESTIONS.length)*100)));
          panels=[];
          setTimeout(spawnRound,700);
        } else {
          lives--; updateHealth(Math.max(0,(lives/3)*100));
          shakeCanvas(canvas); spawnSparks(p.x,p.y,'#FF2D9B');
          showFloatingText('✗ Wrong target!',p.x,p.y-30,'#FF2D9B');
          panels.splice(i,1);
        }
      }
    });
  }

  canvas.addEventListener('mousemove',e=>{const p=gpos(canvas,e);reticleX=p.x;reticleY=p.y;});
  canvas.addEventListener('click',e=>{const p=gpos(canvas,e);checkHit(p.x,p.y);});
  canvas.addEventListener('touchmove',e=>{e.preventDefault();const p=gpos(canvas,e.touches[0]);reticleX=p.x;reticleY=p.y;},{passive:false});
  canvas.addEventListener('touchstart',e=>{const p=gpos(canvas,e.touches[0]);reticleX=p.x;reticleY=p.y;checkHit(p.x,p.y);},{passive:true});

  function loop(){
    if(isOver) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    draw(); animId=requestAnimationFrame(loop);
  }
  function end(){
    isOver=true; clearInterval(timerInterval); cancelAnimationFrame(animId);
    score=localScore; finishMission(Math.min(100,~~((localScore/(QUESTIONS.length*25))*100)),0);
  }
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); spawnRound(); loop();
}


/* ═══════════════════════════════════════════════════════
   MATHS: CALCULUS ROLLER COASTER  (Grade 11-12)

   A roller coaster track is drawn as a sine/polynomial curve.
   The coaster car moves along it. At each checkpoint gate,
   a calculus/advanced maths challenge appears.
   Player must adjust a "dial" (slider drag) to the correct answer
   to open the gate before the car crashes into it.
   Wrong answer = crash + rebuild (life lost).
═══════════════════════════════════════════════════════ */
function mathsAdvanced(g) { calculusCoaster(g); }

function calculusCoaster(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const QUESTIONS = {
    11:[
      { q:'d/dx(sin x)=?',    correct:1,  min:-2, max:2, label:'cos x=1',   display:'cos 0°=?',   fact:'d/dx(sin x)=cos x' },
      { q:'∫2x dx = ?+C',     correct:4,  min:0,  max:8, label:'x²(at 2)',  display:'x² at x=2=?',fact:'∫2x dx = x² + C' },
      { q:'lim sinx/x (x→0)=?',correct:1, min:0,  max:3, label:'=1',        display:'lim sinx/x=?',fact:'Standard limit = 1' },
      { q:'det[[1,2],[3,4]]=?', correct:-2, min:-5, max:5,label:'-2',        display:'1×4−2×3=?',  fact:'ad−bc=4−6=−2' },
      { q:"f(x)=x³ → f'(2)=?",correct:12, min:0, max:20,label:'12',         display:"f'(2) for x³=?",fact:"f'(x)=3x²→3×4=12" },
      { q:'Domain of ln(x)?',  correct:1,  min:0,  max:2, label:'x>0 → 1',  display:'ln(x) at x=1=?',fact:'ln(x) defined for x>0' },
    ],
    12:[
      { q:'∫₀¹ x² dx=?',       correct:0.33,min:0,max:1,  label:'1/3≈0.33', display:'∫₀¹x²dx=?',   fact:'[x³/3]₀¹=1/3' },
      { q:'d/dx(eˣ)=?',        correct:1,  min:0,  max:3, label:'eˣ at 0=1',display:'eˣ at x=0=?', fact:'eˣ is its own derivative' },
      { q:'A·B=0 means?',      correct:90, min:0,  max:180,label:'90°',      display:'angle when A·B=0=?',fact:'Perpendicular: θ=90°' },
      { q:'C(5,2)=?',          correct:10, min:0,  max:20, label:'10',       display:'5C2=?',        fact:'5!/(2!3!)=10' },
      { q:'P(A∪B) needs P(A∩B)?',correct:1,min:0, max:3,  label:'yes→1',    display:'P(A)+P(B)−?=P(A∪B)',fact:'Subtract P(A∩B) once' },
      { q:'Matrix 2×3 × 3×4 gives?',correct:8,min:0,max:16,label:'2×4=8 cells',display:'rows×cols for 2×4?',fact:'(m×n)(n×p)=m×p → 2×4' },
    ]
  };
  const bank = (QUESTIONS[g]||QUESTIONS[11]).slice();

  let localScore=0, lives=3, gameTime=95+(g-11)*5, isOver=false, animId;
  let qIdx=0, currentQ=null, dialValue=0, draggingDial=false;
  let carT=0, carSpd=0.003, gateT=0.5, gateOpen=false, crashed=false;
  let sparks=[], smoke=[];

  /* Track is a parametric curve: x=t*canvas.width, y=midY+sin curve */
  const TRACK_MID=canvas.height*0.52;
  function trackY(t){ return TRACK_MID + Math.sin(t*Math.PI*4)*60 + Math.cos(t*Math.PI*2.5)*30; }

  function nextQ(){
    if(qIdx>=bank.length){end();return;}
    currentQ=bank[qIdx]; qIdx++;
    dialValue=currentQ.min+(currentQ.max-currentQ.min)*0.5;
    gateT=0.45+Math.random()*0.3;
    gateOpen=false; crashed=false;
  }

  function spawnSparks(x,y,col,n=20){
    for(let i=0;i<n;i++) sparks.push({x,y,vx:(Math.random()-.5)*10,vy:(Math.random()-.5)*10,life:1,col,r:3+Math.random()*3});
  }
  function spawnSmoke(x,y){
    for(let i=0;i<12;i++) smoke.push({x,y,vx:(Math.random()-.5)*3,vy:-(1+Math.random()*2),r:8+Math.random()*8,life:1});
  }

  /* DIAL: horizontal drag slider at bottom */
  const DIAL_X=60, DIAL_Y=canvas.height-55, DIAL_W=canvas.width-120, DIAL_H=20;

  function dialToValue(px){ return currentQ.min+(currentQ.max-currentQ.min)*Math.max(0,Math.min(1,(px-DIAL_X)/DIAL_W)); }
  function valueToDial(v){ return DIAL_X+(v-currentQ.min)/(currentQ.max-currentQ.min)*DIAL_W; }

  function checkAnswer(){
    if(!currentQ||gateOpen||crashed) return;
    const tol=Math.abs(currentQ.max-currentQ.min)*0.12;
    if(Math.abs(dialValue-currentQ.correct)<=tol){
      gateOpen=true;
      localScore+=30; score=localScore; updateHUD(localScore);
      spawnSparks(gateT*canvas.width, trackY(gateT), '#00F5A0', 25);
      showFloatingText('🎢 +30 Gate Open!', gateT*canvas.width, trackY(gateT)-40, '#00F5A0');
      showFloatingText('💡 '+currentQ.fact, canvas.width/2, canvas.height/2, '#00C3FF');
      updateProgress(Math.min(100,~~((qIdx/bank.length)*100)));
      setTimeout(()=>{carT=gateT+0.01; nextQ();},1200);
    } else {
      crashed=true; lives--;
      updateHealth(Math.max(0,(lives/3)*100));
      shakeCanvas(canvas);
      spawnSmoke(gateT*canvas.width, trackY(gateT));
      showFloatingText('💥 CRASH! Wrong answer', gateT*canvas.width, trackY(gateT)-30, '#FF2D9B');
      setTimeout(()=>{crashed=false; carT=Math.max(0,gateT-0.05);},1000);
    }
  }

  function draw(){
    /* Sky-to-earth gradient */
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#020818'); bg.addColorStop(0.5,'#0a1820'); bg.addColorStop(1,'#081408');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Ground */
    ctx.fillStyle='#0a180a'; ctx.fillRect(0,TRACK_MID+80,canvas.width,canvas.height);

    /* Track */
    ctx.save();
    ctx.strokeStyle='rgba(200,160,80,0.5)'; ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(0,trackY(0));
    for(let t=0;t<=1;t+=0.005) ctx.lineTo(t*canvas.width, trackY(t));
    ctx.stroke();
    /* Rail sleepers */
    ctx.strokeStyle='rgba(120,80,40,0.4)'; ctx.lineWidth=2;
    for(let t=0;t<=1;t+=0.03){
      const tx=t*canvas.width, ty=trackY(t);
      ctx.beginPath(); ctx.moveTo(tx-8,ty-4); ctx.lineTo(tx+8,ty+4); ctx.stroke();
    }
    ctx.restore();

    /* Gate */
    if(currentQ){
      const gx=gateT*canvas.width, gy=trackY(gateT);
      ctx.save();
      ctx.strokeStyle=gateOpen?'#00F5A0':'#FF2D9B'; ctx.lineWidth=3;
      ctx.shadowBlur=16; ctx.shadowColor=gateOpen?'#00F5A0':'#FF2D9B';
      /* Gate posts */
      ctx.beginPath(); ctx.moveTo(gx-20,gy-60); ctx.lineTo(gx-20,gy+20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx+20,gy-60); ctx.lineTo(gx+20,gy+20); ctx.stroke();
      /* Gate bar (open = raised, closed = across) */
      if(!gateOpen && !crashed){
        ctx.beginPath(); ctx.moveTo(gx-20,gy-20); ctx.lineTo(gx+20,gy-20); ctx.stroke();
      }
      ctx.shadowBlur=0; ctx.restore();
      /* Gate question */
      ctx.save();
      ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.strokeStyle='rgba(255,215,0,0.4)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.roundRect(gx-90,gy-95,180,34,8); ctx.fill(); ctx.stroke();
      ctx.font='bold 11px Outfit'; ctx.fillStyle='#FFD700'; ctx.textAlign='center';
      ctx.fillText('⚡ '+currentQ.q, gx, gy-73);
      ctx.restore();
    }

    /* Coaster car */
    if(!crashed){
      const cx=carT*canvas.width, cy=trackY(carT);
      ctx.save();
      ctx.shadowBlur=18; ctx.shadowColor='#00C3FF';
      ctx.fillStyle='#00C3FF'; ctx.strokeStyle='#fff'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.roundRect(cx-18,cy-14,36,22,6); ctx.fill(); ctx.stroke();
      /* Wheels */
      ctx.fillStyle='#FFD700';
      ctx.beginPath(); ctx.arc(cx-10,cy+8,5,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx+10,cy+8,5,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    /* Dial slider */
    if(currentQ){
      ctx.save();
      /* Track */
      ctx.fillStyle='rgba(255,255,255,0.1)'; ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.roundRect(DIAL_X,DIAL_Y,DIAL_W,DIAL_H,DIAL_H/2); ctx.fill(); ctx.stroke();
      /* Fill */
      const fillW=(dialValue-currentQ.min)/(currentQ.max-currentQ.min)*DIAL_W;
      const fg=ctx.createLinearGradient(DIAL_X,0,DIAL_X+DIAL_W,0);
      fg.addColorStop(0,'#00C3FF'); fg.addColorStop(1,'#FF2D9B');
      ctx.fillStyle=fg;
      ctx.beginPath(); ctx.roundRect(DIAL_X,DIAL_Y,fillW,DIAL_H,DIAL_H/2); ctx.fill();
      /* Thumb */
      const thumbX=valueToDial(dialValue);
      ctx.fillStyle='#fff'; ctx.shadowBlur=12; ctx.shadowColor='#00F5A0';
      ctx.beginPath(); ctx.arc(thumbX,DIAL_Y+DIAL_H/2,13,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      ctx.font='bold 10px Outfit'; ctx.fillStyle='#000';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(dialValue.toFixed(dialValue%1===0?0:1), thumbX, DIAL_Y+DIAL_H/2);
      /* Range labels */
      ctx.font='9px Outfit'; ctx.fillStyle='rgba(255,255,255,0.4)';
      ctx.textAlign='left';  ctx.fillText(currentQ.min, DIAL_X, DIAL_Y-6);
      ctx.textAlign='right'; ctx.fillText(currentQ.max, DIAL_X+DIAL_W, DIAL_Y-6);
      ctx.textAlign='center'; ctx.fillStyle='rgba(255,215,0,0.6)';
      ctx.fillText('← Drag to set answer, then tap CHECK →', canvas.width/2, DIAL_Y-6);
      ctx.restore();
      /* Check button */
      ctx.save();
      ctx.fillStyle='rgba(0,245,160,0.15)'; ctx.strokeStyle='#00F5A0'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.roundRect(canvas.width-110,DIAL_Y-2,100,DIAL_H+4,8); ctx.fill(); ctx.stroke();
      ctx.font='bold 12px Outfit'; ctx.fillStyle='#00F5A0';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('✓ CHECK', canvas.width-60, DIAL_Y+DIAL_H/2);
      ctx.restore();
    }

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.shadowBlur=8; ctx.shadowColor=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    for(let i=smoke.length-1;i>=0;i--){
      const s=smoke[i]; s.x+=s.vx; s.y+=s.vy; s.r*=1.03; s.life-=0.025;
      if(s.life<=0){smoke.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life*0.4; ctx.fillStyle='rgba(200,100,80,1)';
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* HUD */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,canvas.width,44);
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#FFD700'; ctx.textAlign='center';
    ctx.fillText('🎢 CALCULUS COASTER — Grade '+g, canvas.width/2, 28);
    ctx.restore();
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h, 10, canvas.height-10);
  }

  function update(){
    /* Car moves forward */
    if(!crashed && !gateOpen) carT=Math.min(gateT-0.01, carT+carSpd);
    if(gateOpen) carT=Math.min(1, carT+carSpd*1.5);
    if(carT>=1) end();
  }

  /* Dial drag input */
  function dialDown(e){
    const {x,y}=gpos(canvas,e);
    if(y>=DIAL_Y-10 && y<=DIAL_Y+DIAL_H+10 && x>=DIAL_X && x<=DIAL_X+DIAL_W){ draggingDial=true; dialValue=dialToValue(x); }
    /* Check button */
    if(x>=canvas.width-110 && x<=canvas.width-10 && y>=DIAL_Y-2 && y<=DIAL_Y+DIAL_H+4) checkAnswer();
  }
  function dialMove(e){
    if(!draggingDial) return;
    const {x}=gpos(canvas,e);
    dialValue=dialToValue(x);
  }
  function dialUp(){ draggingDial=false; }

  canvas.addEventListener('mousedown',dialDown);
  canvas.addEventListener('mousemove',dialMove);
  canvas.addEventListener('mouseup',dialUp);
  canvas.addEventListener('touchstart',dialDown,{passive:true});
  canvas.addEventListener('touchmove',e=>{dialMove(e.touches[0]);e.preventDefault();},{passive:false});
  canvas.addEventListener('touchend',dialUp);

  function loop(){
    if(isOver) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    draw(); update(); animId=requestAnimationFrame(loop);
  }
  function end(){
    isOver=true; clearInterval(timerInterval); cancelAnimationFrame(animId);
    score=localScore; finishMission(Math.min(100,~~((localScore/(bank.length*30))*100)),0);
  }
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); nextQ(); loop();
}


/* ═══════════════════════════════════════════════════════
   PYTHON: FILL-IN-BLANK  (Grade 7-8)
   Code card shown with one blank highlighted.
   Four draggable word-tiles appear at the bottom.
   Player drags the correct keyword/value into the blank.
   No click-to-answer — must physically drag it in.
═══════════════════════════════════════════════════════ */
function pythonFill(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const QS_G7 = [
    { code:'___("Hello, World!")',             blank:'print',  opts:['print','input','return','def'],    fact:'print() outputs to console' },
    { code:'x = ___(input("Enter: "))',        blank:'int',    opts:['int','str','float','bool'],        fact:'int() converts string → integer' },
    { code:'name = ___("Your name? ")',        blank:'input',  opts:['input','print','read','scan'],     fact:'input() reads from keyboard' },
    { code:'pi = ___',                         blank:'3.14',   opts:['3.14','3','"3.14"','3,14'],        fact:'Float literal — decimal point required' },
    { code:'flag = ___',                       blank:'True',   opts:['True','true','1','yes'],           fact:'Boolean True — capital T in Python' },
    { code:'x = 10\nprint(type(___))',         blank:'x',      opts:['x','10','int','type'],             fact:"type(x) → <class 'int'>" },
  ];
  const QS_G8 = [
    { code:'for i in ___(5):\n    print(i)',   blank:'range',  opts:['range','list','iter','count'],     fact:'range(5) → 0,1,2,3,4' },
    { code:'if x>10:\n    print("big")\n___:\n    print("small")', blank:'else', opts:['else','elif','catch','then'], fact:'else: alternate branch' },
    { code:'i=0\nwhile i ___ 5:\n    i+=1',   blank:'<',      opts:['<','<=','>','=='],                 fact:'< means strictly less than' },
    { code:'for i in range(10):\n    if i==5: ___', blank:'break', opts:['break','continue','pass','stop'], fact:'break exits the loop immediately' },
    { code:'nums=[1,2,3]\nfor n in ___:\n    print(n)', blank:'nums', opts:['nums','num','list','range(3)'], fact:'Iterate over the list variable directly' },
    { code:'x=5\nif x%2 ___ 0:\n    print("even")', blank:'==', opts:['==','=','!=','>='],             fact:'== equality check (not = assignment)' },
  ];
  const QS = g<=7 ? QS_G7 : QS_G8;

  const TILE_W=72, TILE_H=36;
  let qIdx=0, currentQ=null, tiles=[], drag=null, dox=0, doy=0;
  let localScore=0, lives=3, gameTime=90, isOver=false, animId;
  let sparks=[], blankFilled=null, showSuccess=false, successTimer=0;

  function nextQ(){
    if(qIdx>=QS.length){end();return;}
    const raw=QS[qIdx]; qIdx++;
    /* Shuffle options */
    const correctOpt=raw.blank;
    const shuffled=raw.opts.slice().sort(()=>Math.random()-0.5);
    currentQ={...raw, opts:shuffled};
    /* Lay tiles across bottom */
    const spacing=(canvas.width-40)/shuffled.length;
    tiles=shuffled.map((name,i)=>({
      name, ok:name===correctOpt,
      x:20+i*spacing+spacing/2-TILE_W/2,
      y:canvas.height-56,
      ox:20+i*spacing+spacing/2-TILE_W/2,
      oy:canvas.height-56,
      w:TILE_W, h:TILE_H, placed:false,
      col:['#00C3FF','#FFD700','#FF2D9B','#00F5A0'][i%4]
    }));
    blankFilled=null; showSuccess=false; drag=null;
  }

  function spawnSparks(x,y,col){
    for(let i=0;i<20;i++) sparks.push({x,y,vx:(Math.random()-.5)*10,vy:(Math.random()-.5)*10,life:1,col,r:3});
  }

  /* Blank position in canvas space (centre of code block) */
  const BLANK_X=canvas.width/2, BLANK_Y=148;
  const BLANK_W=100, BLANK_H=32;

  function tryDrop(tile){
    const cx=tile.x+tile.w/2, cy=tile.y+tile.h/2;
    if(Math.abs(cx-BLANK_X)<BLANK_W/2+20 && Math.abs(cy-BLANK_Y)<BLANK_H/2+20){
      if(tile.ok){
        blankFilled=tile.name; tile.placed=true;
        spawnSparks(BLANK_X,BLANK_Y,'#00F5A0');
        localScore+=20; score=localScore; updateHUD(localScore);
        showFloatingText('✓ Correct! +20', BLANK_X, BLANK_Y-40, '#00F5A0');
        showFloatingText('💡 '+currentQ.fact, canvas.width/2, canvas.height/2, '#00C3FF');
        updateProgress(Math.min(100,~~((qIdx/QS.length)*100)));
        showSuccess=true; successTimer=60;
        setTimeout(nextQ,1600);
      } else {
        lives--; updateHealth(Math.max(0,(lives/3)*100));
        shakeCanvas(canvas); spawnSparks(BLANK_X,BLANK_Y,'#FF2D9B');
        showFloatingText('✗ Wrong keyword!', BLANK_X, BLANK_Y-40, '#FF2D9B');
        tile.x=tile.ox; tile.y=tile.oy;
      }
    } else {
      tile.x=tile.ox; tile.y=tile.oy;
    }
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#0d0d1a'); bg.addColorStop(1,'#0a1a0a');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!currentQ) return;

    /* Progress bar */
    ctx.fillStyle='#FF2D9B'; ctx.fillRect(0,0,(qIdx/QS.length)*canvas.width,5);

    /* Code editor card */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.strokeStyle='#FF2D9B44'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(20,16,canvas.width-40,170,12); ctx.fill(); ctx.stroke();
    /* Line numbers + code */
    const lines=currentQ.code.split('\n');
    lines.forEach((line,i)=>{
      const ly=44+i*22;
      ctx.font='11px "Courier New"';
      ctx.fillStyle='rgba(255,45,155,0.3)'; ctx.textAlign='right';
      ctx.fillText(i+1,44,ly);
      if(line.includes(currentQ.blank)){
        const parts=line.split(currentQ.blank);
        ctx.fillStyle='#88CC88'; ctx.textAlign='left';
        ctx.fillText(parts[0],54,ly);
        const bw=ctx.measureText(parts[0]).width;
        /* Blank receptacle */
        const filled=blankFilled;
        ctx.save();
        ctx.fillStyle=filled?'rgba(0,245,160,0.2)':'rgba(255,45,155,0.15)';
        ctx.strokeStyle=filled?'#00F5A0':'#FF2D9B'; ctx.lineWidth=2;
        ctx.shadowBlur=filled?20:8; ctx.shadowColor=filled?'#00F5A0':'#FF2D9B';
        ctx.beginPath(); ctx.roundRect(54+bw-2,ly-15,BLANK_W,BLANK_H,6); ctx.fill(); ctx.stroke();
        ctx.font='bold 13px "Courier New"'; ctx.fillStyle=filled?'#00F5A0':'rgba(255,45,155,0.6)';
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.shadowBlur=0;
        ctx.fillText(filled||'  ___  ', 54+bw+BLANK_W/2-2, ly-15+BLANK_H/2);
        ctx.restore();
        if(parts[1]){ctx.fillStyle='#88CC88'; ctx.textAlign='left'; ctx.textBaseline='alphabetic'; ctx.fillText(parts[1],54+bw+BLANK_W+4,ly);}
      } else {
        ctx.fillStyle='#88CC88'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
        ctx.fillText(line,54,ly);
      }
    });
    ctx.restore();

    /* Hint */
    ctx.font='11px Outfit'; ctx.fillStyle='#FF2D9B88'; ctx.textAlign='center';
    ctx.fillText('💡 Drag the correct keyword into the blank ↑', canvas.width/2, 195);

    /* Tile bar background */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,canvas.height-75,canvas.width,75);
    ctx.strokeStyle='rgba(255,45,155,0.2)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,canvas.height-75); ctx.lineTo(canvas.width,canvas.height-75); ctx.stroke();
    ctx.restore();

    /* Tiles */
    tiles.forEach(t=>{
      if(t.placed||t===drag) return;
      ctx.save();
      ctx.fillStyle=t.col+'33'; ctx.strokeStyle=t.col; ctx.lineWidth=1.8;
      ctx.shadowBlur=8; ctx.shadowColor=t.col;
      ctx.beginPath(); ctx.roundRect(t.x,t.y,t.w,t.h,8); ctx.fill(); ctx.stroke();
      ctx.font='bold 12px "Courier New"'; ctx.fillStyle='#fff';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.shadowBlur=0;
      ctx.fillText(t.name, t.x+t.w/2, t.y+t.h/2);
      ctx.restore();
    });

    /* Dragged tile */
    if(drag){
      ctx.save();
      ctx.fillStyle=drag.col+'55'; ctx.strokeStyle=drag.col; ctx.lineWidth=2.5;
      ctx.shadowBlur=22; ctx.shadowColor=drag.col;
      ctx.beginPath(); ctx.roundRect(drag.x,drag.y,drag.w,drag.h,8); ctx.fill(); ctx.stroke();
      ctx.font='bold 12px "Courier New"'; ctx.fillStyle='#fff'; ctx.shadowBlur=0;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(drag.name, drag.x+drag.w/2, drag.y+drag.h/2);
      ctx.restore();
    }

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.shadowBlur=8; ctx.shadowColor=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-10);
    ctx.font='bold 9px Outfit'; ctx.fillStyle='#FF2D9B66'; ctx.textAlign='right';
    ctx.fillText('Grade '+g+' Python',canvas.width-10,canvas.height-10);
  }

  function onDown(e){
    const {x,y}=gpos(canvas,e);
    for(const t of tiles){
      if(!t.placed && x>=t.x && x<=t.x+t.w && y>=t.y && y<=t.y+t.h){
        drag=t; dox=x-t.x; doy=y-t.y; return;
      }
    }
  }
  function onMove(e){
    if(!drag) return;
    const {x,y}=gpos(canvas,e); drag.x=x-dox; drag.y=y-doy;
  }
  function onUp(){
    if(!drag) return; tryDrop(drag); drag=null;
  }
  canvas.addEventListener('mousedown',onDown);
  canvas.addEventListener('mousemove',onMove);
  canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:true});
  canvas.addEventListener('touchmove',e=>{onMove(e.touches[0]);e.preventDefault();},{passive:false});
  canvas.addEventListener('touchend',onUp);

  function loop(){
    if(isOver) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    draw(); animId=requestAnimationFrame(loop);
  }
  function end(){
    isOver=true; clearInterval(timerInterval); cancelAnimationFrame(animId);
    score=localScore; finishMission(Math.min(100,~~((localScore/(QS.length*20))*100)),0);
  }
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); nextQ(); loop();
}


/* ═══════════════════════════════════════════════════════
   PYTHON: DEBUG HUNT  (Grade 9-10)
   Buggy code shown. The bug line highlighted in red.
   Four fix-tiles at the bottom — drag the correct fix onto the bug line.
   Physical drag-and-drop, not button click.
═══════════════════════════════════════════════════════ */
function pythonDebug(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const ALL_BUGS = {
    9:[
      { title:'Fix the function call',
        code:['def greet(name):','    print("Hello, " + name)','greet()  ← BUG'],
        bugLine:2, fix:'greet("Alice")', wrong:['greet[name]','greet = "Alice"','greet.call()'],
        fact:'Pass required argument: greet("Alice")' },
      { title:'Fix list index',
        code:['nums = [10, 20, 30]','print(nums[3])  ← BUG'],
        bugLine:1, fix:'print(nums[2])', wrong:['print(nums[4])','print(nums[0:4])','print(nums[−1:])'],
        fact:'Valid indices for 3-item list: 0, 1, 2' },
      { title:'Fix string + int',
        code:['age = 20','print("Age: " + age)  ← BUG'],
        bugLine:1, fix:'print("Age: " + str(age))', wrong:['print("Age: " + int(age))','print("Age: ",age,)','print("Age:"age)'],
        fact:'str(age) converts int to string for concatenation' },
      { title:'Fix indentation',
        code:['def square(n):','    result = n * n','print(result)  ← BUG'],
        bugLine:2, fix:'    return result', wrong:['return n*n','    print(result)','result = square(5)'],
        fact:'return must be indented inside the function body' },
      { title:'Fix comparison type',
        code:['x = "5"','if x == 5:  ← BUG','    print("Five")'],
        bugLine:1, fix:'if int(x) == 5:', wrong:['if x = 5:','if x is 5:','if x like 5:'],
        fact:'"5" (str) != 5 (int) — use int(x) to convert first' },
    ],
    10:[
      { title:'Fix missing base case',
        code:['def factorial(n):','    return n * factorial(n-1)  ← BUG'],
        bugLine:1, fix:'    if n==0: return 1\n    return n*(n-1)', wrong:['    return 1','    if n>0: return n','    while n: return n'],
        fact:'Base case n==0 prevents infinite recursion' },
      { title:'Fix KeyError',
        code:['d = {"a":1,"b":2}','val = d["c"]  ← BUG'],
        bugLine:1, fix:'val = d.get("c",0)', wrong:['val = d["c"] or 0','val = d.find("c")','val = d.setdefault("c")'],
        fact:'.get(key, default) safely returns default if key missing' },
      { title:'Fix scope error',
        code:['total = 0','def add(x):','    total += x  ← BUG'],
        bugLine:2, fix:'    global total\n    total += x', wrong:['    local total\n    total+=x','    total = x','    return total+x'],
        fact:'"global total" tells Python to use the outer variable' },
      { title:'Fix mutable default',
        code:['def append_to(val,lst=[]):  ← BUG','    lst.append(val)','    return lst'],
        bugLine:0, fix:'def append_to(val,lst=None):\n    if lst is None:lst=[]', wrong:['def append_to(val,lst=list):','def append_to(val,*lst):','def append_to(val,lst={}):'],
        fact:'Mutable defaults persist between calls — use None instead' },
    ]
  };
  const BUGS = ALL_BUGS[g] || ALL_BUGS[9];

  const TILE_W=canvas.width/4-12, TILE_H=38;
  let qIdx=0, currentBug=null, tiles=[], drag=null, dox=0, doy=0;
  let localScore=0, lives=3, gameTime=100, isOver=false, animId;
  let sparks=[], fixApplied=false;

  function nextQ(){
    if(qIdx>=BUGS.length){end();return;}
    const raw=BUGS[qIdx]; qIdx++;
    currentBug=raw;
    /* Shuffle fix options */
    const all=[raw.fix,...raw.wrong].sort(()=>Math.random()-0.5);
    tiles=all.map((name,i)=>({
      name, ok:name===raw.fix,
      x:8+i*(TILE_W+8), y:canvas.height-52,
      ox:8+i*(TILE_W+8), oy:canvas.height-52,
      w:TILE_W, h:TILE_H,
      col:['#00C3FF','#FFD700','#FF2D9B','#00F5A0'][i%4],
      placed:false
    }));
    fixApplied=false; drag=null;
  }

  function spawnSparks(x,y,col){
    for(let i=0;i<18;i++) sparks.push({x,y,vx:(Math.random()-.5)*9,vy:(Math.random()-.5)*9,life:1,col,r:3});
  }

  /* Bug line drop zone Y */
  function bugLineY(){ return 56+currentBug.bugLine*22+8; }

  function tryDrop(tile){
    const cx=tile.x+tile.w/2, cy=tile.y+tile.h/2;
    /* Drop zone: full width of code card, at the bug line */
    const bly=bugLineY();
    if(cy>=bly-20 && cy<=bly+34 && cx>=20 && cx<=canvas.width-20){
      if(tile.ok){
        fixApplied=true; tile.placed=true;
        spawnSparks(canvas.width/2, bly, '#00F5A0');
        localScore+=25; score=localScore; updateHUD(localScore);
        showFloatingText('🐛 Fixed! +25', canvas.width/2, bly-40, '#00F5A0');
        showFloatingText('📚 '+currentBug.fact, canvas.width/2, canvas.height/2, '#00C3FF');
        updateProgress(Math.min(100,~~((qIdx/BUGS.length)*100)));
        setTimeout(nextQ,1800);
      } else {
        lives--; updateHealth(Math.max(0,(lives/3)*100));
        shakeCanvas(canvas); spawnSparks(canvas.width/2,bly,'#FF2D9B');
        showFloatingText('✗ Still buggy!', canvas.width/2, bly-30, '#FF2D9B');
        tile.x=tile.ox; tile.y=tile.oy;
      }
    } else {
      tile.x=tile.ox; tile.y=tile.oy;
    }
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#100010'); bg.addColorStop(1,'#080010');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!currentBug) return;

    /* Matrix rain */
    ctx.save(); ctx.font='11px "Courier New"'; ctx.fillStyle='rgba(255,45,155,0.04)';
    for(let i=0;i<10;i++) ctx.fillText(Math.random()>0.5?'1':'0',i*60+Math.sin(Date.now()*.001+i)*5,((Date.now()*0.035+i*75)%canvas.height));
    ctx.restore();

    /* Title */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.strokeStyle='rgba(255,45,155,0.4)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(12,6,canvas.width-24,34,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#FF2D9B'; ctx.textAlign='center';
    ctx.fillText('🐛 DEBUG HUNT: '+currentBug.title, canvas.width/2, 28); ctx.restore();

    /* Code card */
    const codeH=currentBug.code.length*22+20;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.strokeStyle='#333'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(14,46,canvas.width-28,codeH,8); ctx.fill(); ctx.stroke();
    currentBug.code.forEach((line,i)=>{
      const isBug=i===currentBug.bugLine, ly=56+i*22;
      if(isBug){
        ctx.fillStyle=fixApplied?'rgba(0,245,160,0.15)':'rgba(255,45,155,0.15)';
        ctx.fillRect(14,ly-14,canvas.width-28,22);
        /* Drop zone hint border */
        ctx.strokeStyle=fixApplied?'#00F5A0':'rgba(255,45,155,0.6)';
        ctx.lineWidth=1.5; ctx.setLineDash([4,4]);
        ctx.strokeRect(14,ly-14,canvas.width-28,22); ctx.setLineDash([]);
      }
      ctx.font='11px "Courier New"';
      ctx.fillStyle='rgba(255,45,155,0.35)'; ctx.textAlign='right';
      ctx.fillText(i+1, 36, ly);
      ctx.textAlign='left';
      if(isBug){
        const cleanLine=line.replace('← BUG','').trim();
        ctx.fillStyle=fixApplied?'#00F5A0':'#FF8888';
        ctx.fillText(fixApplied?('✓ '+currentBug.fix.split('\n')[0]):cleanLine, 44, ly);
        if(!fixApplied){
          ctx.fillStyle='rgba(255,100,100,0.7)';
          ctx.font='9px Outfit'; ctx.fillText('↑ drag fix tile here', 44, ly+13);
        }
      } else {
        ctx.fillStyle='#88CC88'; ctx.fillText(line,44,ly);
      }
    });
    ctx.restore();

    /* Progress bar */
    ctx.fillStyle='#FF2D9B'; ctx.fillRect(0,0,(qIdx/BUGS.length)*canvas.width,5);

    /* Tile bar */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,canvas.height-70,canvas.width,70);
    ctx.strokeStyle='rgba(255,45,155,0.2)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,canvas.height-70); ctx.lineTo(canvas.width,canvas.height-70); ctx.stroke();
    ctx.font='9px Outfit'; ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.textAlign='center';
    ctx.fillText('Drag the correct fix onto the highlighted line ↑', canvas.width/2, canvas.height-58);
    ctx.restore();

    /* Fix tiles */
    tiles.forEach(t=>{
      if(t.placed||t===drag) return;
      ctx.save();
      ctx.fillStyle=t.col+'33'; ctx.strokeStyle=t.col; ctx.lineWidth=1.8;
      ctx.shadowBlur=6; ctx.shadowColor=t.col;
      ctx.beginPath(); ctx.roundRect(t.x,t.y,t.w,t.h,8); ctx.fill(); ctx.stroke();
      ctx.font='9px "Courier New"'; ctx.fillStyle='#fff'; ctx.shadowBlur=0;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      const disp=t.name.split('\n')[0];
      ctx.fillText(disp.length>22?disp.slice(0,21)+'…':disp, t.x+t.w/2, t.y+t.h/2);
      ctx.restore();
    });

    /* Dragged tile */
    if(drag){
      ctx.save();
      ctx.fillStyle=drag.col+'55'; ctx.strokeStyle=drag.col; ctx.lineWidth=2.5;
      ctx.shadowBlur=20; ctx.shadowColor=drag.col;
      ctx.beginPath(); ctx.roundRect(drag.x,drag.y,drag.w,drag.h,8); ctx.fill(); ctx.stroke();
      ctx.font='9px "Courier New"'; ctx.fillStyle='#fff'; ctx.shadowBlur=0;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      const disp=drag.name.split('\n')[0];
      ctx.fillText(disp.length>22?disp.slice(0,21)+'…':disp, drag.x+drag.w/2, drag.y+drag.h/2);
      ctx.restore();
    }

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.shadowBlur=8; ctx.shadowColor=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-10);
  }

  function onDown(e){
    const {x,y}=gpos(canvas,e);
    for(const t of tiles){
      if(!t.placed && x>=t.x && x<=t.x+t.w && y>=t.y && y<=t.y+t.h){
        drag=t; dox=x-t.x; doy=y-t.y; return;
      }
    }
  }
  function onMove(e){
    if(!drag) return;
    const {x,y}=gpos(canvas,e); drag.x=x-dox; drag.y=y-doy;
  }
  function onUp(){ if(!drag) return; tryDrop(drag); drag=null; }

  canvas.addEventListener('mousedown',onDown);
  canvas.addEventListener('mousemove',onMove);
  canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:true});
  canvas.addEventListener('touchmove',e=>{onMove(e.touches[0]);e.preventDefault();},{passive:false});
  canvas.addEventListener('touchend',onUp);

  function loop(){
    if(isOver) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    draw(); animId=requestAnimationFrame(loop);
  }
  function end(){
    isOver=true; clearInterval(timerInterval); cancelAnimationFrame(animId);
    score=localScore; finishMission(Math.min(100,~~((localScore/(BUGS.length*25))*100)),0);
  }
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); nextQ(); loop();
}


/* ═══════════════════════════════════════════════════════
   PYTHON: CODE BLOCK DRAG  (Grade 11-12)
   Scrambled code blocks — drag into correct order.
   Physical drag-and-drop into numbered slots.
   Check button validates. Same engine as before but
   with improved visual and drag-snap feel.
═══════════════════════════════════════════════════════ */
function pythonDrag(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const PUZZLES = {
    11:[
      { title:'Build a Class',
        goal:'Define Dog class with bark method',
        blocks:['class Dog:','    def __init__(self,name):','        self.name = name','    def bark(self):','        return "Woof!"','    name = self  # WRONG','    return dog  # WRONG'],
        correct:[0,1,2,3,4], hint:'Constructor: self.name=name. Method returns string.' },
      { title:'List Comprehension',
        goal:'One-liner: even numbers 0-9',
        blocks:['evens=[]','evens=[x for x in range(10) if x%2==0]','evens=[x for x in range(10)]','evens=filter(even,range(10))','for x in range(10): evens.append(x)'],
        correct:[1], hint:'[expr for item in iterable if condition]' },
      { title:'Exception Handling',
        goal:'Safe division with try/except',
        blocks:['def safe_div(a,b):','    try:','        return a/b','    except ZeroDivisionError:','        return None','    catch ZeroDivisionError:  # WRONG','    finally: return 0  # WRONG'],
        correct:[0,1,2,3,4], hint:'try→except ZeroDivisionError→return None' },
    ],
    12:[
      { title:'Recursive Fibonacci',
        goal:'Correct recursive fib(n)',
        blocks:['def fib(n):','    if n<=1: return n','    if n<=1: return 1  # WRONG','    return fib(n-1)+fib(n-2)','    return fib(n)+fib(n-1)  # WRONG'],
        correct:[0,1,3], hint:'Base: fib(0)=0,fib(1)=1. Recurse: fib(n-1)+fib(n-2)' },
      { title:'NumPy Mean',
        goal:'Create array and compute mean',
        blocks:['import numpy as np','import numpy','arr = np.array([1,2,3,4,5])','arr = numpy.array([1,2,3])','mean = arr.mean()','mean = np.mean(arr)'],
        correct:[0,2,4], hint:'import numpy as np → arr.mean()' },
      { title:'Bubble Sort',
        goal:'Correct bubble sort implementation',
        blocks:['def bubble_sort(arr):','    for i in range(len(arr)-1):','        for j in range(len(arr)-1-i):','            if arr[j]>arr[j+1]:','                arr[j],arr[j+1]=arr[j+1],arr[j]','                arr[j]=arr[j+1]  # WRONG','    return arr'],
        correct:[0,1,2,3,4,6], hint:'Nested loops + swap adjacent. Return arr at end.' },
    ]
  };
  const puzzleSet = PUZZLES[g] || PUZZLES[11];

  const BH=34, BW=canvas.width-60, BX=30;
  let pIdx=0, currentP=null, blocks=[], slots=[], drag=null, dox=0, doy=0;
  let localScore=0, lives=3, gameTime=120, isOver=false, animId;
  let sparks=[];

  function loadPuzzle(){
    if(pIdx>=puzzleSet.length){end();return;}
    currentP=puzzleSet[pIdx]; pIdx++;
    blocks=currentP.blocks.map((code,i)=>({
      id:i, code,
      x:BX, y:72+i*(BH+6), ox:BX, oy:72+i*(BH+6),
      w:BW, h:BH, placed:false
    }));
    slots=currentP.correct.map((expects,i)=>({
      idx:i, expects,
      x:BX, y:canvas.height-270+i*(BH+6),
      w:BW, h:BH, filled:-1
    }));
    drag=null;
  }

  function spawnSparks(x,y,col){
    for(let i=0;i<16;i++) sparks.push({x,y,vx:(Math.random()-.5)*9,vy:(Math.random()-.5)*9,life:1,col,r:3});
  }

  function checkAnswer(){
    if(slots.every(s=>s.filled===s.expects)){
      localScore+=40; score=localScore; updateHUD(localScore);
      updateProgress(~~((pIdx/puzzleSet.length)*100));
      spawnSparks(canvas.width/2,canvas.height/2,'#00F5A0',30);
      showFloatingText('🧩 Perfect! +40',canvas.width/2,canvas.height/2-40,'#00F5A0');
      showFloatingText('💡 '+currentP.hint,canvas.width/2,canvas.height/2+10,'#00C3FF');
      setTimeout(loadPuzzle,1600);
    } else {
      lives--; updateHealth(Math.max(0,(lives/3)*100));
      shakeCanvas(canvas); showFloatingText('Check order/selection!',canvas.width/2,canvas.height/2,'#FF2D9B');
    }
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#0d0010'); bg.addColorStop(1,'#080018');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!currentP) return;

    /* Header */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.strokeStyle='rgba(255,45,155,0.4)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(10,6,canvas.width-20,52,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#FF2D9B'; ctx.textAlign='center';
    ctx.fillText('🧩 '+currentP.title,canvas.width/2,24);
    ctx.font='10px Outfit'; ctx.fillStyle='#9B8FC0';
    ctx.fillText('Goal: '+currentP.goal,canvas.width/2,40);
    ctx.restore();

    /* Source blocks section label */
    ctx.font='9px Outfit'; ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.textAlign='left';
    ctx.fillText('Available blocks (drag down):',BX,64);

    /* Source blocks */
    blocks.forEach(b=>{
      if(b.placed||b===drag) return;
      const isCorrectBlock=currentP.correct.includes(b.id);
      ctx.save();
      ctx.fillStyle=isCorrectBlock?'rgba(0,195,255,0.08)':'rgba(255,45,155,0.06)';
      ctx.strokeStyle=isCorrectBlock?'rgba(0,195,255,0.3)':'rgba(255,45,155,0.2)';
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.roundRect(b.x,b.y,b.w,b.h,5); ctx.fill(); ctx.stroke();
      ctx.font='10px "Courier New"'; ctx.fillStyle=isCorrectBlock?'#88CCFF':'rgba(255,150,150,0.7)';
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText(b.code.slice(0,55)+(b.code.length>55?'…':''),b.x+8,b.y+b.h/2);
      ctx.restore();
    });

    /* Divider */
    const divY=canvas.height-285;
    ctx.save();
    ctx.strokeStyle='rgba(255,45,155,0.3)'; ctx.lineWidth=1; ctx.setLineDash([6,6]);
    ctx.beginPath(); ctx.moveTo(20,divY); ctx.lineTo(canvas.width-20,divY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font='9px Outfit'; ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.textAlign='left';
    ctx.fillText('Drop correct blocks here (in order) — '+currentP.correct.length+' needed:',BX,divY+10);
    ctx.restore();

    /* Slots */
    slots.forEach((s,i)=>{
      const filled=s.filled>=0;
      const correct=filled&&s.filled===s.expects;
      const col=correct?'#00F5A0':'#FF2D9B';
      ctx.save();
      ctx.fillStyle=filled?(correct?'rgba(0,245,160,0.12)':'rgba(255,45,155,0.1)'):'rgba(255,255,255,0.03)';
      ctx.strokeStyle=filled?col:'rgba(255,255,255,0.12)'; ctx.lineWidth=filled?2:1;
      if(correct){ctx.shadowBlur=12;ctx.shadowColor='#00F5A0';}
      ctx.beginPath(); ctx.roundRect(s.x,s.y,s.w,s.h,5); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.font='10px "Courier New"'; ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle=filled?(correct?'#00F5A0':'#FF8888'):'rgba(255,255,255,0.18)';
      const label=filled?currentP.blocks[s.filled]:(i+1+'. ← drop here');
      ctx.fillText(label.slice(0,55)+(label.length>55?'…':''),s.x+8,s.y+s.h/2);
      ctx.restore();
    });

    /* Dragged block */
    if(drag){
      ctx.save();
      ctx.fillStyle='rgba(0,195,255,0.25)'; ctx.strokeStyle='#00C3FF'; ctx.lineWidth=2;
      ctx.shadowBlur=18; ctx.shadowColor='#00C3FF';
      ctx.beginPath(); ctx.roundRect(drag.x,drag.y,drag.w,drag.h,5); ctx.fill(); ctx.stroke();
      ctx.font='10px "Courier New"'; ctx.fillStyle='#fff'; ctx.shadowBlur=0;
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText(drag.code.slice(0,55),drag.x+8,drag.y+drag.h/2);
      ctx.restore();
    }

    /* Check button */
    ctx.save();
    ctx.fillStyle='rgba(0,245,160,0.15)'; ctx.strokeStyle='rgba(0,245,160,0.5)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(canvas.width-118,canvas.height-46,108,32,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#00F5A0';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('✓ CHECK',canvas.width-64,canvas.height-30);
    ctx.restore();

    /* Hint */
    ctx.font='9px Outfit'; ctx.fillStyle='rgba(255,215,0,0.45)'; ctx.textAlign='left';
    ctx.textBaseline='alphabetic';
    ctx.fillText('💡 '+currentP.hint,10,canvas.height-10);

    /* Progress */
    ctx.fillStyle='#FF2D9B'; ctx.fillRect(0,0,(pIdx/puzzleSet.length)*canvas.width,5);

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.shadowBlur=8; ctx.shadowColor=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-30);
  }

  function onDown(e){
    const {x,y}=gpos(canvas,e);
    /* Check button */
    if(x>=canvas.width-118&&x<=canvas.width-10&&y>=canvas.height-46&&y<=canvas.height-14){checkAnswer();return;}
    /* Grab from source */
    for(const b of blocks){
      if(!b.placed&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){drag=b;dox=x-b.x;doy=y-b.y;return;}
    }
    /* Grab from slot */
    for(const s of slots){
      if(s.filled>=0&&x>=s.x&&x<=s.x+s.w&&y>=s.y&&y<=s.y+s.h){
        const b=blocks[s.filled]; b.placed=false; b.x=s.x; b.y=s.y;
        s.filled=-1; drag=b; dox=x-b.x; doy=y-b.y; return;
      }
    }
  }
  function onMove(e){
    if(!drag) return;
    const {x,y}=gpos(canvas,e); drag.x=x-dox; drag.y=y-doy;
  }
  function onUp(){
    if(!drag) return;
    let dropped=false;
    for(const s of slots){
      const cx=drag.x+drag.w/2, cy=drag.y+drag.h/2;
      if(cx>=s.x&&cx<=s.x+s.w&&cy>=s.y&&cy<=s.y+s.h&&s.filled<0){
        s.filled=drag.id; drag.placed=true; dropped=true; break;
      }
    }
    if(!dropped){drag.placed=false;drag.x=drag.ox;drag.y=drag.oy;}
    drag=null;
  }
  canvas.addEventListener('mousedown',onDown);
  canvas.addEventListener('mousemove',onMove);
  canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:true});
  canvas.addEventListener('touchmove',e=>{onMove(e.touches[0]);e.preventDefault();},{passive:false});
  canvas.addEventListener('touchend',onUp);

  function loop(){
    if(isOver) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    draw(); animId=requestAnimationFrame(loop);
  }
  function end(){
    isOver=true; clearInterval(timerInterval); cancelAnimationFrame(animId);
    score=localScore; finishMission(Math.min(100,~~((localScore/(puzzleSet.length*40))*100)),0);
  }
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); loadPuzzle(); loop();
}

/* ================================================================
   END OF GAME ENGINE v5.0  |  ShikshaSetu  |  Zero MCQs
   
   ALL GRADES — REAL INTERACTIVE GAMES:
   ──────────────────────────────────────
   Grade 6-7  Physics:   Catch the correct falling block (Arcade)
   Grade 8-9  Physics:   Cannon shooter → correct target bubble
   Grade 10+  Physics:   PARTICLE COLLIDER — tap the correct orbiting particle

   Grade 6-7  Chemistry: Drag & drop potion brewer
   Grade 8-9  Chemistry: PERIODIC TABLE SPY HEIST — move cursor without spotlight
   Grade 10+  Chemistry: MOLECULE FORGE — drag functional groups to skeleton

   Grade 6-7  Biology:   WBC antibody shooter
   Grade 8-9  Biology:   DNA HELIX BUILDER — catch correct base pair
   Grade 10+  Biology:   ECOSYSTEM ARCHITECT — drag organisms to trophic layers

   Grade 6-7  Maths:     Ninja slice the correct bubble
   Grade 8    Maths:     LASER GEOMETRY — rotate laser, fire at correct answer
   Grade 9    Maths:     QUADRATIC CANNON — set power, hit root targets
   Grade 10   Maths:     MATRIX MISSION CONTROL — lock crosshair on correct panel
   Grade 11+  Maths:     CALCULUS COASTER — drag slider to correct answer, open gate

   Grade 7-8  Python:    Drag keyword tile into blank (not click)
   Grade 9-10 Python:    Drag fix tile onto buggy line
   Grade 11+  Python:    Drag code blocks into correct order
================================================================ */

/* ================================================================
   NEW GAMES SECTION — v6.0
   15 brand-new games across Physics, Chemistry, Biology,
   Maths, Python, Java, HTML
================================================================ */


/* ═══════════════════════════════════════════════════════════════
   1. PHYSICS CIRCUIT BUILDER — Grade 8
   Drag components (battery, wire, resistors, bulb) onto a grid.
   Connect them to form a complete circuit. Animated current flows
   when correct. Questions about Ohm's Law, series/parallel.
═══════════════════════════════════════════════════════════════ */
function physicsCircuit(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const PUZZLES = [
    { q:"Complete a series circuit: Battery → R1=3Ω → R2=5Ω → Bulb",
      answer:"series", totalR:8, fact:"Series: R_total = R1+R2 = 8Ω, I = V/R" },
    { q:"Connect parallel resistors: R1=6Ω ∥ R2=6Ω. Total R=?",
      answer:"parallel", totalR:3, fact:"Parallel: 1/R = 1/6+1/6 → R=3Ω" },
    { q:"Ohm's Law: V=12V, R=4Ω. Build circuit, find I",
      answer:"ohm", totalR:4, fact:"I = V/R = 12/4 = 3A" },
    { q:"Power circuit: P=W/t. Connect Battery+Bulb+Switch",
      answer:"power", totalR:2, fact:"P=IV=I²R. Watts measure power consumed." },
  ];

  const GRID = 5, CW = Math.floor((canvas.width-60)/GRID), CH = 70;
  const GX = 30, GY = 120;

  const COMPS = [
    { id:"battery",  icon:"🔋", label:"Battery",    col:"#FFD700" },
    { id:"wire",     icon:"━",  label:"Wire",       col:"#aaa" },
    { id:"resistor", icon:"⬛", label:"Resistor",   col:"#FF8C00" },
    { id:"bulb",     icon:"💡", label:"Bulb",       col:"#00F5A0" },
    { id:"switch",   icon:"🔘", label:"Switch",     col:"#00C3FF" },
  ];

  let localScore=0, lives=3, gameTime=95, isOver=false, animId;
  let qIdx=0, currentP=null;
  let cells=[], drag=null, dox=0, doy=0;
  let currentFlow=0, sparks=[], success=false, successTimer=0;

  function loadPuzzle() {
    if(qIdx>=PUZZLES.length){end();return;}
    currentP = PUZZLES[qIdx]; qIdx++;
    cells = [];
    for(let r=0;r<2;r++) for(let c=0;c<GRID;c++) cells.push({r,c,comp:null});
    success=false; drag=null;
  }

  // Check if circuit is complete (battery + bulb + at least 2 wire/resistor connecting them)
  function checkCircuit() {
    const hasBattery = cells.some(c=>c.comp==='battery');
    const hasBulb    = cells.some(c=>c.comp==='bulb');
    const wires      = cells.filter(c=>c.comp==='wire'||c.comp==='resistor').length;
    return hasBattery && hasBulb && wires >= 2;
  }

  function spawnSparks(x,y,col) {
    for(let i=0;i<16;i++) sparks.push({x,y,vx:(Math.random()-.5)*8,vy:(Math.random()-.5)*8,life:1,col,r:3});
  }

  function draw() {
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#040810'); bg.addColorStop(1,'#080418');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Grid */
    cells.forEach(cell=>{
      const x=GX+cell.c*CW, y=GY+cell.r*CH;
      const comp = COMPS.find(c=>c.id===cell.comp);
      ctx.save();
      ctx.fillStyle = comp ? comp.col+'22' : 'rgba(255,255,255,0.04)';
      ctx.strokeStyle= comp ? comp.col : 'rgba(255,255,255,0.12)';
      ctx.lineWidth=comp?2:1;
      if(comp){ctx.shadowBlur=12;ctx.shadowColor=comp.col;}
      ctx.beginPath(); ctx.roundRect(x+4,y+4,CW-8,CH-8,8); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      if(comp){
        ctx.font='22px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(comp.icon,x+CW/2,y+CH/2-6);
        ctx.font='bold 8px Outfit'; ctx.fillStyle=comp.col;
        ctx.fillText(comp.label,x+CW/2,y+CH/2+12);
      } else {
        ctx.font='9px Outfit'; ctx.fillStyle='rgba(255,255,255,0.2)';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('drop here',x+CW/2,y+CH/2);
      }
      ctx.restore();

      /* Circuit wire lines between adjacent cells */
      if(cell.comp&&cell.c<GRID-1){
        const nc=cells.find(c=>c.r===cell.r&&c.c===cell.c+1);
        if(nc&&nc.comp){
          const lc=COMPS.find(c=>c.id===cell.comp);
          ctx.save(); ctx.strokeStyle=lc?lc.col:'#aaa'; ctx.lineWidth=2.5;
          if(success){ctx.shadowBlur=10;ctx.shadowColor='#FFD700';}
          ctx.beginPath(); ctx.moveTo(x+CW-4,y+CH/2); ctx.lineTo(x+CW+4,y+CH/2); ctx.stroke();
          ctx.restore();
        }
      }
    });

    /* Current flow animation when circuit complete */
    if(success) {
      successTimer++;
      const flowX = GX + ((successTimer*2)%(GRID*CW));
      ctx.save(); ctx.fillStyle='#FFD700'; ctx.shadowBlur=16; ctx.shadowColor='#FFD700';
      ctx.beginPath(); ctx.arc(flowX, GY+CH/2, 5, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    /* Component palette at bottom */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,canvas.height-80,canvas.width,80);
    ctx.strokeStyle='rgba(0,195,255,0.2)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,canvas.height-80); ctx.lineTo(canvas.width,canvas.height-80); ctx.stroke();
    ctx.font='9px Outfit'; ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.textAlign='center';
    ctx.fillText('← Drag components to grid above →',canvas.width/2,canvas.height-68);
    ctx.restore();

    const pw=56, ph=52, gap=(canvas.width-COMPS.length*(pw+8))/2;
    COMPS.forEach((comp,i)=>{
      if(drag&&drag.id===comp.id&&drag.fromPalette) return;
      const px=gap+i*(pw+8), py=canvas.height-56;
      ctx.save();
      ctx.fillStyle=comp.col+'22'; ctx.strokeStyle=comp.col; ctx.lineWidth=1.5;
      ctx.shadowBlur=8; ctx.shadowColor=comp.col;
      ctx.beginPath(); ctx.roundRect(px,py,pw,ph,8); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.font='20px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(comp.icon,px+pw/2,py+ph/2-6);
      ctx.font='bold 7px Outfit'; ctx.fillStyle=comp.col;
      ctx.fillText(comp.label,px+pw/2,py+ph/2+10);
      ctx.restore();
    });

    /* Dragged comp */
    if(drag){
      const comp=COMPS.find(c=>c.id===drag.id);
      if(comp){
        ctx.save(); ctx.globalAlpha=0.8;
        ctx.fillStyle=comp.col+'44'; ctx.strokeStyle=comp.col; ctx.lineWidth=2;
        ctx.shadowBlur=18; ctx.shadowColor=comp.col;
        ctx.beginPath(); ctx.roundRect(drag.x-28,drag.y-26,56,52,8); ctx.fill(); ctx.stroke();
        ctx.font='22px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(comp.icon,drag.x,drag.y-6);
        ctx.font='bold 7px Outfit'; ctx.fillStyle=comp.col; ctx.shadowBlur=0;
        ctx.fillText(comp.label,drag.x,drag.y+14);
        ctx.restore();
      }
    }

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Q panel */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.strokeStyle='rgba(0,195,255,0.3)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(10,8,canvas.width-20,48,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#00C3FF'; ctx.textAlign='center';
    ctx.fillText('⚡ '+currentP.q, canvas.width/2, 38); ctx.restore();

    /* Check button */
    ctx.save();
    ctx.fillStyle='rgba(0,245,160,0.15)'; ctx.strokeStyle='#00F5A0'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(canvas.width/2-70,GY+CH*2+16,140,32,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#00F5A0';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('⚡ CHECK CIRCUIT',canvas.width/2,GY+CH*2+32); ctx.restore();

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-4);
    ctx.font='bold 10px Outfit'; ctx.fillStyle='rgba(0,195,255,0.5)'; ctx.textAlign='right';
    ctx.fillText('Grade '+g+' Physics',canvas.width-10,canvas.height-4);
  }

  function tryCheck(){
    if(checkCircuit()){
      success=true;
      localScore+=30; score=localScore; updateHUD(localScore);
      cells.forEach(c=>{
        if(c.comp){const comp=COMPS.find(x=>x.id===c.comp); spawnSparks(GX+c.c*CW+CW/2,GY+c.r*CH+CH/2,comp.col);}
      });
      showFloatingText('⚡ Circuit Complete! +30',canvas.width/2,GY-20,'#FFD700');
      showFloatingText('💡 '+currentP.fact,canvas.width/2,GY-40,'#00C3FF');
      updateProgress(Math.min(100,~~((qIdx/PUZZLES.length)*100)));
      setTimeout(loadPuzzle,1600);
    } else {
      lives--; updateHealth(Math.max(0,(lives/3)*100)); shakeCanvas(canvas);
      showFloatingText('Circuit incomplete!',canvas.width/2,GY-20,'#FF2D9B');
    }
  }

  function onDown(e){
    const {x,y}=gpos(canvas,e);
    /* Check button */
    if(x>=canvas.width/2-70&&x<=canvas.width/2+70&&y>=GY+CH*2+16&&y<=GY+CH*2+48){tryCheck();return;}
    /* Grab from palette */
    const pw=56,ph=52,gap=(canvas.width-COMPS.length*(pw+8))/2;
    COMPS.forEach((comp,i)=>{
      const px=gap+i*(pw+8),py=canvas.height-56;
      if(x>=px&&x<=px+pw&&y>=py&&y<=py+ph){ drag={id:comp.id,x,y,fromPalette:true}; dox=x-px; doy=y-py; }
    });
    /* Pick from grid */
    cells.forEach(cell=>{
      const cx=GX+cell.c*CW,cy=GY+cell.r*CH;
      if(cell.comp&&x>=cx&&x<=cx+CW&&y>=cy&&y<=cy+CH){ drag={id:cell.comp,x,y,fromCell:cell}; cell.comp=null; dox=0; doy=0; }
    });
  }
  function onMove(e){ if(!drag) return; const {x,y}=gpos(canvas,e); drag.x=x; drag.y=y; }
  function onUp(e){
    if(!drag) return;
    const {x,y}=gpos(canvas,e);
    let dropped=false;
    cells.forEach(cell=>{
      const cx=GX+cell.c*CW,cy=GY+cell.r*CH;
      if(x>=cx&&x<=cx+CW&&y>=cy&&y<=cy+CH&&!cell.comp){ cell.comp=drag.id; dropped=true; }
    });
    if(!dropped && drag.fromCell) drag.fromCell.comp=drag.id;
    drag=null;
  }
  canvas.addEventListener('mousedown',onDown); canvas.addEventListener('mousemove',onMove); canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:true}); canvas.addEventListener('touchmove',e=>{onMove(e.touches[0]);e.preventDefault();},{passive:false}); canvas.addEventListener('touchend',e=>onUp(e.changedTouches[0]));

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/(PUZZLES.length*30))*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); loadPuzzle(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   2. PHYSICS WAVE OSCILLOSCOPE — Grade 10
   Live oscilloscope. Questions ask you to set frequency,
   amplitude, or wavelength using three sliders. Match target wave.
═══════════════════════════════════════════════════════════════ */
function physicsWave(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const TASKS = [
    { q:"Set frequency to 2 Hz (2 full waves visible)",  target:{freq:2,amp:60,phase:0}, check:'freq', fact:"f=2Hz means 2 complete cycles per second" },
    { q:"Set amplitude to MAX (tallest wave)",           target:{freq:1,amp:90,phase:0}, check:'amp',  fact:"Amplitude = max displacement from equilibrium" },
    { q:"Match wavelength: 4 complete waves",            target:{freq:4,amp:50,phase:0}, check:'freq', fact:"Wavelength λ = v/f; more freq = shorter wavelength" },
    { q:"Low frequency: set to 0.5 Hz (half wave)",     target:{freq:0.5,amp:55,phase:0},check:'freq', fact:"Low frequency = long wavelength (slow oscillation)" },
    { q:"Set amplitude to MIN (flattest wave)",          target:{freq:2,amp:15,phase:0}, check:'amp',  fact:"Very low amplitude = low energy wave" },
    { q:"Match: freq=3 Hz, amplitude=70",               target:{freq:3,amp:70,phase:0}, check:'both', fact:"v = f × λ; higher freq = more energy" },
  ];

  let localScore=0,lives=3,gameTime=100,isOver=false,animId;
  let qIdx=0,currentT=null,answered=false;
  let freq=1,amp=50,phase=0,dragSlider=null;
  let t=0,sparks=[];

  const SX=60, SW=canvas.width-120, SY1=canvas.height-115, SY2=canvas.height-80;
  const SLIDERS=[
    {label:'FREQUENCY',min:0.5,max:5,val:()=>freq,set:v=>{freq=v;},y:SY1,col:'#00C3FF'},
    {label:'AMPLITUDE',min:10, max:90,val:()=>amp, set:v=>{amp=v; },y:SY2,col:'#FFD700'},
  ];

  function nextQ(){
    if(qIdx>=TASKS.length){end();return;}
    currentT=TASKS[qIdx]; qIdx++; freq=1; amp=50; answered=false;
  }

  function spawnSparks(x,y,col){
    for(let i=0;i<18;i++) sparks.push({x,y,vx:(Math.random()-.5)*9,vy:(Math.random()-.5)*9,life:1,col,r:3});
  }

  function checkAnswer(){
    if(answered||!currentT) return;
    const tol=0.6;
    let ok=false;
    if(currentT.check==='freq') ok=Math.abs(freq-currentT.target.freq)<=tol;
    else if(currentT.check==='amp') ok=Math.abs(amp-currentT.target.amp)<=15;
    else ok=Math.abs(freq-currentT.target.freq)<=tol&&Math.abs(amp-currentT.target.amp)<=15;
    if(ok){
      answered=true; localScore+=25; score=localScore; updateHUD(localScore);
      spawnSparks(canvas.width/2,canvas.height/2,'#00F5A0');
      showFloatingText('🔊 Match! +25',canvas.width/2,80,'#00F5A0');
      showFloatingText('💡 '+currentT.fact,canvas.width/2,100,'#00C3FF');
      updateProgress(Math.min(100,~~((qIdx/TASKS.length)*100)));
      setTimeout(nextQ,1400);
    } else {
      lives--; updateHealth(Math.max(0,(lives/3)*100)); shakeCanvas(canvas);
      showFloatingText('Not matching! Adjust sliders',canvas.width/2,80,'#FF2D9B');
    }
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#030f18'); bg.addColorStop(1,'#040c14');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Oscilloscope screen */
    const OX=20,OY=52,OW=canvas.width-40,OH=canvas.height-180;
    ctx.save();
    ctx.fillStyle='rgba(0,20,10,0.85)'; ctx.strokeStyle='rgba(0,245,160,0.3)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(OX,OY,OW,OH,8); ctx.fill(); ctx.stroke();
    /* CRT grid */
    ctx.strokeStyle='rgba(0,245,160,0.08)'; ctx.lineWidth=0.5;
    for(let gx=OX;gx<=OX+OW;gx+=OW/8){ctx.beginPath();ctx.moveTo(gx,OY);ctx.lineTo(gx,OY+OH);ctx.stroke();}
    for(let gy=OY;gy<=OY+OH;gy+=OH/4){ctx.beginPath();ctx.moveTo(OX,gy);ctx.lineTo(OX+OW,gy);ctx.stroke();}
    /* Centre line */
    ctx.strokeStyle='rgba(0,245,160,0.2)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(OX,OY+OH/2); ctx.lineTo(OX+OW,OY+OH/2); ctx.stroke();
    ctx.restore();

    /* Live wave - USER wave */
    t+=0.04;
    ctx.save(); ctx.strokeStyle='#00F5A0'; ctx.lineWidth=2.5; ctx.shadowBlur=8; ctx.shadowColor='#00F5A0';
    ctx.beginPath();
    for(let i=0;i<=OW;i++){
      const wx=OX+i;
      const wy=OY+OH/2 - amp*Math.sin(2*Math.PI*freq*(i/OW)+t);
      if(i===0) ctx.moveTo(wx,wy); else ctx.lineTo(wx,wy);
    }
    ctx.stroke(); ctx.restore();

    /* Target wave (dashed) */
    if(currentT){
      ctx.save(); ctx.strokeStyle='rgba(255,215,0,0.5)'; ctx.lineWidth=1.5; ctx.setLineDash([6,5]);
      ctx.shadowBlur=4; ctx.shadowColor='#FFD700';
      ctx.beginPath();
      for(let i=0;i<=OW;i++){
        const wx=OX+i;
        const wy=OY+OH/2-currentT.target.amp*Math.sin(2*Math.PI*currentT.target.freq*(i/OW));
        if(i===0) ctx.moveTo(wx,wy); else ctx.lineTo(wx,wy);
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }

    /* Legend */
    ctx.font='9px Outfit'; ctx.textAlign='left';
    ctx.fillStyle='#00F5A0'; ctx.fillText('— Your wave',OX+8,OY+14);
    ctx.fillStyle='#FFD700'; ctx.fillText('- - Target wave',OX+8,OY+26);

    /* Sliders */
    SLIDERS.forEach(sl=>{
      const frac=(sl.val()-sl.min)/(sl.max-sl.min);
      ctx.save();
      /* Track */
      ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.roundRect(SX,sl.y,SW,16,8); ctx.fill(); ctx.stroke();
      /* Fill */
      const fg=ctx.createLinearGradient(SX,0,SX+SW,0);
      fg.addColorStop(0,sl.col); fg.addColorStop(1,sl.col+'88');
      ctx.fillStyle=fg; ctx.beginPath(); ctx.roundRect(SX,sl.y,frac*SW,16,8); ctx.fill();
      /* Thumb */
      const tx=SX+frac*SW;
      ctx.fillStyle='#fff'; ctx.shadowBlur=10; ctx.shadowColor=sl.col;
      ctx.beginPath(); ctx.arc(tx,sl.y+8,10,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
      ctx.font='bold 9px Outfit'; ctx.fillStyle='#000'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(sl.val().toFixed(1),tx,sl.y+8);
      /* Label */
      ctx.font='bold 9px Outfit'; ctx.fillStyle=sl.col; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      ctx.fillText(sl.label+': '+sl.val().toFixed(1),SX,sl.y-4);
      ctx.restore();
    });

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Check button */
    ctx.save();
    ctx.fillStyle='rgba(0,245,160,0.12)'; ctx.strokeStyle='#00F5A0'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(canvas.width-120,canvas.height-140,110,30,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 11px Outfit'; ctx.fillStyle='#00F5A0'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('✓ MATCH',canvas.width-65,canvas.height-125); ctx.restore();

    /* Q */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.strokeStyle='rgba(0,195,255,0.3)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(10,6,canvas.width-20,42,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#00C3FF'; ctx.textAlign='center';
    ctx.fillText('📡 '+(currentT?currentT.q:''),canvas.width/2,31); ctx.restore();

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-4);
  }

  function onDown(e){
    const {x,y}=gpos(canvas,e);
    if(x>=canvas.width-120&&x<=canvas.width-10&&y>=canvas.height-140&&y<=canvas.height-110){checkAnswer();return;}
    SLIDERS.forEach((sl,i)=>{
      if(y>=sl.y-10&&y<=sl.y+26&&x>=SX-10&&x<=SX+SW+10){ dragSlider=i; }
    });
  }
  function onMove(e){
    if(dragSlider===null) return;
    const {x}=gpos(canvas,e);
    const sl=SLIDERS[dragSlider];
    const frac=Math.max(0,Math.min(1,(x-SX)/SW));
    sl.set(sl.min+(sl.max-sl.min)*frac);
  }
  function onUp(){ dragSlider=null; }
  canvas.addEventListener('mousedown',onDown); canvas.addEventListener('mousemove',onMove); canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:true}); canvas.addEventListener('touchmove',e=>{onMove(e.touches[0]);e.preventDefault();},{passive:false}); canvas.addEventListener('touchend',onUp);

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/(TASKS.length*25))*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); nextQ(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   3. CHEMISTRY TITRATION SIMULATOR — Grade 10
   Control drip speed slider. pH meter animates in real time.
   Stop exactly at pH 7 (equivalence point) before overflow!
═══════════════════════════════════════════════════════════════ */
function chemTitration(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const ROUNDS = [
    { acid:"HCl",  base:"NaOH",  startpH:2, fact:"Strong acid + strong base: sharp equivalence at pH 7" },
    { acid:"CH₃COOH",base:"NaOH",startpH:3, fact:"Weak acid + strong base: equivalence slightly above pH 7" },
    { acid:"HNO₃", base:"KOH",   startpH:2, fact:"HNO₃ + KOH → KNO₃ + H₂O, pH 7 at equivalence" },
  ];

  let localScore=0,lives=3,gameTime=90,isOver=false,animId;
  let rIdx=0,currentR=null,pH=2,volume=0,dripping=false,dripRate=0,overflow=false,done=false;
  let drops=[],sparks=[];

  function nextRound(){
    if(rIdx>=ROUNDS.length){end();return;}
    currentR=ROUNDS[rIdx]; rIdx++;
    pH=currentR.startpH; volume=0; dripping=false; dripRate=0.5;
    overflow=false; done=false; drops=[];
  }

  function getPHColor(ph){
    if(ph<4) return '#FF2D9B';
    if(ph<6.5) return '#FF8C00';
    if(ph<7.5) return '#00F5A0';
    if(ph<9) return '#00C3FF';
    return '#6C63FF';
  }

  function spawnSparks(x,y,col){
    for(let i=0;i<20;i++) sparks.push({x,y,vx:(Math.random()-.5)*8,vy:(Math.random()-.5)*8,life:1,col,r:3});
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#060010'); bg.addColorStop(1,'#0a0520');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Burette (top centre) */
    const BX=canvas.width/2-16, BY=30, BW=32, BH=100;
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.rect(BX,BY,BW,BH); ctx.stroke();
    /* Liquid in burette */
    const fillH=BH-volume*0.8;
    ctx.fillStyle='rgba(0,195,255,0.5)';
    ctx.fillRect(BX+2,BY+fillH,BW-4,BH-fillH);
    /* Tip */
    ctx.beginPath(); ctx.moveTo(BX+BW/2-4,BY+BH); ctx.lineTo(BX+BW/2+4,BY+BH); ctx.lineTo(BX+BW/2,BY+BH+14); ctx.closePath(); ctx.stroke();
    ctx.restore();

    /* Flask */
    const FX=canvas.width/2-50, FY=170, FW=100, FH=110;
    ctx.save();
    /* Flask liquid */
    const phCol=getPHColor(pH);
    ctx.fillStyle=phCol+'44';
    ctx.beginPath(); ctx.moveTo(FX+10,FY+FH); ctx.lineTo(FX+FW-10,FY+FH);
    ctx.quadraticCurveTo(FX+FW+10,FY+FH-20,FX+FW-20,FY+20); ctx.lineTo(FX+20,FY+20);
    ctx.quadraticCurveTo(FX-10,FY+FH-20,FX+10,FY+FH); ctx.closePath(); ctx.fill();
    /* Flask outline */
    ctx.strokeStyle=phCol; ctx.lineWidth=2; ctx.shadowBlur=12; ctx.shadowColor=phCol;
    ctx.beginPath(); ctx.moveTo(FX+20,FY); ctx.lineTo(FX+80,FY);
    ctx.quadraticCurveTo(FX+FW+10,FY+FH-10,FX+FW-10,FY+FH); ctx.lineTo(FX+10,FY+FH);
    ctx.quadraticCurveTo(FX-10,FY+FH-10,FX+20,FY); ctx.stroke(); ctx.shadowBlur=0;
    ctx.restore();

    /* pH meter */
    const PMX=canvas.width-130, PMY=130;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.strokeStyle=getPHColor(pH); ctx.lineWidth=2;
    ctx.shadowBlur=16; ctx.shadowColor=getPHColor(pH);
    ctx.beginPath(); ctx.roundRect(PMX,PMY,110,70,10); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
    ctx.font='bold 11px Outfit'; ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.textAlign='center';
    ctx.fillText('pH METER',PMX+55,PMY+16);
    ctx.font='bold 32px "Courier New"'; ctx.fillStyle=getPHColor(pH);
    ctx.shadowBlur=8; ctx.shadowColor=getPHColor(pH);
    ctx.fillText(pH.toFixed(1),PMX+55,PMY+52); ctx.shadowBlur=0;
    /* Target indicator */
    ctx.font='9px Outfit'; ctx.fillStyle=Math.abs(pH-7)<0.2?'#00F5A0':'rgba(255,255,255,0.3)';
    ctx.fillText(Math.abs(pH-7)<0.2?'✓ EQUIVALENCE!':'Target: pH 7.0',PMX+55,PMY+65); ctx.restore();

    /* pH scale bar */
    const PBX=20,PBY=FY+FH+20,PBW=canvas.width-160,PBH=18;
    const phGrad=ctx.createLinearGradient(PBX,0,PBX+PBW,0);
    phGrad.addColorStop(0,'#FF2D9B'); phGrad.addColorStop(0.3,'#FF8C00');
    phGrad.addColorStop(0.5,'#00F5A0'); phGrad.addColorStop(0.7,'#00C3FF');
    phGrad.addColorStop(1,'#6C63FF');
    ctx.save();
    ctx.fillStyle=phGrad; ctx.beginPath(); ctx.roundRect(PBX,PBY,PBW,PBH,4); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.stroke();
    const phX=PBX+(pH/14)*PBW;
    ctx.fillStyle='#fff'; ctx.shadowBlur=8; ctx.shadowColor='#fff';
    ctx.beginPath(); ctx.arc(phX,PBY+PBH/2,8,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.font='bold 9px Outfit'; ctx.fillStyle='#000'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(pH.toFixed(1),phX,PBY+PBH/2); ctx.restore();

    /* Drip rate slider */
    const DSX=20,DSY=FY+FH+52,DSW=canvas.width-160;
    ctx.save();
    ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.strokeStyle='rgba(0,195,255,0.3)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(DSX,DSY,DSW,16,8); ctx.fill(); ctx.stroke();
    const dfrac=((dripRate-0.1)/(3-0.1));
    const dg=ctx.createLinearGradient(DSX,0,DSX+DSW,0);
    dg.addColorStop(0,'#00C3FF'); dg.addColorStop(1,'#FF2D9B');
    ctx.fillStyle=dg; ctx.beginPath(); ctx.roundRect(DSX,DSY,dfrac*DSW,16,8); ctx.fill();
    const dtx=DSX+dfrac*DSW;
    ctx.fillStyle='#fff'; ctx.shadowBlur=8; ctx.shadowColor='#00C3FF';
    ctx.beginPath(); ctx.arc(dtx,DSY+8,10,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    ctx.font='bold 8px Outfit'; ctx.fillStyle='#000'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(dripRate.toFixed(1),dtx,DSY+8);
    ctx.font='9px Outfit'; ctx.fillStyle='rgba(0,195,255,0.7)'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    ctx.fillText('DRIP RATE: '+dripRate.toFixed(1)+' mL/s ← drag',DSX,DSY-4); ctx.restore();

    /* Drip animation */
    if(dripping&&!overflow&&!done){
      drops.push({x:canvas.width/2,y:BY+BH+14,vy:3+dripRate,r:4,life:1});
    }
    for(let i=drops.length-1;i>=0;i--){
      const d=drops[i]; d.y+=d.vy; d.life-=0.04;
      if(d.y>FY+10){drops.splice(i,1);continue;}
      ctx.save(); ctx.fillStyle='rgba(0,195,255,0.8)'; ctx.shadowBlur=4; ctx.shadowColor='#00C3FF';
      ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Overflow warning */
    if(overflow){
      ctx.save(); ctx.globalAlpha=0.4; ctx.fillStyle='#FF2D9B';
      ctx.fillRect(0,0,canvas.width,canvas.height); ctx.restore();
    }

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.025;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Buttons */
    const btnY=canvas.height-50;
    /* Start/Stop drip */
    ctx.save();
    ctx.fillStyle=dripping?'rgba(255,45,155,0.15)':'rgba(0,245,160,0.15)';
    ctx.strokeStyle=dripping?'#FF2D9B':'#00F5A0'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(20,btnY,120,32,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 11px Outfit'; ctx.fillStyle=dripping?'#FF2D9B':'#00F5A0';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(dripping?'⏹ STOP DRIP':'▶ START DRIP',80,btnY+16); ctx.restore();

    /* Q banner */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.strokeStyle='rgba(255,215,0,0.3)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(10,6,canvas.width-20,42,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 11px Outfit'; ctx.fillStyle='#FFD700'; ctx.textAlign='center';
    if(currentR) ctx.fillText('⚗️ Titrate: '+currentR.acid+' with '+currentR.base+' — stop at pH 7!',canvas.width/2,32); ctx.restore();

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-4);
  }

  function update(){
    if(!dripping||done||overflow) return;
    volume=Math.min(100,volume+dripRate*0.05);
    // pH changes from acid toward 7, then toward base
    const speed=dripRate*0.008;
    if(pH<7) pH=Math.min(7.02,pH+speed);
    else if(pH>7) pH=Math.max(6.98,pH-speed);
    // Check equivalence
    if(Math.abs(pH-7)<0.25&&!done){
      done=true; dripping=false;
      localScore+=30; score=localScore; updateHUD(localScore);
      spawnSparks(canvas.width/2,200,'#00F5A0');
      showFloatingText('🧪 Equivalence reached! +30',canvas.width/2,150,'#00F5A0');
      showFloatingText('💡 '+currentR.fact,canvas.width/2,170,'#00C3FF');
      updateProgress(Math.min(100,~~((rIdx/ROUNDS.length)*100)));
      setTimeout(nextRound,1800);
    }
    // Overflow check
    if(volume>=100&&!done){
      overflow=true; dripping=false; lives--;
      updateHealth(Math.max(0,(lives/3)*100)); shakeCanvas(canvas);
      showFloatingText('💥 OVERFLOW! Too much acid!',canvas.width/2,200,'#FF2D9B');
      pH=currentR.startpH; volume=0; overflow=false;
    }
  }

  let dragSlider=false;
  function onDown(e){
    const {x,y}=gpos(canvas,e);
    if(x>=20&&x<=140&&y>=canvas.height-50&&y<=canvas.height-18){ dripping=!dripping; }
    const DSX=20,DSY=canvas.height-220+80,DSW=canvas.width-160;
    /* Drip slider Y is dynamic — estimate */
    const actualDSY=170+110+52;
    if(y>=actualDSY-12&&y<=actualDSY+28&&x>=DSX-10&&x<=DSX+DSW+10) dragSlider=true;
  }
  function onMove(e){
    if(!dragSlider) return;
    const {x}=gpos(canvas,e);
    const DSX=20,DSW=canvas.width-160;
    const frac=Math.max(0,Math.min(1,(x-DSX)/DSW));
    dripRate=0.1+(3-0.1)*frac;
  }
  function onUp(){ dragSlider=false; }
  canvas.addEventListener('mousedown',onDown); canvas.addEventListener('mousemove',onMove); canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:true}); canvas.addEventListener('touchmove',e=>{onMove(e.touches[0]);e.preventDefault();},{passive:false}); canvas.addEventListener('touchend',onUp);

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();update();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/(ROUNDS.length*30))*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); nextRound(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   4. BIOLOGY MEMBRANE GATE — Grade 9
   Molecules approach the membrane. ALLOW or BLOCK each one
   based on diffusion/osmosis rules. Speed increases each wave.
═══════════════════════════════════════════════════════════════ */
function bioMembrane(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const MOLECULES = [
    { name:'O₂',      icon:'O₂',  pass:true,  col:'#00C3FF', fact:'O₂ is small & nonpolar → passes by simple diffusion' },
    { name:'CO₂',     icon:'CO₂', pass:true,  col:'#00F5A0', fact:'CO₂ is small & nonpolar → diffuses freely across membrane' },
    { name:'H₂O',     icon:'H₂O', pass:true,  col:'#4da6ff', fact:'H₂O passes via osmosis through aquaporin channels' },
    { name:'Glucose', icon:'C₆H₁₂O₆',pass:false,col:'#FFD700',fact:'Glucose is large & polar → needs a transport protein' },
    { name:'Na⁺',     icon:'Na⁺', pass:false, col:'#FF8C00', fact:'Ions like Na⁺ need ion channels — cannot diffuse freely' },
    { name:'Cl⁻',     icon:'Cl⁻', pass:false, col:'#FF6450', fact:'Cl⁻ is charged → requires active transport or channels' },
    { name:'Protein', icon:'PRO', pass:false, col:'#E050FF', fact:'Large proteins cannot cross the membrane without vesicles' },
    { name:'Urea',    icon:'NH₂CO',pass:true, col:'#7CFC00', fact:'Urea is small & uncharged → can diffuse across membrane' },
    { name:'K⁺',      icon:'K⁺',  pass:false, col:'#FF2D9B', fact:'K⁺ uses potassium channels — not free diffusion' },
    { name:'Lipid',   icon:'FAT', pass:true,  col:'#c8a050', fact:'Lipid-soluble molecules dissolve in membrane bilayer' },
  ];

  let localScore=0,lives=3,gameTime=90,isOver=false,animId;
  let wave=1,score2=0,mols=[],particles=[],blocked=[],allowed=[];
  let speed=1.5;

  function spawnMol(){
    const m=MOLECULES[~~(Math.random()*MOLECULES.length)];
    mols.push({...m, x:-40, y:50+Math.random()*(canvas.height-160), vy:(Math.random()-.5)*0.5, size:22, decided:false, result:null, resultTimer:0 });
  }

  function spawnP(x,y,col){
    for(let i=0;i<14;i++) particles.push({x,y,vx:(Math.random()-.5)*7,vy:(Math.random()-.5)*7,life:1,col,r:3});
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,canvas.width,0);
    bg.addColorStop(0,'#001020'); bg.addColorStop(0.45,'#001a10'); bg.addColorStop(0.55,'#0a1020'); bg.addColorStop(1,'#050820');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Cell membrane */
    const MX=canvas.width*0.55;
    ctx.save();
    ctx.strokeStyle='rgba(0,245,160,0.6)'; ctx.lineWidth=12;
    ctx.shadowBlur=20; ctx.shadowColor='#00F5A0';
    ctx.beginPath(); ctx.moveTo(MX,30); ctx.lineTo(MX,canvas.height-30); ctx.stroke();
    ctx.shadowBlur=0;
    /* Phospholipid heads */
    for(let y2=40;y2<canvas.height-40;y2+=22){
      ctx.fillStyle='rgba(0,245,160,0.3)';
      ctx.beginPath(); ctx.arc(MX-7,y2,4,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(MX+7,y2,4,0,Math.PI*2); ctx.fill();
    }
    ctx.font='bold 10px Outfit'; ctx.fillStyle='rgba(0,245,160,0.6)';
    ctx.textAlign='center'; ctx.save(); ctx.translate(MX,canvas.height/2); ctx.rotate(-Math.PI/2);
    ctx.fillText('CELL MEMBRANE',0,0); ctx.restore(); ctx.restore();

    /* Side labels */
    ctx.font='bold 10px Outfit'; ctx.fillStyle='rgba(0,195,255,0.5)'; ctx.textAlign='center';
    ctx.fillText('OUTSIDE CELL',MX*0.4,20);
    ctx.fillText('INSIDE CELL',MX+(canvas.width-MX)*0.5,20);

    /* Molecules */
    mols.forEach(m=>{
      m.y+=m.vy;
      if(m.y<30||m.y>canvas.height-30) m.vy*=-1;
      if(!m.decided) m.x+=speed;

      ctx.save();
      ctx.shadowBlur=14; ctx.shadowColor=m.col;
      ctx.fillStyle=m.col+'44'; ctx.strokeStyle=m.col; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(m.x,m.y,m.size,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.font='bold 9px Outfit'; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(m.icon,m.x,m.y);
      ctx.restore();

      /* Result flash */
      if(m.result){
        m.resultTimer--;
        ctx.save(); ctx.globalAlpha=Math.min(1,m.resultTimer/20);
        ctx.font='bold 13px Outfit'; ctx.fillStyle=m.result==='ok'?'#00F5A0':'#FF2D9B';
        ctx.textAlign='center'; ctx.fillText(m.result==='ok'?'✓':'✗',m.x,m.y-30); ctx.restore();
      }
    });

    /* Particles */
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.life-=0.03;
      if(p.life<=0){particles.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=p.life; ctx.fillStyle=p.col;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* ALLOW / BLOCK buttons */
    const btnW=130, btnH=46, btnY=canvas.height-60;
    ctx.save();
    ctx.fillStyle='rgba(0,245,160,0.15)'; ctx.strokeStyle='#00F5A0'; ctx.lineWidth=2;
    ctx.shadowBlur=12; ctx.shadowColor='#00F5A0';
    ctx.beginPath(); ctx.roundRect(20,btnY,btnW,btnH,10); ctx.fill(); ctx.stroke();
    ctx.shadowBlur=0; ctx.font='bold 14px Outfit'; ctx.fillStyle='#00F5A0';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('✅ ALLOW',20+btnW/2,btnY+btnH/2);
    ctx.fillStyle='rgba(255,45,155,0.15)'; ctx.strokeStyle='#FF2D9B'; ctx.lineWidth=2;
    ctx.shadowBlur=12; ctx.shadowColor='#FF2D9B';
    ctx.beginPath(); ctx.roundRect(canvas.width-20-btnW,btnY,btnW,btnH,10); ctx.fill(); ctx.stroke();
    ctx.shadowBlur=0; ctx.font='bold 14px Outfit'; ctx.fillStyle='#FF2D9B';
    ctx.fillText('🚫 BLOCK',canvas.width-20-btnW/2,btnY+btnH/2); ctx.restore();

    /* Current molecule label */
    const front=mols.find(m=>!m.decided&&m.x>canvas.width*0.25);
    if(front){
      ctx.save();
      ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.strokeStyle='rgba(255,215,0,0.4)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.roundRect(canvas.width/2-180,canvas.height-115,360,40,8); ctx.fill(); ctx.stroke();
      ctx.font='bold 12px Outfit'; ctx.fillStyle='#FFD700'; ctx.textAlign='center';
      ctx.fillText('🧬 '+front.name+' — ALLOW or BLOCK it?',canvas.width/2,canvas.height-88); ctx.restore();
    }

    /* HUD */
    ctx.font='bold 11px Outfit'; ctx.fillStyle='rgba(0,245,160,0.6)'; ctx.textAlign='right';
    ctx.fillText('Wave '+wave+' | Score: '+localScore,canvas.width-10,12);
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-4);
  }

  function decide(allow){
    const front=mols.find(m=>!m.decided&&m.x>canvas.width*0.25);
    if(!front) return;
    front.decided=true;
    const correct=(allow&&front.pass)||(!allow&&!front.pass);
    if(correct){
      front.result='ok'; front.resultTimer=30;
      localScore+=15; score=localScore; updateHUD(localScore);
      spawnP(front.x,front.y,front.col);
      showFloatingText('+15 Correct!',front.x,front.y-40,front.col);
      showFloatingText('💡 '+front.fact,canvas.width/2,40,'#00C3FF');
    } else {
      front.result='bad'; front.resultTimer=30;
      lives--; updateHealth(Math.max(0,(lives/3)*100)); shakeCanvas(canvas);
      showFloatingText('✗ Wrong!',front.x,front.y-40,'#FF2D9B');
    }
    setTimeout(()=>{
      const idx=mols.indexOf(front); if(idx>=0) mols.splice(idx,1);
      if(localScore>0&&localScore%60===0){ wave++; speed+=0.3; }
    },800);
  }

  function onDown(e){
    const {x,y}=gpos(canvas,e);
    const btnW=130,btnH=46,btnY=canvas.height-60;
    if(x>=20&&x<=20+btnW&&y>=btnY&&y<=btnY+btnH) decide(true);
    if(x>=canvas.width-20-btnW&&y>=btnY&&y<=btnY+btnH) decide(false);
  }
  canvas.addEventListener('click',onDown);
  canvas.addEventListener('touchstart',e=>{e.preventDefault();onDown(e.touches[0]);},{passive:false});
  document.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A') decide(true);
    if(e.key==='ArrowRight'||e.key==='d'||e.key==='D') decide(false);
  });

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);clearInterval(spawnInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/300)*100)),0);}
  spawnInterval=setInterval(spawnMol,2200);
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); spawnMol(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   5. BIOLOGY NEURON CHAIN REACTION — Grade 11-12
   A branching neuron network is shown. Click the CORRECT neuron
   in sequence to fire a signal along the reflex arc path.
   Wrong neuron = signal dies + life lost.
═══════════════════════════════════════════════════════════════ */
function bioNeuron(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const ARCS = [
    { name:"Pain Reflex Arc",
      steps:["Receptor","Sensory Neuron","Spinal Cord","Motor Neuron","Effector (Muscle)"],
      fact:"Reflex arc bypasses brain for speed: ~30ms response time" },
    { name:"Knee-Jerk Reflex",
      steps:["Stretch Receptor","Afferent Neuron","Interneuron","Efferent Neuron","Quadriceps"],
      fact:"Knee-jerk is a monosynaptic reflex — only one synapse" },
    { name:"Pupil Light Reflex",
      steps:["Retina","Optic Nerve","Midbrain","Oculomotor Nerve","Iris Muscle"],
      fact:"Light reflex: brighter light → pupils constrict (miosis)" },
  ];

  let localScore=0,lives=3,gameTime=95,isOver=false,animId;
  let arcIdx=0,currentArc=null,stepIdx=0,nodes=[],signal=[],particles=[],signalTrail=[];

  function loadArc(){
    if(arcIdx>=ARCS.length){end();return;}
    currentArc=ARCS[arcIdx]; arcIdx++; stepIdx=0;
    signal=[]; signalTrail=[];
    // Layout nodes in a path across screen
    const count=currentArc.steps.length;
    const wrongLabels=["Cerebellum","Dendrite","Axon Terminal","Schwann Cell","Node of Ranvier","Synapse"];
    nodes=[];
    currentArc.steps.forEach((step,i)=>{
      const x=80+i*(canvas.width-120)/(count-1);
      const y=canvas.height/2+Math.sin(i*0.8)*60;
      nodes.push({label:step,x,y,r:36,correct:true,pulsing:0,lit:false});
      // Add 1-2 decoy nodes around each
      if(i<count-1){
        const wrongLabel=wrongLabels[(i+arcIdx)%wrongLabels.length];
        nodes.push({label:wrongLabel, x:x+30+Math.random()*40, y:y-80+Math.random()*40, r:28, correct:false, pulsing:0, lit:false});
      }
    });
  }

  function spawnP(x,y,col){
    for(let i=0;i<14;i++) particles.push({x,y,vx:(Math.random()-.5)*7,vy:(Math.random()-.5)*7,life:1,col,r:3});
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#000818'); bg.addColorStop(1,'#080018');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!currentArc) return;

    /* Axon connections */
    const correctNodes=nodes.filter(n=>n.correct);
    for(let i=0;i<correctNodes.length-1;i++){
      const a=correctNodes[i],b=correctNodes[i+1];
      ctx.save(); ctx.strokeStyle=a.lit&&b.lit?'rgba(0,245,160,0.8)':'rgba(255,255,255,0.12)';
      ctx.lineWidth=a.lit&&b.lit?3:1.5;
      if(a.lit&&b.lit){ctx.shadowBlur=12;ctx.shadowColor='#00F5A0';}
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      ctx.shadowBlur=0; ctx.restore();
    }

    /* Signal trail */
    signalTrail.forEach((p,i)=>{
      ctx.save(); ctx.globalAlpha=(i/signalTrail.length)*0.6;
      ctx.fillStyle='#00F5A0'; ctx.shadowBlur=8; ctx.shadowColor='#00F5A0';
      ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2); ctx.fill(); ctx.restore();
    });

    /* Nodes */
    nodes.forEach((n,i)=>{
      n.pulsing=(n.pulsing+0.06)%(Math.PI*2);
      const isNext=n.correct&&nodes.filter(x=>x.correct).indexOf(n)===stepIdx;
      const col=n.lit?'#00F5A0':n.correct?'#00C3FF':'#FF8C00';
      ctx.save();
      if(isNext){ctx.shadowBlur=20+Math.sin(n.pulsing)*8;ctx.shadowColor='#00C3FF';}
      if(n.lit){ctx.shadowBlur=24;ctx.shadowColor='#00F5A0';}
      ctx.fillStyle=n.lit?'rgba(0,245,160,0.25)':n.correct?'rgba(0,195,255,0.1)':'rgba(255,140,0,0.1)';
      ctx.strokeStyle=col; ctx.lineWidth=n.lit?3:isNext?2.5:1.5;
      ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.font='bold 8px Outfit'; ctx.fillStyle=col; ctx.textAlign='center'; ctx.textBaseline='middle';
      const lines=n.label.split(' ');
      lines.forEach((l,li)=>ctx.fillText(l,n.x,n.y-4+(li*10)));
      if(isNext){
        ctx.font='11px Outfit'; ctx.fillStyle='#FFD700';
        ctx.fillText('← CLICK',n.x,n.y+n.r+12);
      }
      ctx.restore();
    });

    /* Particles */
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.life-=0.03;
      if(p.life<=0){particles.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=p.life; ctx.fillStyle=p.col;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Title + step indicator */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.strokeStyle='rgba(0,195,255,0.3)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(10,6,canvas.width-20,54,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#00C3FF'; ctx.textAlign='center';
    ctx.fillText('⚡ '+currentArc.name,canvas.width/2,24);
    ctx.font='10px Outfit'; ctx.fillStyle='rgba(255,215,0,0.7)';
    ctx.fillText('Click: '+currentArc.steps[stepIdx]+(stepIdx<currentArc.steps.length?' → ...':'  ✓ DONE'),canvas.width/2,42);
    ctx.restore();

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-10);
  }

  function onTap(e){
    const {x,y}=gpos(canvas,e);
    nodes.forEach(n=>{
      const dx=x-n.x,dy=y-n.y;
      if(Math.sqrt(dx*dx+dy*dy)<n.r+8){
        if(n.correct&&!n.lit&&nodes.filter(x=>x.correct).indexOf(n)===stepIdx){
          n.lit=true; stepIdx++;
          spawnP(n.x,n.y,'#00F5A0');
          showFloatingText('⚡ '+n.label,n.x,n.y-50,'#00F5A0');
          if(stepIdx>=currentArc.steps.length){
            localScore+=35; score=localScore; updateHUD(localScore);
            showFloatingText('🧠 Reflex Arc Complete! +35',canvas.width/2,canvas.height/2-20,'#00F5A0');
            showFloatingText('💡 '+currentArc.fact,canvas.width/2,canvas.height/2,'#00C3FF');
            updateProgress(Math.min(100,~~((arcIdx/ARCS.length)*100)));
            setTimeout(loadArc,2000);
          }
        } else if(!n.correct){
          lives--; updateHealth(Math.max(0,(lives/3)*100)); shakeCanvas(canvas);
          spawnP(n.x,n.y,'#FF2D9B');
          showFloatingText('✗ Wrong neuron!',n.x,n.y-50,'#FF2D9B');
        }
      }
    });
  }
  canvas.addEventListener('click',onTap);
  canvas.addEventListener('touchstart',e=>{e.preventDefault();onTap(e.touches[0]);},{passive:false});

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/(ARCS.length*35))*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); loadArc(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   6. MATHS GRAPH SNIPER — Grade 10
   A coordinate grid shown. A function is given (y=2x+3 etc).
   Dots appear on the grid — shoot ONLY dots that lie ON the graph.
═══════════════════════════════════════════════════════════════ */
function mathsGraphSniper(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const FUNCTIONS = [
    { q:"y = 2x + 1",   fn:x=>2*x+1,   fact:"Slope=2, y-intercept=1. Check: x=2→y=5" },
    { q:"y = x²",       fn:x=>x*x,     fact:"Parabola: x=3→y=9, x=-2→y=4" },
    { q:"y = 3x − 2",   fn:x=>3*x-2,   fact:"Slope=3, passes through (0,-2) and (1,1)" },
    { q:"y = −x + 4",   fn:x=>-x+4,    fact:"Negative slope: goes down left to right" },
    { q:"y = x² − 4",   fn:x=>x*x-4,   fact:"Roots at x=±2 (where y=0)" },
    { q:"y = 2x² + x",  fn:x=>2*x*x+x, fact:"Vertex at x=-0.25, opens upward" },
  ];

  const ORIGIN={x:canvas.width/2,y:canvas.height/2+20}, SCALE=30;
  let localScore=0,lives=3,gameTime=90,isOver=false,animId;
  let qIdx=0,currentF=null,dots=[],particles=[],crosshair={x:canvas.width/2,y:canvas.height/2};

  function toScreen(gx,gy){return{x:ORIGIN.x+gx*SCALE,y:ORIGIN.y-gy*SCALE};}
  function toGrid(sx,sy){return{x:(sx-ORIGIN.x)/SCALE,y:-(sy-ORIGIN.y)/SCALE};}

  function nextQ(){
    currentF=FUNCTIONS[qIdx%FUNCTIONS.length]; qIdx++;
    dots=[];
    const placed=new Set();
    for(let i=0;i<8;i++){
      let gx,gy,onFn;
      if(i<4){
        gx=Math.round((Math.random()*8-4)*2)/2;
        gy=Math.round(currentF.fn(gx)*2)/2;
        onFn=true;
        const k=gx+'_'+gy;
        if(placed.has(k)){i--;continue;}
        placed.add(k);
      } else {
        gx=Math.round((Math.random()*8-4)*2)/2;
        gy=Math.round((Math.random()*8-4)*2)/2;
        onFn=Math.abs(gy-currentF.fn(gx))<0.3;
      }
      const s=toScreen(gx,gy);
      if(s.x<30||s.x>canvas.width-30||s.y<30||s.y>canvas.height-140) continue;
      dots.push({gx,gy,sx:s.x,sy:s.y,onFn,col:onFn?'#00F5A0':'#FF2D9B',hit:false,pulse:Math.random()*Math.PI*2});
    }
  }

  function spawnP(x,y,col){
    for(let i=0;i<16;i++) particles.push({x,y,vx:(Math.random()-.5)*9,vy:(Math.random()-.5)*9,life:1,col,r:3});
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#030818'); bg.addColorStop(1,'#040c10');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Grid */
    const xMax=Math.ceil((canvas.width/2)/SCALE)+1;
    const yMax=Math.ceil(canvas.height/2/SCALE)+1;
    ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=0.5;
    for(let x2=-xMax;x2<=xMax;x2++){const s=toScreen(x2,0);ctx.beginPath();ctx.moveTo(s.x,10);ctx.lineTo(s.x,canvas.height-100);ctx.stroke();}
    for(let y2=-yMax;y2<=yMax;y2++){const s=toScreen(0,y2);ctx.beginPath();ctx.moveTo(10,s.y);ctx.lineTo(canvas.width-10,s.y);ctx.stroke();}
    /* Axes */
    ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(10,ORIGIN.y);ctx.lineTo(canvas.width-10,ORIGIN.y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ORIGIN.x,10);ctx.lineTo(ORIGIN.x,canvas.height-100);ctx.stroke();
    /* Axis labels */
    ctx.font='9px Outfit'; ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.textAlign='center'; ctx.textBaseline='top';
    for(let x2=-xMax;x2<=xMax;x2+=2){if(x2===0)continue;const s=toScreen(x2,0);ctx.fillText(x2,s.x,ORIGIN.y+4);}
    ctx.textAlign='right'; ctx.textBaseline='middle';
    for(let y2=-yMax+1;y2<=yMax;y2+=2){if(y2===0)continue;const s=toScreen(0,y2);ctx.fillText(y2,ORIGIN.x-4,s.y);}
    ctx.restore();

    /* Function curve */
    if(currentF){
      ctx.save(); ctx.strokeStyle='rgba(0,195,255,0.35)'; ctx.lineWidth=2; ctx.setLineDash([6,6]);
      ctx.beginPath(); let first=true;
      for(let x2=-xMax;x2<=xMax;x2+=0.1){
        const y2=currentF.fn(x2);
        const s=toScreen(x2,y2);
        if(s.y<0||s.y>canvas.height-100){first=true;continue;}
        if(first){ctx.moveTo(s.x,s.y);first=false;}else ctx.lineTo(s.x,s.y);
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }

    /* Dots */
    dots.forEach(d=>{
      if(d.hit) return;
      d.pulse+=0.05;
      const pulse=0.7+0.3*Math.sin(d.pulse);
      ctx.save();
      ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=1.5;
      ctx.shadowBlur=8*pulse; ctx.shadowColor='rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(d.sx,d.sy,10,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.font='bold 8px Outfit'; ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('('+d.gx+','+Math.round(d.gy*10)/10+')',d.sx,d.sy-18);
      ctx.restore();
    });

    /* Crosshair */
    ctx.save(); ctx.strokeStyle='rgba(255,215,0,0.8)'; ctx.lineWidth=1.5; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.arc(crosshair.x,crosshair.y,18,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle='rgba(255,215,0,0.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(crosshair.x-28,crosshair.y); ctx.lineTo(crosshair.x+28,crosshair.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(crosshair.x,crosshair.y-28); ctx.lineTo(crosshair.x,crosshair.y+28); ctx.stroke();
    ctx.restore();

    /* Particles */
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.life-=0.03;
      if(p.life<=0){particles.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=p.life; ctx.fillStyle=p.col;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Q banner */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.strokeStyle='rgba(0,195,255,0.3)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(10,6,canvas.width-20,44,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 13px Outfit'; ctx.fillStyle='#00C3FF'; ctx.textAlign='center';
    ctx.fillText('🎯 Shoot dots ON the graph: '+(currentF?currentF.q:''),canvas.width/2,20);
    ctx.font='10px Outfit'; ctx.fillStyle='rgba(255,215,0,0.6)';
    ctx.fillText('Move crosshair (mouse/touch) • Click to shoot',canvas.width/2,38); ctx.restore();

    /* Lives */
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-4);
    const remaining=dots.filter(d=>!d.hit&&d.onFn).length;
    ctx.font='bold 10px Outfit'; ctx.fillStyle='rgba(0,245,160,0.5)'; ctx.textAlign='right';
    ctx.fillText('On-curve left: '+remaining,canvas.width-10,canvas.height-4);
  }

  function shoot(x,y){
    let hit=false;
    dots.forEach(d=>{
      if(d.hit) return;
      const dx=x-d.sx,dy=y-d.sy;
      if(Math.sqrt(dx*dx+dy*dy)<18){
        hit=true; d.hit=true;
        if(d.onFn){
          localScore+=20; score=localScore; updateHUD(localScore);
          spawnP(d.sx,d.sy,'#00F5A0');
          showFloatingText('🎯 +20',d.sx,d.sy-30,'#00F5A0');
          const remaining=dots.filter(x=>!x.hit&&x.onFn).length;
          if(remaining===0){
            showFloatingText('💡 '+currentF.fact,canvas.width/2,canvas.height/2,'#00C3FF');
            updateProgress(Math.min(100,~~((qIdx/FUNCTIONS.length)*100)));
            setTimeout(nextQ,1200);
          }
        } else {
          lives--; updateHealth(Math.max(0,(lives/3)*100)); shakeCanvas(canvas);
          spawnP(d.sx,d.sy,'#FF2D9B');
          showFloatingText('✗ Not on graph!',d.sx,d.sy-30,'#FF2D9B');
        }
      }
    });
    if(!hit) showFloatingText('Miss',x,y,'rgba(255,255,255,0.4)');
  }

  canvas.addEventListener('mousemove',e=>{const p=gpos(canvas,e);crosshair.x=p.x;crosshair.y=p.y;});
  canvas.addEventListener('click',e=>{const p=gpos(canvas,e);shoot(p.x,p.y);});
  canvas.addEventListener('touchmove',e=>{e.preventDefault();const p=gpos(canvas,e.touches[0]);crosshair.x=p.x;crosshair.y=p.y;},{passive:false});
  canvas.addEventListener('touchstart',e=>{const p=gpos(canvas,e.touches[0]);crosshair.x=p.x;crosshair.y=p.y;shoot(p.x,p.y);},{passive:true});

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/(FUNCTIONS.length*80))*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); nextQ(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   7. CODE RACE — SYNTAX SPRINT (Python / Java / HTML) Grade 9+
   A car race track. Your car moves forward for every correct
   answer. Code snippet shown with ONE error highlighted —
   four fix options scroll past — tap the correct one.
═══════════════════════════════════════════════════════════════ */
function codeRace(g, lang) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const BANKS = {
    python:[
      { code:"for i in range(5)\n    print(i)", err:"range(5)", opts:["range(5):", "range(5);", "Range(5):", "range[5]:"], ans:0, fact:"Python for loops end with a colon :" },
      { code:"x = input('num')\nprint(x + 1)", err:"x + 1", opts:["int(x)+1","x+1","float+1","str(x)+1"], ans:0, fact:"input() returns str — convert with int() first" },
      { code:"def greet(name)\n    return 'Hi '+name", err:"def greet(name)", opts:["def greet(name):","def greet name:","function greet(name):","def greet(name);"], ans:0, fact:"Function definitions need a colon after the signature" },
      { code:"nums = [1,2,3]\nprint(nums[3])", err:"nums[3]", opts:["nums[2]","nums[3]","nums[4]","nums[-3]"], ans:0, fact:"Index 3 is out of range for a 3-element list (0,1,2)" },
      { code:"if x = 5:\n    print('five')", err:"x = 5", opts:["x == 5","x = 5","x := 5","x === 5"], ans:0, fact:"== is comparison; = is assignment (causes SyntaxError)" },
      { code:"class Dog\n    def bark(self):\n        return 'Woof'", err:"class Dog", opts:["class Dog:","class Dog()","class dog:","Class Dog:"], ans:0, fact:"Class definitions need a colon. class ClassName:" },
    ],
    java:[
      { code:"public class Main {\n  public static void main(String args[]) {\n    System.out.println('Hello')\n  }\n}", err:"'Hello'", opts:['"Hello";',"'Hello'","'Hello';",'"Hello"'], ans:0, fact:"Java strings use double quotes. Single quotes are for chars" },
      { code:"int x = 5\nSystem.out.println(x);", err:"int x = 5", opts:["int x = 5;","int x = 5","Int x = 5;","integer x = 5;"], ans:0, fact:"Java statements end with semicolons" },
      { code:"for(int i=0, i<5, i++){\n  System.out.println(i);\n}", err:"i<5,", opts:["i<5;","i<5,","i<5","i<5:"], ans:0, fact:"Java for-loop uses semicolons between parts: (init;cond;inc)" },
      { code:"String name = 'Alice';\nSystem.out.println(name);", err:"'Alice'", opts:['"Alice"',"'Alice'","Alice","new String('Alice')"], ans:0, fact:"Java strings must use double quotes, not single" },
      { code:"ArrayList<int> nums = new ArrayList<>();", err:"ArrayList<int>", opts:["ArrayList<Integer>","ArrayList<int>","ArrayList<Int>","List<int>"], ans:0, fact:"Java generics use wrapper classes: Integer not int" },
    ],
    html:[
      { code:"<html>\n<body>\n<h1>Hello World<h1>\n</body>", err:"<h1>Hello World<h1>", opts:["<h1>Hello World</h1>","<h1>Hello World<h1>","<H1>Hello World</H1>","<h1 Hello World /h1>"], ans:0, fact:"HTML tags need a closing tag with a forward slash: </h1>" },
      { code:"<img src='cat.png'>", err:"src='cat.png'", opts:['src="cat.png"',"src='cat.png'","src=cat.png","href='cat.png'"], ans:0, fact:"HTML attributes should use double quotes: src=\"image.png\"" },
      { code:"<a href='page.html'>Click</a>", err:"href='page.html'", opts:['href="page.html"',"src='page.html'","link='page.html'","href=page.html"], ans:0, fact:"Hyperlinks use href attribute with double quotes" },
      { code:"<ul>\n<li>Item 1\n<li>Item 2\n</ol>", err:"</ol>", opts:["</ul>","</ol>","</list>","</UL>"], ans:0, fact:"Opening <ul> must close with </ul>, not </ol>" },
      { code:"<div class=container>\n  <p>Hello</p>\n</div>", err:"class=container", opts:['class="container"',"class=container","className=container",'id="container"'], ans:0, fact:"Attribute values must be in quotes: class=\"container\"" },
    ]
  };

  const bank = (BANKS[lang]||BANKS.python).slice();
  const langLabels={'python':'🐍 Python','java':'☕ Java','html':'🌐 HTML'};
  const langCols={'python':'#FF2D9B','java':'#FF8C00','html':'#00C3FF'};
  const col=langCols[lang]||'#00C3FF';

  let localScore=0,lives=3,gameTime=90,isOver=false,animId;
  let qIdx=0,currentQ=null,carX=40,carTarget=40,optOffset=0,answered=false;
  let sparks=[],wrongFlash=0;
  const TRACK_Y=canvas.height-95, FINISH_X=canvas.width-60;
  const OPT_W=140, OPT_H=50;

  function nextQ(){
    if(qIdx>=bank.length){end();return;}
    currentQ=bank[qIdx]; qIdx++;
    optOffset=0; answered=false;
    /* Shuffle opts keeping ans correct */
    const correctOpt=currentQ.opts[currentQ.ans];
    const shuffled=currentQ.opts.slice().sort(()=>Math.random()-.5);
    currentQ._shuffled=shuffled;
    currentQ._ans=shuffled.indexOf(correctOpt);
  }

  function spawnS(x,y){ for(let i=0;i<14;i++) sparks.push({x,y,vx:(Math.random()-.5)*8,vy:(Math.random()-.5)*8,life:1,col,r:3}); }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#050810'); bg.addColorStop(1,'#080510');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!currentQ) return;

    /* Track road */
    ctx.save();
    ctx.fillStyle='#1a1a2e'; ctx.fillRect(0,TRACK_Y-20,canvas.width,60);
    ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=2; ctx.setLineDash([20,15]);
    ctx.beginPath(); ctx.moveTo(0,TRACK_Y+10); ctx.lineTo(canvas.width,TRACK_Y+10); ctx.stroke(); ctx.setLineDash([]);
    /* Finish line */
    ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.fillRect(FINISH_X,TRACK_Y-20,4,60);
    ctx.font='8px Outfit'; ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.textAlign='center';
    ctx.fillText('FINISH',FINISH_X+2,TRACK_Y-24); ctx.restore();

    /* Progress track */
    const prog=(qIdx-1)/bank.length;
    ctx.fillStyle=col+'33'; ctx.fillRect(0,TRACK_Y-18,canvas.width*prog,4);
    ctx.fillStyle=col; ctx.fillRect(0,TRACK_Y-18,canvas.width*prog,4);

    /* Car */
    carX+=(carTarget-carX)*0.07;
    ctx.save(); ctx.translate(carX,TRACK_Y);
    ctx.fillStyle=col; ctx.shadowBlur=16; ctx.shadowColor=col;
    ctx.beginPath(); ctx.roundRect(-22,-12,44,22,5); ctx.fill();
    ctx.fillStyle=col+'88'; ctx.beginPath(); ctx.roundRect(-14,-20,28,12,3); ctx.fill();
    ctx.shadowBlur=0; ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(-12,10,6,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(12,10,6,0,Math.PI*2); ctx.fill();
    ctx.restore();

    /* Code snippet card */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.strokeStyle=col+'44'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(20,12,canvas.width-40,90,10); ctx.fill(); ctx.stroke();
    ctx.font='bold 10px Outfit'; ctx.fillStyle=col; ctx.textAlign='left';
    ctx.fillText(langLabels[lang]+' — Fix the error:',30,28);
    const lines=currentQ.code.split('\n');
    lines.forEach((line,i)=>{
      const isErr=line.includes(currentQ.err);
      if(isErr){
        ctx.fillStyle='rgba(255,45,155,0.2)'; ctx.fillRect(20,30+i*18,canvas.width-40,18);
        ctx.strokeStyle='rgba(255,45,155,0.5)'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
        ctx.strokeRect(20,30+i*18,canvas.width-40,18); ctx.setLineDash([]);
      }
      ctx.font='11px "Courier New"'; ctx.fillStyle=isErr?'#FF8888':'#88CC88';
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      ctx.fillText(line.replace(currentQ.err,'___'),30,44+i*18);
    });
    ctx.restore();

    /* Scrolling options */
    optOffset-=2.5;
    const totalW=currentQ._shuffled.length*(OPT_W+16);
    if(optOffset<-totalW) optOffset=canvas.width;
    currentQ._shuffled.forEach((opt,i)=>{
      const ox=optOffset+i*(OPT_W+16)+20;
      if(ox<-OPT_W||ox>canvas.width+10) return;
      const oy=TRACK_Y-80;
      ctx.save();
      ctx.fillStyle=col+'22'; ctx.strokeStyle=col; ctx.lineWidth=1.8;
      ctx.shadowBlur=8; ctx.shadowColor=col;
      ctx.beginPath(); ctx.roundRect(ox,oy,OPT_W,OPT_H,8); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.font='bold 10px "Courier New"'; ctx.fillStyle='#fff';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(opt.slice(0,20),ox+OPT_W/2,oy+OPT_H/2);
      ctx.restore();
    });

    /* Wrong flash */
    if(wrongFlash>0){
      ctx.save(); ctx.globalAlpha=wrongFlash*0.3;
      ctx.fillStyle='#FF2D9B'; ctx.fillRect(0,0,canvas.width,canvas.height);
      wrongFlash-=0.06; ctx.restore();
    }

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-4);
    ctx.font='bold 9px Outfit'; ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.textAlign='right';
    ctx.fillText('Tap correct fix as it scrolls past',canvas.width-10,canvas.height-4);
  }

  function tapOpt(x,y){
    if(answered) return;
    const oy=TRACK_Y-80;
    currentQ._shuffled.forEach((opt,i)=>{
      const ox=optOffset+i*(OPT_W+16)+20;
      if(x>=ox&&x<=ox+OPT_W&&y>=oy&&y<=oy+OPT_H){
        answered=true;
        if(i===currentQ._ans){
          localScore+=20; score=localScore; updateHUD(localScore);
          carTarget=Math.min(FINISH_X-30,carTarget+(canvas.width/bank.length));
          spawnS(carX,TRACK_Y-15);
          showFloatingText('+20 ✓ '+opt.slice(0,16),canvas.width/2,TRACK_Y-100,col);
          showFloatingText('💡 '+currentQ.fact,canvas.width/2,TRACK_Y-118,'#00C3FF');
          updateProgress(Math.min(100,~~((qIdx/bank.length)*100)));
          setTimeout(nextQ,900);
        } else {
          lives--; updateHealth(Math.max(0,(lives/3)*100)); wrongFlash=1;
          showFloatingText('✗ Wrong syntax!',canvas.width/2,TRACK_Y-100,'#FF2D9B');
          answered=false;
        }
      }
    });
  }
  canvas.addEventListener('click',e=>{const p=gpos(canvas,e);tapOpt(p.x,p.y);});
  canvas.addEventListener('touchstart',e=>{const p=gpos(canvas,e.touches[0]);tapOpt(p.x,p.y);},{passive:true});

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/(bank.length*20))*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); nextQ(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   8. DEBUG DUNGEON (Python / Java) Grade 10
   Side-scrolling dungeon. Every few steps a monster blocks path.
   Monster IS a bug. Choose the correct sword (fix) to defeat it.
═══════════════════════════════════════════════════════════════ */
function debugDungeon(g, lang) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const MONSTERS = {
    python:[
      { name:"TypeError Monster",     code:"print('Age: ' + 25)", err:"'Age: ' + 25",  fix:"str(25)",  opts:["str(25)","int('Age')","25.str()","25"], fact:"str() converts int to string for concatenation" },
      { name:"IndexError Dragon",     code:"lst=[1,2,3]\nlst[5]",   err:"lst[5]",       fix:"lst[2]",   opts:["lst[2]","lst[5]","lst[3]","lst[-5]"], fact:"Valid indices: 0,1,2. lst[5] raises IndexError" },
      { name:"NameError Goblin",      code:"print(mesage)",          err:"mesage",       fix:"message",  opts:["message","mesage","msg","print"], fact:"Variable not defined: check spelling (NameError)" },
      { name:"IndentError Witch",     code:"def f():\nreturn 5",    err:"return 5",     fix:"  return 5",opts:["  return 5","return 5","  return(5)","return(5)"], fact:"Python uses indentation — body must be indented" },
      { name:"ZeroDivision Troll",    code:"x = 10 / 0",            err:"10 / 0",       fix:"10 / 1",   opts:["10/1","10/0","10//0","10%0"], fact:"Division by zero raises ZeroDivisionError" },
    ],
    java:[
      { name:"NullPointer Dragon",    code:"String s = null;\ns.length();", err:"s.length()", fix:'s != null', opts:['s != null','s.length()','null.length()','"".length()'], fact:"Check for null before calling methods on objects" },
      { name:"ArrayBounds Monster",   code:"int[] a={1,2,3};\na[3];", err:"a[3]",       fix:"a[2]",     opts:["a[2]","a[3]","a[4]","a[0]"], fact:"Array of size 3 has indices 0,1,2 only" },
      { name:"ClassCast Goblin",      code:"Object x = \"hi\";\nint n = (int) x;", err:"(int) x", fix:"(String) x", opts:["(String) x","(int) x","(char) x","(long) x"], fact:"Cannot cast String to int — use Integer.parseInt()" },
      { name:"Missing Semicolon Orc", code:"int x = 5\nSystem.out.println(x);", err:"int x = 5", fix:"int x = 5;", opts:["int x = 5;","int x = 5","Int x = 5;","var x = 5"], fact:"Java statements require semicolons at the end" },
    ]
  };

  const bank=(MONSTERS[lang]||MONSTERS.python).slice().sort(()=>Math.random()-.5);
  const langCol=lang==='java'?'#FF8C00':'#FF2D9B';

  let localScore=0,lives=3,gameTime=95,isOver=false,animId;
  let heroX=80,monsterX=canvas.width+50,mIdx=0,currentM=null,fighting=false,hitFlash=0;
  let sparks=[],heroAnim=0;

  function nextMonster(){
    if(mIdx>=bank.length){end();return;}
    currentM=bank[mIdx]; mIdx++;
    monsterX=canvas.width+50; fighting=false;
  }

  function spawnS(x,y){ for(let i=0;i<16;i++) sparks.push({x,y,vx:(Math.random()-.5)*9,vy:(Math.random()-.5)*9,life:1,col:langCol,r:3+Math.random()*2}); }

  function draw(){
    /* Dungeon background */
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#0a0508'); bg.addColorStop(1,'#150c08');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    /* Floor */
    ctx.fillStyle='#1a1008'; ctx.fillRect(0,canvas.height-60,canvas.width,60);
    ctx.strokeStyle='rgba(255,140,0,0.2)'; ctx.lineWidth=1;
    for(let x2=0;x2<canvas.width;x2+=50){ctx.beginPath();ctx.moveTo(x2,canvas.height-60);ctx.lineTo(x2,canvas.height);ctx.stroke();}
    /* Torches */
    [80,canvas.width/2,canvas.width-80].forEach(tx=>{
      ctx.save(); ctx.fillStyle='rgba(255,140,0,0.15)';
      ctx.beginPath(); ctx.arc(tx,canvas.height-80,20+Math.sin(Date.now()*.01+tx)*5,0,Math.PI*2); ctx.fill();
      ctx.font='20px sans-serif'; ctx.textAlign='center'; ctx.fillText('🔥',tx,canvas.height-70); ctx.restore();
    });

    /* Hero */
    heroAnim+=0.08;
    const heroY=canvas.height-100+Math.sin(heroAnim)*3;
    ctx.font='36px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🧙',heroX,heroY);

    /* Monster */
    if(currentM){
      if(!fighting) monsterX=Math.max(canvas.width*0.55,monsterX-1.5);
      if(monsterX<=canvas.width*0.55) fighting=true;
      ctx.font='36px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('👾',monsterX,canvas.height-100+Math.sin(heroAnim*1.2)*4);
      ctx.font='bold 10px Outfit'; ctx.fillStyle='#FF2D9B'; ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      ctx.fillText(currentM.name,monsterX,canvas.height-140);
    }

    /* Code bug card */
    if(fighting&&currentM){
      ctx.save();
      ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.strokeStyle=langCol+'55'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.roundRect(20,10,canvas.width-40,76,10); ctx.fill(); ctx.stroke();
      ctx.font='bold 10px Outfit'; ctx.fillStyle=langCol; ctx.textAlign='left';
      ctx.fillText('🐛 Bug: '+currentM.name,30,26);
      const lines=currentM.code.split('\n');
      lines.forEach((l,i)=>{
        const isBug=l.includes(currentM.err);
        ctx.fillStyle=isBug?'rgba(255,45,155,0.15)':'transparent';
        if(isBug) ctx.fillRect(20,30+i*18,canvas.width-40,18);
        ctx.font='10px "Courier New"'; ctx.fillStyle=isBug?'#FF8888':'#88CC88';
        ctx.fillText(l,30,42+i*18);
      });
      ctx.restore();

      /* Fix options (swords) */
      const opts=currentM.opts;
      const ow=Math.min(140,(canvas.width-40)/opts.length-8);
      const gap=(canvas.width-40-opts.length*ow)/(opts.length+1);
      opts.forEach((opt,i)=>{
        const ox=20+gap+i*(ow+gap), oy=canvas.height-56;
        ctx.save();
        ctx.fillStyle=langCol+'22'; ctx.strokeStyle=langCol; ctx.lineWidth=1.5;
        ctx.shadowBlur=6; ctx.shadowColor=langCol;
        ctx.beginPath(); ctx.roundRect(ox,oy,ow,38,7); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
        ctx.font='bold 9px "Courier New"'; ctx.fillStyle='#fff';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('⚔ '+opt.slice(0,18),ox+ow/2,oy+19); ctx.restore();
      });
    }

    /* Hit flash */
    if(hitFlash>0){
      ctx.save(); ctx.globalAlpha=hitFlash*0.35;
      ctx.fillStyle='#FF2D9B'; ctx.fillRect(0,0,canvas.width,canvas.height);
      hitFlash-=0.08; ctx.restore();
    }

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Progress gems */
    ctx.font='12px sans-serif'; ctx.textAlign='right';
    ctx.fillText('⚔'.repeat(Math.min(mIdx-1,bank.length)),canvas.width-10,canvas.height-4);

    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-4);
  }

  function tapFix(x,y){
    if(!fighting||!currentM) return;
    const opts=currentM.opts;
    const ow=Math.min(140,(canvas.width-40)/opts.length-8);
    const gap=(canvas.width-40-opts.length*ow)/(opts.length+1);
    const oy=canvas.height-56;
    opts.forEach((opt,i)=>{
      const ox=20+gap+i*(ow+gap);
      if(x>=ox&&x<=ox+ow&&y>=oy&&y<=oy+38){
        if(opt===currentM.fix){
          localScore+=25; score=localScore; updateHUD(localScore);
          spawnS(monsterX,canvas.height-100);
          showFloatingText('⚔ BUG SLAIN! +25',canvas.width/2,canvas.height/2-20,langCol);
          showFloatingText('💡 '+currentM.fact,canvas.width/2,canvas.height/2,'#00C3FF');
          updateProgress(Math.min(100,~~((mIdx/bank.length)*100)));
          monsterX=canvas.width+100;
          setTimeout(nextMonster,1200);
        } else {
          lives--; updateHealth(Math.max(0,(lives/3)*100)); hitFlash=1;
          showFloatingText('✗ Wrong fix!',canvas.width/2,canvas.height/2,'#FF2D9B');
          shakeCanvas(canvas);
        }
      }
    });
  }
  canvas.addEventListener('click',e=>{const p=gpos(canvas,e);tapFix(p.x,p.y);});
  canvas.addEventListener('touchstart',e=>{const p=gpos(canvas,e.touches[0]);tapFix(p.x,p.y);},{passive:true});

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/(bank.length*25))*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); nextMonster(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   9. JAVA TOWER DEFENSE — Grade 11
   Buggy Java snippets march along a path. Place correct "fix
   towers" to destroy them. Each tower targets a bug type.
═══════════════════════════════════════════════════════════════ */
function javaTowerDefense(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const TOWERS = [
    { id:"semi",   label:"Semicolon\nFixer",  icon:"⚔",  col:"#FFD700", range:90, targets:"syntax" },
    { id:"null",   label:"Null\nChecker",     icon:"🛡",  col:"#00C3FF", range:80, targets:"runtime" },
    { id:"type",   label:"Type\nCaster",      icon:"🔧",  col:"#00F5A0", range:70, targets:"type" },
    { id:"logic",  label:"Logic\nDebugger",   icon:"💡",  col:"#FF8C00", range:95, targets:"logic" },
  ];

  const BUGS = [
    { code:"int x = 5", type:"syntax",  hp:3, fact:"Missing semicolon → syntax error" },
    { code:"String s=null;\ns.length()", type:"runtime", hp:3, fact:"NullPointerException — check for null first" },
    { code:"(int)\"abc\"", type:"type",    hp:3, fact:"Cannot cast String to int — use Integer.parseInt()" },
    { code:"if(x=5)", type:"logic",   hp:3, fact:"= is assignment, == is comparison — logic bug" },
    { code:"int a[]=new int[3];\na[3]=1", type:"runtime", hp:4, fact:"Array index out of bounds: valid indices 0-2" },
    { code:"System.out.print(x)", type:"syntax",  hp:3, fact:"println needs parentheses and semicolon" },
    { code:"int+String concat", type:"type",    hp:4, fact:"Use String.valueOf(int) for concatenation" },
  ];

  /* Simple linear path across screen */
  const PATH=[];
  for(let x2=0;x2<=canvas.width+40;x2+=20) PATH.push({x:x2,y:canvas.height/2+Math.sin(x2/60)*40});

  let localScore=0,lives=5,gameTime=100,isOver=false,animId;
  let bugs=[],towers=[],placingTower=null,wave=0,bullets=[];
  let spawnTimer=0;

  function spawnWave(){
    wave++;
    const count=Math.min(3+wave,7);
    for(let i=0;i<count;i++){
      const bDef=BUGS[~~(Math.random()*BUGS.length)];
      bugs.push({...bDef,pathIdx:-(i*40),x:PATH[0].x,y:PATH[0].y,maxHp:bDef.hp,hp:bDef.hp,id:Math.random()});
    }
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,canvas.width,canvas.height);
    bg.addColorStop(0,'#050810'); bg.addColorStop(1,'#080510');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

    /* Path */
    ctx.save(); ctx.strokeStyle='rgba(255,140,0,0.25)'; ctx.lineWidth=32;
    ctx.beginPath(); PATH.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y)); ctx.stroke();
    ctx.strokeStyle='rgba(255,140,0,0.1)'; ctx.lineWidth=34; ctx.stroke();
    ctx.restore();

    /* Bugs */
    bugs.forEach(b=>{
      if(b.pathIdx<0){b.pathIdx++;return;}
      const pi=Math.min(b.pathIdx,PATH.length-1);
      b.pathIdx=Math.min(b.pathIdx+0.5,PATH.length-1);
      b.x=PATH[pi].x; b.y=PATH[pi].y;
      if(b.pathIdx>=PATH.length-1&&b.hp>0){ b.hp=0; lives=Math.max(0,lives-1); updateHealth((lives/5)*100); }

      ctx.save();
      ctx.shadowBlur=12; ctx.shadowColor='#FF2D9B';
      ctx.fillStyle='rgba(255,45,155,0.2)'; ctx.strokeStyle='#FF2D9B'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.roundRect(b.x-36,b.y-16,72,32,6); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
      ctx.font='bold 7px "Courier New"'; ctx.fillStyle='#FF8888'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(b.code.split('\n')[0].slice(0,16),b.x,b.y+1);
      /* HP bar */
      ctx.fillStyle='rgba(255,0,0,0.3)'; ctx.fillRect(b.x-30,b.y-22,60,5);
      ctx.fillStyle='#FF2D9B'; ctx.fillRect(b.x-30,b.y-22,(b.hp/b.maxHp)*60,5);
      ctx.restore();
    });

    /* Towers */
    towers.forEach(t=>{
      const def=TOWERS.find(td=>td.id===t.type);
      if(!def) return;
      ctx.save();
      ctx.shadowBlur=14; ctx.shadowColor=def.col;
      ctx.fillStyle=def.col+'22'; ctx.strokeStyle=def.col; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(t.x,t.y,20,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
      ctx.font='16px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(def.icon,t.x,t.y);
      /* Range ring */
      ctx.strokeStyle=def.col+'22'; ctx.lineWidth=1; ctx.setLineDash([4,6]);
      ctx.beginPath(); ctx.arc(t.x,t.y,def.range,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    });

    /* Bullets */
    for(let i=bullets.length-1;i>=0;i--){
      const b=bullets[i];
      b.x+=(b.tx-b.x)*0.15; b.y+=(b.ty-b.y)*0.15;
      const dist=Math.hypot(b.tx-b.x,b.ty-b.y);
      if(dist<8){ bullets.splice(i,1); continue; }
      ctx.save(); ctx.fillStyle=b.col; ctx.shadowBlur=8; ctx.shadowColor=b.col;
      ctx.beginPath(); ctx.arc(b.x,b.y,5,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Tower palette */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,canvas.height-72,canvas.width,72);
    ctx.strokeStyle='rgba(255,140,0,0.2)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,canvas.height-72); ctx.lineTo(canvas.width,canvas.height-72); ctx.stroke();
    ctx.font='8px Outfit'; ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.textAlign='center';
    ctx.fillText('Click to select tower, then click path to place',canvas.width/2,canvas.height-62);
    TOWERS.forEach((t,i)=>{
      const tx=30+i*((canvas.width-60)/TOWERS.length)+((canvas.width-60)/TOWERS.length)/2-24;
      const ty=canvas.height-52;
      const sel=placingTower&&placingTower.id===t.id;
      ctx.fillStyle=sel?t.col+'44':'rgba(255,255,255,0.04)'; ctx.strokeStyle=t.col; ctx.lineWidth=sel?2:1;
      ctx.shadowBlur=sel?14:0; ctx.shadowColor=t.col;
      ctx.beginPath(); ctx.roundRect(tx,ty,48,42,8); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
      ctx.font='18px sans-serif'; ctx.textAlign='center'; ctx.fillText(t.icon,tx+24,ty+18);
      ctx.font='6px Outfit'; ctx.fillStyle=t.col; ctx.fillText(t.label.replace('\n',' '),tx+24,ty+34);
    });
    ctx.restore();

    /* HUD */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.fillRect(0,0,canvas.width,38);
    ctx.font='bold 11px Outfit'; ctx.fillStyle='#FFD700'; ctx.textAlign='center';
    ctx.fillText('☕ JAVA TOWER DEFENSE — Wave '+wave+' | Lives: '+'❤️'.repeat(lives)+'🖤'.repeat(Math.max(0,5-lives)),canvas.width/2,25);
    ctx.font='bold 11px Outfit'; ctx.fillStyle='#00F5A0'; ctx.textAlign='right';
    ctx.fillText('Score: '+localScore,canvas.width-10,25); ctx.restore();
  }

  function update(){
    spawnTimer++;
    if(spawnTimer>180){ spawnTimer=0; spawnWave(); }
    /* Towers fire at bugs */
    towers.forEach(t=>{
      const def=TOWERS.find(td=>td.id===t.type);
      if(!def) return;
      bugs.forEach(b=>{
        if(b.hp<=0) return;
        const dist=Math.hypot(b.x-t.x,b.y-t.y);
        if(dist<def.range&&b.type===def.targets&&Math.random()<0.03){
          b.hp--;
          bullets.push({x:t.x,y:t.y,tx:b.x,ty:b.y,col:def.col});
          if(b.hp<=0){
            localScore+=20; score=localScore; updateHUD(localScore);
            showFloatingText('+20 Bug fixed!',b.x,b.y-30,def.col);
          }
        }
      });
    });
    bugs=bugs.filter(b=>b.hp>0);
  }

  function onDown(e){
    const {x,y}=gpos(canvas,e);
    /* Click palette */
    if(y>=canvas.height-72){
      TOWERS.forEach((t,i)=>{
        const tx=30+i*((canvas.width-60)/TOWERS.length)+((canvas.width-60)/TOWERS.length)/2-24;
        const ty=canvas.height-52;
        if(x>=tx&&x<=tx+48&&y>=ty&&y<=ty+42){
          placingTower=placingTower&&placingTower.id===t.id?null:t;
        }
      });
    } else if(placingTower){
      /* Place tower on map (not on path) */
      const onPath=PATH.some(p=>Math.hypot(x-p.x,y-p.y)<24);
      if(!onPath&&y<canvas.height-72){
        towers.push({type:placingTower.id,x,y});
        placingTower=null;
      }
    }
  }
  canvas.addEventListener('click',onDown);
  canvas.addEventListener('touchstart',e=>{onDown(e.touches[0]);e.preventDefault();},{passive:false});

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();update();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/500)*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); spawnWave(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   10. HTML ARCHITECT — Grade 6-8
   Target webpage preview shown on right. Drag HTML tag tiles
   into correct positions on left. Live preview updates instantly.
═══════════════════════════════════════════════════════════════ */
function htmlArchitect(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const PUZZLES = [
    { target:"<h1>Hello World</h1>",
      description:"A big heading that says Hello World",
      slots:[{expects:"<h1>",label:"open heading"},{expects:"Hello World",label:"text"},{expects:"</h1>",label:"close heading"}],
      pool:["<h1>","</h1>","<p>","Hello World","<div>","</p>"],
      fact:"<h1> is the largest heading tag (h1 to h6)" },
    { target:"<p>Welcome to HTML</p>",
      description:"A paragraph with Welcome to HTML",
      slots:[{expects:"<p>",label:"open para"},{expects:"Welcome to HTML",label:"text"},{expects:"</p>",label:"close para"}],
      pool:["<p>","</p>","<h2>","Welcome to HTML","</h2>","<span>"],
      fact:"<p> defines a paragraph — one of the most common HTML elements" },
    { target:'<a href="page.html">Click me</a>',
      description:"A link that says Click me",
      slots:[{expects:'<a href="page.html">',label:"anchor tag"},{expects:"Click me",label:"link text"},{expects:"</a>",label:"close anchor"}],
      pool:['<a href="page.html">',"</a>","Click me","<link>","<href>","</link>"],
      fact:"<a href=...> creates hyperlinks. href specifies the destination" },
    { target:"<ul><li>Item 1</li><li>Item 2</li></ul>",
      description:"Unordered list with 2 items",
      slots:[{expects:"<ul>",label:"open list"},{expects:"<li>Item 1</li>",label:"item 1"},{expects:"<li>Item 2</li>",label:"item 2"},{expects:"</ul>",label:"close list"}],
      pool:["<ul>","</ul>","<li>Item 1</li>","<li>Item 2</li>","<ol>","</ol>"],
      fact:"<ul> = unordered (bullet) list. <li> = each list item" },
  ];

  const TILE_W=100, TILE_H=32, SLOT_H=36;
  let pIdx=0,currentP=null,slots=[],tiles=[],drag=null,dox=0,doy=0;
  let localScore=0,lives=3,gameTime=110,isOver=false,animId,sparks=[];

  function loadPuzzle(){
    if(pIdx>=PUZZLES.length){end();return;}
    currentP=PUZZLES[pIdx]; pIdx++;
    const poolShuffle=currentP.pool.slice().sort(()=>Math.random()-.5);
    tiles=poolShuffle.map((tag,i)=>({tag,x:20+i*(TILE_W+8),y:canvas.height-54,ox:20+i*(TILE_W+8),oy:canvas.height-54,w:TILE_W,h:TILE_H,placed:false}));
    slots=currentP.slots.map((s,i)=>({...s,filled:null,x:20,y:80+i*(SLOT_H+8),w:canvas.width*0.55-30,h:SLOT_H}));
    drag=null; sparks=[];
  }

  function spawnS(x,y){ for(let i=0;i<14;i++) sparks.push({x,y,vx:(Math.random()-.5)*7,vy:(Math.random()-.5)*7,life:1,col:'#00C3FF',r:3}); }

  function renderPreview(){
    /* Draw a simple live preview on the right side */
    const PX=canvas.width*0.58, PY=70, PW=canvas.width*0.38, PH=canvas.height-160;
    ctx.save();
    ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.roundRect(PX,PY,PW,PH,6); ctx.fill();
    ctx.strokeStyle='rgba(0,195,255,0.5)'; ctx.lineWidth=1.5; ctx.stroke();
    /* Browser chrome */
    ctx.fillStyle='#e0e0e0'; ctx.beginPath(); ctx.roundRect(PX,PY,PW,22,6); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.font='8px Outfit'; ctx.textAlign='left';
    ctx.fillText('● ● ●  index.html',PX+6,PY+14);
    /* Render assembled HTML visually */
    const assembled=slots.map(s=>s.filled||'').join('');
    ctx.fillStyle='#222'; ctx.font='bold 11px serif'; ctx.textAlign='left';
    let renderY=PY+38, rx=PX+8;
    if(assembled.includes('<h1>')){
      ctx.font='bold 14px serif'; ctx.fillStyle='#111';
      const text=assembled.replace(/<[^>]+>/g,'').slice(0,20)||'...';
      ctx.fillText(text,rx,renderY);
    } else if(assembled.includes('<p>')){
      ctx.font='11px serif'; ctx.fillStyle='#333';
      const text=assembled.replace(/<[^>]+>/g,'').slice(0,30)||'...';
      ctx.fillText(text,rx,renderY);
    } else if(assembled.includes('<a ')){
      ctx.font='11px serif'; ctx.fillStyle='#0066cc';
      ctx.fillText(assembled.replace(/<[^>]+>/g,'').slice(0,20)||'link',rx,renderY);
    } else if(assembled.includes('<ul>')){
      const items=assembled.match(/<li>(.*?)<\/li>/g)||[];
      items.forEach((item,i)=>{
        ctx.font='10px serif'; ctx.fillStyle='#222';
        ctx.fillText('• '+item.replace(/<[^>]+>/g,''),rx,renderY+i*14);
      });
    } else if(assembled.length>0){
      ctx.font='10px serif'; ctx.fillStyle='#999';
      ctx.fillText(assembled.replace(/<[^>]+>/g,'').slice(0,30)||'...',rx,renderY);
    } else {
      ctx.font='9px Outfit'; ctx.fillStyle='#aaa';
      ctx.fillText('← drag tags to build',rx,renderY);
    }
    ctx.restore();
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#050812'); bg.addColorStop(1,'#080518');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!currentP) return;

    /* Left panel - builder */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.strokeStyle='rgba(0,195,255,0.2)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(10,64,canvas.width*0.55,canvas.height-160,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 10px Outfit'; ctx.fillStyle='#00C3FF'; ctx.textAlign='left';
    ctx.fillText('🏗 Build: '+currentP.description,16,58);
    ctx.restore();

    /* Slots */
    slots.forEach((s,i)=>{
      const filled=s.filled!==null;
      const correct=filled&&s.filled===s.expects;
      const col=correct?'#00F5A0':filled?'#FF8C00':'rgba(0,195,255,0.2)';
      ctx.save();
      ctx.fillStyle=filled?col+'22':'rgba(0,0,0,0.3)';
      ctx.strokeStyle=col; ctx.lineWidth=filled?2:1;
      if(correct){ctx.shadowBlur=12;ctx.shadowColor='#00F5A0';}
      ctx.beginPath(); ctx.roundRect(s.x,s.y,s.w,s.h,6); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
      ctx.font='bold 9px "Courier New"'; ctx.fillStyle=filled?'#fff':'rgba(255,255,255,0.3)';
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText(filled?s.filled:s.label,s.x+8,s.y+s.h/2); ctx.restore();
    });

    /* Live preview */
    renderPreview();

    /* Divider */
    ctx.save(); ctx.strokeStyle='rgba(0,195,255,0.2)'; ctx.lineWidth=1; ctx.setLineDash([6,6]);
    ctx.beginPath(); ctx.moveTo(canvas.width*0.56,70); ctx.lineTo(canvas.width*0.56,canvas.height-140); ctx.stroke();
    ctx.setLineDash([]); ctx.font='8px Outfit'; ctx.fillStyle='rgba(0,195,255,0.5)'; ctx.textAlign='center';
    ctx.fillText('LIVE PREVIEW →',canvas.width*0.57,64); ctx.restore();

    /* Check button */
    ctx.save();
    ctx.fillStyle='rgba(0,245,160,0.15)'; ctx.strokeStyle='#00F5A0'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(canvas.width*0.15,canvas.height-130,canvas.width*0.25,30,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 11px Outfit'; ctx.fillStyle='#00F5A0'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('✓ CHECK HTML',canvas.width*0.275,canvas.height-115); ctx.restore();

    /* Tile pool */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,canvas.height-72,canvas.width,72);
    ctx.strokeStyle='rgba(0,195,255,0.2)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,canvas.height-72); ctx.lineTo(canvas.width,canvas.height-72); ctx.stroke();
    ctx.font='8px Outfit'; ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.textAlign='center';
    ctx.fillText('Drag HTML tags into the slots above',canvas.width/2,canvas.height-62);
    ctx.restore();

    tiles.forEach(t=>{
      if(t.placed||t===drag) return;
      ctx.save(); ctx.fillStyle='rgba(0,195,255,0.12)'; ctx.strokeStyle='#00C3FF'; ctx.lineWidth=1.5;
      ctx.shadowBlur=6; ctx.shadowColor='#00C3FF';
      ctx.beginPath(); ctx.roundRect(t.x,t.y,t.w,t.h,6); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
      ctx.font='bold 9px "Courier New"'; ctx.fillStyle='#00C3FF'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(t.tag.slice(0,18),t.x+t.w/2,t.y+t.h/2); ctx.restore();
    });

    if(drag){
      ctx.save(); ctx.fillStyle='rgba(0,195,255,0.3)'; ctx.strokeStyle='#00C3FF'; ctx.lineWidth=2;
      ctx.shadowBlur=16; ctx.shadowColor='#00C3FF';
      ctx.beginPath(); ctx.roundRect(drag.x,drag.y,drag.w,drag.h,6); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
      ctx.font='bold 9px "Courier New"'; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(drag.tag.slice(0,18),drag.x+drag.w/2,drag.y+drag.h/2); ctx.restore();
    }

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    /* Title banner */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.8)'; ctx.strokeStyle='rgba(0,195,255,0.4)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(10,6,canvas.width-20,42,8); ctx.fill(); ctx.stroke();
    ctx.font='bold 12px Outfit'; ctx.fillStyle='#00C3FF'; ctx.textAlign='center';
    ctx.fillText('🌐 HTML ARCHITECT — Drag tags, build the page!',canvas.width/2,32); ctx.restore();

    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-4);
  }

  function checkPuzzle(){
    const allCorrect=slots.every(s=>s.filled===s.expects);
    if(allCorrect){
      localScore+=35; score=localScore; updateHUD(localScore);
      slots.forEach(s=>spawnS(s.x+s.w/2,s.y+s.h/2));
      showFloatingText('🌐 Page Built! +35',canvas.width/2,canvas.height/2-20,'#00C3FF');
      showFloatingText('💡 '+currentP.fact,canvas.width/2,canvas.height/2,'#00F5A0');
      updateProgress(Math.min(100,~~((pIdx/PUZZLES.length)*100)));
      setTimeout(loadPuzzle,1800);
    } else {
      lives--; updateHealth(Math.max(0,(lives/3)*100)); shakeCanvas(canvas);
      showFloatingText('Some tags are wrong — check the preview!',canvas.width/2,canvas.height/2,'#FF2D9B');
    }
  }

  function tryDrop(tile){
    let dropped=false;
    slots.forEach(s=>{
      if(s.filled!==null) return;
      const cx=tile.x+tile.w/2,cy=tile.y+tile.h/2;
      if(cx>=s.x&&cx<=s.x+s.w&&cy>=s.y&&cy<=s.y+s.h){
        s.filled=tile.tag; tile.placed=true; dropped=true;
        spawnS(s.x+s.w/2,s.y+s.h/2);
        if(tile.tag===s.expects) showFloatingText('✓',s.x+s.w/2,s.y-15,'#00F5A0');
      }
    });
    if(!dropped){tile.x=tile.ox;tile.y=tile.oy;}
  }

  function onDown(e){
    const {x,y}=gpos(canvas,e);
    if(x>=canvas.width*0.15&&x<=canvas.width*0.4&&y>=canvas.height-130&&y<=canvas.height-100){checkPuzzle();return;}
    /* Pick up from slot */
    slots.forEach(s=>{
      if(s.filled&&x>=s.x&&x<=s.x+s.w&&y>=s.y&&y<=s.y+s.h){
        const t=tiles.find(t=>t.tag===s.filled&&t.placed);
        if(t){t.placed=false;t.x=x-t.w/2;t.y=y-t.h/2;drag=t;dox=0;doy=0;s.filled=null;}
      }
    });
    /* Pick up from pool */
    for(const t of tiles){
      if(!t.placed&&x>=t.x&&x<=t.x+t.w&&y>=t.y&&y<=t.y+t.h){drag=t;dox=x-t.x;doy=y-t.y;break;}
    }
  }
  function onMove(e){if(!drag)return;const{x,y}=gpos(canvas,e);drag.x=x-dox;drag.y=y-doy;}
  function onUp(){if(!drag)return;tryDrop(drag);drag=null;}
  canvas.addEventListener('mousedown',onDown); canvas.addEventListener('mousemove',onMove); canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:true}); canvas.addEventListener('touchmove',e=>{onMove(e.touches[0]);e.preventDefault();},{passive:false}); canvas.addEventListener('touchend',onUp);

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/(PUZZLES.length*35))*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); loadPuzzle(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   11. JAVA FILL-IN-BLANK — Grade 6-8
   Same drag mechanic as pythonFill but with Java syntax.
═══════════════════════════════════════════════════════════════ */
function javaFill(g) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const QS = [
    { code:'System.out.___(\"Hello\");',  blank:'println', opts:['println','print','log','write'],  fact:'System.out.println() prints with a newline' },
    { code:'___ x = 10;',                 blank:'int',     opts:['int','Int','integer','num'],       fact:'int is the Java primitive type for integers' },
    { code:'for(int i=0; i<5; ___) {',   blank:'i++',     opts:['i++','i+1','i+=2','++i'],          fact:'i++ increments i by 1 each loop iteration' },
    { code:'String name = ___;\nname = \"Alice\";', blank:'null', opts:['null','\"\"','0','new'],    fact:'Variables can be initialised to null before assignment' },
    { code:'___(x==5) { doSomething(); }',blank:'if',      opts:['if','If','while','when'],          fact:'if keyword starts a conditional block in Java' },
    { code:'public ___ main(String[] args)', blank:'static void', opts:['static void','void','static','public void'], fact:'main must be static void — entry point signature' },
    { code:'int[] arr = ___ int[5];',     blank:'new',     opts:['new','create','make','alloc'],     fact:'new keyword allocates memory for arrays and objects' },
  ];

  const langCol='#FF8C00';
  const TILE_W=90, TILE_H=36;
  let qIdx=0,currentQ=null,tiles=[],drag=null,dox=0,doy=0;
  let localScore=0,lives=3,gameTime=95,isOver=false,animId,sparks=[],blankFilled=null;

  function nextQ(){
    if(qIdx>=QS.length){end();return;}
    const raw=QS[qIdx]; qIdx++;
    const shuffled=raw.opts.slice().sort(()=>Math.random()-.5);
    currentQ={...raw,opts:shuffled};
    const spacing=(canvas.width-40)/shuffled.length;
    tiles=shuffled.map((name,i)=>({name,ok:name===raw.blank,x:20+i*spacing+spacing/2-TILE_W/2,y:canvas.height-56,ox:20+i*spacing+spacing/2-TILE_W/2,oy:canvas.height-56,w:TILE_W,h:TILE_H,placed:false,col:['#FF8C00','#FFD700','#00C3FF','#00F5A0'][i%4]}));
    blankFilled=null; drag=null;
  }

  function spawnS(x,y){for(let i=0;i<18;i++) sparks.push({x,y,vx:(Math.random()-.5)*9,vy:(Math.random()-.5)*9,life:1,col:langCol,r:3});}

  const BLANK_X=canvas.width/2, BLANK_Y=148, BLANK_W=110, BLANK_H=34;

  function tryDrop(tile){
    const cx=tile.x+tile.w/2, cy=tile.y+tile.h/2;
    if(Math.abs(cx-BLANK_X)<BLANK_W/2+22&&Math.abs(cy-BLANK_Y)<BLANK_H/2+22){
      if(tile.ok){
        blankFilled=tile.name; tile.placed=true;
        spawnS(BLANK_X,BLANK_Y);
        localScore+=20; score=localScore; updateHUD(localScore);
        showFloatingText('✓ Correct! +20',BLANK_X,BLANK_Y-40,'#00F5A0');
        showFloatingText('💡 '+currentQ.fact,canvas.width/2,canvas.height/2,'#00C3FF');
        updateProgress(Math.min(100,~~((qIdx/QS.length)*100)));
        setTimeout(nextQ,1600);
      } else {
        lives--; updateHealth(Math.max(0,(lives/3)*100)); shakeCanvas(canvas);
        spawnS(BLANK_X,BLANK_Y); tile.x=tile.ox; tile.y=tile.oy;
        showFloatingText('✗ Wrong token!',BLANK_X,BLANK_Y-40,'#FF2D9B');
      }
    } else { tile.x=tile.ox; tile.y=tile.oy; }
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#100808'); bg.addColorStop(1,'#0a1200');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!currentQ) return;
    ctx.fillStyle=langCol; ctx.fillRect(0,0,(qIdx/QS.length)*canvas.width,5);
    /* Code card */
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.strokeStyle=langCol+'44'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(20,16,canvas.width-40,170,12); ctx.fill(); ctx.stroke();
    const lines=currentQ.code.split('\n');
    lines.forEach((line,i)=>{
      const ly=44+i*22;
      ctx.font='11px "Courier New"'; ctx.fillStyle='rgba(255,140,0,0.3)'; ctx.textAlign='right';
      ctx.fillText(i+1,44,ly);
      if(line.includes(currentQ.blank)){
        const parts=line.split(currentQ.blank);
        ctx.fillStyle='#88CC88'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
        ctx.fillText(parts[0],54,ly);
        const bw=ctx.measureText(parts[0]).width;
        ctx.save();
        ctx.fillStyle=blankFilled?'rgba(0,245,160,0.2)':'rgba(255,140,0,0.15)';
        ctx.strokeStyle=blankFilled?'#00F5A0':langCol; ctx.lineWidth=2;
        ctx.shadowBlur=blankFilled?16:8; ctx.shadowColor=blankFilled?'#00F5A0':langCol;
        ctx.beginPath(); ctx.roundRect(54+bw-2,ly-15,BLANK_W,BLANK_H,6); ctx.fill(); ctx.stroke();
        ctx.font='bold 12px "Courier New"'; ctx.fillStyle=blankFilled?'#00F5A0':'rgba(255,140,0,0.6)';
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.shadowBlur=0;
        ctx.fillText(blankFilled||'___',54+bw+BLANK_W/2-2,ly-15+BLANK_H/2);
        ctx.restore();
        if(parts[1]){ctx.fillStyle='#88CC88';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(parts[1],54+bw+BLANK_W+4,ly);}
      } else {ctx.fillStyle='#88CC88';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(line,54,ly);}
    });
    ctx.restore();
    ctx.font='11px Outfit'; ctx.fillStyle=langCol+'88'; ctx.textAlign='center';
    ctx.fillText('☕ Drag the correct Java token into the blank',canvas.width/2,200);
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,canvas.height-75,canvas.width,75);
    ctx.strokeStyle=langCol+'22'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,canvas.height-75); ctx.lineTo(canvas.width,canvas.height-75); ctx.stroke();
    ctx.restore();
    tiles.forEach(t=>{
      if(t.placed||t===drag) return;
      ctx.save(); ctx.fillStyle=t.col+'33'; ctx.strokeStyle=t.col; ctx.lineWidth=1.8; ctx.shadowBlur=8; ctx.shadowColor=t.col;
      ctx.beginPath(); ctx.roundRect(t.x,t.y,t.w,t.h,8); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
      ctx.font='bold 11px "Courier New"'; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(t.name,t.x+t.w/2,t.y+t.h/2); ctx.restore();
    });
    if(drag){
      ctx.save(); ctx.fillStyle=drag.col+'55'; ctx.strokeStyle=drag.col; ctx.lineWidth=2.5; ctx.shadowBlur=20; ctx.shadowColor=drag.col;
      ctx.beginPath(); ctx.roundRect(drag.x,drag.y,drag.w,drag.h,8); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
      ctx.font='bold 11px "Courier New"'; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(drag.name,drag.x+drag.w/2,drag.y+drag.h/2); ctx.restore();
    }
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-10);
    ctx.font='bold 9px Outfit'; ctx.fillStyle=langCol+'66'; ctx.textAlign='right';
    ctx.fillText('☕ Java — Grade '+g,canvas.width-10,canvas.height-10);
  }

  function onDown(e){const{x,y}=gpos(canvas,e);for(const t of tiles){if(!t.placed&&x>=t.x&&x<=t.x+t.w&&y>=t.y&&y<=t.y+t.h){drag=t;dox=x-t.x;doy=y-t.y;return;}}}
  function onMove(e){if(!drag)return;const{x,y}=gpos(canvas,e);drag.x=x-dox;drag.y=y-doy;}
  function onUp(){if(!drag)return;tryDrop(drag);drag=null;}
  canvas.addEventListener('mousedown',onDown); canvas.addEventListener('mousemove',onMove); canvas.addEventListener('mouseup',onUp);
  canvas.addEventListener('touchstart',onDown,{passive:true}); canvas.addEventListener('touchmove',e=>{onMove(e.touches[0]);e.preventDefault();},{passive:false}); canvas.addEventListener('touchend',onUp);

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/(QS.length*20))*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); nextQ(); loop();
}


/* ═══════════════════════════════════════════════════════════════
   12. COMPILE & RUN TERMINAL — Python/Java/HTML Grade 11-12
   A fake terminal. Program shown with a bug. It "executes"
   step by step. A crash occurs mid-run. Pick the correct fix
   before the countdown hits zero.
═══════════════════════════════════════════════════════════════ */
function compileRun(g, lang) {
  const canvas = document.getElementById('gameCanvas');
  const ctx    = canvas.getContext('2d');

  const PROGRAMS = {
    python:[
      { title:"fibonacci.py", lines:["def fib(n):","  if n<=1: return n","  return fib(n-1) + fib(n-2)","","result = fib(7)","print('fib(7) =', result)"],
        crashLine:4, crashErr:"RecursionError", crashMsg:"maximum recursion depth exceeded",
        fix:"result = fib(6)", opts:["result = fib(6)","fib = result(7)","result = fib(-1)","fib(7) = result"],
        output:["Running fibonacci.py...","Calling fib(7)...","Going deeper... fib(6)...","fib(5)... fib(4)...","💥 CRASH!"],
        fact:"fib(7) works fine; recursion error occurs at very large n like fib(1000)" },
      { title:"sort_list.py", lines:["numbers = [3,1,4,1,5,9,2]","numbers.sort()","total = numbers[0]+numbers[10]","print('Sum of first 2:', total)"],
        crashLine:2, crashErr:"IndexError", crashMsg:"list index 10 out of range",
        fix:"numbers[0]+numbers[1]", opts:["numbers[0]+numbers[1]","numbers[0]+numbers[10]","numbers[1]+numbers[10]","numbers[-1]+numbers[0]"],
        output:["Running sort_list.py...","Sorting list...","[1,1,2,3,4,5,9]","Accessing index 10...","💥 CRASH!"],
        fact:"List has 7 elements: valid indices 0-6. Index 10 is out of range." },
    ],
    java:[
      { title:"Main.java", lines:["public class Main {","  public static void main(String[] args) {","    String s = null;","    System.out.println(s.length());","  }","}"],
        crashLine:3, crashErr:"NullPointerException", crashMsg:"Cannot invoke length() on null",
        fix:'String s = "Hello";', opts:['String s = "Hello";','String s = null;','String s = "";','String s = new String()'],
        output:["Compiling Main.java...","✓ Compiled OK","Running main()...","Accessing s.length()...","💥 CRASH!"],
        fact:"Always initialise strings before use. null.length() throws NullPointerException" },
      { title:"ArrayDemo.java", lines:["int[] arr = new int[3];","arr[0]=10; arr[1]=20; arr[2]=30;","System.out.println(arr[3]);"],
        crashLine:2, crashErr:"ArrayIndexOutOfBoundsException", crashMsg:"Index 3 out of bounds for length 3",
        fix:"arr[2]", opts:["arr[2]","arr[3]","arr[4]","arr[-1]"],
        output:["Compiling...","✓ Compiled","Running...","Reading arr[3]...","💥 CRASH!"],
        fact:"Array of size 3: valid indices 0, 1, 2. arr[3] is out of bounds." },
    ],
    html:[
      { title:"index.html", lines:['<!DOCTYPE html>','<html>','<body>','<h1>Hello World<h1>','</body>','</html>'],
        crashLine:3, crashErr:"Rendering Error", crashMsg:"Unclosed tag: <h1> not properly closed",
        fix:"<h1>Hello World</h1>", opts:["<h1>Hello World</h1>","<h1>Hello World<h1>","<H1>Hello World</H1>","<h1/>Hello World"],
        output:["Parsing HTML...","DOCTYPE ✓","body ✓","Rendering h1...","💥 RENDER FAIL!"],
        fact:"Every opening HTML tag needs a matching closing tag: <h1>...</h1>" },
    ]
  };

  const bank=(PROGRAMS[lang]||PROGRAMS.python).slice();
  const langCol=lang==='java'?'#FF8C00':lang==='html'?'#00C3FF':'#FF2D9B';
  const langLabel=lang==='java'?'☕ Java':lang==='html'?'🌐 HTML':'🐍 Python';

  let localScore=0,lives=3,gameTime=100,isOver=false,animId;
  let pIdx=0,currentP=null,execLine=0,execTimer=0,crashed=false,countdown=8,countTimer=null;
  let outputLines=[],sparks=[],answered=false;

  function nextProgram(){
    if(pIdx>=bank.length){end();return;}
    currentP=bank[pIdx]; pIdx++;
    execLine=0; execTimer=0; crashed=false; countdown=8; answered=false;
    outputLines=[];
    clearInterval(countTimer);
    /* Auto-execute line by line */
    const execInterval=setInterval(()=>{
      if(execLine>=currentP.lines.length||isOver){clearInterval(execInterval);return;}
      if(execLine<currentP.output.length) outputLines.push(currentP.output[execLine]);
      execLine++;
      if(outputLines[outputLines.length-1]==='💥 CRASH!'){
        crashed=true; clearInterval(execInterval);
        /* Countdown to fix */
        countTimer=setInterval(()=>{
          countdown--;
          if(countdown<=0){clearInterval(countTimer);lives--;updateHealth(Math.max(0,(lives/3)*100));shakeCanvas(canvas);outputLines.push('❌ Time out! -1 life');setTimeout(()=>{countdown=8;answered=false;outputLines=[];crashed=false;execLine=0;nextProgram();},1200);}
        },1000);
      }
    },500);
  }

  function spawnS(x,y){for(let i=0;i<14;i++) sparks.push({x,y,vx:(Math.random()-.5)*8,vy:(Math.random()-.5)*8,life:1,col:langCol,r:3});}

  function tapFix(opt){
    if(!crashed||answered) return;
    clearInterval(countTimer); answered=true;
    if(opt===currentP.fix){
      localScore+=30; score=localScore; updateHUD(localScore);
      outputLines.push('✅ Fix applied: '+opt.slice(0,24));
      outputLines.push('✓ Program completed successfully!');
      spawnS(canvas.width/2,canvas.height/2);
      showFloatingText('🖥 Fixed! +30',canvas.width/2,canvas.height/2-30,langCol);
      showFloatingText('💡 '+currentP.fact,canvas.width/2,canvas.height/2,'#00C3FF');
      updateProgress(Math.min(100,~~((pIdx/bank.length)*100)));
      setTimeout(nextProgram,2000);
    } else {
      lives--; updateHealth(Math.max(0,(lives/3)*100)); shakeCanvas(canvas);
      outputLines.push('✗ Wrong fix: '+opt.slice(0,20));
      showFloatingText('✗ Wrong fix!',canvas.width/2,canvas.height/2,'#FF2D9B');
      setTimeout(()=>{answered=false;countdown=8;clearInterval(countTimer);countTimer=setInterval(()=>{countdown--;if(countdown<=0){clearInterval(countTimer);lives--;updateHealth(Math.max(0,(lives/3)*100));}},1000);},500);
    }
  }

  function draw(){
    const bg=ctx.createLinearGradient(0,0,0,canvas.height);
    bg.addColorStop(0,'#030308'); bg.addColorStop(1,'#060310');
    ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!currentP) return;

    /* Terminal window */
    const TX=10,TY=14,TW=canvas.width-20,TH=canvas.height*0.52;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.strokeStyle=langCol+'55'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(TX,TY,TW,TH,8); ctx.fill(); ctx.stroke();
    /* Terminal title bar */
    ctx.fillStyle='rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.roundRect(TX,TY,TW,22,8); ctx.fill();
    ctx.font='bold 10px Outfit'; ctx.fillStyle=langCol; ctx.textAlign='left';
    ctx.fillText(langLabel+' — '+currentP.title, TX+10, TY+15);
    /* Traffic lights */
    ['#FF5F57','#FEBC2E','#28C840'].forEach((c,i)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(TW-20+i*(-18)+TX,TY+11,5,0,Math.PI*2);ctx.fill();});
    ctx.restore();

    /* Code lines */
    currentP.lines.forEach((line,i)=>{
      const ly=TY+28+i*15;
      if(ly>TY+TH-8) return;
      const isExec=i<execLine&&!crashed||i===currentP.crashLine&&crashed;
      const isCrash=i===currentP.crashLine&&crashed;
      if(isCrash){ctx.fillStyle='rgba(255,45,155,0.15)';ctx.fillRect(TX+2,ly-11,TW-4,14);}
      ctx.font='9px "Courier New"';
      ctx.fillStyle='rgba(255,140,0,0.3)'; ctx.textAlign='right';
      ctx.fillText(i+1,TX+22,ly);
      ctx.fillStyle=isCrash?'#FF8888':isExec?'#88CC88':'rgba(255,255,255,0.35)';
      ctx.textAlign='left'; ctx.fillText(line,TX+28,ly);
      if(i===execLine-1&&!crashed){
        ctx.fillStyle=langCol; ctx.fillText('◄',TX+TW-20,ly);
      }
    });

    /* Output console */
    const CY=TY+TH+4, CH=canvas.height*0.2;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.85)'; ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(TX,CY,TW,CH,6); ctx.fill(); ctx.stroke();
    ctx.font='bold 9px Outfit'; ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.textAlign='left';
    ctx.fillText('OUTPUT:',TX+6,CY+12);
    outputLines.slice(-4).forEach((line,i)=>{
      const col=line.startsWith('💥')||line.startsWith('❌')?'#FF2D9B':line.startsWith('✅')||line.startsWith('✓')?'#00F5A0':'#88CC88';
      ctx.font='9px "Courier New"'; ctx.fillStyle=col;
      ctx.fillText(line,TX+6,CY+24+i*12);
    });
    ctx.restore();

    /* Crash fix options */
    if(crashed&&!answered){
      ctx.save();
      ctx.fillStyle='rgba(0,0,0,0.9)'; ctx.strokeStyle='rgba(255,45,155,0.5)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.roundRect(TX,CY+CH+6,TW,canvas.height-CY-CH-50,8); ctx.fill(); ctx.stroke();
      ctx.font='bold 11px Outfit'; ctx.fillStyle='#FF2D9B'; ctx.textAlign='center';
      ctx.fillText('⏰ '+currentP.crashErr+' — Fix it in '+countdown+'s!',canvas.width/2,CY+CH+22);
      /* Countdown bar */
      const pct=countdown/8;
      const barCol=pct>0.5?'#00F5A0':pct>0.25?'#FFD700':'#FF2D9B';
      ctx.fillStyle='rgba(255,255,255,0.1)'; ctx.fillRect(TX+10,CY+CH+28,TW-20,8);
      ctx.fillStyle=barCol; ctx.fillRect(TX+10,CY+CH+28,(TW-20)*pct,8);
      const opts=currentP.opts, ow=(TW-20)/2-6;
      opts.forEach((opt,i)=>{
        const ox=TX+10+(i%2)*(ow+12), oy=CY+CH+42+(~~(i/2))*28;
        ctx.fillStyle=langCol+'22'; ctx.strokeStyle=langCol; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.roundRect(ox,oy,ow,22,5); ctx.fill(); ctx.stroke();
        ctx.font='bold 9px "Courier New"'; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(opt.slice(0,24),ox+ow/2,oy+11);
      });
      ctx.restore();
    }

    /* Sparks */
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i]; s.x+=s.vx; s.y+=s.vy; s.life-=0.03;
      if(s.life<=0){sparks.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=s.life; ctx.fillStyle=s.col;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore();
    }

    ctx.font='15px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    let h=''; for(let i=0;i<3;i++) h+=i<lives?'❤️ ':'🖤 ';
    ctx.fillText(h,10,canvas.height-4);
    ctx.font='bold 9px Outfit'; ctx.fillStyle=langCol+'66'; ctx.textAlign='right';
    ctx.fillText(langLabel+' Grade '+g,canvas.width-10,canvas.height-4);
  }

  function onDown(e){
    if(!crashed||answered) return;
    const{x,y}=gpos(canvas,e);
    const TX=10, TY=14, TW=canvas.width-20, TH=canvas.height*0.52;
    const CY=TY+TH+4, CH=canvas.height*0.2;
    const ow=(TW-20)/2-6;
    currentP.opts.forEach((opt,i)=>{
      const ox=TX+10+(i%2)*(ow+12), oy=CY+CH+42+(~~(i/2))*28;
      if(x>=ox&&x<=ox+ow&&y>=oy&&y<=oy+22) tapFix(opt);
    });
  }
  canvas.addEventListener('click',onDown);
  canvas.addEventListener('touchstart',e=>{e.preventDefault();onDown(e.touches[0]);},{passive:false});

  function loop(){if(isOver)return;ctx.clearRect(0,0,canvas.width,canvas.height);draw();animId=requestAnimationFrame(loop);}
  function end(){isOver=true;clearInterval(timerInterval);clearInterval(countTimer);cancelAnimationFrame(animId);score=localScore;finishMission(Math.min(100,~~((localScore/(bank.length*30))*100)),0);}
  timerInterval=setInterval(()=>{gameTime--;updateTimer(gameTime);if(gameTime<=0||lives<=0)end();},1000);
  updateTimer(gameTime); nextProgram(); loop();
}

/* ================================================================
   END OF GAME ENGINE v6.0 — ShikshaSetu
   NEW GAMES ADDED:
   1.  physicsCircuit(g)      — Circuit Builder drag-and-snap grid
   2.  physicsWave(g)         — Wave Oscilloscope sliders
   3.  chemTitration(g)       — Titration Simulator pH meter
   4.  bioMembrane(g)         — Cell Membrane Gate Allow/Block
   5.  bioNeuron(g)           — Neuron Chain Reaction clicker
   6.  mathsGraphSniper(g)    — Graph Sniper shoot points on function
   7.  codeRace(g,lang)       — Syntax Sprint car race (Python/Java/HTML)
   8.  debugDungeon(g,lang)   — Debug Dungeon side-scroller (Python/Java)
   9.  javaTowerDefense(g)    — Java Tower Defense
   10. htmlArchitect(g)       — HTML Architect live preview drag
   11. javaFill(g)            — Java Fill-in-Blank
   12. compileRun(g,lang)     — Compile & Run terminal crash fix
   + Updated dispatchers for Java and HTML subjects
================================================================ */