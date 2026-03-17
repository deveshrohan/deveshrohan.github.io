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
  const CP_DISTS = [550, 1250, 1950, 2650, 3350, 4050, 4750];
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
  let autoImgCanvas = null; // processed (white-stripped) auto image

  let phase         = PH.AMBIENT;
  let score         = 0, lives = 3;
  let totalDist     = 0, speed = 0;
  let playerLane    = 1, playerTargetLane = 1, playerNormX = 0;
  let obstacles     = [], dashes = [];
  let lastTime      = 0, raf = null;
  let shakeX = 0, shakeY = 0, shakeDur = 0;
  let cpIdx = 0, p2Time = 0, spawnT = 0, lastBillboardSide = -1;
  let ambientT      = 0;

  const AMBIENT_SPEED = 0.10;
  const P1_SPEED      = 0.24;
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
    // Preload auto image, strip white background
    const img = new Image();
    img.onload = () => { autoImgCanvas = _stripWhite(img); };
    img.src = '/auto.png';
    // Start ambient loop immediately
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function _stripWhite(img) {
    const oc = document.createElement('canvas');
    oc.width = img.naturalWidth; oc.height = img.naturalHeight;
    const octx = oc.getContext('2d');
    octx.drawImage(img, 0, 0);
    const id = octx.getImageData(0, 0, oc.width, oc.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      // Make near-white pixels fully transparent
      if (d[i] > 235 && d[i+1] > 235 && d[i+2] > 235) d[i+3] = 0;
    }
    octx.putImageData(id, 0, 0);
    return oc;
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
    document.getElementById('cp-icon').textContent  = cp.icon;
    document.getElementById('cp-label').textContent = cp.label;
    document.getElementById('cp-facts').innerHTML   = cp.facts.map(f => `<li>${f}</li>`).join('');
    const stopEl = document.getElementById('cp-stop-num');
    if (stopEl) stopEl.textContent = `${cpIdx} / ${CHECKPOINTS.length}`;
    document.getElementById('cp-continue-btn').onclick = closeCheckpoint;
    document.getElementById('cp-read-btn').onclick     = () => readSection(cp.id);
    const card = document.getElementById('checkpoint-card');
    card.classList.remove('from-left', 'from-right');
    card.classList.add(lastBillboardSide === -1 ? 'from-left' : 'from-right');
    // Force reflow so animation retriggers
    void card.offsetWidth;
    card.classList.add('visible');
    updateHUD();
    if (typeof gtag !== 'undefined') gtag('event', 'checkpoint', { event_category: 'blr_game', event_label: cp.id });
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
    drawGround();
    drawCity();
    drawRoad();
    drawMarkings();
    drawApproachBillboard();
    drawMilestones();
    drawElectricPoles();
    drawObstacles();
    drawAuto();

    if (phase===PH.PHASE2 && speed>0.48) drawSpeedLines();
    drawVignette();
    ctx.restore();
  }

  /* ── SKY ── */
  function drawSky() {
    const night = phase===PH.PHASE2;
    const g = ctx.createLinearGradient(0,0,0,HY);
    if (night) {
      g.addColorStop(0,'#02010f'); g.addColorStop(0.4,'#06041a'); g.addColorStop(0.75,'#0d0b2e'); g.addColorStop(1,'#1a1050');
    } else {
      // Golden-hour gradient: deep azure → sky blue → warm peach → amber at horizon
      g.addColorStop(0,   '#1565c0');
      g.addColorStop(0.28,'#42a5f5');
      g.addColorStop(0.62,'#80d4f5');
      g.addColorStop(0.82,'#ffcc80');
      g.addColorStop(1,   '#ff8a50');
    }
    ctx.fillStyle=g; ctx.fillRect(0,0,W,HY);

    if (!night) {
      // Horizon warm glow strip
      const hg = ctx.createLinearGradient(0, HY*0.72, 0, HY);
      hg.addColorStop(0, 'rgba(255,140,40,0)');
      hg.addColorStop(1, 'rgba(255,110,20,0.32)');
      ctx.fillStyle = hg; ctx.fillRect(0, HY*0.72, W, HY*0.28);

      // Sun — larger with dramatic radial corona
      const sx=W*.78, sy=HY*.26;
      [[80,0.05],[62,0.09],[48,0.15],[36,0.22]].forEach(([r,a])=>{
        const cg=ctx.createRadialGradient(sx,sy,0,sx,sy,r);
        cg.addColorStop(0,`rgba(255,200,60,${a})`); cg.addColorStop(1,'rgba(255,160,30,0)');
        ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(sx,sy,r,0,Math.PI*2); ctx.fill();
      });
      ctx.fillStyle='#FFF176'; ctx.beginPath(); ctx.arc(sx,sy,22,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#FFFFFF'; ctx.beginPath(); ctx.arc(sx,sy,13,0,Math.PI*2); ctx.fill();

      drawCloud(W*.14, HY*.22, 1.1);
      drawCloud(W*.44, HY*.13, 0.8);
      drawCloud(W*.82, HY*.30, 1.0);
      drawCloud(W*.63, HY*.08, 0.6);
    } else {
      // Moon with crescent shadow
      ctx.fillStyle='#ccd4ff'; ctx.beginPath(); ctx.arc(W*.8,HY*.22,18,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(W*.8,HY*.22,22,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#02010f'; ctx.beginPath(); ctx.arc(W*.8+11,HY*.22-6,15,0,Math.PI*2); ctx.fill();
      // Stars
      [[.06,.09,1.8],[.15,.18,1.4],[.28,.06,2.0],[.42,.14,1.5],[.53,.04,1.7],[.11,.32,1.2],[.38,.25,1.6],[.61,.1,1.9],[.68,.22,1.3],[.22,.4,1.0],[.5,.3,1.1],[.72,.4,1.4]].forEach(([sx,sy,r])=>{
        const sg=ctx.createRadialGradient(sx*W,sy*HY,0,sx*W,sy*HY,r*2.5);
        sg.addColorStop(0,'rgba(255,255,255,0.95)'); sg.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(sx*W,sy*HY,r*2.5,0,Math.PI*2); ctx.fill();
      });
    }
  }

  function drawCloud(cx, cy, sc) {
    ctx.save();
    const r = 22 * sc;
    // Blue-grey underside shadow
    ctx.fillStyle = 'rgba(140,170,210,0.38)';
    [[0,5,r],[r*.75,5-r*.2,r*.75],[r*1.4,5,r*.85],[-r*.8,5-r*.1,r*.7]].forEach(([dx,dy,rr])=>{
      ctx.beginPath(); ctx.arc(cx+dx,cy+dy,rr,0,Math.PI*2); ctx.fill();
    });
    // Main white cloud body
    ctx.fillStyle='rgba(255,255,255,0.96)';
    [[0,0,r],[r*.75,-r*.22,r*.75],[r*1.4,0,r*.85],[-r*.8,-r*.12,r*.7]].forEach(([dx,dy,rr])=>{
      ctx.beginPath(); ctx.arc(cx+dx,cy+dy,rr,0,Math.PI*2); ctx.fill();
    });
    // Warm amber tint on bottom (golden-hour effect)
    const tg = ctx.createLinearGradient(cx, cy-r, cx, cy+r*0.5);
    tg.addColorStop(0, 'rgba(255,160,60,0)');
    tg.addColorStop(1, 'rgba(255,130,40,0.20)');
    ctx.fillStyle = tg;
    [[0,0,r],[r*.75,-r*.22,r*.75],[r*1.4,0,r*.85],[-r*.8,-r*.12,r*.7]].forEach(([dx,dy,rr])=>{
      ctx.beginPath(); ctx.arc(cx+dx,cy+dy,rr,0,Math.PI*2); ctx.fill();
    });
    // Top highlight (bright white rim)
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    [[0,-r*.18,r*.55],[-r*.65,-r*.08,r*.38]].forEach(([dx,dy,rr])=>{
      ctx.beginPath(); ctx.arc(cx+dx,cy+dy,rr,0,Math.PI*2); ctx.fill();
    });
    ctx.restore();
  }

  /* ── GROUND — alternating strips (OutRun style) ── */
  function drawGround() {
    const night = phase === PH.PHASE2;

    // Alternating grass strips that get thinner near horizon
    const nStrips = 12;
    for (let i = 0; i < nStrips; i++) {
      const y0 = HY + (H - HY) * (i / nStrips);
      const y1 = HY + (H - HY) * ((i + 1) / nStrips);
      ctx.fillStyle = night
        ? (i % 2 === 0 ? '#090e07' : '#0d140a')
        : (i % 2 === 0 ? '#5aaa2e' : '#4e9424');
      ctx.fillRect(0, y0, W, y1 - y0 + 0.5);
    }

    // Dirt shoulder (tan strip between grass and kerb)
    ctx.fillStyle = night ? '#1c1c14' : '#c4a85a';
    ctx.beginPath();
    ctx.moveTo(0, HY);
    ctx.lineTo(projX(1, -1) - 2, HY);
    ctx.lineTo(projX(0, -1) - roadWBot * 0.04, H);
    ctx.lineTo(0, H);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, HY);
    ctx.lineTo(projX(1, 1) + 2, HY);
    ctx.lineTo(projX(0, 1) + roadWBot * 0.04, H);
    ctx.lineTo(W, H);
    ctx.closePath(); ctx.fill();

    // Horizon atmospheric haze
    if (!night) {
      const hz = ctx.createLinearGradient(0, HY - 18, 0, HY + 22);
      hz.addColorStop(0,    'rgba(210,230,250,0)');
      hz.addColorStop(0.45, 'rgba(200,220,245,0.28)');
      hz.addColorStop(1,    'rgba(200,220,245,0)');
      ctx.fillStyle = hz;
      ctx.fillRect(0, HY - 18, W, 40);
    }
  }

  /* ── CITY ── */
  function drawCity() {
    const night = phase === PH.PHASE2;

    // Background silhouette layer (distant buildings, desaturated)
    ctx.fillStyle = night ? 'rgba(18,16,48,0.75)' : 'rgba(155,178,208,0.48)';
    [[.02,90,52],[.07,70,68],[.13,80,45],[.20,55,62],[.26,75,38],
     [.47,65,55],[.54,85,42],[.60,62,68],[.66,90,48],[.72,72,60],[.79,55,78],[.86,82,40],[.93,66,54]
    ].forEach(([xf,w,h]) => ctx.fillRect(xf*W - w/2, HY - h, w, h));

    // Depth haze over background layer
    if (!night) {
      const dh = ctx.createLinearGradient(0, HY - 85, 0, HY);
      dh.addColorStop(0, 'rgba(175,205,238,0)');
      dh.addColorStop(1, 'rgba(175,205,238,0.42)');
      ctx.fillStyle = dh; ctx.fillRect(0, HY - 85, W, 85);
    }

    // Vidhana Soudha
    drawSoudha(W * .28, HY, night);

    // Left foreground buildings
    [[.04,62,78,0],[.10,45,105,2],[.17,56,85,4]].forEach(([xf,w,h,ci]) => drawPixelBuilding(xf*W,HY,w,h,night,ci));

    // Right foreground buildings
    [[.54,58,88,1],[.62,42,118,3],[.70,64,82,5],[.77,38,130,0],[.84,50,96,2],[.91,68,72,6]].forEach(([xf,w,h,ci]) => drawPixelBuilding(xf*W,HY,w,h,night,ci));

    // Palm trees
    [.03,.08,.93,.97].forEach(xf => drawPalmTree(xf*W, HY, night));
  }

  function drawPixelBuilding(cx, baseY, w, h, night, colorIdx) {
    const dayPalette = ['#f0dfc0','#cde0f0','#f0d0b0','#b8d8d4','#dcc8e8','#e8d4c0','#c4dce8'];
    const nightPalette = ['#131030','#1a1840','#0e0d28','#181638','#0c0e26'];
    const col = night
      ? nightPalette[(colorIdx||Math.floor(cx/70)) % nightPalette.length]
      : dayPalette[(colorIdx||Math.floor(cx/70)) % dayPalette.length];

    // Drop shadow for depth
    if (!night) {
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(cx - w/2 + 5, baseY - h + 5, w, h);
    }

    // Main body
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(cx-w/2, baseY-h, w, h, [5,5,0,0]); ctx.fill();

    // Right-side shading (3D feel)
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    ctx.fillRect(cx + w*0.28, baseY-h, w*0.22, h);

    // Roof parapet
    ctx.fillStyle = night ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.11)';
    ctx.beginPath(); ctx.roundRect(cx-w/2, baseY-h, w, 9, [5,5,0,0]); ctx.fill();

    // Water tank (Indian style, taller buildings only)
    if (h > 85 && !night) {
      ctx.fillStyle = '#8090a2';
      ctx.beginPath(); ctx.roundRect(cx-9, baseY-h-16, 18, 16, [3,3,0,0]); ctx.fill();
      ctx.fillStyle = '#607082';
      ctx.fillRect(cx-6, baseY-h-19, 4, 4);
      ctx.fillRect(cx+2, baseY-h-19, 4, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(cx-8, baseY-h-15, 5, 7);
    }

    // Ground-floor colourful shop front (very Indian)
    if (!night && h > 60) {
      const shopCols = ['#d03030','#d06820','#3070d0','#259050','#7030c0'];
      ctx.fillStyle = shopCols[(colorIdx||0) % shopCols.length];
      ctx.fillRect(cx-w/2, baseY-20, w, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(cx-w/2, baseY-20, w, 5);
    }

    // Windows
    const cols = Math.max(2, Math.floor(w/13));
    const rows = Math.max(2, Math.floor((h-28)/15));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = night ? Math.random() > 0.38 : true;
        if (!lit) continue;
        const wx = cx-w/2 + 7 + c*(w-14)/(cols-1||1);
        const wy = baseY-h + 15 + r*(h-36)/(rows-1||1);
        if (night) {
          ctx.fillStyle = Math.random()>0.25 ? 'rgba(255,225,110,0.88)' : 'rgba(180,205,255,0.68)';
          ctx.fillRect(wx-3, wy-4, 7, 9);
          ctx.fillStyle = 'rgba(255,200,50,0.10)';
          ctx.fillRect(wx-6, wy-7, 13, 15);
        } else {
          ctx.fillStyle = 'rgba(120,175,230,0.62)';
          ctx.beginPath(); ctx.roundRect(wx-3, wy-4, 7, 9, [3,3,0,0]); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillRect(wx-3, wy-4, 2, 4);
        }
      }
    }

    // Outline
    ctx.strokeStyle = night ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(cx-w/2, baseY-h, w, h, [5,5,0,0]); ctx.stroke();
  }

  function drawSoudha(cx, baseY, night) {
    const stone = night ? '#0e0c2a' : '#b8cce0';
    const lite  = night ? '#1c1a44' : '#d4e4f4';
    const gold  = night ? '#ffd700' : '#ddc870';

    // Drop shadow
    if (!night) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(cx-76+6, baseY-172+6, 152, 172);
    }

    // Plinth steps
    [[92,9],[82,9],[72,10]].forEach(([hw, hh], i) => {
      ctx.fillStyle = night
        ? `rgba(${18+i*4},${16+i*4},${48+i*6},1)`
        : `rgba(${168+i*10},${188+i*10},${208+i*10},1)`;
      ctx.fillRect(cx-hw, baseY - (i+1)*hh, hw*2, hh);
    });

    // Main building body
    ctx.fillStyle = lite;
    ctx.beginPath(); ctx.roundRect(cx-65, baseY-108, 130, 80, [3,3,0,0]); ctx.fill();
    // Side shade
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    ctx.fillRect(cx+28, baseY-108, 37, 80);

    // Colonnade pillars with arches
    ctx.fillStyle = stone;
    [-48,-24,0,24,48].forEach(dx => {
      ctx.beginPath(); ctx.roundRect(cx+dx-5, baseY-108, 10, 80, 2); ctx.fill();
    });
    // Arches between pillars
    if (!night) {
      ctx.fillStyle = 'rgba(140,168,200,0.38)';
      [-36,-12,12,36].forEach(dx => {
        ctx.beginPath(); ctx.arc(cx+dx, baseY-88, 10, Math.PI, 0); ctx.closePath(); ctx.fill();
      });
    }

    // Entablature
    ctx.fillStyle = stone;
    ctx.beginPath(); ctx.roundRect(cx-69, baseY-116, 138, 12, [2,2,0,0]); ctx.fill();
    // Frieze highlight
    ctx.fillStyle = 'rgba(255,255,200,0.30)';
    ctx.fillRect(cx-65, baseY-113, 130, 4);

    // Dome base
    ctx.fillStyle = stone;
    ctx.beginPath(); ctx.arc(cx, baseY-128, 36, Math.PI, 0); ctx.closePath(); ctx.fill();
    // Dome highlight
    ctx.fillStyle = lite;
    ctx.beginPath(); ctx.arc(cx-10, baseY-136, 23, Math.PI, 0); ctx.closePath(); ctx.fill();
    // Inner dome shadow
    ctx.fillStyle = stone;
    ctx.beginPath(); ctx.arc(cx, baseY-128, 28, Math.PI, 0); ctx.closePath(); ctx.fill();

    // Gold dome cap
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.arc(cx, baseY-145, 8, 0, Math.PI*2); ctx.fill();
    if (night) {
      ctx.fillStyle = 'rgba(255,215,0,0.18)';
      ctx.beginPath(); ctx.arc(cx, baseY-145, 20, 0, Math.PI*2); ctx.fill();
    }

    // Spire
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(cx, baseY-175);
    ctx.lineTo(cx-3, baseY-151);
    ctx.lineTo(cx+3, baseY-151);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.arc(cx, baseY-175, 3.5, 0, Math.PI*2); ctx.fill();

    // Indian flag
    const fy = baseY-179;
    ctx.fillStyle = '#FF9933'; ctx.fillRect(cx+1, fy,    22, 6);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(cx+1, fy+6,  22, 6);
    ctx.fillStyle = '#138808'; ctx.fillRect(cx+1, fy+12, 22, 6);
    ctx.strokeStyle = 'rgba(0,0,128,0.65)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(cx+12, fy+9, 4, 0, Math.PI*2); ctx.stroke();

    // Night window glow
    if (night) {
      [[-42,-88],[-18,-88],[6,-88],[30,-88],[-42,-66],[-18,-66],[6,-66],[30,-66]].forEach(([dx,dy]) => {
        ctx.fillStyle = 'rgba(255,215,80,0.55)';
        ctx.fillRect(cx+dx-4, baseY+dy, 8, 10);
        ctx.fillStyle = 'rgba(255,200,50,0.12)';
        ctx.fillRect(cx+dx-8, baseY+dy-4, 16, 18);
      });
    }
  }

  function drawPalmTree(x, baseY, night) {
    const trunkDark  = night ? '#111a0d' : '#5a3a18';
    const trunkLight = night ? '#1a2a14' : '#7a5228';
    const leafDark   = night ? '#0a150a' : '#2a5a18';
    const leafMid    = night ? '#0d1a0d' : '#3e7828';
    const leafTipC   = night ? '#0a130a' : '#5aa030';
    ctx.save();

    // Trunk — slightly curved, tapers toward top
    const tipX = x + 6, tipY = baseY - 82;
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const y0 = baseY - (baseY - tipY) * t0;
      const y1 = baseY - (baseY - tipY) * t1;
      const bx = x + (tipX - x) * t0 + Math.sin(t0 * Math.PI) * 5;
      const w0 = lerp(9, 4, t0);
      ctx.fillStyle = i % 2 === 0 ? trunkDark : trunkLight;
      ctx.beginPath();
      ctx.moveTo(bx - w0, y0); ctx.lineTo(bx + w0, y0);
      ctx.lineTo(bx + w0 - 0.5, y1); ctx.lineTo(bx - w0 + 0.5, y1);
      ctx.closePath(); ctx.fill();
    }

    // Leaf fronds — filled triangular shapes fanning out
    const fronds = [
      { dx:-34, dy:-6,  cx:-18, cy:-26 },
      { dx:-24, dy: 4,  cx:-12, cy:-18 },
      { dx: -8, dy: 10, cx: -4, cy:-12 },
      { dx:  8, dy: 10, cx:  4, cy:-12 },
      { dx: 24, dy: 4,  cx: 12, cy:-18 },
      { dx: 34, dy:-6,  cx: 18, cy:-26 },
      { dx: 14, dy:-22, cx:  8, cy:-32 },
      { dx: -14,dy:-22, cx: -8, cy:-32 },
    ];
    fronds.forEach(({ dx, dy, cx, cy }, fi) => {
      const ex = tipX + dx, ey = tipY + dy;
      const cpx = tipX + cx, cpy = tipY + cy;
      // Fill frond as thin tapered shape
      ctx.fillStyle = fi < 6 ? leafMid : leafDark;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.quadraticCurveTo(cpx - 4, cpy + 3, ex, ey);
      ctx.quadraticCurveTo(cpx + 4, cpy + 3, tipX, tipY);
      ctx.fill();
      // Lighter midrib
      ctx.strokeStyle = leafTipC; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY); ctx.quadraticCurveTo(cpx, cpy, ex, ey);
      ctx.stroke();
    });

    // Crown hub (darker circle where fronds meet)
    ctx.fillStyle = trunkDark;
    ctx.beginPath(); ctx.arc(tipX, tipY, 5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  /* ── ROAD ── */
  function drawRoad() {
    // Base asphalt
    const rg = ctx.createLinearGradient(0, HY, 0, H);
    rg.addColorStop(0,   '#383838');
    rg.addColorStop(0.4, '#444444');
    rg.addColorStop(1,   '#505050');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(VX-roadWTop/2, HY);
    ctx.lineTo(VX+roadWTop/2, HY);
    ctx.lineTo(VX+roadWBot/2, H);
    ctx.lineTo(VX-roadWBot/2, H);
    ctx.closePath(); ctx.fill();

    // Worn centre crown (subtle lighter strip)
    const crown = ctx.createLinearGradient(VX-roadWBot*0.1, 0, VX+roadWBot*0.1, 0);
    crown.addColorStop(0,   'rgba(255,255,255,0)');
    crown.addColorStop(0.5, 'rgba(255,255,255,0.045)');
    crown.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = crown;
    ctx.beginPath();
    ctx.moveTo(VX-roadWTop*0.28, HY);
    ctx.lineTo(VX+roadWTop*0.28, HY);
    ctx.lineTo(VX+roadWBot*0.28, H);
    ctx.lineTo(VX-roadWBot*0.28, H);
    ctx.closePath(); ctx.fill();

    // Kerb stones — alternating orange/white (Indian tricolor-inspired)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 16; i++) {
        const z0 = i/16, z1 = (i+0.5)/16;
        const kw = lerp(2, 20, 1-z0);
        ctx.fillStyle = i%2===0 ? '#F07010' : '#E8E8E8';
        const x0e = projX(z0,side), x1e = projX(z1,side);
        ctx.beginPath();
        ctx.moveTo(x0e,           projY(z0));
        ctx.lineTo(x0e+side*kw*2, projY(z0));
        ctx.lineTo(x1e+side*kw*2, projY(z1));
        ctx.lineTo(x1e,           projY(z1));
        ctx.closePath(); ctx.fill();
      }
    }

    // Atmospheric depth fog on road surface (near = clear, horizon = hazy)
    const night = phase === PH.PHASE2;
    const fogG = ctx.createLinearGradient(0, H, 0, HY);
    fogG.addColorStop(0, 'rgba(180,180,180,0)');
    fogG.addColorStop(1, night ? 'rgba(20,16,50,0.28)' : 'rgba(200,220,245,0.22)');
    ctx.fillStyle = fogG;
    ctx.beginPath();
    ctx.moveTo(VX-roadWTop/2, HY);
    ctx.lineTo(VX+roadWTop/2, HY);
    ctx.lineTo(VX+roadWBot/2, H);
    ctx.lineTo(VX-roadWBot/2, H);
    ctx.closePath(); ctx.fill();

    // Subtle road surface sheen (wet asphalt effect near bottom)
    const sheenG = ctx.createLinearGradient(VX-roadWBot*0.5, 0, VX+roadWBot*0.5, 0);
    sheenG.addColorStop(0,   'rgba(255,255,255,0)');
    sheenG.addColorStop(0.42,'rgba(255,255,255,0.03)');
    sheenG.addColorStop(0.5, 'rgba(255,255,255,0.07)');
    sheenG.addColorStop(0.58,'rgba(255,255,255,0.03)');
    sheenG.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = sheenG;
    ctx.beginPath();
    ctx.moveTo(VX-roadWTop/2, HY);
    ctx.lineTo(VX+roadWTop/2, HY);
    ctx.lineTo(VX+roadWBot/2, H);
    ctx.lineTo(VX-roadWBot/2, H);
    ctx.closePath(); ctx.fill();
  }

  /* ── ELECTRIC POLES (scrolling Indian roadside poles) ── */
  function drawElectricPoles() {
    if (phase === PH.AMBIENT) return;
    const night = phase === PH.PHASE2;
    const poleCol  = night ? '#282828' : '#524838';
    const wireCol  = night ? 'rgba(38,38,38,0.7)' : 'rgba(58,48,36,0.55)';
    const insulCol = '#8a7040';

    for (let i = 0; i < 4; i++) {
      const scroll = (totalDist * 0.0014 + i * 0.25) % 1;
      const z  = lerp(0.14, 0.91, scroll);
      const sc = oScale(z);
      if (sc < 0.06) continue;

      const ph2 = 74 * sc;
      const arm = 24 * sc;
      const lx  = projX(z, -1.28);
      const rx  = projX(z,  1.28);
      const ly  = projY(z);

      // Left pole
      ctx.strokeStyle = poleCol; ctx.lineWidth = 4.5*sc; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly-ph2); ctx.stroke();
      ctx.lineWidth = 2.5*sc;
      ctx.beginPath(); ctx.moveTo(lx-arm, ly-ph2+6*sc); ctx.lineTo(lx+arm*0.35, ly-ph2+6*sc); ctx.stroke();
      ctx.fillStyle = insulCol;
      [lx-arm, lx].forEach(ix => { ctx.beginPath(); ctx.arc(ix, ly-ph2+6*sc, 2.8*sc, 0, Math.PI*2); ctx.fill(); });

      // Right pole (mirror)
      ctx.strokeStyle = poleCol; ctx.lineWidth = 4.5*sc;
      ctx.beginPath(); ctx.moveTo(rx, ly); ctx.lineTo(rx, ly-ph2); ctx.stroke();
      ctx.lineWidth = 2.5*sc;
      ctx.beginPath(); ctx.moveTo(rx+arm, ly-ph2+6*sc); ctx.lineTo(rx-arm*0.35, ly-ph2+6*sc); ctx.stroke();
      ctx.fillStyle = insulCol;
      [rx+arm, rx].forEach(ix => { ctx.beginPath(); ctx.arc(ix, ly-ph2+6*sc, 2.8*sc, 0, Math.PI*2); ctx.fill(); });

      // Catenary wire
      ctx.strokeStyle = wireCol; ctx.lineWidth = sc*0.9;
      ctx.beginPath();
      ctx.moveTo(lx-arm, ly-ph2+6*sc);
      ctx.quadraticCurveTo((lx+rx)/2, ly-ph2+14*sc, rx+arm, ly-ph2+6*sc);
      ctx.stroke();

      // Night street-lamp glow
      if (night && sc > 0.28) {
        ctx.fillStyle = 'rgba(255,220,100,0.16)';
        ctx.beginPath(); ctx.arc(lx, ly-ph2, 16*sc, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,100,0.80)';
        ctx.beginPath(); ctx.arc(lx, ly-ph2, 4*sc, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,100,0.16)';
        ctx.beginPath(); ctx.arc(rx, ly-ph2, 16*sc, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,100,0.80)';
        ctx.beginPath(); ctx.arc(rx, ly-ph2, 4*sc, 0, Math.PI*2); ctx.fill();
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

  /* ── MILESTONES (Indian-style km markers) ── */
  function drawMilestones() {
    if (phase === PH.AMBIENT) return;
    // Draw 3 milestone pillars at different depths
    [0.3, 0.55, 0.78].forEach((z, i) => {
      const scroll = (totalDist * 0.0008 + i * 0.333) % 1;
      const mz = lerp(0.15, 0.88, scroll);
      const mx = projX(mz, -1.15); // left side
      const my = projY(mz);
      const ms = oScale(mz) * 1.2;
      if (ms < 0.08) return;

      ctx.save(); ctx.translate(mx, my);
      // Post
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-3*ms, 0, 6*ms, 20*ms);
      // Yellow/black bottom stripe (Indian style)
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(-3*ms, 14*ms, 6*ms, 4*ms);
      ctx.fillStyle = '#222';
      ctx.fillRect(-3*ms, 18*ms, 6*ms, 2*ms);
      ctx.restore();
    });
  }

  /* ── SINGLE ALTERNATING APPROACH BILLBOARD ── */
  function drawApproachBillboard() {
    if (phase !== PH.PHASE1) return;
    if (cpIdx >= CHECKPOINTS.length) return;
    const distToCP = CP_DISTS[cpIdx] - totalDist;
    if (distToCP < 5 || distToCP > 700) return;

    const cp   = CHECKPOINTS[cpIdx];
    const sn   = cpIdx + 1;
    // Even checkpoints → LEFT side, odd → RIGHT side
    const side = cpIdx % 2 === 0 ? -1 : 1;
    lastBillboardSide = side;

    const ratio = 1 - distToCP / 700;
    const z     = clamp(0.96 - ratio * 0.88, 0.08, 0.96);
    const bsc   = oScale(z);
    if (bsc < 0.03) return;
    const nx = side * 1.55;
    drawRoadsideBillboard(projX(z, nx), projY(z), bsc, cp, sn, side);
  }

  function drawRoadsideBillboard(x, y, sc, cp, stopNum, side) {
    ctx.save();
    ctx.translate(x, y);

    const bw = 360 * sc;   // wide hoarding
    const bh = 240 * sc;   // tall hoarding
    const pw = 12 * sc;
    const ph = 60 * sc;
    const fh = (bh - 52 * sc) / 3;

    // Posts
    [-bw * 0.27, bw * 0.27].forEach(dx => {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(dx + 3 * sc, 2 * sc, pw, ph);
      ctx.fillStyle = '#6b6b56';
      ctx.fillRect(dx - pw / 2, 0, pw, ph);
      ctx.fillStyle = '#4a4a38';
      ctx.beginPath(); ctx.roundRect(dx - pw * 1.3, ph - 4 * sc, pw * 2.6, 6 * sc, 2 * sc); ctx.fill();
    });

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.roundRect(-bw / 2 + 7 * sc, -bh + 7 * sc, bw, bh, 14 * sc); ctx.fill();

    // Main board
    ctx.fillStyle = '#FFFDE7';
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh, bw, bh, 14 * sc); ctx.fill();

    // Outer border
    ctx.strokeStyle = '#BF360C'; ctx.lineWidth = 6 * sc;
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh, bw, bh, 14 * sc); ctx.stroke();

    // Inner gold border
    ctx.strokeStyle = '#FFC107'; ctx.lineWidth = 2.5 * sc;
    ctx.beginPath(); ctx.roundRect(-bw / 2 + 8 * sc, -bh + 8 * sc, bw - 16 * sc, bh - 16 * sc, 10 * sc); ctx.stroke();

    // Header strip
    ctx.fillStyle = '#E64A19';
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh, bw, 44 * sc, [14 * sc, 14 * sc, 0, 0]); ctx.fill();

    if (sc > 0.09) {
      ctx.textBaseline = 'middle';

      // Icon
      ctx.font = `${20 * sc}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(cp.icon, -bw / 2 + 28 * sc, -bh + 22 * sc);

      // Label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${14 * sc}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(cp.label.toUpperCase(), -bw / 2 + 48 * sc, -bh + 15 * sc);

      // Kannada subtext
      ctx.fillStyle = 'rgba(255,230,150,0.85)';
      ctx.font = `${9 * sc}px sans-serif`;
      ctx.fillText('ನಮ್ಮ ಬೆಂಗಳೂರು Career Journey', -bw / 2 + 48 * sc, -bh + 31 * sc);

      // Stop badge
      ctx.fillStyle = '#FFC107';
      ctx.beginPath(); ctx.roundRect(bw / 2 - 38 * sc, -bh + 8 * sc, 32 * sc, 28 * sc, 7 * sc); ctx.fill();
      ctx.fillStyle = '#1a0800';
      ctx.font = `bold ${8 * sc}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('STOP', bw / 2 - 22 * sc, -bh + 11 * sc);
      ctx.font = `bold ${12 * sc}px monospace`;
      ctx.fillText(`${stopNum}/7`, bw / 2 - 22 * sc, -bh + 22 * sc);
    }

    // Facts section
    if (sc > 0.11) {
      cp.facts.forEach((fact, i) => {
        const fy = -bh + 52 * sc + i * fh;
        const cardH = fh - 6 * sc;

        // Card bg
        ctx.fillStyle = i % 2 === 0 ? 'rgba(230,74,25,0.07)' : 'rgba(255,193,7,0.10)';
        ctx.beginPath(); ctx.roundRect(-bw / 2 + 10 * sc, fy, bw - 20 * sc, cardH, 7 * sc); ctx.fill();

        // Accent bar
        ctx.fillStyle = '#E64A19';
        ctx.beginPath(); ctx.roundRect(-bw / 2 + 10 * sc, fy, 4 * sc, cardH, 2 * sc); ctx.fill();

        if (sc > 0.13) {
          // Bullet number circle
          ctx.fillStyle = '#E64A19';
          ctx.beginPath(); ctx.arc(-bw / 2 + 24 * sc, fy + cardH / 2, 7 * sc, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${7 * sc}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), -bw / 2 + 24 * sc, fy + cardH / 2);

          // Fact text with wrapping
          ctx.fillStyle = '#1a0800';
          ctx.font = `${9 * sc}px sans-serif`;
          ctx.textAlign = 'left';
          const maxW = bw - 60 * sc;
          const textX = -bw / 2 + 36 * sc;

          const words = fact.split(' ');
          const lines = [''];
          words.forEach(word => {
            const test = (lines[lines.length - 1] ? lines[lines.length - 1] + ' ' : '') + word;
            if (ctx.measureText(test).width > maxW && lines[lines.length - 1]) {
              lines.push(word);
            } else {
              lines[lines.length - 1] = test;
            }
          });
          const twoLines = lines.slice(0, 2);

          if (twoLines.length === 1) {
            ctx.fillText(twoLines[0], textX, fy + cardH / 2);
          } else {
            ctx.font = `${9 * sc}px sans-serif`;
            ctx.fillText(twoLines[0], textX, fy + cardH * 0.32);
            ctx.font = `${8 * sc}px sans-serif`;
            ctx.fillStyle = '#3a1a00';
            ctx.fillText(twoLines[1], textX, fy + cardH * 0.68);
          }
        }
      });
    }

    // Bottom CTA strip
    if (sc > 0.18) {
      ctx.fillStyle = '#BF360C';
      ctx.beginPath(); ctx.roundRect(-bw / 2, -10 * sc, bw, 10 * sc, [0, 0, 14 * sc, 14 * sc]); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${6 * sc}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PRESS SPACE TO STOP  ·  deveshrohan.com', 0, -5 * sc);
    }

    ctx.restore();
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
    const sc  = phase === PH.AMBIENT ? 1.7 : 2.5;
    const cx  = projX(0.10, playerNormX);
    const cy  = projY(0.10) + 18;
    const tlt = (playerNormX - LANE_NX[playerTargetLane]) * 3;
    if (autoImgCanvas) {
      _drawAutoImage(cx, cy, sc, tlt);
    } else {
      _drawAutoRickshaw(cx, cy, sc, tlt);
    }
  }

  function _drawAutoImage(cx, cy, sc, tilt) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.rotate(tilt * 0.035);

    // The auto.png is a square image; auto body occupies ~10–88% width, ~10–84% height
    // We position so the bottom of the auto (wheels) sits at y=0 reference point
    const dh = 190;           // display height in game units
    const dw = dh;            // square image
    const autoBottomFrac = 0.86; // wheels are ~86% down the image

    // Ground shadow — layered for soft penumbra
    const shadowY = dh * (1 - autoBottomFrac) + 12;
    const sg = ctx.createRadialGradient(8, shadowY, 4, 8, shadowY, 72);
    sg.addColorStop(0,   'rgba(0,0,0,0.38)');
    sg.addColorStop(0.55,'rgba(0,0,0,0.18)');
    sg.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(8, shadowY, 72, 18, 0.08, 0, Math.PI * 2); ctx.fill();

    ctx.drawImage(autoImgCanvas, -dw / 2, -dh * autoBottomFrac, dw, dh);
    ctx.restore();
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
    // NAMMA BLR sticker on glass
    ctx.fillStyle='rgba(255,215,0,0.7)';
    ctx.font='bold 5px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('NAMMA BLR 🛺', 0, H2-28);
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

  /* ── VIGNETTE ── */
  function drawVignette() {
    const vg = ctx.createRadialGradient(W/2, H*0.55, H*0.25, W/2, H*0.55, H*0.82);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
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
