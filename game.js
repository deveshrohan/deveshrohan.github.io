/* ══════════════════════════════════════════════════════
   NAMMA BENGALURU — Auto-Rickshaw Career Game
   Pixel / Sims-inspired aesthetic
   Phases: AMBIENT → PHASE1 (career tour) → PHASE2 (survival)
══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─── PHASES ─────────────────────────────────────── */
  const PH = { AMBIENT:0, PHASE1:1, CHECKPOINT:2, TRANSITION:3, PHASE2:4, GAMEOVER:5 };

  /* ─── CHECKPOINT DATA ────────────────────────────── */
  const CP_DISTS = [900, 2000, 3300, 4600, 5700, 6700, 7600];
  const CHECKPOINTS = [
    { id:'about',       label:'About Me',       icon:'👤',
      facts:['Engineer → PM: Samsung patents to IIM MBA','Reads diffs AND P&Ls with equal ease','Built macOS apps · Filed US + India patents'] },
    { id:'ai-shipping', label:'AI & Shipping',  icon:'🤖',
      facts:['LLM-driven PRDs & AI code review','Eval frameworks for underwriting AI','Shipped faster with AI co-pilot on every project'] },
    { id:'experience',  label:'Experience',     icon:'💼',
      facts:['Head of Product · Recur Club · Current','INR 1500 Cr+ annual disbursements','5 companies · 7+ years · Fintech & Gaming'] },
    { id:'projects',    label:'Side Projects',  icon:'🛠️',
      facts:['Notchd — GitHub streak in your Mac notch','PopSlack — Custom sounds for every Slack ping','Kaaku — 3D AI-powered desktop buddy'] },
    { id:'skills',      label:'Skills',         icon:'⚡',
      facts:['Product Strategy · AI/Data · Engineering','Swift · Python · SQL · GraphQL','LLM Integration · System Design · DRM'] },
    { id:'education',   label:'Education',      icon:'🎓',
      facts:['IIM Kozhikode · MBA General Management','NIT Hamirpur · B.Tech Computer Science','Top 100 Competitive Leaders in India'] },
    { id:'experience',  label:'Recognition',    icon:'🏆',
      facts:['Ring of Honour · Recur Club 2025','Winner · Myntra PM Challenge (4500+ entrants)','Employee of the Quarter · Samsung Electronics'] },
  ];

  /* ─── STATE ──────────────────────────────────────── */
  let canvas, ctx, W, H, VX, HY, roadWBot;
  const roadWTop = 220;

  let phase         = PH.AMBIENT;
  let score         = 0, lives = 3;
  let totalDist     = 0, speed = 0;
  let playerLane    = 1, playerTargetLane = 1, playerNormX = 0;
  let obstacles     = [], dashes = [];
  let lastTime      = 0, raf = null;
  let shakeX = 0, shakeY = 0, shakeDur = 0;
  let cpIdx = 0, p2Time = 0, spawnT = 0;
  let ambientT      = 0;

  const AMBIENT_SPEED = 0.10;
  const P1_SPEED      = 0.20;
  const P2_SPEED_0    = 0.30;
  const LANE_NX       = [-0.62, 0, 0.62];

  /* ─── MATH ───────────────────────────────────────── */
  const lerp   = (a,b,t) => a+(b-a)*t;
  const clamp  = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  function projY(z)    { return H - (H-HY)*z; }
  function projHW(z)   { return lerp(roadWBot/2, roadWTop/2, z); }
  function projX(z,nx) { return VX + nx*projHW(z); }
  function oScale(z)   { return clamp(1-z*0.92, 0.02, 1); }

  /* ─── INIT ───────────────────────────────────────── */
  function init() {
    canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    setupInput();
    initDashes();
    // Start ambient loop immediately
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function resize() {
    const hero = document.getElementById('hero');
    W = canvas.width  = hero ? hero.offsetWidth  : window.innerWidth;
    H = canvas.height = hero ? hero.offsetHeight : window.innerHeight;
    VX = W/2; HY = H*0.38; roadWBot = W*0.84;
  }

  function initDashes() {
    dashes = Array.from({length:16}, (_,i) => ({ z: i/16 + 0.01 }));
  }

  /* ─── INPUT ──────────────────────────────────────── */
  function setupInput() {
    document.addEventListener('keydown', onKey);
    let tx0 = 0;
    document.addEventListener('touchstart', e => { tx0 = e.touches[0].clientX; }, {passive:true});
    document.addEventListener('touchend',   e => {
      if (phase < PH.PHASE1) return;
      const dx = e.changedTouches[0].clientX - tx0;
      if (Math.abs(dx) > 30) moveLane(dx>0?1:-1);
    }, {passive:true});
  }

  function onKey(e) {
    const active = phase >= PH.PHASE1;
    if (e.key === 'Escape' && active) { stop(); return; }

    if (phase === PH.CHECKPOINT) {
      if (e.key===' '||e.key==='Enter') { e.preventDefault(); closeCheckpoint(); } return;
    }
    if (phase === PH.TRANSITION) {
      if (e.key===' '||e.key==='Enter') { e.preventDefault(); startP2(); } return;
    }
    if (phase === PH.GAMEOVER) {
      if (e.key===' '||e.key==='Enter'||e.key==='r'||e.key==='R') { e.preventDefault(); restartP2(); } return;
    }
    if (phase === PH.PHASE1 || phase === PH.PHASE2) {
      if (e.key==='ArrowLeft' ||e.key==='a'||e.key==='A') { e.preventDefault(); moveLane(-1); }
      if (e.key==='ArrowRight'||e.key==='d'||e.key==='D') { e.preventDefault(); moveLane( 1); }
    }
  }

  function moveLane(d) {
    playerTargetLane = clamp(playerTargetLane+d, 0, 2);
  }

  /* ─── START / STOP ───────────────────────────────── */
  function start() {
    // Go fullscreen
    canvas.style.position = 'fixed';
    canvas.style.inset     = '0';
    canvas.style.zIndex    = '500';
    canvas.style.width     = '100%';
    canvas.style.height    = '100%';
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    VX = W/2; HY = H*0.38; roadWBot = W*0.84;

    document.getElementById('game-overlay').classList.add('active');
    pauseHeroCanvas();
    hideCursor();

    // Reset for phase 1
    phase = PH.PHASE1;
    score = 0; lives = 3; totalDist = 0; cpIdx = 0;
    speed = P1_SPEED;
    playerLane = 1; playerTargetLane = 1; playerNormX = 0;
    obstacles = []; spawnT = 2.5;
    initDashes();
    updateHUD();

    if (typeof gtag!=='undefined') gtag('event','game_started',{event_category:'blr_game'});
  }

  function stop() {
    phase = PH.AMBIENT;
    // Back to hero-embedded
    canvas.style.position = 'absolute';
    canvas.style.inset     = '0';
    canvas.style.zIndex    = '2';
    canvas.style.width     = '';
    canvas.style.height    = '';
    resize();

    document.getElementById('game-overlay').classList.remove('active');
    hideSplash(); hideCP();
    resumeHeroCanvas(); showCursor();

    // Reset ambient
    speed = AMBIENT_SPEED;
    obstacles = [];
    playerNormX = 0; playerLane = 1; playerTargetLane = 1;
    initDashes();
  }

  /* ─── HERO CANVAS PAUSE ──────────────────────────── */
  function pauseHeroCanvas()  { if (window._pauseHeroCanvas)  window._pauseHeroCanvas(); }
  function resumeHeroCanvas() { if (window._resumeHeroCanvas) window._resumeHeroCanvas(); }
  function hideCursor()  { ['cursor','cursor-ring'].forEach(id=>{ const e=document.getElementById(id); if(e) e.style.display='none'; }); }
  function showCursor()  { ['cursor','cursor-ring'].forEach(id=>{ const e=document.getElementById(id); if(e) e.style.display=''; }); }

  /* ─── GAME LOOP ──────────────────────────────────── */
  function loop(now) {
    const dt = clamp((now-lastTime)/1000, 0, 0.05);
    lastTime = now;
    update(dt);
    render();
    raf = requestAnimationFrame(loop);  // always runs
  }

  /* ─── UPDATE ─────────────────────────────────────── */
  function update(dt) {
    ambientT += dt;

    // Shake decay
    if (shakeDur > 0) {
      shakeDur -= dt;
      shakeX = (Math.random()-0.5)*10*(shakeDur/0.35);
      shakeY = (Math.random()-0.5)*6*(shakeDur/0.35);
    } else { shakeX = shakeY = 0; }

    // Smooth lane lerp
    const tNX = LANE_NX[playerTargetLane];
    playerNormX = lerp(playerNormX, tNX, clamp(dt*9, 0, 1));
    if (Math.abs(playerNormX-tNX) < 0.003) playerNormX = tNX;

    if (phase === PH.AMBIENT) {
      scrollDashes(dt, AMBIENT_SPEED);
      // gentle auto drift
      if (Math.sin(ambientT*0.4) > 0.8)  playerTargetLane = 2;
      else if (Math.sin(ambientT*0.4) < -0.8) playerTargetLane = 0;
      else playerTargetLane = 1;
    }
    if (phase === PH.PHASE1) updateP1(dt);
    if (phase === PH.PHASE2) updateP2(dt);
  }

  function updateP1(dt) {
    scrollDashes(dt, speed);
    moveObs(dt);
    spawnT -= dt;
    if (spawnT <= 0) { spawnObs(); spawnT = 2.6 + Math.random()*1.6; }
    totalDist += speed * dt * 1000;
    if (cpIdx < CHECKPOINTS.length && totalDist >= CP_DISTS[cpIdx]) {
      reachCP(CHECKPOINTS[cpIdx]);
    } else if (cpIdx >= CHECKPOINTS.length && phase === PH.PHASE1) {
      phase = PH.TRANSITION;
      setTimeout(showTransition, 500);
    }
  }

  function updateP2(dt) {
    scrollDashes(dt, speed);
    moveObs(dt);
    spawnT -= dt;
    const interval = clamp(1.8 - (p2Time/50)*0.22, 0.42, 1.8);
    if (spawnT <= 0) { spawnObs(); spawnT = interval + Math.random()*0.4; }
    p2Time += dt;
    speed  = P2_SPEED_0 + p2Time*0.007;
    totalDist += speed*dt*1000;
    score  = Math.floor(p2Time*12 + totalDist/80);
    updateHUD();
    checkHits();
  }

  function scrollDashes(dt, spd) {
    dashes.forEach(d => { d.z -= spd*dt; if (d.z < 0) d.z += 1; });
  }
  function moveObs(dt) {
    obstacles.forEach(o => { o.z -= speed*dt; });
    obstacles = obstacles.filter(o => o.z > -0.06);
  }
  function spawnObs() {
    let ln; do { ln = Math.floor(Math.random()*3); } while(ln===playerTargetLane && Math.random()>0.35);
    const types = ['pothole','pothole','cone'];
    obstacles.push({ z:0.92+Math.random()*0.05, lane:ln, nx:LANE_NX[ln],
                     type:types[Math.floor(Math.random()*types.length)], hit:false });
  }
  function checkHits() {
    obstacles.forEach(o => {
      if (o.hit) return;
      if (Math.abs(o.z-0.12)<0.05 && Math.abs(o.nx-playerNormX)<0.24) {
        o.hit = true; lives--;
        shakeDur = 0.4; updateHUD();
        if (typeof gtag!=='undefined') gtag('event','pothole_hit',{event_category:'blr_game',value:lives});
        if (lives<=0) { phase=PH.GAMEOVER; setTimeout(showGameOver,600); }
      }
    });
  }

  /* ─── CHECKPOINTS ────────────────────────────────── */
  function reachCP(cp) {
    phase = PH.CHECKPOINT; cpIdx++; speed = 0;
    const card = document.getElementById('checkpoint-card');
    document.getElementById('cp-icon').textContent  = cp.icon;
    document.getElementById('cp-label').textContent = cp.label;
    document.getElementById('cp-facts').innerHTML   = cp.facts.map(f=>`<li>${f}</li>`).join('');
    document.getElementById('cp-continue-btn').onclick = closeCheckpoint;
    document.getElementById('cp-read-btn').onclick     = ()=>readSection(cp.id);
    card.classList.add('visible');
    if (typeof gtag!=='undefined') gtag('event','checkpoint',{event_category:'blr_game',event_label:cp.id});
  }

  function closeCheckpoint() {
    hideCP(); phase = PH.PHASE1;
    let v = 0;
    const iv = setInterval(()=>{ v+=0.014; speed=Math.min(P1_SPEED,v); if(speed>=P1_SPEED) clearInterval(iv); }, 40);
  }

  function readSection(id) {
    stop();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({behavior:'smooth'});
      setTimeout(()=>{
        el.style.transition='box-shadow 0.4s';
        el.style.boxShadow='0 0 60px rgba(255,215,0,0.22)';
        setTimeout(()=>{ el.style.boxShadow=''; },2400);
      },900);
    }
    if (typeof gtag!=='undefined') gtag('event','section_via_game',{event_category:'blr_game',event_label:id});
  }

  /* ─── SPLASH SCREENS ─────────────────────────────── */
  function showTransition() {
    setSplash(`<div class="splash-content">
      <div class="splash-kannada">ನಮ್ಮ ಬೆಂಗಳೂರು</div>
      <div class="splash-title">PHASE 2<br><span style="font-size:0.55em;color:#FFD700;">SURVIVAL MODE</span></div>
      <div class="splash-sub">Career tour complete! Now survive<br>Bengaluru's legendary roads.</div>
      <div class="splash-rules"><span>🛺 3 lives</span><span>⚡ speed ↑</span><span>🕳️ dodge potholes</span></div>
      <button class="splash-btn" onclick="BLRGame.startP2()">LET'S RIDE →</button>
      <div class="splash-hint">or press Space / Enter</div>
    </div>`);
  }

  function showGameOver() {
    const best = Math.max(score, parseInt(localStorage.getItem('blr_best')||'0'));
    localStorage.setItem('blr_best', String(best));
    setSplash(`<div class="splash-content">
      <div class="splash-title" style="color:#ff5555;">GAME<br>OVER</div>
      <div class="splash-kannada">ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ</div>
      <div style="font-size:28px;font-family:monospace;color:#FFD700;margin:12px 0;">SCORE: ${score}</div>
      <div style="font-size:13px;color:#888;font-family:monospace;margin-bottom:24px;">BEST: ${best}</div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;">
        <button class="splash-btn" onclick="BLRGame.restartP2()">PLAY AGAIN</button>
        <button class="splash-btn splash-btn-ghost" onclick="BLRGame.stop()">VIEW PORTFOLIO</button>
        <button class="splash-btn splash-btn-share" onclick="shareScore(${score})">SHARE 🐦</button>
      </div>
      <div class="splash-hint">R or Space to retry</div>
    </div>`);
  }

  function setSplash(html) { const e=document.getElementById('game-splash'); e.innerHTML=html; e.style.display='flex'; }
  function hideSplash()    { const e=document.getElementById('game-splash'); if(e) e.style.display='none'; }
  function hideCP()        { const e=document.getElementById('checkpoint-card'); if(e) e.classList.remove('visible'); }

  /* ─── HUD ────────────────────────────────────────── */
  function updateHUD() {
    const lv=document.getElementById('hud-lives');
    const sc=document.getElementById('hud-score');
    const ph=document.getElementById('hud-phase');
    if(lv) lv.innerHTML=[0,1,2].map(i=>`<span style="opacity:${i<lives?1:0.15};font-size:20px">🛺</span>`).join('');
    if(sc) sc.textContent = phase===PH.PHASE2 ? `SCORE: ${String(score).padStart(5,'0')}` : `${cpIdx} / ${CHECKPOINTS.length} stops`;
    if(ph) ph.textContent = phase===PH.PHASE2 ? 'PHASE 2 · SURVIVAL' : 'PHASE 1 · CAREER TOUR';
  }

  /* ─── PHASE 2 ────────────────────────────────────── */
  function startP2() {
    hideSplash(); phase=PH.PHASE2;
    p2Time=0; score=0; lives=3; totalDist=0; speed=P2_SPEED_0;
    playerLane=1; playerTargetLane=1; playerNormX=0;
    obstacles=[]; spawnT=1; initDashes(); updateHUD();
    if (typeof gtag!=='undefined') gtag('event','phase2_start',{event_category:'blr_game'});
  }
  function restartP2() { hideSplash(); startP2(); }

  /* ═══════════════════════════════════════════════════
     RENDER — Pixel / Sims aesthetic
  ═══════════════════════════════════════════════════ */
  function render() {
    ctx.save();
    if (shakeDur > 0) ctx.translate(shakeX, shakeY);
    ctx.clearRect(-20,-20,W+40,H+40);

    drawSky();
    drawCity();
    drawRoad();
    drawMarkings();
    drawObstacles();
    drawAuto();

    if (phase===PH.PHASE2 && speed>0.48) drawSpeedLines();
    ctx.restore();
  }

  /* ── SKY ── */
  function drawSky() {
    const night = phase===PH.PHASE2;
    const g = ctx.createLinearGradient(0,0,0,HY);
    if (night) {
      g.addColorStop(0,'#0d0b2b'); g.addColorStop(1,'#1e1040');
    } else {
      g.addColorStop(0,'#5bc8f5'); g.addColorStop(0.55,'#87d8f7'); g.addColorStop(1,'#fde8c0');
    }
    ctx.fillStyle=g; ctx.fillRect(0,0,W,HY);

    if (!night) {
      // Cartoon sun
      ctx.fillStyle='#FFE066';
      ctx.beginPath(); ctx.arc(W*.76,HY*.35,24,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,230,80,0.22)';
      ctx.beginPath(); ctx.arc(W*.76,HY*.35,38,0,Math.PI*2); ctx.fill();
      // Small fluffy clouds (pixel style)
      drawCloud(W*.18, HY*.28, 1.0);
      drawCloud(W*.5,  HY*.18, 0.75);
      drawCloud(W*.88, HY*.32, 0.9);
    } else {
      // Moon
      ctx.fillStyle='#d8dcff';
      ctx.beginPath(); ctx.arc(W*.82,HY*.25,16,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#0d0b2b';
      ctx.beginPath(); ctx.arc(W*.82+9,HY*.25-5,13,0,Math.PI*2); ctx.fill();
      // Stars
      ctx.fillStyle='rgba(255,255,255,0.85)';
      [[.07,.1],[.17,.2],[.3,.07],[.45,.16],[.55,.05],[.13,.36],[.4,.28],[.62,.12],[.7,.25]].forEach(([sx,sy])=>{
        ctx.beginPath(); ctx.arc(sx*W,sy*HY,1.6,0,Math.PI*2); ctx.fill();
      });
    }
  }

  function drawCloud(cx, cy, sc) {
    ctx.fillStyle='rgba(255,255,255,0.88)';
    const r=18*sc;
    [[0,0,r],[r*.75,-r*.25,r*.7],[r*1.4,0,r*.8],[-r*.75,-r*.15,r*.65]].forEach(([dx,dy,rr])=>{
      ctx.beginPath(); ctx.arc(cx+dx,cy+dy,rr,0,Math.PI*2); ctx.fill();
    });
  }

  /* ── CITY (Pixel / Sims style) ── */
  function drawCity() {
    const night = phase===PH.PHASE2;

    // Sky gradient fade for city depth
    if (!night) {
      const fg = ctx.createLinearGradient(0,HY*0.5,0,HY);
      fg.addColorStop(0,'rgba(180,210,240,0)');
      fg.addColorStop(1,'rgba(160,195,230,0.35)');
      ctx.fillStyle=fg; ctx.fillRect(0,HY*0.5,W,HY*0.5);
    }

    // Vidhana Soudha (center feature)
    drawSoudha(W*.28, HY, night);

    // Left buildings
    [[.04,62,78],[.10,45,105],[.17,56,85]].forEach(([xf,w,h])=>drawPixelBuilding(xf*W,HY,w,h,night));

    // Right buildings
    [[.54,58,88],[.62,42,118],[.70,64,82],[.77,38,130],[.84,50,96],[.91,68,72]].forEach(([xf,w,h])=>drawPixelBuilding(xf*W,HY,w,h,night));

    // Palm trees
    [.03,.08,.93,.97].forEach(xf=>drawPalmTree(xf*W,HY,night));
  }

  function drawPixelBuilding(cx, baseY, w, h, night) {
    const palette = night
      ? ['#12102a','#1a1838','#0f0e24']
      : ['#c8d8e8','#b8c8d8','#d0dde8','#bfced8'];
    ctx.fillStyle = palette[Math.floor(cx/80)%palette.length];
    // Main block
    ctx.beginPath(); ctx.roundRect(cx-w/2, baseY-h, w, h, [3,3,0,0]); ctx.fill();
    // Darker top accent
    ctx.fillStyle = night ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(cx-w/2, baseY-h, w, 6);
    // Windows (pixel style — small bright squares)
    const wc = night ? 'rgba(255,220,100,0.75)' : 'rgba(100,160,220,0.6)';
    ctx.fillStyle = wc;
    const cols = Math.max(2, Math.floor(w/16));
    const rows = Math.max(2, Math.floor(h/18));
    for (let r=0;r<rows;r++) {
      for (let c=0;c<cols;c++) {
        if (night ? Math.random()>0.45 : true) {
          const wx = cx-w/2+8 + c*(w-16)/(cols-1||1);
          const wy = baseY-h+12 + r*(h-24)/(rows-1||1);
          ctx.fillRect(wx-3,wy-4,6,7);
        }
      }
    }
    // Outline
    ctx.strokeStyle = night ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cx-w/2,baseY-h,w,h,[3,3,0,0]); ctx.stroke();
  }

  function drawSoudha(cx, baseY, night) {
    const col  = night ? '#0e0c28' : '#a8b8cc';
    const col2 = night ? '#1a1838' : '#c0d0e0';
    ctx.fillStyle = col;

    // Steps
    ctx.beginPath(); ctx.rect(cx-80, baseY-12, 160, 12); ctx.fill();
    ctx.beginPath(); ctx.rect(cx-70, baseY-24, 140, 12); ctx.fill();

    // Main building
    ctx.fillStyle = col2;
    ctx.beginPath(); ctx.roundRect(cx-62, baseY-100, 124, 76, [4,4,0,0]); ctx.fill();

    // Columns (pixel style)
    ctx.fillStyle = col;
    [-48,-24,0,24,48].forEach(dx => {
      ctx.beginPath(); ctx.roundRect(cx+dx-5,baseY-100,10,76,2); ctx.fill();
    });

    // Entablature
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(cx-66,baseY-108,132,12,[2,2,0,0]); ctx.fill();

    // Dome (pixel style — two arcs)
    ctx.fillStyle = col2;
    ctx.beginPath(); ctx.arc(cx, baseY-120, 32, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx, baseY-120, 24, Math.PI, 0); ctx.closePath(); ctx.fill();

    // Spire
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.rect(cx-4, baseY-162, 8, 42); ctx.fill();

    // Pixel flag
    const flagCols = night ? ['#ff9933','#ffffff','#138808'] : ['#ffb347','#ffffff','#5cb85c'];
    flagCols.forEach((c,i) => {
      ctx.fillStyle = c;
      ctx.fillRect(cx-2, baseY-175+i*5, 18, 5);
    });

    // Lit windows at night
    if (night) {
      ctx.fillStyle = 'rgba(255,220,100,0.6)';
      [[-40,-80],[-14,-80],[14,-80],[40,-80],[-40,-60],[-14,-60],[14,-60],[40,-60]].forEach(([dx,dy]) => {
        ctx.fillRect(cx+dx-3,baseY+dy,7,8);
      });
    }
  }

  function drawPalmTree(x, baseY, night) {
    const trunk = night ? '#1a2a14' : '#5a7a2a';
    const leaf  = night ? '#0d1a0a' : '#3a6420';
    ctx.save();
    ctx.strokeStyle = trunk; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, baseY); ctx.quadraticCurveTo(x+8,baseY-46,x+2,baseY-78);
    ctx.stroke();
    ctx.strokeStyle = leaf; ctx.lineWidth = 4;
    [[-28,-12],[-18,-3],[0,3],[18,-3],[28,-12],[10,-18],[-10,-18]].forEach(([lx,ly])=>{
      ctx.beginPath(); ctx.moveTo(x+2,baseY-78); ctx.quadraticCurveTo(x+lx/2,baseY-78+ly/2-14,x+lx,baseY-78+ly); ctx.stroke();
    });
    ctx.restore();
  }

  /* ── ROAD ── */
  function drawRoad() {
    // Asphalt
    const rg = ctx.createLinearGradient(0,HY,0,H);
    rg.addColorStop(0,'#404040'); rg.addColorStop(0.4,'#4a4a4a'); rg.addColorStop(1,'#525252');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(VX-roadWTop/2, HY);
    ctx.lineTo(VX+roadWTop/2, HY);
    ctx.lineTo(VX+roadWBot/2, H);
    ctx.lineTo(VX-roadWBot/2, H);
    ctx.closePath(); ctx.fill();

    // Kerb stones — alternating orange/white pixel stripes
    for (let side of [-1,1]) {
      for (let i=0;i<14;i++) {
        const z0=i/14, z1=(i+0.48)/14;
        const kw = lerp(2,18,1-z0);
        ctx.fillStyle = i%2===0 ? '#F08000' : '#E8E8E8';
        const x0e = projX(z0,side), x1e = projX(z1,side);
        ctx.beginPath();
        ctx.moveTo(x0e,         projY(z0));
        ctx.lineTo(x0e+side*kw*2, projY(z0));
        ctx.lineTo(x1e+side*kw*2, projY(z1));
        ctx.lineTo(x1e,         projY(z1));
        ctx.closePath(); ctx.fill();
      }
    }
  }

  /* ── ROAD MARKINGS ── */
  function drawMarkings() {
    // Double yellow centre
    ctx.strokeStyle='rgba(255,215,0,0.9)'; ctx.lineWidth=1.5;
    [-2,2].forEach(off=>{
      ctx.beginPath(); ctx.moveTo(VX+off,projY(0.97)); ctx.lineTo(VX+off,projY(0.03)); ctx.stroke();
    });
    // Dashed white lane dividers
    dashes.forEach(d=>{
      const z=d.z;
      if (z<0.03||z>0.96) return;
      const lw=lerp(0.4,3,z);
      ctx.strokeStyle=`rgba(255,255,255,${lerp(0.15,0.75,z)})`;
      ctx.lineWidth=lw;
      [-1/3, 1/3].forEach(nx=>{
        ctx.beginPath();
        ctx.moveTo(projX(z,nx),   projY(z));
        ctx.lineTo(projX(z+0.03,nx), projY(z+0.03));
        ctx.stroke();
      });
    });
    ctx.lineWidth=1;
  }

  /* ── OBSTACLES ── */
  function drawObstacles() {
    [...obstacles].sort((a,b)=>b.z-a.z).forEach(o=>{
      if (o.z<0.02||o.z>0.98) return;
      const sx=projX(o.z,o.nx), sy=projY(o.z), sc=oScale(o.z);
      if (o.type==='pothole') drawPothole(sx,sy,sc);
      else drawCone(sx,sy,sc);
    });
  }

  function drawPothole(x,y,sc) {
    const w=52*sc, h=24*sc;
    ctx.save(); ctx.translate(x,y);
    // Drop shadow
    ctx.fillStyle='rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(3,5,w*.88,h*.65,0,0,Math.PI*2); ctx.fill();
    // Outer rim — cracked asphalt
    ctx.fillStyle='#2a2015';
    ctx.beginPath(); ctx.ellipse(0,0,w,h,0,0,Math.PI*2); ctx.fill();
    // Inner hole
    const ig=ctx.createRadialGradient(0,0,0,0,0,w*.82);
    ig.addColorStop(0,'#050302'); ig.addColorStop(0.6,'#0e0906'); ig.addColorStop(1,'#22130a');
    ctx.fillStyle=ig;
    ctx.beginPath(); ctx.ellipse(0,0,w*.82,h*.72,0,0,Math.PI*2); ctx.fill();
    // Muddy puddle
    ctx.fillStyle='rgba(50,70,88,0.45)';
    ctx.beginPath(); ctx.ellipse(-w*.1,-h*.06,w*.25,h*.15,0.4,0,Math.PI*2); ctx.fill();
    // Cracks (pixel style)
    ctx.strokeStyle='#554030'; ctx.lineWidth=sc*1.4;
    [[w*.6,-h*.3,w*.85,-h*.52],[-w*.5,h*.25,-w*.78,h*.46],[w*.2,h*.4,w*.4,h*.58]].forEach(([x1,y1,x2,y2])=>{
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    });
    // Warning triangle
    if (sc>0.3) {
      ctx.fillStyle='#FFD700';
      ctx.beginPath(); ctx.moveTo(0,-h-10*sc); ctx.lineTo(-8*sc,-h); ctx.lineTo(8*sc,-h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#000'; ctx.lineWidth=sc; ctx.stroke();
      ctx.fillStyle='#000'; ctx.font=`bold ${6*sc}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('!',0,-h-5*sc);
    }
    ctx.restore();
  }

  function drawCone(x,y,sc) {
    const ch=36*sc, bw=20*sc;
    ctx.save(); ctx.translate(x,y);
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(2,ch/2+3,bw*.75,4*sc,0,0,Math.PI*2); ctx.fill();
    // Base plate
    ctx.fillStyle='#cc4400';
    ctx.beginPath(); ctx.roundRect(-bw,ch/2-2,bw*2,7,2); ctx.fill();
    // Cone
    ctx.fillStyle='#ff5500';
    ctx.beginPath(); ctx.moveTo(0,-ch/2); ctx.lineTo(-bw*.7,ch/2); ctx.lineTo(bw*.7,ch/2); ctx.closePath(); ctx.fill();
    // White stripe
    ctx.fillStyle='#fff';
    const sy=ch*.0, sh=ch*.15, sw=bw*.38;
    ctx.beginPath();
    ctx.moveTo(-sw,sy); ctx.lineTo(sw,sy); ctx.lineTo(sw*.75,sy+sh); ctx.lineTo(-sw*.75,sy+sh); ctx.closePath(); ctx.fill();
    // Outline
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=sc*1.2;
    ctx.beginPath(); ctx.moveTo(0,-ch/2); ctx.lineTo(-bw*.7,ch/2); ctx.lineTo(bw*.7,ch/2); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }

  /* ════════════════════════════════════════════════════
     AUTO RICKSHAW — Pixel / Sims 3D back view
     Reference: yellow Indian auto-rickshaw from behind
     Style: clean chunky shapes, bold outlines, drop shadows
  ════════════════════════════════════════════════════ */
  function drawAuto() {
    const sc  = phase === PH.AMBIENT ? 1.7 : 2.05;
    const cx  = projX(0.12, playerNormX);
    const cy  = projY(0.12) + 22;
    const tlt = (playerNormX - LANE_NX[playerTargetLane]) * 3;
    _drawAutoRickshaw(cx, cy, sc, tlt);
  }

  function _drawAutoRickshaw(cx, cy, sc, tilt) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.rotate(tilt * 0.035);

    const W2=50, H2=54; // half-width, half-height reference

    /* ── 1. Ground shadow ── */
    ctx.fillStyle='rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, H2+10, 58, 14, 0, 0, Math.PI*2); ctx.fill();

    /* ── 2. Rear axle ── */
    ctx.fillStyle='#222';
    ctx.beginPath(); ctx.roundRect(-W2-8, H2-10, (W2+8)*2, 8, 4); ctx.fill();

    /* ── 3. Wheels (pixel / chunky) ── */
    [[-W2+2, H2+4], [W2-2, H2+4]].forEach(([wx,wy])=>{
      // Tyre
      ctx.fillStyle='#1c1c1c';
      ctx.beginPath(); ctx.ellipse(wx, wy, 18, 14, 0, 0, Math.PI*2); ctx.fill();
      // Tyre inner
      ctx.fillStyle='#2c2c2c';
      ctx.beginPath(); ctx.ellipse(wx, wy, 13, 10, 0, 0, Math.PI*2); ctx.fill();
      // Rim
      ctx.fillStyle='#aaa';
      ctx.beginPath(); ctx.arc(wx, wy, 7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='#888';
      ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI*2); ctx.fill();
      // Hub
      ctx.fillStyle='#ccc';
      ctx.beginPath(); ctx.arc(wx, wy, 2.5, 0, Math.PI*2); ctx.fill();
      // Lug bolts
      ctx.fillStyle='#999';
      for (let a=0;a<5;a++) {
        const ax=wx+Math.cos(a*Math.PI*2/5)*4.5, ay=wy+Math.sin(a*Math.PI*2/5)*4.5;
        ctx.beginPath(); ctx.arc(ax,ay,1,0,Math.PI*2); ctx.fill();
      }
    });

    /* ── 4. MAIN BODY (yellow) ── */
    // Outer panel shape — slightly trapezoidal
    ctx.fillStyle='#FFD700';
    ctx.beginPath();
    ctx.moveTo(-W2,   H2-2);   // bottom-left
    ctx.lineTo( W2,   H2-2);   // bottom-right
    ctx.lineTo( W2-2, -H2+6);  // top-right
    ctx.lineTo(-W2+2, -H2+6);  // top-left
    ctx.closePath(); ctx.fill();

    // Body highlight (left panel slightly lighter)
    ctx.fillStyle='rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(-W2,H2-2); ctx.lineTo(-W2+2,-H2+6); ctx.lineTo(-W2/2,-H2+6); ctx.lineTo(-W2/2,H2-2); ctx.closePath(); ctx.fill();

    // Body shading (right + bottom)
    ctx.fillStyle='rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.moveTo(W2/3,H2-2); ctx.lineTo(W2,H2-2); ctx.lineTo(W2-2,-H2+6); ctx.lineTo(W2/3,-H2+6); ctx.closePath(); ctx.fill();

    /* ── 5. Black lower panel ── */
    ctx.fillStyle='#1a1a1a';
    ctx.beginPath(); ctx.roundRect(-W2+1, H2-22, (W2-1)*2, 20, [0,0,4,4]); ctx.fill();
    // Mud flap hint
    ctx.fillStyle='#111';
    ctx.beginPath(); ctx.roundRect(-W2+1, H2-4, 22, 6, [0,0,3,3]); ctx.fill();
    ctx.beginPath(); ctx.roundRect(W2-23, H2-4, 22, 6, [0,0,3,3]); ctx.fill();

    /* ── 6. Canopy / roof (signature auto shape) ── */
    // The iconic auto-rickshaw roof — curved trapezoid
    ctx.fillStyle='#1e1e1e';
    ctx.beginPath();
    ctx.moveTo(-W2+2, -H2+6);   // body top-left
    ctx.lineTo( W2-2, -H2+6);   // body top-right
    ctx.lineTo( W2-10,-H2-34);  // roof top-right
    ctx.lineTo(-W2+10,-H2-34);  // roof top-left
    ctx.closePath(); ctx.fill();

    // Roof top rail (chrome look)
    ctx.fillStyle='#444';
    ctx.beginPath(); ctx.roundRect(-W2+8, -H2-40, (W2-8)*2, 9, 4); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.roundRect(-W2+10, -H2-39, (W2-10)*2, 3, 2); ctx.fill();

    // Luggage rack lines on roof
    ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=1.5;
    [-20,-8,4,16].forEach(dx=>{
      ctx.beginPath();
      ctx.moveTo(dx,-H2-40); ctx.lineTo(dx,-H2-32);
      ctx.stroke();
    });

    // Canopy side light strip (yellow reflective)
    ctx.fillStyle='rgba(255,215,0,0.35)';
    ctx.beginPath(); ctx.roundRect(-W2+11,-H2+4,(W2-11)*2,4,2); ctx.fill();

    /* ── 7. Rear window ── */
    // Window frame
    ctx.fillStyle='#111';
    ctx.beginPath(); ctx.roundRect(-W2+8, -H2+8, (W2-8)*2, H2-14, 5); ctx.fill();
    // Glass
    ctx.fillStyle='#0a0e1c';
    ctx.beginPath(); ctx.roundRect(-W2+11, -H2+11, (W2-11)*2, H2-20, 4); ctx.fill();
    // Glass horizontal divider (bar)
    ctx.fillStyle='#111';
    ctx.fillRect(-W2+11, -8, (W2-11)*2, 3);
    // Upper glass reflection
    const rg2=ctx.createLinearGradient(-W2+11,-H2+11,12,-8);
    rg2.addColorStop(0,'rgba(150,200,255,0.08)'); rg2.addColorStop(1,'rgba(150,200,255,0)');
    ctx.fillStyle=rg2;
    ctx.beginPath(); ctx.roundRect(-W2+11,-H2+11,(W2-11)*2,H2-20,4); ctx.fill();
    // Silhouette of driver (pixel style — head and shoulders)
    ctx.fillStyle='rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.arc(0,-H2+28,9,0,Math.PI*2); ctx.fill(); // head
    ctx.beginPath(); ctx.ellipse(0,-H2+40,16,8,0,0,Math.PI); ctx.fill(); // shoulders

    /* ── 8. Taillights (pixel — bright chunky squares) ── */
    [[-W2+1,-28],[W2-13,-28]].forEach(([lx,ly])=>{
      // Housing
      ctx.fillStyle='#880000';
      ctx.beginPath(); ctx.roundRect(lx, ly, 12, 22, 3); ctx.fill();
      // Light element
      ctx.fillStyle='#ff2200';
      ctx.beginPath(); ctx.roundRect(lx+1.5, ly+1.5, 9, 19, 2); ctx.fill();
      // Pixel highlight inside
      ctx.fillStyle='rgba(255,120,100,0.6)';
      ctx.fillRect(lx+3, ly+3, 4, 6);
      // Glow halo
      const lxc=lx+6, lyc=ly+11;
      const gl=ctx.createRadialGradient(lxc,lyc,0,lxc,lyc,22);
      gl.addColorStop(0,'rgba(255,50,0,0.25)'); gl.addColorStop(1,'rgba(255,50,0,0)');
      ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(lxc,lyc,22,0,Math.PI*2); ctx.fill();
    });

    /* ── 9. Reverse light (small white) ── */
    ctx.fillStyle='rgba(220,230,255,0.7)';
    ctx.beginPath(); ctx.roundRect(-5, -24, 10, 8, 2); ctx.fill();

    /* ── 10. Number plate ── */
    // White plate
    ctx.fillStyle='#f2f2f0';
    ctx.beginPath(); ctx.roundRect(-22, H2-20, 44, 14, 2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.roundRect(-22,H2-20,44,14,2); ctx.stroke();
    // Text
    ctx.fillStyle='#111'; ctx.font='bold 6.5px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('KA 01 BLR', 0, H2-13);

    /* ── 11. Kannada / KARNATAKA text on body ── */
    ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.font='7px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillText('ಕರ್ನಾಟಕ', 0, H2-26);

    /* ── 12. Body outline (pixel — bold black edge) ── */
    ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(-W2, H2-2); ctx.lineTo(-W2+2,-H2+6);
    ctx.moveTo( W2, H2-2); ctx.lineTo( W2-2,-H2+6);
    ctx.stroke();
    // Bottom outline
    ctx.beginPath(); ctx.moveTo(-W2,H2-2); ctx.lineTo(W2,H2-2); ctx.stroke();

    ctx.restore();
  }

  /* ── SPEED LINES ── */
  function drawSpeedLines() {
    const t = clamp((speed-0.48)/0.3, 0, 1);
    ctx.strokeStyle=`rgba(255,255,255,${t*0.06})`;
    ctx.lineWidth=1;
    for (let i=0;i<16;i++) {
      const x=(Math.random()*.7+.15)*W;
      const y0=HY+Math.random()*(H-HY)*.3;
      ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x+(x-VX)*.015,y0+25+Math.random()*35); ctx.stroke();
    }
  }

  /* ─── PUBLIC API ─────────────────────────────────── */
  window.BLRGame = { init, start, stop, startP2, restartP2 };

  // Auto-init (starts ambient immediately)
  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

window.shareScore = function(s) {
  const t=`I survived Bengaluru roads for ${s} points on deveshrohan.com 🛺 Can you beat it?`;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent('https://deveshrohan.com')}`,'_blank');
};
