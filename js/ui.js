/* Screen, input and persistence. */
(function (global) {
  'use strict';

  var TW = 62, TH = 84, DX = 6, DY = 8;
  var $ = function (id) { return document.getElementById(id); };

  /* ---- stored data ----------------------------------------------------- */
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem('mahjong.' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem('mahjong.' + key, JSON.stringify(value)); } catch (e) {}
  }

  var settings = load('settings', { sound: true, dimBlocked: true });
  var bests = load('bests', {});

  /* ---- sound ----------------------------------------------------------- *
   * Generated with the Web Audio API, so there are no audio files to load
   * and nothing extra to cache offline. */
  var actx = null;
  function audio() {
    if (!settings.sound) return null;
    if (!actx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, start, dur, peak, type) {
    var ac = audio(); if (!ac) return;
    var t = ac.currentTime + start;
    var osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  var sfx = {
    select:  function () { tone(620, 0, 0.06, 0.12); },
    match:   function () { tone(880, 0, 0.12, 0.16); tone(1320, 0.07, 0.18, 0.12); },
    blocked: function () { tone(150, 0, 0.11, 0.13, 'square'); },
    undo:    function () { tone(420, 0, 0.09, 0.11, 'triangle'); },
    win:     function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.11, 0.34, 0.15); }); }
  };

  /* ---- game state ------------------------------------------------------ */
  var G = {
    layout: null, slots: null, faces: null, present: null,
    els: [], undo: [], selected: null,
    moves: 0, shuffles: 0, elapsed: 0, startedAt: null,
    hints: [], hintAt: 0, seed: 0, finished: false
  };

  function running() { return G.startedAt !== null && !G.finished; }
  function elapsedMs() { return G.elapsed + (running() ? Date.now() - G.startedAt : 0); }
  function pause() { if (running()) { G.elapsed += Date.now() - G.startedAt; G.startedAt = null; } }
  function resume() { if (!G.finished && G.startedAt === null) G.startedAt = Date.now(); }

  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0');
  }

  /* ---- building the board ---------------------------------------------- */
  function buildBoard() {
    var board = $('board');
    board.textContent = '';
    G.els = [];
    var maxZ = G.slots.reduce(function (m, s) { return Math.max(m, s.z); }, 0);

    G.slots.forEach(function (slot, i) {
      var el = document.createElement('div');
      el.className = 'tile';
      el.style.left = ((slot.x - G.layout.originX) * TW + slot.z * DX) + 'px';
      el.style.top = ((slot.y - G.layout.originY) * TH + (maxZ - slot.z) * DY) + 'px';
      el.style.zIndex = Math.round(slot.z * 100000 + slot.y * 200 + slot.x * 2);
      el.dataset.z = slot.z;
      var face = document.createElement('div');
      face.className = 'face';
      face.innerHTML = '<svg viewBox="0 0 100 132" aria-hidden="true">' +
                       global.Tiles.art(G.faces[i]) + '</svg>';
      el.appendChild(face);
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', global.Tiles.get(G.faces[i]).label);
      el.addEventListener('click', function () { onTap(i); });
      board.appendChild(el);
      G.els.push(el);
    });

    board.dataset.w = G.layout.width * TW + maxZ * DX;
    board.dataset.h = G.layout.height * TH + maxZ * DY;
    fit();
    refresh();
  }

  // Scale the board to fill the stage without cropping.
  function fit() {
    var stage = $('stage'), board = $('board');
    if (!board.dataset.w) return;
    var W = +board.dataset.w, H = +board.dataset.h;
    var pad = 10;
    var sw = stage.clientWidth - pad * 2, sh = stage.clientHeight - pad * 2;
    var k = Math.min(sw / W, sh / H);
    board.style.transform = 'translate(' + ((stage.clientWidth - W * k) / 2) + 'px,' +
                            ((stage.clientHeight - H * k) / 2) + 'px) scale(' + k + ')';

    // Only suggest rotating when it would actually make the tiles usable.
    var tooSmall = k * TW < 42;
    var portrait = stage.clientHeight > stage.clientWidth;
    $('rotate-hint').hidden = !(tooSmall && portrait && G.layout.wide);
  }

  /* ---- rendering the current position ---------------------------------- */
  function refresh() {
    var left = 0;
    for (var i = 0; i < G.slots.length; i++) {
      var el = G.els[i];
      if (!G.present[i]) { el.classList.add('hidden'); continue; }
      left++;
      el.classList.remove('hidden');
      var free = global.Engine.isFree(G.slots[i], G.present);
      el.classList.toggle('blocked', settings.dimBlocked && !free);
      el.classList.toggle('selected', G.selected === i);
    }
    $('stat-left').textContent = left;
    $('stat-layout').textContent = G.layout.name;
    $('btn-undo').disabled = G.undo.length === 0;
    $('shuffle-count').textContent = G.shuffles ? '(' + G.shuffles + ' used)' : '';
    return left;
  }

  function tick() { $('stat-time').textContent = formatTime(elapsedMs()); }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  function clearHint() {
    G.els.forEach(function (el) { el.classList.remove('hinted'); });
  }

  /* ---- playing --------------------------------------------------------- */
  function onTap(i) {
    if (G.finished || !G.present[i]) return;
    clearHint();
    resume();

    if (!global.Engine.isFree(G.slots[i], G.present)) {
      var el = G.els[i];
      el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
      setTimeout(function () { el.classList.remove('nope'); }, 340);
      sfx.blocked();
      return;
    }

    if (G.selected === i) { G.selected = null; refresh(); return; }
    if (G.selected !== null && global.Tiles.matches(G.faces[G.selected], G.faces[i])) {
      take(G.selected, i);
      return;
    }
    G.selected = i;
    sfx.select();
    refresh();
  }

  function take(a, b) {
    G.present[a] = false; G.present[b] = false;
    G.selected = null;
    G.moves++;
    G.undo.push({ t: 'm', a: a, b: b });
    [a, b].forEach(function (i) {
      var el = G.els[i];
      el.classList.remove('selected');
      el.classList.add('gone');
      setTimeout(function () { el.classList.remove('gone'); el.classList.add('hidden'); }, 260);
    });
    sfx.match();
    var left = refresh();
    persist();
    if (left === 0) win();
    else if (global.Engine.availableMoves(G.slots, G.faces, G.present).length === 0) {
      setTimeout(openStuck, 420);
    }
  }

  function undoMove() {
    if (!G.undo.length) return;
    clearHint();
    var step = G.undo.pop();
    if (step.t === 'm') {
      G.present[step.a] = true; G.present[step.b] = true;
      [step.a, step.b].forEach(function (i) { G.els[i].classList.remove('hidden', 'gone'); });
      G.moves = Math.max(0, G.moves - 1);
    } else {                       // undo a shuffle: put the old faces back
      G.faces = step.faces.slice();
      G.shuffles = Math.max(0, G.shuffles - 1);
      repaintFaces();
    }
    G.selected = null;
    G.finished = false;
    sfx.undo();
    refresh();
    persist();
  }

  function repaintFaces() {
    G.faces.forEach(function (id, i) {
      G.els[i].querySelector('.face').innerHTML =
        '<svg viewBox="0 0 100 132" aria-hidden="true">' + global.Tiles.art(id) + '</svg>';
      G.els[i].setAttribute('aria-label', global.Tiles.get(id).label);
    });
  }

  function hint() {
    resume();
    var moves = global.Engine.availableMoves(G.slots, G.faces, G.present);
    clearHint();
    if (!moves.length) { openStuck(); return; }
    if (G.hintAt >= moves.length) G.hintAt = 0;
    var pair = moves[G.hintAt++];
    G.els[pair[0]].classList.add('hinted');
    G.els[pair[1]].classList.add('hinted');
    sfx.select();
    if (moves.length > 1) toast(moves.length + ' pairs available');
  }

  function shuffle() {
    if (G.finished) return;
    var before = G.faces.slice();
    var next = global.Engine.reshuffle(G.slots, G.faces, G.present, (Math.random() * 1e9) | 0);
    if (!next) { openStuck(); return; }
    G.undo.push({ t: 's', faces: before });
    G.faces = next;
    G.shuffles++;
    G.selected = null;
    clearHint();
    repaintFaces();
    refresh();
    persist();
    closeOverlays();
    toast('Tiles rearranged — still winnable');
  }

  /* Once the survivors are stacked in a single column, only the top tile is
   * ever free, so no rearrangement can match them -- the position is dead by
   * geometry rather than by luck. Undoing one move always reopens it, because
   * the pair just taken back was legal a moment ago. Say which one works. */
  function openStuck() {
    var canShuffle = global.Engine.reshuffle(
      G.slots, G.faces, G.present, (Math.random() * 1e9) | 0) !== null;
    var canUndo = G.undo.length > 0;
    $('btn-stuck-shuffle').hidden = !canShuffle;
    $('btn-stuck-undo').hidden = !canUndo;
    $('btn-stuck-undo').classList.toggle('primary', !canShuffle && canUndo);
    $('stuck-title').textContent = canShuffle ? 'No moves left' : 'This board cannot be finished';
    $('stuck-detail').textContent = canShuffle
      ? 'Nothing on the board matches any more. Shuffling rearranges the remaining tiles into a position that can still be won.'
      : (canUndo
          ? 'The tiles that are left sit stacked on top of one another, so no arrangement of them could be matched. Taking back a move opens the board up again.'
          : 'The tiles that are left sit stacked on top of one another, so no arrangement of them could be matched.');
    openOverlay('stuck');
  }

  function win() {
    G.finished = true;
    pause();
    var secs = Math.round(elapsedMs() / 1000);
    var prev = bests[G.layout.id];
    var record = !prev || secs < prev;
    if (record) { bests[G.layout.id] = secs; save('bests', bests); }
    sfx.win();
    $('win-detail').textContent =
      G.layout.name + ' cleared in ' + formatTime(secs * 1000) + ' and ' + G.moves + ' moves.' +
      (record ? ' That is your best time yet.' : ' Your best is ' + formatTime(prev * 1000) + '.');
    try { localStorage.removeItem('mahjong.save'); } catch (e) {}
    openOverlay('win');
  }

  /* ---- new games and saved games --------------------------------------- */
  function newGame(layoutId, seed) {
    var layout = global.Layouts.byId(layoutId);
    var board = global.Engine.deal(layout, seed || ((Math.random() * 4294967295) >>> 0));
    G.layout = layout;
    G.slots = board.slots;
    G.faces = board.faces;
    G.seed = board.seed;
    G.present = new Array(board.slots.length).fill(true);
    G.undo = []; G.selected = null; G.moves = 0; G.shuffles = 0;
    G.elapsed = 0; G.startedAt = null; G.hintAt = 0; G.finished = false;
    save('lastLayout', layout.id);
    buildBoard();
    tick();
    persist();
  }

  function persist() {
    if (G.finished) return;
    save('save', {
      layout: G.layout.id, seed: G.seed, faces: G.faces,
      present: G.present, undo: G.undo, moves: G.moves,
      shuffles: G.shuffles, elapsed: elapsedMs()
    });
  }

  function restore() {
    var s = load('save', null);
    if (!s || !s.faces) return false;
    var layout = global.Layouts.byId(s.layout);
    if (s.faces.length !== layout.count) return false;
    G.layout = layout;
    G.slots = global.Engine.analyse(layout);
    G.faces = s.faces;
    G.present = s.present;
    G.seed = s.seed;
    G.undo = s.undo || [];
    G.moves = s.moves || 0;
    G.shuffles = s.shuffles || 0;
    G.elapsed = s.elapsed || 0;
    G.startedAt = null; G.selected = null; G.hintAt = 0; G.finished = false;
    buildBoard();
    tick();
    return true;
  }

  /* ---- overlays -------------------------------------------------------- */
  function openOverlay(id) {
    pause();
    closeOverlays();
    if (id === 'menu') renderMenu();
    $(id).hidden = false;
  }
  function closeOverlays() {
    ['menu', 'win', 'stuck'].forEach(function (id) { $(id).hidden = true; });
  }

  function renderMenu() {
    var list = $('layout-list');
    list.textContent = '';
    global.Layouts.all.forEach(function (l) {
      var btn = document.createElement('button');
      btn.className = 'choice';
      if (G.layout && l.id === G.layout.id) btn.setAttribute('aria-current', 'true');
      var best = bests[l.id] ? 'Best ' + formatTime(bests[l.id] * 1000) : '';
      btn.innerHTML = '<div class="body"><div class="name">' + l.name + ' &middot; ' + l.count +
                      ' tiles</div><div class="desc">' + l.blurb + '</div></div>' +
                      '<div class="best">' + best + '</div>';
      btn.addEventListener('click', function () { closeOverlays(); newGame(l.id); });
      list.appendChild(btn);
    });
    $('sound-state').textContent = settings.sound ? 'On' : 'Off';
    $('showfree-state').textContent = settings.dimBlocked ? 'On' : 'Off';
  }

  /* ---- wiring ---------------------------------------------------------- */
  function init() {
    $('btn-undo').addEventListener('click', undoMove);
    $('btn-hint').addEventListener('click', hint);
    $('btn-shuffle').addEventListener('click', shuffle);
    $('btn-menu').addEventListener('click', function () { openOverlay('menu'); });

    $('btn-resume').addEventListener('click', function () { closeOverlays(); resume(); });
    $('btn-restart').addEventListener('click', function () {
      closeOverlays(); newGame(G.layout.id, G.seed);
    });
    $('btn-sound').addEventListener('click', function () {
      settings.sound = !settings.sound; save('settings', settings);
      $('sound-state').textContent = settings.sound ? 'On' : 'Off';
      if (settings.sound) sfx.select();
    });
    $('btn-showfree').addEventListener('click', function () {
      settings.dimBlocked = !settings.dimBlocked; save('settings', settings);
      $('showfree-state').textContent = settings.dimBlocked ? 'On' : 'Off';
      refresh();
    });

    $('btn-again').addEventListener('click', function () { closeOverlays(); newGame(G.layout.id); });
    $('btn-win-menu').addEventListener('click', function () { openOverlay('menu'); });
    $('btn-stuck-shuffle').addEventListener('click', shuffle);
    $('btn-stuck-undo').addEventListener('click', function () { closeOverlays(); undoMove(); resume(); });
    $('btn-stuck-new').addEventListener('click', function () { closeOverlays(); newGame(G.layout.id); });

    global.addEventListener('resize', fit);
    global.addEventListener('load', fit);
    global.addEventListener('orientationchange', function () { setTimeout(fit, 120); });
    // Android collapses the address bar after first paint, which changes the
    // usable height without firing a normal resize.
    if (global.visualViewport) global.visualViewport.addEventListener('resize', fit);
    if (global.requestAnimationFrame) global.requestAnimationFrame(fit);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { pause(); persist(); } else if (isPlaying()) resume();
    });
    function isPlaying() {
      return ['menu', 'win', 'stuck'].every(function (id) { return $(id).hidden; });
    }

    setInterval(function () { if (running()) tick(); }, 500);
    setInterval(persist, 10000);

    if (!restore()) newGame(load('lastLayout', 'garden'));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})(window);
