// EMBERLINE — the DOM HUD: crosshair, hit marker, health, armour, money, ammo,
// round timer, team scores, capture progress, killfeed, damage flash, and the
// overlays (start, buy, paused, round end, match end). It never touches the
// simulation; main.js pushes numbers in and reads callbacks out.
import { WEAPONS, BUY_ORDER, ARMOR_PRICE } from './weapons.js';

const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'A round-based tactical FPS in Foundry Yard. Vanguard vs Ember, first to 5 rounds — eliminate the other team or capture the Relay at mid.',
    action: 'Deploy',
  },
  paused: {
    title: 'EMBERLINE',
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
  const timerValue = $('timer-value');
  const scoreVanguard = $('score-vanguard');
  const scoreEmber = $('score-ember');
  const roundValue = $('round-value');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerText = $('banner-text');
  const bannerSub = $('banner-sub');
  const captureWrap = $('capture-wrap');
  const captureBar = $('capture-bar');
  const captureLabel = $('capture-label');
  const damageFlash = $('damage-flash');
  const buyPanel = $('buy-panel');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const deployBtn = $('deploy');
  const phaseLabel = $('phase-label');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};

  function setText(el, value, key) {
    if (last[key] !== value) {
      last[key] = value;
      el.textContent = value;
    }
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
    setTimer(seconds, phase) {
      const safe = Math.max(0, Math.ceil(seconds));
      setText(timerValue, `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`, 'timer');
      setText(phaseLabel, phase, 'phase');
      timerValue.classList.toggle('urgent', seconds <= 10 && phase === 'ROUND');
    },
    setScore(vanguard, ember, round) {
      setText(scoreVanguard, String(vanguard), 'sv');
      setText(scoreEmber, String(ember), 'se');
      setText(roundValue, `ROUND ${round}`, 'round');
    },
    setCapture(progress, label) {
      if (progress === null) {
        captureWrap.hidden = true;
        return;
      }
      captureWrap.hidden = false;
      captureBar.style.width = `${Math.round(progress * 100)}%`;
      setText(captureLabel, label, 'caplabel');
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
    showBuy(money, ownedWeapon, hasArmor, onBuy) {
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
    },
    hideBuy() {
      buyPanel.hidden = true;
    },
    onDeploy(handler) {
      deployBtn.addEventListener('click', handler);
    },
    showMatchEnd(vanguard, ember) {
      title.textContent = vanguard > ember ? 'VANGUARD TAKES THE YARD' : 'EMBER TAKES THE YARD';
      copy.textContent = `Final score — Vanguard ${vanguard} : ${ember} Ember. Play again to run it back.`;
      play.textContent = 'Play again';
      overlay.hidden = false;
      play.focus();
    },
  };
}
