/**
 * Patterns Module for Geometric Wallpaper Generator
 * Implements math-driven generators for 6 visual styles:
 * - Low Poly (Delaunay)
 * - Voronoi Cells
 * - Sacred Geometry
 * - Bauhaus Memphis
 * - Isometric Cubes
 * - Flow Field Waves
 */

const Patterns = {
  // --- DELAUNAY TRIANGULATION UTILS ---
  // Bowyer-Watson Delaunay Triangulation
  triangulate(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    let dx = maxX - minX;
    let dy = maxY - minY;
    let deltaMax = Math.max(dx, dy);
    let midX = (minX + maxX) / 2;
    let midY = (minY + maxY) / 2;

    // Super-triangle vertices (guaranteed to contain all points)
    let p1 = { x: midX - 20 * deltaMax, y: midY - deltaMax, id: -1 };
    let p2 = { x: midX, y: midY + 20 * deltaMax, id: -2 };
    let p3 = { x: midX + 20 * deltaMax, y: midY - deltaMax, id: -3 };

    let triangles = [{ p1, p2, p3 }];

    for (let p of points) {
      let badTriangles = [];
      for (let t of triangles) {
        if (this.inCircumcircle(p, t.p1, t.p2, t.p3)) {
          badTriangles.push(t);
        }
      }

      let polygon = [];
      for (let t of badTriangles) {
        let edges = [
          { a: t.p1, b: t.p2 },
          { a: t.p2, b: t.p3 },
          { a: t.p3, b: t.p1 }
        ];
        for (let edge of edges) {
          let shared = false;
          for (let otherT of badTriangles) {
            if (otherT === t) continue;
            if (this.hasEdge(otherT, edge.a, edge.b)) {
              shared = true;
              break;
            }
          }
          if (!shared) {
            polygon.push(edge);
          }
        }
      }

      triangles = triangles.filter(t => !badTriangles.includes(t));

      for (let edge of polygon) {
        triangles.push({ p1: edge.a, p2: edge.b, p3: p });
      }
    }

    // Remove super-triangle vertices
    return triangles.filter(t => t.p1.id >= 0 && t.p2.id >= 0 && t.p3.id >= 0);
  },

  inCircumcircle(p, p1, p2, p3) {
    let d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    if (Math.abs(d) < 1e-9) return false;

    let ux = ((p1.x * p1.x + p1.y * p1.y) * (p2.y - p3.y) + (p2.x * p2.x + p2.y * p2.y) * (p3.y - p1.y) + (p3.x * p3.x + p3.y * p3.y) * (p1.y - p2.y)) / d;
    let uy = ((p1.x * p1.x + p1.y * p1.y) * (p3.x - p2.x) + (p2.x * p2.x + p2.y * p2.y) * (p1.x - p3.x) + (p3.x * p3.x + p3.y * p3.y) * (p2.x - p1.x)) / d;

    let r2 = (p1.x - ux) * (p1.x - ux) + (p1.y - uy) * (p1.y - uy);
    let dist2 = (p.x - ux) * (p.x - ux) + (p.y - uy) * (p.y - uy);

    return dist2 < r2;
  },

  hasEdge(t, a, b) {
    let ids = [t.p1.id, t.p2.id, t.p3.id];
    return ids.includes(a.id) && ids.includes(b.id);
  },

  getCircumcenter(p1, p2, p3) {
    let d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    if (Math.abs(d) < 1e-9) return { x: (p1.x + p2.x + p3.x)/3, y: (p1.y + p2.y + p3.y)/3 };

    let ux = ((p1.x * p1.x + p1.y * p1.y) * (p2.y - p3.y) + (p2.x * p2.x + p2.y * p2.y) * (p3.y - p1.y) + (p3.x * p3.x + p3.y * p3.y) * (p1.y - p2.y)) / d;
    let uy = ((p1.x * p1.x + p1.y * p1.y) * (p3.x - p2.x) + (p2.x * p2.x + p2.y * p2.y) * (p1.x - p3.x) + (p3.x * p3.x + p3.y * p3.y) * (p2.x - p1.x)) / d;

    return { x: ux, y: uy };
  },

  // Generates randomized points inside canvas bounds + border cushion
  generatePoissonSample(width, height, count, randomness = 1.0) {
    let points = [];
    let cols = Math.ceil(Math.sqrt(count * (width / height)));
    let rows = Math.ceil(count / cols);

    let idx = 0;
    // Add grid points with noise
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        let px = (c / cols) * width;
        let py = (r / rows) * height;

        // Apply noise based on randomness settings
        if (c > 0 && c < cols && r > 0 && r < rows) {
          px += (Math.random() - 0.5) * (width / cols) * randomness;
          py += (Math.random() - 0.5) * (height / rows) * randomness;
        }

        points.push({ x: px, y: py, id: idx++, baseX: px, baseY: py, seedX: Math.random() * 100, seedY: Math.random() * 100 });
      }
    }

    // Add perimeter cushion points to avoid blank spots
    let cushion = Math.max(width, height) * 0.25;
    let perimeterPoints = [
      { x: -cushion, y: -cushion },
      { x: width + cushion, y: -cushion },
      { x: width + cushion, y: height + cushion },
      { x: -cushion, y: height + cushion },
      { x: width / 2, y: -cushion },
      { x: width / 2, y: height + cushion },
      { x: -cushion, y: height / 2 },
      { x: width + cushion, y: height / 2 }
    ];

    perimeterPoints.forEach(p => {
      points.push({ x: p.x, y: p.y, id: idx++, baseX: p.x, baseY: p.y, seedX: 0, seedY: 0 });
    });

    return points;
  },

  // Simple pseudo 2D Perlin-like noise generator
  noise(x, y) {
    let X = Math.floor(x) & 255;
    let Y = Math.floor(y) & 255;
    let xf = x - Math.floor(x);
    let yf = y - Math.floor(y);

    // Fade curves
    let u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    let v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);

    // Simple hashing
    let n00 = Math.sin(X * 127.1 + Y * 311.7) * 43758.5453123;
    n00 = n00 - Math.floor(n00);
    let n10 = Math.sin((X+1) * 127.1 + Y * 311.7) * 43758.5453123;
    n10 = n10 - Math.floor(n10);
    let n01 = Math.sin(X * 127.1 + (Y+1) * 311.7) * 43758.5453123;
    n01 = n01 - Math.floor(n01);
    let n11 = Math.sin((X+1) * 127.1 + (Y+1) * 311.7) * 43758.5453123;
    n11 = n11 - Math.floor(n11);

    // Interpolate
    let x1 = n00 + u * (n10 - n00);
    let x2 = n01 + u * (n11 - n01);
    return x1 + v * (x2 - x1);
  },

  // 1. --- LOW POLY (DELAUNAY) PATTERN GENERATOR ---
  drawLowPoly(ctx, width, height, colors, settings, time = 0) {
    // Canvas clean setup
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, width, height);

    // Check custom cache or generate points
    if (!ctx.geometricPoints || ctx.geometricPoints.length < settings.density || ctx.geometricPatternType !== 'lowpoly') {
      ctx.geometricPoints = this.generatePoissonSample(width, height, settings.density, settings.randomness);
      ctx.geometricPatternType = 'lowpoly';
    }

    // Animate points for morph effect
    let animatedPoints = ctx.geometricPoints.map(p => {
      if (p.id < 0 || p.seedX === 0) return p; // Skip super-triangle & perimeter corners
      let speed = settings.morphSpeed * 0.001;
      let range = Math.max(width, height) * 0.08 * settings.morphAmount;
      let dx = Math.sin(time * speed + p.seedX) * range;
      let dy = Math.cos(time * speed + p.seedY) * range;
      return { x: p.baseX + dx, y: p.baseY + dy, id: p.id };
    });

    let triangles = this.triangulate(animatedPoints);

    // Draw triangles
    for (let t of triangles) {
      let cx = (t.p1.x + t.p2.x + t.p3.x) / 3;
      let cy = (t.p1.y + t.p2.y + t.p3.y) / 3;

      // Map color based on coordinates
      let dist = Math.sqrt((cx - width/2)**2 + (cy - height/2)**2);
      let maxDist = Math.sqrt((width/2)**2 + (height/2)**2);
      let factor = (cx / width) * 0.6 + (cy / height) * 0.4;
      
      // Inject some mathematical variance
      if (settings.shadingMode === 'radial') {
        factor = Math.min(1.0, dist / maxDist);
      } else if (settings.shadingMode === 'noise') {
        factor = this.noise(cx * 0.003, cy * 0.003 + time * 0.0001);
      }

      let baseColor = window.Palettes.interpolateColor(colors, factor);

      ctx.beginPath();
      ctx.moveTo(t.p1.x, t.p1.y);
      ctx.lineTo(t.p2.x, t.p2.y);
      ctx.lineTo(t.p3.x, t.p3.y);
      ctx.closePath();

      // Shading fill style
      if (settings.fillType === 'gradient') {
        let grad = ctx.createLinearGradient(t.p1.x, t.p1.y, t.p3.x, t.p3.y);
        grad.addColorStop(0, baseColor);
        let highlight = window.Palettes.interpolateColor(colors, Math.min(1, factor + 0.15));
        grad.addColorStop(1, highlight);
        ctx.fillStyle = grad;
      } else if (settings.fillType === 'neon') {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
      } else {
        ctx.fillStyle = baseColor;
      }
      ctx.fill();

      // Draw wireframes
      if (settings.strokeWidth > 0) {
        ctx.strokeStyle = settings.fillType === 'neon' 
          ? window.Palettes.interpolateColor(colors, (factor + 0.2) % 1.0) 
          : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = settings.strokeWidth;
        
        if (settings.fillType === 'neon') {
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = settings.glowAmount;
        } else {
          ctx.shadowBlur = 0;
        }
        
        ctx.stroke();
      }
    }
    // Clean shadows
    ctx.shadowBlur = 0;
  },

  // 2. --- VORONOI CELLS PATTERN GENERATOR ---
  drawVoronoi(ctx, width, height, colors, settings, time = 0) {
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, width, height);

    if (!ctx.geometricPoints || ctx.geometricPoints.length < settings.density || ctx.geometricPatternType !== 'voronoi') {
      ctx.geometricPoints = this.generatePoissonSample(width, height, settings.density, settings.randomness);
      ctx.geometricPatternType = 'voronoi';
    }

    // Animate points for morph
    let animatedPoints = ctx.geometricPoints.map(p => {
      if (p.id < 0 || p.seedX === 0) return p;
      let speed = settings.morphSpeed * 0.001;
      let range = Math.max(width, height) * 0.08 * settings.morphAmount;
      let dx = Math.sin(time * speed + p.seedX) * range;
      let dy = Math.cos(time * speed + p.seedY) * range;
      return { x: p.baseX + dx, y: p.baseY + dy, id: p.id, seedX: p.seedX };
    });

    let triangles = this.triangulate(animatedPoints);

    // Associate each vertex ID with circumcenters of triangles sharing it
    let cells = {};
    for (let p of animatedPoints) {
      if (p.id >= 0 && p.seedX > 0) {
        cells[p.id] = { center: p, circumcenters: [] };
      }
    }

    for (let t of triangles) {
      let cc = this.getCircumcenter(t.p1, t.p2, t.p3);
      if (t.p1.id >= 0 && cells[t.p1.id]) cells[t.p1.id].circumcenters.push(cc);
      if (t.p2.id >= 0 && cells[t.p2.id]) cells[t.p2.id].circumcenters.push(cc);
      if (t.p3.id >= 0 && cells[t.p3.id]) cells[t.p3.id].circumcenters.push(cc);
    }

    // Clip rendering boundary
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();

    // Render each cell
    for (let id in cells) {
      let cell = cells[id];
      let center = cell.center;
      let pts = cell.circumcenters;
      if (pts.length < 3) continue;

      // Sort circumcenters in circular order around the cell seed center point
      pts.sort((a, b) => {
        let angleA = Math.atan2(a.y - center.y, a.x - center.x);
        let angleB = Math.atan2(b.y - center.y, b.x - center.x);
        return angleA - angleB;
      });

      // Shading factor based on seed center position
      let factor = (center.x / width) * 0.6 + (center.y / height) * 0.4;
      if (settings.shadingMode === 'radial') {
        let dist = Math.sqrt((center.x - width/2)**2 + (center.y - height/2)**2);
        let maxDist = Math.sqrt((width/2)**2 + (height/2)**2);
        factor = Math.min(1.0, dist / maxDist);
      } else if (settings.shadingMode === 'noise') {
        factor = this.noise(center.x * 0.003, center.y * 0.003 + time * 0.0001);
      }

      let cellColor = window.Palettes.interpolateColor(colors, factor);

      ctx.beginPath();
      // Draw cell scaled towards its center (cell spacing/gap control)
      let scale = 1.0 - (settings.cellGap * 0.05); // shrink cells by gap ratio
      for (let i = 0; i < pts.length; i++) {
        let px = center.x + (pts[i].x - center.x) * scale;
        let py = center.y + (pts[i].y - center.y) * scale;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // Premium Fill: Radial Gradient from seed center to cell boundary
      if (settings.fillType === 'gradient') {
        let maxRad = Math.max(width, height) / Math.sqrt(settings.density);
        let grad = ctx.createRadialGradient(center.x, center.y, 2, center.x, center.y, maxRad);
        grad.addColorStop(0, window.Palettes.interpolateColor(colors, Math.min(1.0, factor + 0.15)));
        grad.addColorStop(1, cellColor);
        ctx.fillStyle = grad;
      } else if (settings.fillType === 'neon') {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
      } else {
        ctx.fillStyle = cellColor;
      }
      
      ctx.fill();

      // Border stroke
      if (settings.strokeWidth > 0) {
        ctx.strokeStyle = settings.fillType === 'neon'
          ? window.Palettes.interpolateColor(colors, (factor + 0.25) % 1.0)
          : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = settings.strokeWidth;

        if (settings.fillType === 'neon') {
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = settings.glowAmount;
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();
  },

  // 3. --- SACRED GEOMETRY PATTERN GENERATOR ---
  drawSacred(ctx, width, height, colors, settings, time = 0) {
    // Rich gradient background
    let bgGrad = ctx.createRadialGradient(width/2, height/2, width * 0.1, width/2, height/2, width * 0.8);
    bgGrad.addColorStop(0, colors[1] || colors[0]);
    bgGrad.addColorStop(1, colors[0]);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width/2, height/2);

    let baseRadius = Math.min(width, height) * 0.38;
    let symmetry = settings.symmetry || 12;
    let scale = settings.scale || 1.0;
    baseRadius *= scale;

    let rotPhase = time * settings.morphSpeed * 0.00015;

    // Grid details: Subtle underlay patterns
    if (settings.showFlowerOfLife) {
      ctx.strokeStyle = 'rgba(255,255,255,0.02)';
      ctx.lineWidth = 1;
      let hexSize = baseRadius * 0.15;
      for (let q = -6; q <= 6; q++) {
        for (let r = -6; r <= 6; r++) {
          let hx = hexSize * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
          let hy = hexSize * (3/2 * r);
          if (hx*hx + hy*hy < baseRadius*baseRadius*1.5) {
            ctx.beginPath();
            ctx.arc(hx, hy, hexSize, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    }

    // Outer intricate circle bands
    ctx.shadowBlur = settings.glowAmount || 0;
    let layers = 5;
    for (let l = 1; l <= layers; l++) {
      let r = baseRadius * (l / layers);
      let layerColor = window.Palettes.interpolateColor(colors, l / layers);
      ctx.strokeStyle = layerColor;
      ctx.shadowColor = layerColor;
      ctx.lineWidth = Math.max(1, settings.strokeWidth * (1 - l / (layers + 2)));

      // Add rotation animation alternate directions
      ctx.save();
      ctx.rotate(l % 2 === 0 ? rotPhase * l : -rotPhase * l);

      // Radial symmetry shapes
      ctx.beginPath();
      for (let s = 0; s < symmetry; s++) {
        let angle = (s / symmetry) * Math.PI * 2;
        let x = Math.cos(angle) * r;
        let y = Math.sin(angle) * r;

        // Draw overlapping geometries
        if (l === 2) {
          ctx.moveTo(x, y);
          ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
        } else if (l === 3) {
          ctx.lineTo(x, y);
        } else if (l === 4) {
          // Draw geometric lines to center
          ctx.moveTo(x, y);
          ctx.lineTo(0, 0);
        } else if (l === 5) {
          // Intricate stars
          let nextAngle = ((s + 2) / symmetry) * Math.PI * 2;
          ctx.moveTo(x, y);
          ctx.lineTo(Math.cos(nextAngle) * r, Math.sin(nextAngle) * r);
        }
      }
      ctx.stroke();

      // Draw primary concentric boundary rings
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // Core centerpiece geometry
    ctx.rotate(rotPhase);
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = colors[colors.length - 1];
    ctx.shadowColor = colors[colors.length - 1];
    ctx.fill();

    ctx.restore();
    ctx.shadowBlur = 0;
  },

  // 4. --- BAUHAUS / MEMPHIS RETRO GENERATOR ---
  drawBauhaus(ctx, width, height, colors, settings, time = 0) {
    // Solid retro background
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, width, height);

    // Draw grid background
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    let gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Static seeded placement so shapes don't jitter unless morphing
    let rngSeed = settings.density || 40;
    let seed = 0.1234;
    function rand() {
      let x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    }

    let shapeCount = rngSeed;
    let shapes = [];
    for (let i = 0; i < shapeCount; i++) {
      shapes.push({
        type: ['circle', 'arch', 'stripeGrid', 'line', 'triangle', 'squiggle', 'block'][Math.floor(rand() * 7)],
        x: rand() * width,
        y: rand() * height,
        size: 50 + rand() * 150 * settings.scale,
        colorIndex: Math.floor(rand() * (colors.length - 1)) + 1,
        angle: rand() * Math.PI * 2,
        blend: rand() > 0.6 ? 'multiply' : 'source-over',
        driftX: rand() * 10,
        driftY: rand() * 10
      });
    }

    // Render Bauhaus shapes
    for (let s of shapes) {
      ctx.save();
      
      // Live morph coordinates drifting
      let speed = settings.morphSpeed * 0.0003;
      let dx = Math.sin(time * speed + s.driftX) * 20 * settings.morphAmount;
      let dy = Math.cos(time * speed + s.driftY) * 20 * settings.morphAmount;

      ctx.translate(s.x + dx, s.y + dy);
      ctx.rotate(s.angle + (time * speed * 0.05 * settings.morphAmount));
      ctx.globalCompositeOperation = s.blend;
      ctx.fillStyle = colors[s.colorIndex];
      ctx.strokeStyle = colors[s.colorIndex];
      ctx.lineWidth = settings.strokeWidth || 4;

      switch (s.type) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, s.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
          if (rand() > 0.5) {
            ctx.strokeStyle = '#111111';
            ctx.stroke();
          }
          break;

        case 'arch':
          ctx.beginPath();
          ctx.arc(0, 0, s.size * 0.5, 0, Math.PI, true);
          ctx.closePath();
          ctx.fill();
          break;

        case 'stripeGrid':
          ctx.lineWidth = 3;
          let count = 5;
          let gap = s.size / count;
          ctx.beginPath();
          for (let i = -count/2; i <= count/2; i++) {
            ctx.moveTo(i * gap, -s.size/2);
            ctx.lineTo(i * gap, s.size/2);
          }
          ctx.stroke();
          break;

        case 'line':
          ctx.lineWidth = settings.strokeWidth * 1.5;
          ctx.beginPath();
          ctx.moveTo(-s.size/2, 0);
          ctx.lineTo(s.size/2, 0);
          ctx.stroke();
          break;

        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(0, -s.size * 0.5);
          ctx.lineTo(s.size * 0.5, s.size * 0.5);
          ctx.lineTo(-s.size * 0.5, s.size * 0.5);
          ctx.closePath();
          ctx.fill();
          break;

        case 'squiggle':
          ctx.beginPath();
          ctx.lineWidth = Math.max(3, settings.strokeWidth);
          ctx.moveTo(-s.size/2, 0);
          ctx.bezierCurveTo(-s.size/4, -s.size/4, 0, s.size/4, s.size/4, -s.size/4);
          ctx.lineTo(s.size/2, 0);
          ctx.stroke();
          break;

        case 'block':
          ctx.fillRect(-s.size/2, -s.size/4, s.size, s.size/2);
          if (rand() > 0.6) {
            ctx.strokeStyle = '#111111';
            ctx.strokeRect(-s.size/2, -s.size/4, s.size, s.size/2);
          }
          break;
      }

      ctx.restore();
    }

    // Retro Paper Grain Overlay
    if (settings.showGrain) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = '#ffffff';
      let bufferCanvas = ctx.canvas;
      let w = width, h = height;
      
      // Fast procedural grain injection
      let grainImg = ctx.createImageData(w, h);
      let data = grainImg.data;
      let opacity = 0.05 * settings.grainAmount;
      for (let i = 0; i < data.length; i += 4) {
        let val = (Math.random() - 0.5) * 255 * opacity;
        data[i] = 128 + val;
        data[i+1] = 128 + val;
        data[i+2] = 128 + val;
        data[i+3] = 255;
      }
      
      // Temporary draw image
      let tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      tempCanvas.getContext('2d').putImageData(grainImg, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.restore();
    }
  },

  // 5. --- ISOMETRIC 3D CUBES PATTERN GENERATOR ---
  drawIsometric(ctx, width, height, colors, settings, time = 0) {
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, width, height);

    let size = 30 * settings.scale; // grid unit size
    let cos30 = Math.cos(Math.PI / 6);
    let sin30 = Math.sin(Math.PI / 6);

    // Calculate grid coverage range
    let colWidth = size * cos30;
    let rowHeight = size * sin30 * 2;
    
    let cols = Math.ceil(width / colWidth) + 4;
    let rows = Math.ceil(height / (size * sin30)) + 6;

    // Apply isometric layout logic
    ctx.save();
    
    let speed = settings.morphSpeed * 0.001;

    for (let r = -2; r < rows; r++) {
      for (let c = -2; c < cols; c++) {
        // Calculate center coordinate
        let cx = (c - r) * size * cos30;
        let cy = (c + r) * size * sin30;
        
        // Translate grid center coordinates to cover the screen properly
        cx += width / 2;
        
        // Wave-like dynamic height offset (Isometric 3D wave morphing)
        let dist = Math.sqrt((cx - width/2)**2 + (cy - height/2)**2);
        let maxDist = Math.sqrt((width/2)**2 + (height/2)**2);
        
        let waveOffset = 0;
        if (settings.morphAmount > 0) {
          let waveFreq = 0.005 / settings.scale;
          let waveAmp = size * 1.5 * settings.morphAmount;
          waveOffset = Math.sin(dist * waveFreq - time * speed) * waveAmp;
        }

        let yOffset = cy + waveOffset;

        // Determine face base colors
        let factor = (cx / width) * 0.5 + (yOffset / height) * 0.5;
        let cubeColor = window.Palettes.interpolateColor(colors, Math.max(0, Math.min(1, factor)));
        let hsl = window.Palettes.hexToHsl(cubeColor);

        // Face 1: Top Face (bright)
        let topColor = window.Palettes.hslToHex(hsl.h, hsl.s, Math.min(95, hsl.l + 10));
        // Face 2: Left Face (medium shadow)
        let leftColor = window.Palettes.hslToHex(hsl.h, hsl.s, Math.max(10, hsl.l - 12));
        // Face 3: Right Face (deep shadow)
        let rightColor = window.Palettes.hslToHex(hsl.h, hsl.s, Math.max(5, hsl.l - 25));

        // Draw top rhombus
        ctx.fillStyle = topColor;
        ctx.beginPath();
        ctx.moveTo(cx, yOffset - size);
        ctx.lineTo(cx + size * cos30, yOffset - size + size * sin30);
        ctx.lineTo(cx, yOffset);
        ctx.lineTo(cx - size * cos30, yOffset - size + size * sin30);
        ctx.closePath();
        ctx.fill();

        // Draw left side rhombus
        ctx.fillStyle = leftColor;
        ctx.beginPath();
        ctx.moveTo(cx - size * cos30, yOffset - size + size * sin30);
        ctx.lineTo(cx, yOffset);
        ctx.lineTo(cx, yOffset + size);
        ctx.lineTo(cx - size * cos30, yOffset + size * sin30);
        ctx.closePath();
        ctx.fill();

        // Draw right side rhombus
        ctx.fillStyle = rightColor;
        ctx.beginPath();
        ctx.moveTo(cx, yOffset);
        ctx.lineTo(cx + size * cos30, yOffset - size + size * sin30);
        ctx.lineTo(cx + size * cos30, yOffset + size * sin30);
        ctx.lineTo(cx, yOffset + size);
        ctx.closePath();
        ctx.fill();

        // Draw mesh borders
        if (settings.strokeWidth > 0) {
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = settings.strokeWidth;
          ctx.beginPath();
          // Draw wire edges
          ctx.moveTo(cx, yOffset - size);
          ctx.lineTo(cx, yOffset + size);
          ctx.moveTo(cx - size * cos30, yOffset - size + size * sin30);
          ctx.lineTo(cx + size * cos30, yOffset + size * sin30);
          ctx.moveTo(cx + size * cos30, yOffset - size + size * sin30);
          ctx.lineTo(cx - size * cos30, yOffset + size * sin30);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  },

  // 6. --- FLOW FIELD WAVES PATTERN GENERATOR ---
  drawFlowWaves(ctx, width, height, colors, settings, time = 0) {
    // Backdrop fill
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, width, height);

    let waveCount = settings.density || 8;
    let waveAmplitude = 120 * settings.scale;
    let baseSpeed = settings.morphSpeed * 0.0002;

    // Draw stacked wave landscapes from back to front
    for (let w = waveCount; w > 0; w--) {
      let relativeHeight = w / (waveCount + 1); // 1 to 0 (top-down)
      let waveY = height * relativeHeight;

      // Color mapping: Back layers use deeper dark colors, front layers use vibrant shades
      let factor = 1.0 - (w / waveCount);
      let waveColor = window.Palettes.interpolateColor(colors, factor);

      ctx.beginPath();
      ctx.moveTo(0, height); // start bottom-left

      // Render flowing curve across the horizontal width
      let steps = 40;
      let stepSize = width / steps;
      
      for (let i = 0; i <= steps; i++) {
        let x = i * stepSize;
        
        // Multi-frequency wave synthesis (pseudo 1D noise)
        let noiseFactor = 0.002;
        let nAngle = x * noiseFactor;
        
        let n1 = Math.sin(nAngle * 1.5 + time * baseSpeed + w * 1.7) * waveAmplitude * 0.6;
        let n2 = Math.cos(nAngle * 4.2 - time * baseSpeed * 1.3 + w * 2.3) * waveAmplitude * 0.25;
        let n3 = Math.sin(nAngle * 9.8 + time * baseSpeed * 2.1) * waveAmplitude * 0.08;

        let y = waveY + (n1 + n2 + n3) * settings.morphAmount;

        if (i === 0) ctx.lineTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.lineTo(width, height); // end bottom-right
      ctx.closePath();

      // Stacked gradients matching peaks
      let grad = ctx.createLinearGradient(0, waveY - waveAmplitude, 0, height);
      grad.addColorStop(0, waveColor);
      let deepShade = window.Palettes.interpolateColor(colors, Math.max(0, factor - 0.2));
      grad.addColorStop(1, deepShade);
      ctx.fillStyle = grad;
      ctx.fill();

      // Ridge highlight strokes (vector wire ridges)
      if (settings.strokeWidth > 0) {
        ctx.strokeStyle = window.Palettes.interpolateColor(colors, Math.min(1.0, factor + 0.15));
        ctx.lineWidth = settings.strokeWidth;
        
        // Setup ridge neon glows
        if (settings.fillType === 'neon') {
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = settings.glowAmount || 8;
        }

        // Redraw only the top ridge line
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          let x = i * stepSize;
          let noiseFactor = 0.002;
          let nAngle = x * noiseFactor;
          let n1 = Math.sin(nAngle * 1.5 + time * baseSpeed + w * 1.7) * waveAmplitude * 0.6;
          let n2 = Math.cos(nAngle * 4.2 - time * baseSpeed * 1.3 + w * 2.3) * waveAmplitude * 0.25;
          let n3 = Math.sin(nAngle * 9.8 + time * baseSpeed * 2.1) * waveAmplitude * 0.08;
          let y = waveY + (n1 + n2 + n3) * settings.morphAmount;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }
};

// Export to window
if (typeof window !== "undefined") {
  window.Patterns = Patterns;
}
