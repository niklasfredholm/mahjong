/* Board layouts.
 *
 * Coordinates are in tile units: every tile occupies exactly 1x1, and a
 * position is the tile's top-left corner. Half-unit offsets are legal --
 * the turtle's tail and head sit between two rows, which is what gives the
 * classic layout its silhouette. `z` is the stacking level, 0 = table.
 */
(function (global) {
  'use strict';

  function rect(x0, y0, w, h, z, out) {
    for (var dy = 0; dy < h; dy++) {
      for (var dx = 0; dx < w; dx++) out.push({ x: x0 + dx, y: y0 + dy, z: z });
    }
    return out;
  }

  // Rows of the given widths, each centred against the widest row.
  function centredRows(widths, z, out) {
    var max = Math.max.apply(null, widths);
    widths.forEach(function (w, row) {
      var x0 = (max - w) / 2;
      for (var i = 0; i < w; i++) out.push({ x: x0 + i, y: row, z: z });
    });
    return out;
  }

  function turtle() {
    var t = [];
    // Body: eight rows, centred on a twelve-wide span starting at x = 1.
    [12, 8, 10, 12, 12, 10, 8, 12].forEach(function (w, y) {
      var x0 = 1 + (12 - w) / 2;
      for (var i = 0; i < w; i++) t.push({ x: x0 + i, y: y, z: 0 });
    });
    t.push({ x: 0, y: 3.5, z: 0 });   // tail
    t.push({ x: 13, y: 3.5, z: 0 });  // head
    t.push({ x: 14, y: 3.5, z: 0 });  // nose -- the one tile that is always free
    rect(4, 1, 6, 6, 1, t);
    rect(5, 2, 4, 4, 2, t);
    rect(6, 3, 2, 2, 3, t);
    t.push({ x: 6.5, y: 3.5, z: 4 }); // capstone, straddling the 2x2 below it
    return t;
  }

  function pyramid() {
    var t = [];
    rect(0, 0, 8, 8, 0, t);
    rect(1, 1, 6, 6, 1, t);
    rect(2, 2, 4, 4, 2, t);
    rect(3, 3, 2, 2, 3, t);
    return t;
  }

  function garden() {
    return centredRows([6, 8, 10, 10, 10, 10, 10, 10, 8, 6], 0, []);
  }

  var LAYOUTS = [
    {
      id: 'garden',
      name: 'Garden',
      blurb: 'One flat layer. Nothing is buried — a gentle game.',
      build: garden
    },
    {
      id: 'pyramid',
      name: 'Pyramid',
      blurb: 'Four levels, tall and narrow. Fits an upright phone.',
      build: pyramid
    },
    {
      id: 'turtle',
      name: 'Turtle',
      blurb: 'The classic 144-tile board. Best played sideways.',
      build: turtle
    }
  ];

  LAYOUTS.forEach(function (l) {
    var slots = l.build();
    l.slots = slots;
    l.count = slots.length;
    var xs = slots.map(function (s) { return s.x; });
    var ys = slots.map(function (s) { return s.y; });
    l.width = Math.max.apply(null, xs) + 1 - Math.min.apply(null, xs);
    l.height = Math.max.apply(null, ys) + 1 - Math.min.apply(null, ys);
    l.originX = Math.min.apply(null, xs);
    l.originY = Math.min.apply(null, ys);
    // Rough shape hint, used to nudge the player to rotate the phone.
    l.wide = l.width / l.height > 1.15;
  });

  global.Layouts = {
    all: LAYOUTS,
    byId: function (id) {
      for (var i = 0; i < LAYOUTS.length; i++) if (LAYOUTS[i].id === id) return LAYOUTS[i];
      return LAYOUTS[0];
    }
  };
})(window);
