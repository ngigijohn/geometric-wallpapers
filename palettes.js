/**
 * Palettes Module for Geometric Wallpaper Generator
 * Manages color spaces, curated palettes, gradient interpolation, and color theory harmonies.
 */

const Palettes = {
  // Curated premium palettes
  presets: {
    midnight: {
      name: "Midnight Glow",
      colors: ["#0b0c10", "#1f2833", "#c5a059", "#45a29e", "#66fcf1"],
      theme: "dark"
    },
    cyberpunk: {
      name: "Cyberpunk Neon",
      colors: ["#0d0221", "#0f0844", "#a12568", "#fec260", "#3a0ca3", "#7209b7", "#f72585", "#4cc9f0"],
      theme: "dark"
    },
    scandi: {
      name: "Scandinavian Pastel",
      colors: ["#f4ebd0", "#eedad1", "#d6e2e9", "#bcd4e6", "#99c1de", "#a8dadc", "#457b9d"],
      theme: "light"
    },
    earthy: {
      name: "Warm Earth",
      colors: ["#2c1a11", "#4a3b32", "#826251", "#c5a880", "#e5d3b3", "#6e775c", "#a8a77a"],
      theme: "dark"
    },
    bauhaus: {
      name: "Bauhaus Primaries",
      colors: ["#f2f1e8", "#e63946", "#1d3557", "#ffb703", "#2a9d8f", "#111111"],
      theme: "light"
    },
    goldenHour: {
      name: "Golden Hour",
      colors: ["#1a0c18", "#78244c", "#b63c63", "#e65c40", "#fca311", "#fed166"],
      theme: "dark"
    },
    luxury: {
      name: "Dark Luxury",
      colors: ["#0f0f11", "#1b1b1f", "#3e3223", "#867556", "#c3b091", "#e3d2be"],
      theme: "dark"
    },
    oceanic: {
      name: "Ocean Depths",
      colors: ["#03045e", "#023e8a", "#0077b6", "#0096c7", "#00b4d8", "#48cae4", "#90e0ef", "#ade8f4"],
      theme: "dark"
    },
    forest: {
      name: "Forest Mystic",
      colors: ["#132a13", "#31572c", "#4f772d", "#90a955", "#ecf39e", "#3f5e5a", "#264653"],
      theme: "dark"
    },
    monochrome: {
      name: "Obsidian & Chalk",
      colors: ["#000000", "#111111", "#333333", "#666666", "#cccccc", "#eeeeee", "#ffffff"],
      theme: "dark"
    }
  },

  // Helper: Hex to RGB
  hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  },

  // Helper: RGB to Hex
  rgbToHex(r, g, b) {
    const toHex = (c) => {
      const hex = Math.max(0, Math.min(255, Math.round(c))).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + toHex(r) + toHex(g) + toHex(b);
  },

  // Helper: Hex to HSL
  hexToHsl(hex) {
    const rgb = this.hexToRgb(hex);
    let r = rgb.r / 255;
    let g = rgb.g / 255;
    let b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  },

  // Helper: HSL to Hex
  hslToHex(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return this.rgbToHex(r * 255, g * 255, b * 255);
  },

  // Interpolate between a list of colors (0.0 to 1.0) using HSL for high visual aesthetics
  interpolateColor(colors, factor) {
    if (colors.length === 0) return "#000000";
    if (colors.length === 1) return colors[0];
    if (factor <= 0) return colors[0];
    if (factor >= 1) return colors[colors.length - 1];

    const count = colors.length - 1;
    const segment = Math.min(count - 1, Math.floor(factor * count));
    const segmentFactor = (factor * count) - segment;

    const c1 = this.hexToHsl(colors[segment]);
    const c2 = this.hexToHsl(colors[segment + 1]);

    // Handle hue wrapping correctly
    let h1 = c1.h;
    let h2 = c2.h;
    const diff = h2 - h1;

    if (Math.abs(diff) > 180) {
      if (diff > 0) {
        h1 += 360;
      } else {
        h2 += 360;
      }
    }

    const h = (h1 + segmentFactor * (h2 - h1)) % 360;
    const s = c1.s + segmentFactor * (c2.s - c1.s);
    const l = c1.l + segmentFactor * (c2.l - c1.l);

    return this.hslToHex(h, s, l);
  },

  // Generate color harmony rules
  generateHarmony(seedHex, rule) {
    const hsl = this.hexToHsl(seedHex);
    const colors = [];

    switch (rule) {
      case "analogous":
        // 5 colors separated by 15-20 degrees of hue
        for (let i = -2; i <= 2; i++) {
          const h = (hsl.h + (i * 20) + 360) % 360;
          colors.push(this.hslToHex(h, hsl.s, hsl.l));
        }
        break;

      case "triadic":
        // 3 primary angles spaced at 120 degrees, padded with varied lightness/saturation
        colors.push(this.hslToHex(hsl.h, hsl.s, Math.max(20, hsl.l - 15)));
        colors.push(seedHex);
        colors.push(this.hslToHex((hsl.h + 120) % 360, hsl.s, hsl.l));
        colors.push(this.hslToHex((hsl.h + 240) % 360, hsl.s, hsl.l));
        colors.push(this.hslToHex(hsl.h, Math.max(10, hsl.s - 20), Math.min(90, hsl.l + 20)));
        break;

      case "complementary":
        // Seed and its opposite (180 deg) with saturation/lightness variations
        colors.push(this.hslToHex(hsl.h, hsl.s, Math.max(15, hsl.l - 20)));
        colors.push(seedHex);
        colors.push(this.hslToHex(hsl.h, Math.max(20, hsl.s - 20), Math.min(85, hsl.l + 25)));
        colors.push(this.hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l));
        colors.push(this.hslToHex((hsl.h + 180) % 360, Math.max(10, hsl.s - 20), Math.max(20, hsl.l - 15)));
        break;

      case "split":
        // Seed and two colors next to its complement (+-150 degrees)
        colors.push(seedHex);
        colors.push(this.hslToHex((hsl.h + 150) % 360, hsl.s, hsl.l));
        colors.push(this.hslToHex((hsl.h + 210) % 360, hsl.s, hsl.l));
        colors.push(this.hslToHex(hsl.h, hsl.s, Math.max(20, hsl.l - 15)));
        colors.push(this.hslToHex(hsl.h, Math.max(10, hsl.s - 30), Math.min(90, hsl.l + 20)));
        break;

      case "monochromatic":
        // Vary lightness and saturation of the seed color
        const steps = [
          { s: 20, l: 15 },
          { s: 15, l: 35 },
          { s: 0, l: 0 }, // will use seed values
          { s: -10, l: 20 },
          { s: -20, l: 35 }
        ];
        steps.forEach((step, idx) => {
          if (idx === 2) {
            colors.push(seedHex);
          } else {
            const s = Math.max(10, Math.min(100, hsl.s + step.s));
            const l = Math.max(10, Math.min(95, hsl.l + step.l));
            colors.push(this.hslToHex(hsl.h, s, l));
          }
        });
        break;

      default:
        colors.push(seedHex);
    }

    return colors;
  }
};

// Export to window for access by other scripts
if (typeof window !== "undefined") {
  window.Palettes = Palettes;
}
