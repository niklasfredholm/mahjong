/* The 144-tile set, and the artwork for each face.
 *
 * Every face is drawn as inline SVG rather than shipped as an image: the app
 * stays a few tens of kilobytes, the tiles stay sharp at any size, and there
 * are no assets to lose. Suit pips are generated from row patterns; the
 * honour, flower and season tiles use their traditional characters, which
 * Android renders with its bundled Noto CJK font.
 */
(function (global) {
  'use strict';

  var CJK_NUM = ['一', '二', '三', '四', '五',
                 '六', '七', '八', '九'];

  var INK = '#2b3038';
  var RED = '#b3251f';
  var GREEN = '#22683a';
  var BLUE = '#1c4f86';

  // Pip arrangements, row by row. Traditional where it matters, legible always.
  var PIN_ROWS = { 1: [1], 2: [1, 1], 4: [2, 2], 5: [2, 1, 2], 6: [2, 2, 2],
                   7: [3, 2, 2], 8: [2, 2, 2, 2], 9: [3, 3, 3] };
  var SOU_ROWS = { 2: [1, 1], 3: [1, 2], 4: [2, 2], 5: [2, 1, 2], 6: [3, 3],
                   7: [1, 3, 3], 8: [4, 4], 9: [3, 3, 3] };

  var BOX = { x: 13, y: 15, w: 74, h: 102 };  // drawable area inside the face

  // Lay out `rows` of pips on a shared column pitch so columns line up
  // between rows of different lengths.
  function grid(rows) {
    var maxCount = Math.max.apply(null, rows);
    var pitchX = BOX.w / maxCount;
    var pitchY = BOX.h / rows.length;
    var pts = [];
    rows.forEach(function (count, r) {
      var x0 = BOX.x + (BOX.w - count * pitchX) / 2;
      for (var c = 0; c < count; c++) {
        pts.push({ x: x0 + pitchX * (c + 0.5), y: BOX.y + pitchY * (r + 0.5) });
      }
    });
    return { pts: pts, pitchX: pitchX, pitchY: pitchY };
  }

  function dot(x, y, r) {
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) +
           '" fill="#fbfbfb" stroke="' + BLUE + '" stroke-width="' + Math.max(1.4, r * 0.34).toFixed(1) + '"/>' +
           '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r * 0.36).toFixed(1) +
           '" fill="' + RED + '"/>';
  }

  function pinFace(n) {
    if (n === 3) {  // the three of circles runs on the diagonal
      var out = '';
      var step = 30;
      for (var i = 0; i < 3; i++) out += dot(28 + step * i, 32 + step * i, 15);
      return out;
    }
    var g = grid(PIN_ROWS[n]);
    var r = Math.min(g.pitchX, g.pitchY) * (n === 1 ? 0.62 : 0.40);
    return g.pts.map(function (p) { return dot(p.x, p.y, r); }).join('');
  }

  function stick(x, y, w, h) {
    var x0 = x - w / 2, y0 = y - h / 2;
    return '<rect x="' + x0.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + w.toFixed(1) +
           '" height="' + h.toFixed(1) + '" rx="' + (w * 0.42).toFixed(1) + '" fill="' + GREEN + '"/>' +
           '<rect x="' + x0.toFixed(1) + '" y="' + (y0 + h * 0.32).toFixed(1) + '" width="' + w.toFixed(1) +
           '" height="' + Math.max(1, h * 0.07).toFixed(1) + '" fill="#0f3d20" opacity="0.75"/>' +
           '<rect x="' + x0.toFixed(1) + '" y="' + (y0 + h * 0.62).toFixed(1) + '" width="' + w.toFixed(1) +
           '" height="' + Math.max(1, h * 0.07).toFixed(1) + '" fill="#0f3d20" opacity="0.75"/>';
  }

  function souFace(n) {
    if (n === 1) {  // a single tall stalk, in place of the traditional bird
      return stick(50, 66, 22, 84) +
             '<circle cx="50" cy="30" r="9" fill="' + RED + '"/>';
    }
    var g = grid(SOU_ROWS[n]);
    var w = g.pitchX * 0.36, h = g.pitchY * 0.74;
    return g.pts.map(function (p) { return stick(p.x, p.y, w, h); }).join('');
  }

  function text(str, x, y, size, fill, weight) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + fill +
           '" font-weight="' + (weight || 600) + '" text-anchor="middle" dominant-baseline="central"' +
           ' font-family="Noto Sans CJK SC, Noto Sans SC, Noto Serif CJK SC, Source Han Sans, sans-serif">' +
           str + '</text>';
  }

  function manFace(n) {
    return text(CJK_NUM[n - 1], 50, 43, 42, INK) +
           text('萬', 50, 92, 40, RED);
  }

  // Every distinct face in the set, in a stable order.
  var FACES = [];
  function add(id, group, label, svg) {
    FACES.push({ id: id, group: group, label: label, art: svg });
  }

  for (var n = 1; n <= 9; n++) {
    add('pin' + n, 'pin' + n, 'Cirklar ' + n, pinFace(n));
    add('sou' + n, 'sou' + n, 'Bambu ' + n, souFace(n));
    add('man' + n, 'man' + n, 'Tecken ' + n, manFace(n));
  }

  [['east', '東', 'Östanvind'], ['south', '南', 'Sunnanvind'],
   ['west', '西', 'Västanvind'], ['north', '北', 'Nordanvind']
  ].forEach(function (w) {
    add('wind_' + w[0], 'wind_' + w[0], w[2], text(w[1], 50, 66, 62, INK));
  });

  add('dragon_red', 'dragon_red', 'Röd drake', text('中', 50, 66, 62, RED));
  add('dragon_green', 'dragon_green', 'Grön drake', text('發', 50, 66, 58, GREEN));
  add('dragon_white', 'dragon_white', 'Vit drake',
      '<rect x="20" y="26" width="60" height="80" rx="6" fill="none" stroke="' + BLUE + '" stroke-width="5"/>' +
      '<rect x="30" y="36" width="40" height="60" rx="3" fill="none" stroke="' + BLUE + '" stroke-width="2" opacity="0.5"/>');

  // Flowers and seasons are bonus tiles: any flower matches any other flower,
  // and likewise for seasons. The coloured bar along the foot of the tile is
  // the visual cue for that, so the rule is readable without being told.
  [['plum', '梅', 'Plommon'], ['orchid', '蘭', 'Orkidé'],
   ['chrys', '菊', 'Krysantemum'], ['bamboo', '竹', 'Bambu']
  ].forEach(function (f) {
    add('flower_' + f[0], 'flower', f[2] + ' (blomma)',
        text(f[1], 50, 60, 54, GREEN) +
        '<rect x="24" y="104" width="52" height="7" rx="3.5" fill="' + GREEN + '"/>');
  });

  [['spring', '春', 'Vår'], ['summer', '夏', 'Sommar'],
   ['autumn', '秋', 'Höst'], ['winter', '冬', 'Vinter']
  ].forEach(function (s) {
    add('season_' + s[0], 'season', s[2] + ' (årstid)',
        text(s[1], 50, 60, 54, BLUE) +
        '<circle cx="42" cy="107" r="4" fill="' + BLUE + '"/>' +
        '<circle cx="58" cy="107" r="4" fill="' + BLUE + '"/>');
  });

  var BY_ID = {};
  FACES.forEach(function (f) { BY_ID[f.id] = f; });

  /* The full deck as a list of 72 pairs. Suits and honours contribute four
   * copies each (two pairs); the four flowers make two pairs between them,
   * as do the four seasons, since any two of a group match. */
  function deckPairs() {
    var pairs = [];
    FACES.forEach(function (f) {
      if (f.group === 'flower' || f.group === 'season') return;
      pairs.push([f.id, f.id]);
      pairs.push([f.id, f.id]);
    });
    pairs.push(['flower_plum', 'flower_orchid']);
    pairs.push(['flower_chrys', 'flower_bamboo']);
    pairs.push(['season_spring', 'season_summer']);
    pairs.push(['season_autumn', 'season_winter']);
    return pairs;
  }

  global.Tiles = {
    faces: FACES,
    get: function (id) { return BY_ID[id]; },
    group: function (id) { return BY_ID[id].group; },
    matches: function (a, b) { return BY_ID[a].group === BY_ID[b].group; },
    deckPairs: deckPairs,
    art: function (id) { return BY_ID[id].art; }
  };
})(window);
