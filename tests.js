/**
 * Test cases for tests.html. Uses TestRunner (test-runner.js) — no Node/npm involved.
 *
 * Section A tests palettes.js/patterns.js pure functions against a mock 2D context
 * (records calls, no real <canvas> needed for the smoke tests).
 * Section B drives the real app inside an iframe pointing at index.html, so the
 * share-link round trip and accessibility wiring are tested against the actual DOM.
 */

// --- Minimal mock CanvasRenderingContext2D ---
// Records how many times each drawing method was called; every method just needs to
// not throw and to look plausible. Gradients need addColorStop to be chainable.
function createMockCtx() {
  const calls = {};
  const record = (name) => { calls[name] = (calls[name] || 0) + 1; };

  const mockGradient = () => ({ addColorStop: () => record("gradient.addColorStop") });

  const ctx = {
    calls,
    canvas: { width: 800, height: 600 },
    geometricPoints: null,
    geometricPatternType: null,
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
    globalAlpha: 1, globalCompositeOperation: "source-over",
    shadowColor: "", shadowBlur: 0,
  };

  ["fillRect", "strokeRect", "beginPath", "moveTo", "lineTo", "closePath", "fill",
   "stroke", "arc", "save", "restore", "translate", "rotate", "clip", "rect",
   "quadraticCurveTo", "bezierCurveTo", "drawImage", "putImageData"].forEach(method => {
    ctx[method] = (...args) => record(method);
  });

  ctx.createLinearGradient = () => { record("createLinearGradient"); return mockGradient(); };
  ctx.createRadialGradient = () => { record("createRadialGradient"); return mockGradient(); };
  ctx.createPattern = () => { record("createPattern"); return "mock-pattern"; };
  ctx.createImageData = (w, h) => { record("createImageData"); return { data: new Uint8ClampedArray(w * h * 4) }; };

  return ctx;
}

function defaultSettings(overrides) {
  return Object.assign({
    density: 60, randomness: 1.0, scale: 1.0, strokeWidth: 1, cellGap: 0,
    glowAmount: 12, cubeSize: 36, wavePosition: 0.55, fillType: "gradient",
    shadingMode: "noise", symmetry: 12, showFlowerOfLife: true, showGrain: true,
    grainAmount: 1.0, morphSpeed: 1.0, morphAmount: 1.0, aspect: "16:9"
  }, overrides || {});
}

const { describe, it, itAsync, assert, assertEqual, assertClose, assertNoThrow } = TestRunner;

