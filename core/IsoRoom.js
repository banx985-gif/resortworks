// A room drawn by code in the 3/4 "dollhouse" view (any game): a checkered floor on the grid and the two back walls
// (along row 0 on the right, along col 0 on the left), with optional coloured bands along both walls.
// Draw it once into a CachedLayer. Colours arrive as data:
//   look: { floorA, floorB, grout, wallFace (right wall), wallSide (left wall), wallLine (wall edges), wallCap (outline) }
//   bands: [{ from, to, color }] — heights as shares of wallH (0 = floor, 1 = top of the wall)
// wallPoint() gives a spot on a wall, for a game's own extras (windows, doors, posters…).
export function isoPath(g, pts) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
}

// A point on a back wall: side 'right' runs along row 0 (t = columns from the corner), 'left' along col 0
// (t = rows from the corner); h = drawn height above the floor.
export function wallPoint(iso, side, t, h) {
  const p = side === 'right' ? iso.corner(t, 0) : iso.corner(0, t);
  return { x: p.x, y: p.y - h };
}

// The four corners of a patch of wall from t0 to t1, between heights h0 and h1 (for windows, boards, doors).
export function wallPatch(iso, side, t0, t1, h0, h1) {
  return [wallPoint(iso, side, t0, h0), wallPoint(iso, side, t1, h0), wallPoint(iso, side, t1, h1), wallPoint(iso, side, t0, h1)];
}

export function drawIsoRoom(g, iso, { cols, rows, wallH, look, bands = [] }) {
  // Floor: checkered tiles with grout lines.
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      isoPath(g, iso.outline(c, r));
      g.fillStyle = (c + r) % 2 ? look.floorA : look.floorB;
      g.fill();
    }
  g.strokeStyle = look.grout;
  g.lineWidth = 1.5;
  for (let c = 0; c <= cols; c++) line(g, iso.corner(c, 0), iso.corner(c, rows));
  for (let r = 0; r <= rows; r++) line(g, iso.corner(0, r), iso.corner(cols, r));

  // Back walls, then the bands along them.
  const top = iso.corner(0, 0);
  const right = iso.corner(cols, 0);
  const left = iso.corner(0, rows);
  const up = (p, h) => ({ x: p.x, y: p.y - h });
  const wall = (a, b, fill) => {
    isoPath(g, [a, b, up(b, wallH), up(a, wallH)]);
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = look.wallLine;
    g.lineWidth = 2;
    g.stroke();
  };
  wall(top, right, look.wallFace);
  wall(left, top, look.wallSide);
  for (const [a, b] of [
    [top, right],
    [left, top],
  ])
    for (const band of bands) {
      isoPath(g, [up(a, wallH * band.to), up(b, wallH * band.to), up(b, wallH * band.from), up(a, wallH * band.from)]);
      g.fillStyle = band.color;
      g.fill();
    }

  // Wall caps and the floor's front edges.
  g.strokeStyle = look.wallCap;
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(left.x, left.y);
  g.lineTo(left.x, left.y - wallH);
  g.lineTo(top.x, top.y - wallH);
  g.lineTo(right.x, right.y - wallH);
  g.lineTo(right.x, right.y);
  g.stroke();
  line(g, top, up(top, wallH));
  const bottom = iso.corner(cols, rows);
  g.beginPath();
  g.moveTo(left.x, left.y);
  g.lineTo(bottom.x, bottom.y);
  g.lineTo(right.x, right.y);
  g.stroke();
}

function line(g, a, b) {
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke();
}
