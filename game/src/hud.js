// The DOM HUD: health, armour, ammo, money, timer, score, kill feed, round banners,
// plant progress, the buy menu and a 2D minimap. It never touches the simulation;
// the game pushes numbers in and reads callbacks out. All DOM writes are cached so
// unchanged values cost nothing per frame.
const COPY = {
  start: {
    title: 'Kestrel Yard',
    copy: 'A round-based tactical FPS in an old freight depot. Five Kestrels against five Vultures. Plant the charge or clear the yard — first to 8 rounds wins.',
    action: 'Click to play',
  },
  paused: {
    title: 'Kestrel Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your team fights on. Click to keep watching.',
    action: 'Keep watching',
  },
  matchWin: {
    title: 'Match won',
    copy: 'The Kestrels take the yard.',
    action: 'Play again',
  },
  matchLose: {
    title: 'Match lost',
    copy: 'The Vultures hold the yard this time.',
    action: 'Play again',
  },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const healthEl = $('health');
  const healthValue = $('health-value');
  const armorValue = $('armor-value');
  const ammoEl = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const timerEl = $('timer');
  const roundLabel = $('round-label');
  const scoreK = $('score-k');
  const scoreV = $('score-v');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const plantbar = $('plantbar');
  const plantLabel = $('plant-label');
  const plantFill = $('plant-fill');
  const buyEl = $('buy');
  const buyTable = $('buy-table');
  const minimap = $('minimap');
  const mctx = minimap.getContext('2d');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');

  let lastHp = -1;
  let lastArmor = -1;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastMoney = -1;
  let lastTimer = '';
  let lastRound = -1;
  let lastScoreK = -1;
  let lastScoreV = -1;
  let hitTimer = 0;
  let bannerTimer = 0;
  let buyItems = [];
  let buyVisible = false;

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function renderBuy() {
    buyTable.innerHTML = '';
    for (const item of buyItems) {
      const row = document.createElement('tr');
      const key = document.createElement('td');
      key.className = 'key';
      key.textContent = item.key;
      const name = document.createElement('td');
      name.textContent = item.name;
      const price = document.createElement('td');
      price.className = 'price';
      price.textContent = item.owned ? '' : `$${item.price}`;
      const owned = document.createElement('td');
      owned.className = 'owned';
      owned.textContent = item.owned ? (item.equipped ? 'EQUIPPED' : 'OWNED') : '';
      row.append(key, name, price, owned);
      buyTable.appendChild(row);
    }
  }

  window.addEventListener('keydown', (event) => {
    if (!buyVisible) return;
    const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(event.code);
    if (index >= 0 && buyItems[index] && callbacks.onBuy) callbacks.onBuy(buyItems[index].id);
  });

  return {
    setHealth(hp, armor) {
      if (hp === lastHp && armor === lastArmor) return;
      lastHp = hp;
      lastArmor = armor;
      healthValue.textContent = String(Math.max(0, Math.ceil(hp)));
      armorValue.textContent = String(Math.max(0, Math.ceil(armor)));
      healthEl.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, name) {
      if (mag === lastMag && reserve === lastReserve && name === lastWeapon) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name.toUpperCase();
      ammoEl.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = String(value);
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${fmtTime(seconds)}` : fmtTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerEl.textContent = text;
      timerEl.classList.toggle('urgent', phase !== 'buy' && seconds <= 10);
    },
    setScore(k, v, round) {
      if (k === lastScoreK && v === lastScoreV && round === lastRound) return;
      lastScoreK = k;
      lastScoreV = v;
      lastRound = round;
      scoreK.textContent = String(k);
      scoreV.textContent = String(v);
      roundLabel.textContent = `ROUND ${round}`;
    },
    killfeed(killer, victim, headshot, killerTeam) {
      const row = document.createElement('div');
      const killerEl = document.createElement('b');
      killerEl.textContent = killer;
      killerEl.style.color = killerTeam === 'K' ? '#2fae9e' : '#c65a3a';
      row.appendChild(killerEl);
      row.appendChild(document.createTextNode(headshot ? ' ⌖ ' : ' ✕ '));
      const victimEl = document.createElement('b');
      victimEl.textContent = victim;
      row.appendChild(victimEl);
      killfeed.prepend(row);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => row.remove(), 6000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    setCrosshairSpread(px) {
      crosshair.style.transform = `translate(-50%, -50%) scale(${1 + px / 22})`;
    },
    banner(titleText, sub, kind, instant) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = sub;
      banner.className = `show ${kind || ''}`;
      clearTimeout(bannerTimer);
      if (instant) {
        // Staged captures (?shot=): appear at full opacity at once and do
        // not auto-hide. Under headless compositing the 200 ms fade can
        // take longer than the 3.2 s auto-hide to produce a frame, so a
        // fading banner may never be visible in the screenshot.
        banner.style.transition = 'none';
        banner.style.opacity = '1';
        return;
      }
      // Clear any instant styling left by a staged capture so the fade works.
      banner.style.transition = '';
      banner.style.opacity = '';
      bannerTimer = setTimeout(() => banner.classList.remove('show'), 3200);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      banner.classList.remove('show');
      banner.style.transition = '';
      banner.style.opacity = '';
    },
    showPlant(label, frac) {
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
      plantbar.classList.add('show');
    },
    hidePlant() {
      plantbar.classList.remove('show');
    },
    showBuy(items) {
      buyItems = items;
      buyVisible = true;
      renderBuy();
      buyEl.classList.add('show');
    },
    updateBuy(items) {
      buyItems = items;
      if (buyVisible) renderBuy();
    },
    hideBuy() {
      buyVisible = false;
      buyEl.classList.remove('show');
    },
    buyOpen() {
      return buyVisible;
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    drawMinimap(model, player, friendlies, enemies, bomb) {
      const w = minimap.width;
      const h = minimap.height;
      const sx = w / (model.maxX - model.minX);
      const sz = h / (model.maxZ - model.minZ);
      const px = (x) => (x - model.minX) * sx;
      const pz = (z) => (z - model.minZ) * sz;
      mctx.clearRect(0, 0, w, h);
      mctx.fillStyle = '#12181d';
      mctx.fillRect(0, 0, w, h);
      mctx.fillStyle = '#39434d';
      for (const wall of model.walls) mctx.fillRect(px(wall.x - wall.w / 2), pz(wall.z - wall.d / 2), wall.w * sx, wall.d * sz);
      mctx.font = 'bold 11px ui-monospace, monospace';
      mctx.fillStyle = '#f0a830';
      mctx.fillText('A', px(model.sites.A.cx) - 4, pz(model.sites.A.cz) + 4);
      mctx.fillText('B', px(model.sites.B.cx) - 4, pz(model.sites.B.cz) + 4);
      if (bomb) {
        mctx.fillStyle = '#f0a830';
        mctx.beginPath();
        mctx.arc(px(bomb.x), pz(bomb.z), 4, 0, Math.PI * 2);
        mctx.fill();
      }
      for (const f of friendlies) {
        mctx.fillStyle = '#2fae9e';
        mctx.beginPath();
        mctx.arc(px(f.x), pz(f.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }
      for (const e of enemies) {
        mctx.fillStyle = '#c65a3a';
        mctx.beginPath();
        mctx.arc(px(e.x), pz(e.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }
      // Player arrow, rotated by yaw.
      mctx.save();
      mctx.translate(px(player.x), pz(player.z));
      mctx.rotate(-player.yaw);
      mctx.fillStyle = '#e8e4d8';
      mctx.beginPath();
      mctx.moveTo(0, -6);
      mctx.lineTo(4, 5);
      mctx.lineTo(-4, 5);
      mctx.closePath();
      mctx.fill();
      mctx.restore();
    },
  };
}
