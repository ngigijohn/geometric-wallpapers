/**
 * App Module for Geometric Wallpaper Generator
 * Coordinates state, canvas resize cycles, interactive mouse/drag physics,
 * floating UI panels, high-res exports (4K PNG & scalable SVG), and gallery systems.
 */

const App = {
  // Global Application State
  state: {
    pattern: "lowpoly",
    colors: [...window.Palettes.presets.midnight.colors],
    activePaletteKey: "midnight",
    settings: {
      density: 60,
      randomness: 1.0,
      scale: 1.0,
      strokeWidth: 1,
      cellGap: 0,
      glowAmount: 12,
      cubeSize: 36,
      wavePosition: 0.55,
      fillType: "gradient",
      shadingMode: "noise",
      symmetry: 12,
      showFlowerOfLife: true,
      showGrain: true,
      grainAmount: 1.0,
      morphEnabled: true,
      morphSpeed: 1.0,
      morphAmount: 1.0,
      aspect: "16:9"
    },
    // Aspect Ratio Resolution Map
    resolutions: {
      "16:9": { w: 3840, h: 2160, label: "Desktop (4K UHD)" },
      "9:16": { w: 1440, h: 3200, label: "Mobile (QHD+)" },
      "4:3":  { w: 2048, h: 2732, label: "Tablet (Retina)" },
      "1:1":  { w: 2048, h: 2048, label: "Square (Hi-Res)" }
    }
  },

  // State History Stacks (Undo/Redo)
  history: {
    undoStack: [],
    redoStack: [],
    maxDepth: 30,

    saveState(state) {
      // Serialize state to deep copy
      const snapshot = JSON.stringify({
        pattern: state.pattern,
        colors: state.colors,
        activePaletteKey: state.activePaletteKey,
        settings: { ...state.settings }
      });

      // Avoid adjacent duplicates
      if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snapshot) return;

      this.undoStack.push(snapshot);
      if (this.undoStack.length > this.maxDepth) {
        this.undoStack.shift();
      }
      this.redoStack = []; // Clear redo on new action
      this.updateUIButtons();
    },

    undo(state) {
      if (this.undoStack.length <= 1) return; // Keep at least the starting state
      
      const currentState = this.undoStack.pop();
      this.redoStack.push(currentState);
      
      const previousState = JSON.parse(this.undoStack[this.undoStack.length - 1]);
      this.applyState(state, previousState);
      this.updateUIButtons();
    },

    redo(state) {
      if (this.redoStack.length === 0) return;

      const nextState = JSON.parse(this.redoStack.pop());
      this.undoStack.push(JSON.stringify(nextState));
      
      this.applyState(state, nextState);
      this.updateUIButtons();
    },

    applyState(state, target) {
      state.pattern = target.pattern;
      state.colors = [...target.colors];
      state.activePaletteKey = target.activePaletteKey;
      state.settings = { ...target.settings };

      // Re-link UI control bindings to matches
      App.syncSettingsToUI();
      App.triggerRender();
    },

    updateUIButtons() {
      const undoBtn = document.getElementById("undoBtn");
      const redoBtn = document.getElementById("redoBtn");
      
      if (undoBtn) {
        if (this.undoStack.length > 1) undoBtn.classList.remove("disabled");
        else undoBtn.classList.add("disabled");
      }
      if (redoBtn) {
        if (this.redoStack.length > 0) redoBtn.classList.remove("disabled");
        else redoBtn.classList.add("disabled");
      }
    }
  },

  // Setup initializers
  init() {
    this.canvas = document.getElementById("mainCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.viewport = document.getElementById("viewport");
    
    // Animation tick parameters
    this.time = 0;
    this.lastTime = 0;
    this.isMorphing = true;
    this.paused = false;
    
    // Interaction physics
    this.draggedPoint = null;
    this.dragThreshold = 40;

    // Load initial states
    this.setupUIBindings();
    this.bindKeyboardShortcuts();
    this.loadPresetPalettes();
    this.loadFavorites();

    // If the page was opened via a "Copy Share Link" URL, apply the encoded design
    // before the first render/history snapshot so it becomes the new baseline.
    if (this.applySharedStateFromURL()) {
      this.ctx.geometricPoints = null;
      this.syncSettingsToUI();
      this.syncPaletteHighlight();
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", location.pathname + location.hash);
      }
    }

    // Set aspect and size workspace
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
    // Re-fit after fonts/layout fully settle (important on mobile)
    setTimeout(() => this.resizeCanvas(), 200);

    // Save baseline snapshot
    this.history.saveState(this.state);

    // Bootstrap render ticks
    this.animate(0);
  },

  // Canvas Sizing and High-DPI fitting
  resizeCanvas() {
    const ratioKey = this.state.settings.aspect;
    const target = this.state.resolutions[ratioKey];

    // True physical resolution of the canvas drawing buffer
    this.canvas.width = target.w;
    this.canvas.height = target.h;

    // Scale canvas CSS fitting inside the viewport bounds
    const viewW = this.viewport.clientWidth - 40;
    const viewH = this.viewport.clientHeight - 40;

    const scale = Math.min(viewW / target.w, viewH / target.h);
    
    this.canvas.style.width = `${target.w * scale}px`;
    this.canvas.style.height = `${target.h * scale}px`;

    // Reset temporary cached points so they re-generate correctly matching aspect
    if (this.ctx) {
      this.ctx.geometricPoints = null;
    }
    
    this.triggerRender();
  },

  // Target redraw interval for morph animation (ms). Capping below native display
  // refresh rate avoids redoing expensive per-frame work (Delaunay triangulation,
  // full-canvas grain, etc.) more often than is visually necessary.
  frameInterval: 1000 / 45,

  // Continuous animation request ticks
  animate(timestamp) {
    if (this.paused) {
      this.lastTime = 0;
    } else {
      if (!this.lastTime) this.lastTime = timestamp;
      const dt = timestamp - this.lastTime;

      if (this.state.settings.morphEnabled && dt >= this.frameInterval) {
        this.lastTime = timestamp;
        this.time += dt;
        this.draw();
      }
    }

    requestAnimationFrame((t) => this.animate(t));
  },

  // Main canvas router drawing selected styles
  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const colors = this.state.colors;
    const settings = this.state.settings;

    ctx.save();
    
    switch (this.state.pattern) {
      case "lowpoly":
        window.Patterns.drawLowPoly(ctx, w, h, colors, settings, this.time);
        break;
      case "voronoi":
        window.Patterns.drawVoronoi(ctx, w, h, colors, settings, this.time);
        break;
      case "sacred":
        window.Patterns.drawSacred(ctx, w, h, colors, settings, this.time);
        break;
      case "bauhaus":
        window.Patterns.drawBauhaus(ctx, w, h, colors, settings, this.time);
        break;
      case "isometric":
        window.Patterns.drawIsometric(ctx, w, h, colors, settings, this.time);
        break;
      case "flowfields":
        window.Patterns.drawFlowWaves(ctx, w, h, colors, settings, this.time);
        break;
      case "blobs":
        window.Patterns.drawBlobs(ctx, w, h, colors, settings, this.time);
        break;
    }

    ctx.restore();
  },

  triggerRender() {
    // Force a single redraw when morph is off or animation is paused
    if (!this.state.settings.morphEnabled || this.paused) {
      this.draw();
    }
  },

  // UI Control Panel Event Bindings
  setupUIBindings() {
    const self = this;

    // --- SIDEBAR TABS NAV ---
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        tabBtns.forEach(b => b.classList.remove("active"));
        tabPanels.forEach(p => p.classList.remove("active"));
        
        btn.classList.add("active");
        const panelId = btn.getAttribute("data-tab");
        document.getElementById(panelId).classList.add("active");
      });
    });

    // --- MOBILE SHEET HANDLE: tap = toggle, drag = free resize + snap at release ---
    const sheetHandle = document.getElementById("sheetHandle");
    if (sheetHandle) {
      const sheetText = document.getElementById("sheetHandleText");
      const container = document.querySelector(".app-container");
      const sidebarEl = document.getElementById("sidebar");
      const viewportEl = document.getElementById("viewport");

      const HANDLE_H = 58;        // height of the handle strip when collapsed
      const MIN_PANEL_H = 100;    // below this, drag-release snaps to collapsed
      const DRAG_THRESHOLD = 8;   // px of movement before drag mode activates

      let dragActive = false;
      let pointerStartY = 0;
      let startSidebarH = 0;
      let currentDragH = 0;
      let lastExpandedH = 0;      // remembers last non-collapsed height for tap-to-expand

      const isCollapsed = () => container.classList.contains("panel-collapsed");

      // Set both sidebar and viewport to explicit pixel heights via inline styles.
      // This is the single source of truth on mobile — CSS classes only control visual state.
      const applyHeights = (sidebarH) => {
        const totalH = window.innerHeight;
        const h = Math.max(HANDLE_H, Math.min(Math.round(totalH * 0.90), Math.round(sidebarH)));
        sidebarEl.style.height = h + "px";
        sidebarEl.style.flex = "none";
        viewportEl.style.height = (totalH - h) + "px";
        viewportEl.style.flex = "none";
        currentDragH = h;
        return h;
      };

      const collapse = () => {
        applyHeights(HANDLE_H);
        container.classList.add("panel-collapsed");
        if (sheetText) sheetText.textContent = "Show Panel";
        setTimeout(() => self.resizeCanvas(), 50);
      };

      const expand = (targetH) => {
        const totalH = window.innerHeight;
        const h = applyHeights(targetH || Math.round(totalH * 0.52));
        lastExpandedH = h;
        container.classList.remove("panel-collapsed");
        if (sheetText) sheetText.textContent = "Hide Panel";
        setTimeout(() => self.resizeCanvas(), 50);
      };

      // Read current sidebar height (inline style → fallback to measured)
      const getSidebarH = () => {
        if (sidebarEl.style.height) return parseInt(sidebarEl.style.height, 10);
        return sidebarEl.getBoundingClientRect().height;
      };

      sheetHandle.addEventListener("pointerdown", (e) => {
        dragActive = false;
        pointerStartY = e.clientY;
        startSidebarH = getSidebarH();
        currentDragH = startSidebarH;
        sheetHandle.setPointerCapture(e.pointerId);
      });

      sheetHandle.addEventListener("pointermove", (e) => {
        const dy = pointerStartY - e.clientY; // up = positive = bigger sidebar
        if (!dragActive && Math.abs(dy) > DRAG_THRESHOLD) {
          dragActive = true;
          container.classList.add("dragging");
          // Begin drag from handle height if currently collapsed
          if (isCollapsed()) {
            startSidebarH = HANDLE_H;
            container.classList.remove("panel-collapsed");
          }
        }
        if (dragActive) {
          applyHeights(startSidebarH + dy);
        }
      });

      // Shared release logic for both a normal release (pointerup) and an OS-initiated
      // cancel (pointercancel) — e.g. a mobile browser deciding mid-touch that the
      // gesture is a page scroll. Without this, a cancel used to just freeze the panel
      // wherever the drag left it, with no snap and no tap-to-toggle fallback.
      const finishRelease = () => {
        container.classList.remove("dragging");
        if (dragActive) {
          dragActive = false;
          // Snap to collapsed if released very low; otherwise lock in at released position
          if (currentDragH < MIN_PANEL_H) {
            collapse();
          } else {
            lastExpandedH = currentDragH;
            container.classList.remove("panel-collapsed");
            if (sheetText) sheetText.textContent = "Hide Panel";
            setTimeout(() => self.resizeCanvas(), 50);
          }
        } else {
          // Pure tap: toggle between collapsed and last-known expanded height
          if (isCollapsed()) {
            expand(lastExpandedH);
          } else {
            const h = getSidebarH();
            if (h > HANDLE_H + 20) lastExpandedH = h;
            collapse();
          }
        }
      };

      sheetHandle.addEventListener("pointerup", finishRelease);
      sheetHandle.addEventListener("pointercancel", finishRelease);

      sheetHandle.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isCollapsed()) expand(lastExpandedH);
          else { const h = getSidebarH(); if (h > HANDLE_H + 20) lastExpandedH = h; collapse(); }
        }
      });
    }

    // --- COLLAPSE SIDEBAR EVENT ---
    const sidebar = document.getElementById("sidebar");
    const collapseBtn = document.getElementById("collapseBtn");
    const collapseIcon = document.getElementById("collapseIcon");
    collapseBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      if (sidebar.classList.contains("collapsed")) {
        collapseBtn.title = "Show Control Panel";
        collapseIcon.innerHTML = `<polyline points="15 18 9 12 15 6"></polyline>`;
      } else {
        collapseBtn.title = "Hide Control Panel";
        collapseIcon.innerHTML = `<polyline points="9 18 15 12 9 6"></polyline>`;
      }
    });
    collapseBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        collapseBtn.click();
      }
    });

    // --- SELECT PATTERN ENGINE ---
    const cards = document.querySelectorAll(".pattern-card");
    const engineTitle = document.getElementById("engineTitle");
    const engineDesc = document.getElementById("engineDesc");

    const engineDetails = {
      lowpoly: { title: "Low Poly Delaunay Triangulation", desc: "Generates a gorgeous high-fidelity Delaunay mesh. Triangles can be filled with deep radial or noise-driven gradients, flat shading, or neon cyberpunk glows. Drag vertices or click to shape your mesh!" },
      voronoi: { title: "Voronoi Cellular Mosaic", desc: "Computes the exact mathematical dual of the Delaunay mesh, forming closed cellular polygons. Customize cell spacing and border scaling to build beautiful crystal-like structures." },
      sacred: { title: "Sacred Geometry & Mandalas", desc: "Implements high-symmetry rotating concentric rings, rotated stars, and complex lines. Optional hexagonally spaced circles underlay (Flower of Life style) make this highly relaxing." },
      bauhaus: { title: "Bauhaus & Memphis Modernism", desc: "Builds a clean vector compositional canvas utilizing overlapping large circles, arches, grids, curvis, squiggles, and lines with custom vintage paper grain filtering overlays." },
      isometric: { title: "Isometric 3D Cascading Cubes", desc: "Constructs cascading isometric cubes with high-fidelity directional light shading. morph animations run sine-based rolling 3D landscape terrain waves." },
      flowfields: { title: "Generative Flow Field Waves", desc: "Generates stacked fluid-like wavy landscape bands. Ridge wireframes can glow in adjustable neon colors while waves roll like a digital ocean." },
      blobs: { title: "Floating Morphing Blobs", desc: "Organic blob shapes drift and slowly morph across the canvas. Each blob warps between lobe configurations independently, creating a mesmerizing lava-lamp flow effect." }
    };

    cards.forEach(card => {
      const activate = () => {
        cards.forEach(c => { c.classList.remove("active"); c.setAttribute("aria-pressed", "false"); });
        card.classList.add("active");
        card.setAttribute("aria-pressed", "true");

        const patternKey = card.getAttribute("data-pattern");
        self.state.pattern = patternKey;

        // Update details display
        engineTitle.textContent = engineDetails[patternKey].title;
        engineDesc.textContent = engineDetails[patternKey].desc;

        // Toggle engine specific sliders in UI
        self.toggleEngineInputs(patternKey);

        // Reset points cache
        self.ctx.geometricPoints = null;

        self.history.saveState(self.state);
        self.triggerRender();
      };
      card.setAttribute("aria-pressed", card.classList.contains("active") ? "true" : "false");
      card.addEventListener("click", activate);
      self.makeKeyboardActivatable(card, activate);
    });

    // --- INPUT RANGE/SLIDER BINDINGS ---
    const rangeSliders = [
      { id: "slider-density", key: "density" },
      { id: "slider-randomness", key: "randomness" },
      { id: "slider-scale", key: "scale" },
      { id: "slider-strokeWidth", key: "strokeWidth" },
      { id: "slider-cellGap", key: "cellGap" },
      { id: "slider-symmetry", key: "symmetry" },
      { id: "slider-morphSpeed", key: "morphSpeed" },
      { id: "slider-morphAmount", key: "morphAmount" },
      { id: "slider-grainAmount", key: "grainAmount" },
      { id: "slider-glowAmount", key: "glowAmount" },
      { id: "slider-cubeSize", key: "cubeSize" },
      { id: "slider-wavePosition", key: "wavePosition" }
    ];

    rangeSliders.forEach(slider => {
      const el = document.getElementById(slider.id);
      const display = document.getElementById(`val-${slider.key}`);
      if (el) {
        el.addEventListener("input", (e) => {
          const val = parseFloat(e.target.value);
          self.state.settings[slider.key] = val;
          if (display) display.textContent = val;
          
          if (slider.key === "density" || slider.key === "randomness") {
            // Need to reset cached grid nodes
            self.ctx.geometricPoints = null;
          }
          self.triggerRender();
        });

        el.addEventListener("change", () => {
          self.history.saveState(self.state);
        });
      }
    });

    // --- SELECT BINDINGS ---
    const selects = [
      { id: "select-fillType", key: "fillType" },
      { id: "select-shadingMode", key: "shadingMode" }
    ];
    selects.forEach(sel => {
      const el = document.getElementById(sel.id);
      if (el) {
        el.addEventListener("change", (e) => {
          self.state.settings[sel.key] = e.target.value;
          if (sel.key === "fillType") {
            const glowGroup = document.getElementById("group-glowAmount");
            if (glowGroup) glowGroup.style.display = e.target.value === "neon" ? "flex" : "none";
          }
          self.history.saveState(self.state);
          self.triggerRender();
        });
      }
    });

    // --- TOGGLE CHECKBOXES ---
    const toggles = [
      { id: "check-flowerGrid", key: "showFlowerOfLife" },
      { id: "check-grain", key: "showGrain" },
      { id: "check-morph", key: "morphEnabled" }
    ];
    toggles.forEach(tog => {
      const el = document.getElementById(tog.id);
      if (el) {
        el.addEventListener("change", (e) => {
          self.state.settings[tog.key] = e.target.checked;
          self.history.saveState(self.state);
          self.triggerRender();
        });
      }
    });

    // --- ASPECT RATIO SELECTIONS ---
    const ratioCards = document.querySelectorAll(".ratio-card");
    ratioCards.forEach(card => {
      const activate = () => {
        ratioCards.forEach(c => { c.classList.remove("active"); c.setAttribute("aria-pressed", "false"); });
        card.classList.add("active");
        card.setAttribute("aria-pressed", "true");

        self.state.settings.aspect = card.getAttribute("data-ratio");
        self.history.saveState(self.state);
        self.resizeCanvas();
      };
      card.setAttribute("aria-pressed", card.classList.contains("active") ? "true" : "false");
      card.addEventListener("click", activate);
      self.makeKeyboardActivatable(card, activate);
    });

    // --- COLOR HARMONIZER ACTIONS ---
    const applyHarmonyBtn = document.getElementById("generatePaletteBtn");
    if (applyHarmonyBtn) {
      applyHarmonyBtn.addEventListener("click", () => {
        const seed = document.getElementById("harmonySeed").value;
        const rule = document.getElementById("harmonyRule").value;

        // Apply algorithm
        const newColors = window.Palettes.generateHarmony(seed, rule);
        self.state.colors = newColors;
        self.state.activePaletteKey = "custom";

        // De-select pre-coded active borders
        document.querySelectorAll(".palette-item").forEach(item => item.classList.remove("active"));

        self.renderCustomSwatchEditor();
        self.history.saveState(self.state);
        self.triggerRender();
      });
    }

    // --- QUICK ACTION WORKSPACE CONTROL BUTTONS ---
    const pauseBtn = document.getElementById("pauseBtn");
    const pauseIconEl = document.getElementById("pauseIcon");
    if (pauseBtn) {
      pauseBtn.addEventListener("click", () => {
        self.paused = !self.paused;
        if (self.paused) {
          pauseIconEl.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
          pauseBtn.title = "Resume Animation";
          pauseBtn.setAttribute("aria-label", "Resume Animation");
        } else {
          pauseIconEl.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
          pauseBtn.title = "Pause Animation";
          pauseBtn.setAttribute("aria-label", "Pause Animation");
          self.triggerRender();
        }
      });
    }

    document.getElementById("undoBtn").addEventListener("click", () => self.history.undo(self.state));
    document.getElementById("redoBtn").addEventListener("click", () => self.history.redo(self.state));
    
    document.getElementById("shuffleBtn").addEventListener("click", () => {
      // SHUFFLE SETTINGS & SEEDS (Awesome discovery feature!)
      self.state.settings.density = Math.floor(20 + Math.random() * 80);
      self.state.settings.randomness = parseFloat((0.2 + Math.random() * 1.5).toFixed(1));
      self.state.settings.scale = parseFloat((0.5 + Math.random() * 1.5).toFixed(1));
      self.state.settings.strokeWidth = Math.floor(Math.random() * 3);
      self.state.settings.cellGap = Math.floor(Math.random() * 5);
      
      const shadingOpts = ["linear", "radial", "noise"];
      self.state.settings.shadingMode = shadingOpts[Math.floor(Math.random() * shadingOpts.length)];
      
      const fillOpts = ["solid", "gradient"];
      self.state.settings.fillType = fillOpts[Math.floor(Math.random() * fillOpts.length)];

      // Pick a random palette
      const keys = Object.keys(window.Palettes.presets);
      const randKey = keys[Math.floor(Math.random() * keys.length)];
      self.state.colors = [...window.Palettes.presets[randKey].colors];
      self.state.activePaletteKey = randKey;
      
      // Update pre-coded highlights
      document.querySelectorAll(".palette-item").forEach(item => {
        if (item.getAttribute("data-palette") === randKey) item.classList.add("active");
        else item.classList.remove("active");
      });

      self.ctx.geometricPoints = null; // Re-seed
      self.syncSettingsToUI(); // also refreshes the custom swatch editor
      self.history.saveState(self.state);
      self.triggerRender();
    });

    // --- KEYBOARD SHORTCUTS LEGEND MODAL ---
    const shortcutsBtn = document.getElementById("shortcutsBtn");
    const shortcutsBackdrop = document.getElementById("shortcutsModalBackdrop");
    const shortcutsCloseBtn = document.getElementById("shortcutsCloseBtn");
    if (shortcutsBtn && shortcutsBackdrop) {
      const openShortcuts = () => shortcutsBackdrop.classList.remove("hidden");
      const closeShortcuts = () => shortcutsBackdrop.classList.add("hidden");
      self.toggleShortcutsModal = () => {
        shortcutsBackdrop.classList.toggle("hidden");
      };
      shortcutsBtn.addEventListener("click", openShortcuts);
      shortcutsCloseBtn.addEventListener("click", closeShortcuts);
      shortcutsBackdrop.addEventListener("click", (e) => {
        if (e.target === shortcutsBackdrop) closeShortcuts();
      });
    }

    document.getElementById("fullScreenBtn").addEventListener("click", () => {
      if (!document.fullscreenElement) {
        self.viewport.requestFullscreen().catch(err => {
          console.error(`Error enabling fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    });

    // --- DOWNLOAD EXPORTS ---
    document.getElementById("downloadPngBtn").addEventListener("click", () => self.exportPNG());
    document.getElementById("downloadSvgBtn").addEventListener("click", () => self.exportSVG());
    document.getElementById("saveGalleryBtn").addEventListener("click", () => self.saveToGallery());
    document.getElementById("copyShareLinkBtn").addEventListener("click", () => self.copyShareLink());

    // --- INTERACTIVE DRAGGING / NODE SCULPTING MOUSE UTILS ---
    this.canvas.addEventListener("mousedown", (e) => self.handleMouseDown(e));
    this.canvas.addEventListener("mousemove", (e) => self.handleMouseMove(e));
    this.canvas.addEventListener("mouseup", () => self.handleMouseUp());
    this.canvas.addEventListener("mouseleave", () => self.handleMouseUp());

    // Touch support for mobile interaction. preventDefault stops the page from
    // scrolling/pinch-zooming while the user is sculpting vertices on the canvas
    // (listeners are non-passive by default here, so this is safe to call).
    this.canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        self.handleMouseDown(touch);
      }
    }, { passive: false });
    this.canvas.addEventListener("touchmove", (e) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        self.handleMouseMove(touch);
      }
    }, { passive: false });
    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      self.handleMouseUp();
    }, { passive: false });
  },

  // Toggle visible controls in panel depending on selected geometric engine
  toggleEngineInputs(pattern) {
    const gapGroup = document.getElementById("group-cellGap");
    const symGroup = document.getElementById("group-symmetry");
    const flowerGroup = document.getElementById("group-flowerGrid");
    const grainGroup = document.getElementById("group-grain");

    const jitterGroup = document.getElementById("group-randomness");
    const fillGroup = document.getElementById("group-fillType");
    const shadingGroup = document.getElementById("group-shadingMode");
    const densityGroup = document.getElementById("group-density");
    const scaleGroup = document.getElementById("group-scale");
    const cubeSizeGroup = document.getElementById("group-cubeSize");
    const wavePosGroup = document.getElementById("group-wavePosition");
    const glowGroup = document.getElementById("group-glowAmount");

    // Default visible set (shared low-poly / voronoi style controls)
    gapGroup.style.display = "none";
    symGroup.style.display = "none";
    flowerGroup.style.display = "none";
    grainGroup.style.display = "none";
    cubeSizeGroup.style.display = "none";
    wavePosGroup.style.display = "none";
    jitterGroup.style.display = "flex";
    fillGroup.style.display = "flex";
    shadingGroup.style.display = "flex";
    densityGroup.style.display = "flex";
    scaleGroup.style.display = "flex";
    // Glow only matters when neon fill is available AND active
    if (glowGroup) glowGroup.style.display = this.state.settings.fillType === "neon" ? "flex" : "none";

    if (pattern === "voronoi") {
      gapGroup.style.display = "flex";
    } else if (pattern === "sacred") {
      symGroup.style.display = "flex";
      flowerGroup.style.display = "flex";
      jitterGroup.style.display = "none";
      fillGroup.style.display = "none";
      shadingGroup.style.display = "none";
      densityGroup.style.display = "none";
      if (glowGroup) glowGroup.style.display = "none";
    } else if (pattern === "bauhaus") {
      grainGroup.style.display = "flex";
      shadingGroup.style.display = "none";
      fillGroup.style.display = "none";
      jitterGroup.style.display = "none";
      if (glowGroup) glowGroup.style.display = "none";
    } else if (pattern === "isometric") {
      jitterGroup.style.display = "none";
      shadingGroup.style.display = "none";
      densityGroup.style.display = "none";
      scaleGroup.style.display = "none";
      cubeSizeGroup.style.display = "flex";
    } else if (pattern === "flowfields") {
      jitterGroup.style.display = "none";
      shadingGroup.style.display = "none";
      wavePosGroup.style.display = "flex";
    } else if (pattern === "blobs") {
      jitterGroup.style.display = "none";
      shadingGroup.style.display = "none";
    }
  },

  // Force sync the UI widgets when history Undo/Redo/Shuffle is called
  syncSettingsToUI() {
    const settings = this.state.settings;

    // Sync cards active
    document.querySelectorAll(".pattern-card").forEach(c => {
      if (c.getAttribute("data-pattern") === this.state.pattern) c.classList.add("active");
      else c.classList.remove("active");
    });
    this.toggleEngineInputs(this.state.pattern);

    // Sync sliders
    const sliders = ["density", "randomness", "scale", "strokeWidth", "cellGap", "symmetry", "morphSpeed", "morphAmount", "grainAmount", "glowAmount", "cubeSize", "wavePosition"];
    sliders.forEach(key => {
      const el = document.getElementById(`slider-${key}`);
      const valDisplay = document.getElementById(`val-${key}`);
      if (el) {
        el.value = settings[key];
        if (valDisplay) valDisplay.textContent = settings[key];
      }
    });

    // Sync selects
    const selects = ["fillType", "shadingMode"];
    selects.forEach(key => {
      const el = document.getElementById(`select-${key}`);
      if (el) el.value = settings[key];
    });

    // Sync checkboxes
    const checks = [
      { id: "check-flowerGrid", val: settings.showFlowerOfLife },
      { id: "check-grain", val: settings.showGrain },
      { id: "check-morph", val: settings.morphEnabled }
    ];
    checks.forEach(chk => {
      const el = document.getElementById(chk.id);
      if (el) el.checked = chk.val;
    });

    // (Glow slider visibility is handled by toggleEngineInputs above)

    // Sync aspect cards
    document.querySelectorAll(".ratio-card").forEach(c => {
      if (c.getAttribute("data-ratio") === settings.aspect) c.classList.add("active");
      else c.classList.remove("active");
    });

    this.renderCustomSwatchEditor();
  },

  // Highlights whichever palette card matches state.activePaletteKey (no-op / clears
  // highlight entirely when the active colors were custom-edited or harmony-generated).
  syncPaletteHighlight() {
    document.querySelectorAll(".palette-item").forEach(item => {
      if (item.getAttribute("data-palette") === this.state.activePaletteKey) item.classList.add("active");
      else item.classList.remove("active");
    });
  },

  // --- CUSTOM PALETTE EDITOR (edit-in-place) ---
  // Renders one <input type="color"> per active swatch so the user can fine-tune the
  // currently-selected palette directly, without a separate "save as new palette" flow.
  renderCustomSwatchEditor() {
    const container = document.getElementById("customSwatchEditor");
    if (!container) return;
    container.innerHTML = "";

    const self = this;
    this.state.colors.forEach((hex, idx) => {
      const wrapper = document.createElement("div");
      wrapper.className = "picker-wrapper";
      wrapper.title = `Swatch ${idx + 1}`;

      const input = document.createElement("input");
      input.type = "color";
      input.value = hex;
      input.setAttribute("aria-label", `Edit swatch ${idx + 1} color`);
      input.addEventListener("input", () => {
        self.state.colors[idx] = input.value;
        self.state.activePaletteKey = "custom";
        self.syncPaletteHighlight();
        self.triggerRender();
        self.debouncedSaveHistory();
      });

      wrapper.appendChild(input);
      container.appendChild(wrapper);
    });
  },

  // Native color inputs fire "input" continuously while dragging the picker; debounce
  // the undo/redo snapshot so a single drag doesn't spam the 30-step history stack.
  debouncedSaveHistory() {
    clearTimeout(this._saveHistoryTimer);
    this._saveHistoryTimer = setTimeout(() => this.history.saveState(this.state), 400);
  },

  // --- SHAREABLE LINKS (human-readable query params) ---
  // Settings serialized uniformly regardless of the active pattern, so a link always
  // reproduces exactly what was on screen even if the viewer switches patterns after.
  SHARE_NUMERIC_KEYS: ["density", "randomness", "scale", "strokeWidth", "cellGap", "glowAmount", "cubeSize", "wavePosition", "symmetry", "grainAmount", "morphSpeed", "morphAmount"],
  SHARE_STRING_KEYS: ["fillType", "shadingMode"],
  SHARE_BOOL_KEYS: ["showFlowerOfLife", "showGrain", "morphEnabled"],

  buildShareParams() {
    const s = this.state;
    const params = new URLSearchParams();
    params.set("pattern", s.pattern);
    params.set("palette", s.activePaletteKey);
    params.set("aspect", s.settings.aspect);

    // Only ship explicit colors when they don't match a built-in preset (custom edits
    // or a generated harmony) so the link reproduces exactly what's on screen.
    if (!window.Palettes.presets[s.activePaletteKey]) {
      params.set("colors", s.colors.join(","));
    }

    this.SHARE_NUMERIC_KEYS.forEach(k => params.set(k, s.settings[k]));
    this.SHARE_STRING_KEYS.forEach(k => params.set(k, s.settings[k]));
    this.SHARE_BOOL_KEYS.forEach(k => params.set(k, s.settings[k] ? "1" : "0"));

    return params;
  },

  getShareURL() {
    return `${location.origin}${location.pathname}?${this.buildShareParams().toString()}`;
  },

  // Reads location.search and merges any recognized params into state. Returns true
  // if any shared design params were found and applied.
  applySharedStateFromURL() {
    const params = new URLSearchParams(location.search);
    if ([...params.keys()].length === 0) return false;

    const pattern = params.get("pattern");
    if (pattern) this.state.pattern = pattern;

    const paletteKey = params.get("palette");
    const colorsParam = params.get("colors");
    if (colorsParam) {
      const colors = colorsParam.split(",").map(c => c.trim()).filter(Boolean);
      if (colors.length > 0) {
        this.state.colors = colors;
        this.state.activePaletteKey = paletteKey || "custom";
      }
    } else if (paletteKey && window.Palettes.presets[paletteKey]) {
      this.state.colors = [...window.Palettes.presets[paletteKey].colors];
      this.state.activePaletteKey = paletteKey;
    }

    this.SHARE_NUMERIC_KEYS.forEach(k => {
      if (!params.has(k)) return;
      const v = parseFloat(params.get(k));
      if (!Number.isNaN(v)) this.state.settings[k] = v;
    });

    this.SHARE_STRING_KEYS.forEach(k => {
      if (params.has(k)) this.state.settings[k] = params.get(k);
    });

    this.SHARE_BOOL_KEYS.forEach(k => {
      if (params.has(k)) this.state.settings[k] = params.get(k) === "1";
    });

    const aspect = params.get("aspect");
    if (aspect && this.state.resolutions[aspect]) this.state.settings.aspect = aspect;

    return true;
  },

  copyShareLink() {
    const btn = document.getElementById("copyShareLinkBtn");
    const url = this.getShareURL();

    const showCopied = () => {
      if (!btn) return;
      const original = btn.innerHTML;
      btn.textContent = "Link Copied!";
      setTimeout(() => { btn.innerHTML = original; }, 1600);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(showCopied).catch(() => window.prompt("Copy this link:", url));
    } else {
      window.prompt("Copy this link:", url);
    }
  },

  // --- KEYBOARD SHORTCUTS ---
  // Global shortcuts, ignored whenever focus is inside a form control so typing in
  // sliders/selects/color pickers/text fields is never intercepted.
  bindKeyboardShortcuts() {
    const self = this;
    document.addEventListener("keydown", (e) => {
      const active = document.activeElement;
      const tag = active && active.tagName;
      const isEditable = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || (active && active.isContentEditable);

      if (e.key === "Escape") {
        const backdrop = document.getElementById("shortcutsModalBackdrop");
        if (backdrop && !backdrop.classList.contains("hidden")) backdrop.classList.add("hidden");
        return;
      }

      if (isEditable) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) self.history.redo(self.state);
        else self.history.undo(self.state);
        return;
      }
      if (mod) return; // leave other Ctrl/Cmd combos to the browser/OS

      switch (e.key) {
        case "s": case "S":
          e.preventDefault();
          document.getElementById("shuffleBtn").click();
          break;
        case "p": case "P":
          e.preventDefault();
          self.exportPNG();
          break;
        case "f": case "F":
          e.preventDefault();
          document.getElementById("fullScreenBtn").click();
          break;
        case " ":
          e.preventDefault();
          document.getElementById("pauseBtn").click();
          break;
        case "?":
          e.preventDefault();
          if (self.toggleShortcutsModal) self.toggleShortcutsModal();
          break;
        case "1": case "2": case "3": case "4": case "5": case "6": case "7": {
          e.preventDefault();
          const cards = document.querySelectorAll(".pattern-card");
          const card = cards[parseInt(e.key, 10) - 1];
          if (card) card.click();
          break;
        }
      }
    });
  },

  // --- ACCESSIBILITY HELPER ---
  // Makes a plain clickable <div> keyboard-operable (Tab to focus, Enter/Space to
  // activate) without changing its click-driven markup/CSS elsewhere in the app.
  makeKeyboardActivatable(el, onActivate) {
    el.setAttribute("role", "button");
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(e);
      }
    });
  },

  // Inject Curated Palettes List
  loadPresetPalettes() {
    const list = document.getElementById("paletteList");
    list.innerHTML = "";

    const self = this;
    for (let key in window.Palettes.presets) {
      const pal = window.Palettes.presets[key];
      const item = document.createElement("div");
      item.className = `palette-item ${key === self.state.activePaletteKey ? "active" : ""}`;
      item.setAttribute("data-palette", key);

      // Create swatches block
      let swatchesHtml = `<div class="palette-swatches">`;
      pal.colors.forEach(col => {
        swatchesHtml += `<div class="swatch" style="background-color:${col}"></div>`;
      });
      swatchesHtml += `</div>`;

      item.innerHTML = `
        <div class="palette-meta">
          <span class="palette-name">${pal.name}</span>
          <span style="font-size:10px; opacity:0.6; text-transform:uppercase;">${pal.theme}</span>
        </div>
        ${swatchesHtml}
      `;

      const activate = () => {
        document.querySelectorAll(".palette-item").forEach(p => { p.classList.remove("active"); p.setAttribute("aria-pressed", "false"); });
        item.classList.add("active");
        item.setAttribute("aria-pressed", "true");

        self.state.colors = [...pal.colors];
        self.state.activePaletteKey = key;

        self.renderCustomSwatchEditor();
        self.history.saveState(self.state);
        self.triggerRender();
      };
      item.setAttribute("aria-pressed", item.classList.contains("active") ? "true" : "false");
      item.addEventListener("click", activate);
      self.makeKeyboardActivatable(item, activate);

      list.appendChild(item);
    }

    this.renderCustomSwatchEditor();
  },

  // --- MOUSE CLICK/DRAG INTERACTIVE PHYSICS ---
  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    
    // Account for CSS scaling vs drawing buffer size
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    return {
      x: clientX * scaleX,
      y: clientY * scaleY
    };
  },

  handleMouseDown(e) {
    if (!this.ctx.geometricPoints) return;
    const mouse = this.getMousePos(e);
    
    // Find closest node to point
    let closestNode = null;
    let minDist = this.dragThreshold * (this.canvas.width / this.canvas.clientWidth); // scale threshold

    // Scan points
    for (let p of this.ctx.geometricPoints) {
      if (p.id < 0 || p.seedX === 0) continue; // skip perimeter corners
      
      const d = Math.sqrt((p.x - mouse.x)**2 + (p.y - mouse.y)**2);
      if (d < minDist) {
        minDist = d;
        closestNode = p;
      }
    }

    if (closestNode) {
      this.draggedPoint = closestNode;
      // Temporarily halt morph drift so user has tight hold
      this.isMorphingBeforeDrag = this.state.settings.morphEnabled;
    } else {
      // If clicked empty space, add a new point node to shape space! (Wow sculpt factor!)
      if (this.state.pattern === "lowpoly" || this.state.pattern === "voronoi") {
        const nextId = this.ctx.geometricPoints.length;
        const newPt = {
          x: mouse.x,
          y: mouse.y,
          id: nextId,
          baseX: mouse.x,
          baseY: mouse.y,
          seedX: Math.random() * 100,
          seedY: Math.random() * 100
        };
        
        // Push and re-render
        this.ctx.geometricPoints.push(newPt);
        this.state.settings.density = this.ctx.geometricPoints.length - 8; // align values excluding border cushioning
        document.getElementById("slider-density").value = this.state.settings.density;
        document.getElementById("val-density").textContent = this.state.settings.density;

        this.history.saveState(this.state);
        this.triggerRender();
      }
    }
  },

  handleMouseMove(e) {
    if (!this.draggedPoint) return;
    const mouse = this.getMousePos(e);

    // Update dragged node position directly in point map
    this.draggedPoint.x = mouse.x;
    this.draggedPoint.y = mouse.y;
    this.draggedPoint.baseX = mouse.x;
    this.draggedPoint.baseY = mouse.y;

    this.triggerRender();
  },

  handleMouseUp() {
    if (this.draggedPoint) {
      this.draggedPoint = null;
      this.history.saveState(this.state);
    }
  },

  // --- HIGH-RESOLUTION GRAPHICS EXPORT SYSTEMS ---

  // toDataURL()/large SVG string-building block the main thread on 4K canvases (can take
  // 500ms-2s). Swap the trigger button to a disabled "busy" label first, and defer the
  // blocking work one tick so the browser gets a chance to paint that state.
  setExportBusy(btn, label) {
    if (!btn || btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    btn.dataset.originalLabel = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = label;
  },
  clearExportBusy(btn) {
    if (!btn) return;
    btn.disabled = false;
    if (btn.dataset.originalLabel) btn.innerHTML = btn.dataset.originalLabel;
    delete btn.dataset.busy;
  },

  exportPNG() {
    const btn = document.getElementById("downloadPngBtn");
    this.setExportBusy(btn, "Rendering...");
    setTimeout(() => {
      // Canvas download triggers matching selected resolutions
      const link = document.createElement("a");
      link.download = `geometric_wallpaper_${this.state.pattern}_${Date.now()}.png`;

      // Draw current static state high-res
      this.triggerRender();

      link.href = this.canvas.toDataURL("image/png");
      link.click();
      this.clearExportBusy(btn);
    }, 0);
  },

  exportSVG() {
    const btn = document.getElementById("downloadSvgBtn");
    this.setExportBusy(btn, "Rendering...");
    setTimeout(() => {
      this._buildAndDownloadSVG();
      this.clearExportBusy(btn);
    }, 0);
  },

  _buildAndDownloadSVG() {
    // Constructs an exact mathematical vector file of active paths!
    const w = this.canvas.width;
    const h = this.canvas.height;
    const colors = this.state.colors;

    let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
    svgContent += `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">\n`;
    svgContent += `  <!-- Background -->\n`;
    svgContent += `  <rect width="100%" height="100%" fill="${colors[0]}"/>\n`;

    // Process Delaunay/Voronoi cells into vector nodes
    if (this.state.pattern === "lowpoly") {
      const points = this.ctx.geometricPoints;
      if (points) {
        const triangles = window.Patterns.triangulate(points);
        svgContent += `  <g id="Triangles" stroke="rgba(255,255,255,0.08)" stroke-width="${this.state.settings.strokeWidth}">\n`;
        
        triangles.forEach((t, i) => {
          let cx = (t.p1.x + t.p2.x + t.p3.x) / 3;
          let cy = (t.p1.y + t.p2.y + t.p3.y) / 3;
          let factor = (cx / w) * 0.6 + (cy / h) * 0.4;
          let col = window.Palettes.interpolateColor(colors, factor);
          
          svgContent += `    <polygon points="${t.p1.x.toFixed(1)},${t.p1.y.toFixed(1)} ${t.p2.x.toFixed(1)},${t.p2.y.toFixed(1)} ${t.p3.x.toFixed(1)},${t.p3.y.toFixed(1)}" fill="${col}"/>\n`;
        });
        
        svgContent += `  </g>\n`;
      }
    } else if (this.state.pattern === "voronoi") {
      const points = this.ctx.geometricPoints;
      if (points) {
        const triangles = window.Patterns.triangulate(points);
        let cells = {};
        for (let p of points) {
          if (p.id >= 0 && p.seedX > 0) cells[p.id] = { center: p, circumcenters: [] };
        }
        for (let t of triangles) {
          let cc = window.Patterns.getCircumcenter(t.p1, t.p2, t.p3);
          if (t.p1.id >= 0 && cells[t.p1.id]) cells[t.p1.id].circumcenters.push(cc);
          if (t.p2.id >= 0 && cells[t.p2.id]) cells[t.p2.id].circumcenters.push(cc);
          if (t.p3.id >= 0 && cells[t.p3.id]) cells[t.p3.id].circumcenters.push(cc);
        }

        svgContent += `  <g id="VoronoiCells" stroke="rgba(255,255,255,0.08)" stroke-width="${this.state.settings.strokeWidth}">\n`;
        for (let id in cells) {
          let cell = cells[id];
          let center = cell.center;
          let pts = cell.circumcenters;
          if (pts.length < 3) continue;

          // sort circumcenters
          pts.sort((a, b) => {
            let angleA = Math.atan2(a.y - center.y, a.x - center.x);
            let angleB = Math.atan2(b.y - center.y, b.x - center.x);
            return angleA - angleB;
          });

          let factor = (center.x / w) * 0.6 + (center.y / h) * 0.4;
          let col = window.Palettes.interpolateColor(colors, factor);
          
          let pointsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          svgContent += `    <polygon points="${pointsStr}" fill="${col}"/>\n`;
        }
        svgContent += `  </g>\n`;
      }
    } else if (this.state.pattern === "sacred") {
      // Sacred geometry circles
      let baseRadius = Math.min(w, h) * 0.38 * this.state.settings.scale;
      let symmetry = this.state.settings.symmetry;
      svgContent += `  <g id="SacredGeometry" fill="none" stroke-width="${this.state.settings.strokeWidth}">\n`;
      
      let layers = 5;
      for (let l = 1; l <= layers; l++) {
        let r = baseRadius * (l / layers);
        let col = window.Palettes.interpolateColor(colors, l / layers);
        
        svgContent += `    <!-- Layer ${l} Concentric circle -->\n`;
        svgContent += `    <circle cx="${(w/2).toFixed(1)}" cy="${(h/2).toFixed(1)}" r="${r.toFixed(1)}" stroke="${col}"/>\n`;
        
        // draw line facets
        for (let s = 0; s < symmetry; s++) {
          let angle = (s / symmetry) * Math.PI * 2;
          let x = w/2 + Math.cos(angle) * r;
          let y = h/2 + Math.sin(angle) * r;
          svgContent += `    <line x1="${(w/2).toFixed(1)}" y1="${(h/2).toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${col}" stroke-opacity="0.3"/>\n`;
        }
      }
      svgContent += `  </g>\n`;
    } else {
      // Fallback for waves and bauhaus vector placeholders
      svgContent += `  <!-- Fallback vector representations -->\n`;
      svgContent += `  <circle cx="${(w/2).toFixed(1)}" cy="${(h/2).toFixed(1)}" r="200" fill="${colors[1]}" opacity="0.8"/>\n`;
      svgContent += `  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="'Outfit', sans-serif" font-size="48" fill="#ffffff">GEOMETRIC VECTOR STUDIO</text>\n`;
    }

    svgContent += `</svg>\n`;

    // Download blob trigger
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `geometric_vector_${this.state.pattern}_${Date.now()}.svg`;
    link.click();
  },

  // --- LOCAL STORAGE FAVORITES GALLERY ---
  saveToGallery() {
    this.triggerRender();
    const dataUrl = this.canvas.toDataURL("image/jpeg", 0.3); // low-res thumbnail copy

    const favorite = {
      id: `fav_${Date.now()}`,
      pattern: this.state.pattern,
      colors: [...this.state.colors],
      activePaletteKey: this.state.activePaletteKey,
      settings: { ...this.state.settings },
      thumbnail: dataUrl
    };

    let gallery = [];
    const saved = localStorage.getItem("geometric_gallery");
    if (saved) {
      gallery = JSON.parse(saved);
    }
    
    // Add to front of stack
    gallery.unshift(favorite);
    
    // Keep max 10 to save local storage quota
    if (gallery.length > 10) gallery.pop();

    localStorage.setItem("geometric_gallery", JSON.stringify(gallery));
    
    this.loadFavorites();
  },

  loadFavorites() {
    const grid = document.getElementById("galleryGrid");
    grid.innerHTML = "";

    const saved = localStorage.getItem("geometric_gallery");
    if (!saved || JSON.parse(saved).length === 0) {
      grid.innerHTML = `<div class="gallery-empty">No saved wallpapers found. Click "Save Current" above to compile one in local storage.</div>`;
      return;
    }

    const gallery = JSON.parse(saved);
    const self = this;

    gallery.forEach(fav => {
      const card = document.createElement("div");
      card.className = "gallery-card";
      
      card.innerHTML = `
        <img src="${fav.thumbnail}" alt="Saved Geometric Style">
        <div class="card-actions">
          <div class="action-icon load-btn" title="Load Style" aria-label="Load Saved Style">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
          </div>
          <div class="action-icon del-btn" title="Delete Style" aria-label="Delete Saved Style">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </div>
        </div>
      `;

      // Load action bindings
      const loadBtn = card.querySelector(".load-btn");
      const doLoad = (e) => {
        e.stopPropagation();
        self.history.applyState(self.state, fav);
      };
      loadBtn.addEventListener("click", doLoad);
      self.makeKeyboardActivatable(loadBtn, doLoad);

      // Delete action bindings
      const delBtn = card.querySelector(".del-btn");
      const doDelete = (e) => {
        e.stopPropagation();
        let currentGallery = JSON.parse(localStorage.getItem("geometric_gallery"));
        currentGallery = currentGallery.filter(item => item.id !== fav.id);
        localStorage.setItem("geometric_gallery", JSON.stringify(currentGallery));
        self.loadFavorites();
      };
      delBtn.addEventListener("click", doDelete);
      self.makeKeyboardActivatable(delBtn, doDelete);

      grid.appendChild(card);
    });
  }
};

// Expose on window, matching Palettes/Patterns, so other scripts (e.g. the test suite
// driving this app inside an iframe) can reach it as `window.App`.
window.App = App;

// Bootstrap app on window load event
window.addEventListener("DOMContentLoaded", () => {
  App.init();
});
