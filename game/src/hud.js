// KESTREL — the DOM HUD: crosshair, hit marker, health, armour, money, ammo,
// grenade slots, round timer, team scores, alive pips, plant/defuse progress,
// the bomb fuse bar, killfeed, radio callouts, a live radar minimap, damage
// flash, flashbang whiteout, and the overlays (start, buy, paused, dead, match
// end). It never touches the simulation; main.js pushes numbers in and reads
// callbacks out.
import { WEAPONS, BUY_ORDER, ARMOR_PRICE } from './weapons.js';
import { GRENADES, GRENADE_ORDER } from './grenades.js';

const COPY = {
  start: {
    title: 'KESTREL',
    copy: 'A round-based tactical FPS at High Observatory. AURORA vs WARDEN, first to 5 rounds — plant the Pulse Core at A or B, or eliminate the other team. Buy grenades: smoke cuts sightlines, flash blinds, HE clears rooms.',
    action: 'Deploy',
  },
  paused: {
    title: 'KESTREL',
    copy: 'Paused. Click to resume.',
    action: 'Resume',
  },
  dead: {
    title: 'Eliminated',
    copy: 'Your squad is still fighting. You redeploy next round.',
    action: 'Spectate',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthValue = $('health-value');
  const healthBar = $('health-bar');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const chargeTag = $('charge-tag');
  const timerValue = $('timer-value');
  const scoreAurora = $('score-aurora');
  const scoreWarden = $('score-warden');
  const roundValue = $('round-value');
  const aliveAurora = $('alive-aurora');
  const aliveWarden = $('alive-warden');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const killfeed = $('killfeed');
  const radioFeed = $('radio-feed');
  const banner = $('banner');
  const bannerText = $('banner-text');
  const bannerSub = $('banner-sub');
  const progressWrap = $('progress-wrap');
  const progressBar = $('progress-bar');
  const progressLabel = $('progress-label');
  const bombWrap = $('bomb-wrap');
  const bombBar = $('bomb-bar');
  const bombLabel = $('bomb-label');
  const damageFlash = $('damage-flash');
  const flashOverlay = $('flash-overlay');
  const scopeOverlay = $('scope-overlay');
  const buyPanel = $('buy-panel');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const deployBtn = $('deploy');
  const phaseLabel = $('phase-label');
  const grenadeSlots = $('grenade-slots');
  const radarCanvas = $('radar-canvas');
  const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};

  function setText(el, value, key) {
    if (!el) return;
    if (last[key] !== value) {
      last[key] = value;
      el.textContent = value;
    }
  }

  function drawRadar(playerState, bots, charge, time) {
    if (!radarCtx) return;
    const W = radarCanvas.width;
    const H = radarCanvas.height;
    const ctx = radarCtx;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(16,20,32,0.82)';
    ctx.fillRect(0, 0, W, H);
    const sx = (x) => (x + 26) / 52 * W;
    const sy = (z) => (z + 22) / 44 * H;
    // Sites.
    ctx.strokeStyle = '#ff9a2e';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx(-15), sy(-12), 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ff9a2e';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A', sx(-15), sy(-12) + 3);
    ctx.strokeStyle = '#4fd8e8';
    ctx.beginPath(); ctx.arc(sx(15), sy(-12), 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#4fd8e8';
    ctx.fillText('B', sx(15), sy(-12) + 3);
    // Teammates + heard enemies.
    for (const bot of bots) {
      if (!bot.alive) continue;
      const x = sx(bot.body.position.x);
      const y = sy(bot.body.position.z);
      if (bot.team === 'aurora') {
        ctx.fillStyle = '#ffb020';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      } else if (time - (bot.lastShotAt || -99) < 1.5) {
        ctx.fillStyle = '#ff5252';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    // The core: blinking when planted, steady when dropped.
    if (charge.planted && charge.site) {
      const p = charge.site === 'A' ? [-15, -12] : [15, -12];
      if (Math.floor(time * 2) % 2 === 0) {
        ctx.fillStyle = '#ff2020';
        ctx.save();
        ctx.translate(sx(p[0]), sy(p[1]));
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      }
    } else if (charge.droppedAt) {
      ctx.fillStyle = '#ffd27a';
      ctx.save();
      ctx.translate(sx(charge.droppedAt.x), sy(charge.droppedAt.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }
    // Player arrow, rotated by yaw (north is up).
    const px = sx(playerState.position.x);
    const py = sy(playerState.position.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-playerState.yaw + Math.PI);
    ctx.fillStyle = '#f2f5fb';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    setAmmo(mag, reserve, weaponId) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'res');
      setText(weaponName, WEAPONS[weaponId].name, 'wname');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(health, armor) {
      setText(healthValue, String(Math.max(0, Math.ceil(health))), 'hp');
      healthBar.style.width = `${Math.max(0, Math.min(100, health))}%`;
      healthBar.classList.toggle('low', health <= 30);
      setText(armorValue, armor > 0 ? `ARMOR ${armor}` : 'NO ARMOR', 'armor');
    },
    setMoney(money) {
      setText(moneyValue, `$${money}`, 'money');
      setText(buyMoney, `$${money}`, 'buymoney');
    },
    setCharge(carrying) {
      if (!chargeTag) return;
      chargeTag.hidden = !carrying;
    },
    setGrenades(counts, selected) {
      if (!grenadeSlots) return;
      const key = JSON.stringify([counts, selected]);
      if (last.grenades === key) return;
      last.grenades = key;
      grenadeSlots.innerHTML = '';
      for (const id of GRENADE_ORDER) {
        const slot = document.createElement('span');
        slot.className = `grenade-slot${id === selected ? ' selected' : ''}${counts[id] > 0 ? '' : ' empty'}`;
        slot.textContent = `${GRENADES[id].name} ×${counts[id]}`;
        grenadeSlots.appendChild(slot);
      }
    },
    setFlash(strength) {
      if (!flashOverlay) return;
      flashOverlay.style.opacity = String(Math.max(0, Math.min(1, strength)));
    },
    setScope(on) {
      if (!scopeOverlay) return;
      scopeOverlay.hidden = !on;
    },
    setTimer(seconds, phase) {
      const safe = Math.max(0, Math.ceil(seconds));
      setText(timerValue, `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`, 'timer');
      setText(phaseLabel, phase, 'phase');
      timerValue.classList.toggle('urgent', seconds <= 10 && phase === 'ROUND');
    },
    setScore(aurora, warden, round) {
      setText(scoreAurora, String(aurora), 'sh');
      setText(scoreWarden, String(warden), 'su');
      setText(roundValue, `ROUND ${round}`, 'round');
    },
    setAlive(aurora, warden) {
      setText(aliveAurora, '●'.repeat(Math.max(0, aurora)), 'ah');
      setText(aliveWarden, '●'.repeat(Math.max(0, warden)), 'au');
    },
    setProgress(progress, label) {
      if (progress === null) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      progressBar.style.width = `${Math.round(progress * 100)}%`;
      setText(progressLabel, label, 'proglabel');
    },
    setBomb(secondsLeft, site) {
      if (secondsLeft === null) {
        bombWrap.hidden = true;
        return;
      }
      bombWrap.hidden = false;
      bombBar.style.width = `${Math.max(0, Math.min(100, (secondsLeft / 35) * 100))}%`;
      setText(bombLabel, `CORE LIVE AT ${site} — ${Math.ceil(secondsLeft)}s`, 'bomblabel');
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    damage() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 180);
    },
    killfeed(text, friendly) {
      const entry = document.createElement('div');
      entry.className = `feed-entry${friendly ? ' friendly' : ''}`;
      entry.textContent = text;
      killfeed.prepend(entry);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.remove(), 6000);
    },
    radio(text, team) {
      const entry = document.createElement('div');
      entry.className = `radio-entry ${team === 'aurora' ? 'aurora' : 'warden'}`;
      entry.textContent = text;
      radioFeed.prepend(entry);
      while (radioFeed.children.length > 3) radioFeed.removeChild(radioFeed.lastChild);
      setTimeout(() => entry.remove(), 7000);
    },
    banner(text, sub, holdMs = 2600) {
      bannerText.textContent = text;
      bannerSub.textContent = sub || '';
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showOverlay(mode) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = text.copy;
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
    showBuy(money, ownedWeapon, hasArmor, grenadeCounts, onBuy) {
      buyPanel.hidden = false;
      setText(buyMoney, `$${money}`, 'buymoney2');
      buyList.innerHTML = '';
      BUY_ORDER.forEach((id, index) => {
        const def = WEAPONS[id];
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.disabled = money < def.price && id !== ownedWeapon;
        row.innerHTML = `<span class="buy-key">${index + 1}</span><span class="buy-name">${def.name}</span><span class="buy-price">${def.price === 0 ? 'OWNED' : `$${def.price}`}</span>${id === ownedWeapon ? '<span class="buy-tag">EQUIPPED</span>' : ''}`;
        row.addEventListener('click', () => onBuy(id));
        buyList.appendChild(row);
      });
      const armorRow = document.createElement('button');
      armorRow.type = 'button';
      armorRow.className = 'buy-row';
      armorRow.disabled = hasArmor || money < ARMOR_PRICE;
      armorRow.innerHTML = `<span class="buy-key">6</span><span class="buy-name">Kevlar Vest — 50 armour</span><span class="buy-price">$${ARMOR_PRICE}</span>${hasArmor ? '<span class="buy-tag">EQUIPPED</span>' : ''}`;
      armorRow.addEventListener('click', () => onBuy('armor'));
      buyList.appendChild(armorRow);
      GRENADE_ORDER.forEach((id, index) => {
        const def = GRENADES[id];
        const owned = grenadeCounts[id] || 0;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row grenade';
        row.disabled = owned >= def.max || money < def.price;
        row.innerHTML = `<span class="buy-key">${7 + index}</span><span class="buy-name">${def.name} — ${def.blurb}</span><span class="buy-price">${owned >= def.max ? 'MAX' : `$${def.price}`}</span>${owned > 0 ? `<span class="buy-tag">×${owned}</span>` : ''}`;
        row.addEventListener('click', () => onBuy(`grenade:${id}`));
        buyList.appendChild(row);
      });
    },
    hideBuy() {
      buyPanel.hidden = true;
    },
    onDeploy(handler) {
      deployBtn.addEventListener('click', handler);
    },
    showMatchEnd(aurora, warden, kills, deaths) {
      title.textContent = aurora > warden ? 'AURORA TAKES THE OBSERVATORY' : 'WARDEN HOLDS THE OBSERVATORY';
      copy.textContent = `Final score — AURORA ${aurora} : ${warden} WARDEN. Your line: ${kills} eliminations, ${deaths} deaths. Play again to run it back.`;
      play.textContent = 'Play again';
      overlay.hidden = false;
      play.focus();
    },
    drawRadar,
  };
}
