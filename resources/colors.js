
/**
 * Returns the minimum value among its arguments
 * @param {number[]} args the arguments
 * @return {number} the minimal argument
 */
function min(...args) {
  let res = args[0];
  for (const val of args) {
    if (val < res)
      res = val;
  }
  return res;
}

/**
 * Returns the maximum value among its arguments
 * @param {number[]} args the arguments
 * @return {number} the maximal argument
 */
function max(...args) {
  let res = args[0];
  for (const val of args) {
    if (val > res)
      res = val;
  }
  return res;
}

/**
 * Limits a value to a certain range
 * @param {number} val the value
 * @param {number} mi the lower end of the range
 * @param {number} mx the upper end of the range
 * @return {number} the value limited to the range [mi, ma]
 */
function limit(val, mi, ma) {
  return max(min(val, ma), mi);
}

/**
 * Color utility class
 */
class Color {
  /**
   * Create a new color
   * @param {string|number|number[]} [col] either the red value (0-255), or a CSS string (rgb(...), rgba(...),
   * #000000, or #000000ff), or an array containing the red (0-255), green, blue, and potentially alpha (0-1) values
   * @param {number} [g] the green value (0-255)
   * @param {number} [b] the blue value (0-255)
   * @param {number} [a] the alpha value (0-1)
   */
  constructor(col, g, b, a) {
    this.r = 0;
    this.g = 0;
    this.b = 0;
    this.a = 1;
    if (typeof col === 'string') {
      if (col.search(/^rgb\(([0-9]+), ?([0-9]+), ?([0-9]+)\)$/) != -1) {
        const res = (new RegExp(/^rgb\(([0-9]+), ?([0-9]+), ?([0-9]+)\)$/)).exec(col);
        this.r = parseInt(res[1]);
        this.g = parseInt(res[2]);
        this.b = parseInt(res[3]);
      } else if (col.search(/^rgba\(([0-9]+), ?([0-9]+), ?([0-9]+), ?([0-9]+(?:\.[0-9]+)?)\)$/) != -1) {
        const res = (new RegExp(/^rgba\(([0-9]+), ?([0-9]+), ?([0-9]+), ?([0-9]+(?:\.[0-9]+)?)\)$/)).exec(col);
        this.r = parseInt(res[1]);
        this.g = parseInt(res[2]);
        this.b = parseInt(res[3]);
        this.a = parseFloat(res[4]);
      } else if (col.search(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/) != -1) {
        const res = (new RegExp(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/)).exec(col);
        this.r = parseInt(res[1], 16);
        this.g = parseInt(res[2], 16);
        this.b = parseInt(res[3], 16);
      } else if (col.search(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/) != -1) {
        const res = (new RegExp(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/)).exec(col);
        this.r = parseInt(res[1], 16);
        this.g = parseInt(res[2], 16);
        this.b = parseInt(res[3], 16);
        this.a = parseInt(res[4], 16) / 255;
      }
    } else if (typeof col === 'number') {
      this.r = col;
      this.g = g;
      this.b = b;
      if (typeof a === 'number')
        this.a = a;
    } else if (col instanceof Array) {
      this.r = col[0];
      this.g = col[1];
      this.b = col[2];
      if (typeof col[3] === 'number')
        this.a = col[3];
    }
  }

  /**
   * Mix this color with another color (all channels, including alpha)
   * @param {Color} colorb the color to mix with
   * @param {number} [fac] the fraction of colorb that will be used
   * @return {Color} the mixed color
   */
  mix(colorb, fac = 0.5) {
    return new Color(this.r * (1 - fac) + colorb.r * fac,
      this.g * (1 - fac) + colorb.g * fac,
      this.b * (1 - fac) + colorb.b * fac,
      this.a * (1 - fac) + colorb.a * fac);
  }

  /**
   * Mix this color with black (alpha channel untouched)
   * @param {number} [fac] the fraction of black that will be used
   * @return {Color} the mixed color
   */
  darken(fac = 0.5) {
    return this.mix(new Color(0, 0, 0, this.a), fac);
  }

  /**
   * Mix this color with white (alpha channel untouched)
   * @param {number} [fac] the fraction of white that will be used
   * @return {Color} the mixed color
   */
  lighten(fac = 0.5) {
    return this.mix(new Color(255, 255, 255, this.a), fac);
  }

  /**
   * Mix this color with either white or black (alpha channel untouched)
   * @param {number} [fac] the fraction of white or black that will be used; if fac < 0, this color
   * will be mixed with black (fraction of black of -fac), otherwise it will be mixed with white
   * @return {Color} the mixed color
   */
  darkenlighten(fac = 0) {
    if (fac < 0)
      return this.darken(-fac);
    else
      return this.lighten(fac);
  }

  /**
   * Convert to a CSS string
   * @return {string} the CSS string corresponding to this color, either rgb(...) or rgba(...)
   */
  toString() {
    if (this.a >= 1) {
      return `rgb(${Math.round(limit(this.r, 0, 255))}, ${Math.round(limit(this.g, 0, 255))}, ${Math.round(limit(this.b, 0, 255))})`;
    } else {
      return `rgba(${Math.round(limit(this.r, 0, 255))}, ${Math.round(limit(this.g, 0, 255))}, ${Math.round(limit(this.b, 0, 255))}, ${limit(this.a, 0, 1)})`;
    }
  }

  /**
   * Method for JSON serialization
   * @return {string} the CSS string corresponding to this color, either rgb(...) or rgba(...)
   */
  toJSON() {
    return this.toString();
  }