// --- SECTION A: palettes.js pure functions ---
describe("palettes.js color conversions", () => {
  it("hexToRgb parses a standard 6-digit hex", () => {
    const rgb = Palettes.hexToRgb("#ff8800");
    assertEqual(rgb.r, 255);
    assertEqual(rgb.g, 136);
    assertEqual(rgb.b, 0);
  });

  it("rgbToHex clamps out-of-range channels", () => {
    assertEqual(Palettes.rgbToHex(300, -10, 128), "#ff0080");
  });

  it("hexToHsl -> hslToHex round-trips within rounding tolerance", () => {
    const original = "#c5a059";
    const hsl = Palettes.hexToHsl(original);
    const roundTripped = Palettes.hslToHex(hsl.h, hsl.s, hsl.l);
    const rgbA = Palettes.hexToRgb(original);
    const rgbB = Palettes.hexToRgb(roundTripped);
    assertClose(rgbA.r, rgbB.r, 3, "red channel drifted too much");
    assertClose(rgbA.g, rgbB.g, 3, "green channel drifted too much");
    assertClose(rgbA.b, rgbB.b, 3, "blue channel drifted too much");
  });

  it("interpolateColor returns the first color at factor 0 and last at factor 1", () => {
    const colors = ["#000000", "#808080", "#ffffff"];
    assertEqual(Palettes.interpolateColor(colors, 0), "#000000");
    assertEqual(Palettes.interpolateColor(colors, 1), "#ffffff");
  });

  it("interpolateColorHSL agrees with interpolateColor (avoids the redundant hex round-trip)", () => {
    // Compared as RGB with a small tolerance, not exact hex string equality: at the 0/1
    // endpoints interpolateColor short-circuits to the raw preset hex, while
    // interpolateColorHSL always goes through hexToHsl() — a lossy, rounding conversion
    // that can shift a channel by ~1 even for a color that's already "pure" HSL-wise.
    const colors = ["#03045e", "#00b4d8", "#ade8f4"];
    for (let f = 0; f <= 1; f += 0.25) {
      const viaHex = Palettes.interpolateColor(colors, f);
      const viaHsl = Palettes.interpolateColorHSL(colors, f);
      const rebuiltHex = Palettes.hslToHex(viaHsl.h, viaHsl.s, viaHsl.l);
      const rgbA = Palettes.hexToRgb(viaHex);
      const rgbB = Palettes.hexToRgb(rebuiltHex);
      assertClose(rgbA.r, rgbB.r, 2, `red channel mismatch at factor ${f}`);
      assertClose(rgbA.g, rgbB.g, 2, `green channel mismatch at factor ${f}`);
      assertClose(rgbA.b, rgbB.b, 2, `blue channel mismatch at factor ${f}`);
    }
  });

  ["analogous", "triadic", "complementary", "split", "monochromatic"].forEach(rule => {
    it(`generateHarmony produces 5 valid hex colors for rule "${rule}"`, () => {
      const colors = Palettes.generateHarmony("#c5a059", rule);
      assertEqual(colors.length, 5);
      colors.forEach(c => assert(/^#[0-9a-f]{6}$/i.test(c), `"${c}" is not a valid hex color`));
    });
  });
});

// --- SECTION A: patterns.js draw function smoke tests ---
describe("patterns.js draw function smoke tests", () => {
  const engines = [
    ["drawLowPoly", "lowpoly"],
    ["drawVoronoi", "voronoi"],
    ["drawSacred", "sacred"],
    ["drawBauhaus", "bauhaus"],
    ["drawIsometric", "isometric"],
    ["drawFlowWaves", "flowfields"],
    ["drawBlobs", "blobs"]
  ];
  const colors = Palettes.presets.midnight.colors;

  engines.forEach(([fnName]) => {
    it(`${fnName} renders without throwing at default settings`, () => {
      const ctx = createMockCtx();
      assertNoThrow(() => Patterns[fnName](ctx, 800, 600, colors, defaultSettings(), 0));
      assert(Object.keys(ctx.calls).length > 0, "expected at least one draw call");
    });

    it(`${fnName} renders without throwing at minimum density`, () => {
      const ctx = createMockCtx();
      assertNoThrow(() => Patterns[fnName](ctx, 800, 600, colors, defaultSettings({ density: 10, symmetry: 4, cubeSize: 18 }), 500));
    });

    it(`${fnName} renders without throwing at maximum density`, () => {
      const ctx = createMockCtx();
      assertNoThrow(() => Patterns[fnName](ctx, 800, 600, colors, defaultSettings({ density: 250, symmetry: 32, cubeSize: 90 }), 1200));
    });
  });

  it("drawIsometric interpolateColorHSL path stays within valid HSL ranges across the grid", () => {
    const ctx = createMockCtx();
    assertNoThrow(() => Patterns.drawIsometric(ctx, 400, 300, colors, defaultSettings({ cubeSize: 60 }), 3000));
  });

  it("drawBauhaus grain tile cache regenerates only when grainAmount changes", () => {
    const ctx = createMockCtx();
    Patterns.drawBauhaus(ctx, 400, 300, colors, defaultSettings({ grainAmount: 1.0 }), 0);
    const tileAfterFirst = Patterns._grainCache.tile;
    Patterns.drawBauhaus(ctx, 400, 300, colors, defaultSettings({ grainAmount: 1.0 }), 16);
    assert(Patterns._grainCache.tile === tileAfterFirst, "tile should be reused when grainAmount is unchanged");
    Patterns.drawBauhaus(ctx, 400, 300, colors, defaultSettings({ grainAmount: 2.0 }), 32);
    assert(Patterns._grainCache.tile !== tileAfterFirst, "tile should regenerate when grainAmount changes");
  });
});

// --- SECTION B: integration tests against the real app (via iframe) ---
function loadAppFrame() {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.src = "index.html";
    frame.onload = () => resolve(frame);
    frame.onerror = () => reject(new Error("Failed to load index.html in iframe"));
    document.body.appendChild(frame);
  });
}