  /**
   * Get the grayscale value for this color
   * @return {number} the grayscale value
   */
  getGrayscale() {
    return limit(this.r, 0, 255) * 0.299 + limit(this.g, 0, 255) * 0.587 + limit(this.b, 0, 255) * 0.114;
  }

  /**
   * Get black or white text color, depending on what is easier to read if this color is used as background
   * @param {Color} [defaultColor] the default text color to use. Will be returned if the contrast is high enough, will be darkened or lightened otherwise
   * @param {'none'|'lighten'|'darken'} [preferMode] whether to prefer darkening or lightening the default color (only affects the color if a defaultColor is supplied)
   * @param {string} [latexColorName] optionally provide a LaTeX color name for the text color.
   *                                  If provided, then this function will return a string like color name!15!black for use in LaTeX
   * @return {Color|string} the text color (or a string for use in LaTeX)
   */
  getTextColor(defaultColor = null, preferMode = 'none', latexColorName = undefined) {
    const grayscThis = this.getGrayscale();
    if (defaultColor === null) {
      if (grayscThis > 186) {
        return new Color('#000000');
      } else
        return new Color('#ffffff');
    }
    const latexStr = (typeof latexColorName === 'undefined') ? 'black' : latexColorName;
    const CONTRAST_MIN = 80;
    if (Math.abs(grayscThis - defaultColor.getGrayscale()) > CONTRAST_MIN) return (typeof latexColorName === 'undefined') ? defaultColor : latexStr;
    else {
      let lightenUpper = 1;
      let lightenLower = 0;
      while (lightenUpper - lightenLower > 0.05) {
        const lightenMid = (lightenLower + lightenUpper) / 2;
        const newCol = defaultColor.lighten(lightenMid);
        if (Math.abs(grayscThis - newCol.getGrayscale()) > CONTRAST_MIN) lightenUpper = lightenMid;
        else lightenLower = lightenMid;
      }
      let darkenUpper = 1;
      let darkenLower = 0;
      while (darkenUpper - darkenLower > 0.05) {
        const darkenMid = (darkenLower + darkenUpper) / 2;
        const newCol = defaultColor.darken(darkenMid);
        if (Math.abs(grayscThis - newCol.getGrayscale()) > CONTRAST_MIN) darkenUpper = darkenMid;
        else darkenLower = darkenMid;
      }
      const darkenedCol = defaultColor.darken(darkenUpper);
      const lightenedCol = defaultColor.lighten(lightenUpper);
      const darkenedColTex = `${latexStr}!${Math.round((1 - darkenUpper)*100)}!black`;
      const lightenedColTex = `${latexStr}!${Math.round((1 - lightenUpper)*100)}!white`;
      if (Math.abs(grayscThis - darkenedCol.getGrayscale()) < CONTRAST_MIN) return (typeof latexColorName === 'undefined') ? lightenedCol : lightenedColTex;
      if (Math.abs(grayscThis - lightenedCol.getGrayscale()) < CONTRAST_MIN) return (typeof latexColorName === 'undefined') ? darkenedCol : darkenedColTex;
      if (preferMode == 'lighten' && Math.abs(grayscThis - lightenedCol.getGrayscale()) > CONTRAST_MIN) return (typeof latexColorName === 'undefined') ? lightenedCol : lightenedColTex;
      if (preferMode == 'darken' && Math.abs(grayscThis - darkenedCol.getGrayscale()) > CONTRAST_MIN) return (typeof latexColorName === 'undefined') ? darkenedCol : darkenedColTex;
      if (darkenUpper < lightenUpper) return (typeof latexColorName === 'undefined') ? darkenedCol : darkenedColTex;
      else return (typeof latexColorName === 'undefined') ? lightenedCol : lightenedColTex;
    }
  }
}

const RAINBOW_COLORS = [new Color('#345a5d'), new Color('#355e8a'), new Color('#53a396'),
  new Color('#4d884e'), new Color('#809254'), new Color('#ffd43a'), new Color('#f1a02d'),
  new Color('#b65329'), new Color('#975f60'), new Color('#3e2b3e')];

function getRainbowColor(p) {
  if (p <= 0) return RAINBOW_COLORS[0];
  if (p >= 1) return RAINBOW_COLORS[RAINBOW_COLORS.length - 1];
  p *= RAINBOW_COLORS.length - 1;
  const idxA = Math.floor(p);
  const idxB = (idxA + 1) % RAINBOW_COLORS.length;
  const fac = p % 1;
  return RAINBOW_COLORS[idxA].mix(RAINBOW_COLORS[idxB], fac);
}

function getLatexRainbowColor(p, muted = 'lighten') {
  if (p <= 0) return `rainbow${(muted == 'lighten') ? 'muted' : ((muted == 'darken') ? 'dark' : '')}a`;
  if (p >= 1) return `rainbow${(muted == 'lighten') ? 'muted' : ((muted == 'darken') ? 'dark' : '')}${String.fromCharCode(96 + RAINBOW_COLORS.length)}`;
  p *= RAINBOW_COLORS.length - 1;
  const idxA = Math.floor(p);
  const idxB = (idxA + 1) % RAINBOW_COLORS.length;
  const fac = p % 1;
  return `rainbow${(muted == 'lighten') ? 'muted' : ((muted == 'darken') ? 'dark' : '')}${
    String.fromCharCode(97 + idxA)}!${Math.round((1 - fac)*100)}!rainbow${
    (muted == 'lighten') ? 'muted' : ((muted == 'darken') ? 'dark' : '')}${
    String.fromCharCode(97 + idxB)}`;
}

if (typeof window === 'undefined') {
  module.exports = {
    Color,
    getRainbowColor,
    getLatexRainbowColor
  };
}