async function runIntegrationTests() {
  describe("app.js share-link round trip (live app in iframe)", () => {});
  let frame;
  try {
    frame = await loadAppFrame();
  } catch (err) {
    TestRunner.results.push({ suite: "app.js share-link round trip (live app in iframe)", name: "load index.html", pass: false, error: err.message });
    return;
  }

  const App = frame.contentWindow.App;

  await itAsync("share URL encodes the current pattern/palette/aspect", async () => {
    App.state.pattern = "voronoi";
    App.state.activePaletteKey = "oceanic";
    App.state.colors = [...frame.contentWindow.Palettes.presets.oceanic.colors];
    App.state.settings.aspect = "1:1";
    App.state.settings.density = 90;

    const params = App.buildShareParams();
    assertEqual(params.get("pattern"), "voronoi");
    assertEqual(params.get("palette"), "oceanic");
    assertEqual(params.get("aspect"), "1:1");
    assertEqual(params.get("density"), "90");
  });

  await itAsync("applySharedStateFromURL reproduces a previously-built share link", async () => {
    App.state.pattern = "bauhaus";
    App.state.activePaletteKey = "forest";
    App.state.colors = [...frame.contentWindow.Palettes.presets.forest.colors];
    App.state.settings.aspect = "4:3";
    App.state.settings.density = 75;
    App.state.settings.grainAmount = 1.8;

    const params = App.buildShareParams();
    const search = "?" + params.toString();

    // Reset to a different baseline, then simulate loading that share link
    App.state.pattern = "lowpoly";
    App.state.activePaletteKey = "midnight";
    App.state.colors = [...frame.contentWindow.Palettes.presets.midnight.colors];
    App.state.settings.aspect = "16:9";

    frame.contentWindow.history.replaceState(null, "", frame.contentWindow.location.pathname + search);
    const applied = App.applySharedStateFromURL();

    assert(applied, "expected applySharedStateFromURL to report params were found");
    assertEqual(App.state.pattern, "bauhaus");
    assertEqual(App.state.activePaletteKey, "forest");
    assertEqual(App.state.settings.aspect, "4:3");
    assertEqual(App.state.settings.density, 75);
    assertClose(App.state.settings.grainAmount, 1.8, 0.001);
  });

  await itAsync("custom-edited colors round-trip via the explicit colors param", async () => {
    App.state.colors = ["#111111", "#222222", "#333333"];
    App.state.activePaletteKey = "custom";
    const params = App.buildShareParams();
    assert(params.has("colors"), "expected an explicit colors param for a non-preset palette");

    App.state.colors = [];
    frame.contentWindow.history.replaceState(null, "", frame.contentWindow.location.pathname + "?" + params.toString());
    App.applySharedStateFromURL();
    assertEqual(App.state.colors.join(","), "#111111,#222222,#333333");
  });

  describe("accessibility: keyboard-operable controls (live app in iframe)", () => {});

  await itAsync("pattern-card, ratio-card, and palette-item are keyboard-operable", async () => {
    const doc = frame.contentWindow.document;
    const patternCard = doc.querySelector(".pattern-card");
    const ratioCard = doc.querySelector(".ratio-card");
    const paletteItem = doc.querySelector(".palette-item");

    [patternCard, ratioCard, paletteItem].forEach(el => {
      assertEqual(el.getAttribute("role"), "button");
      assertEqual(el.getAttribute("tabindex"), "0");
    });
  });

  await itAsync("activating a pattern-card via Enter updates App.state.pattern", async () => {
    const doc = frame.contentWindow.document;
    const card = doc.querySelector('.pattern-card[data-pattern="sacred"]');
    card.dispatchEvent(new frame.contentWindow.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assertEqual(App.state.pattern, "sacred");
    assertEqual(card.getAttribute("aria-pressed"), "true");
  });

  document.body.removeChild(frame);
}

// Run sync tests immediately, then async integration tests, then render.
runIntegrationTests().finally(() => {
  TestRunner.render("results");
});
