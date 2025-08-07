
/** @type {number} if the desired grid line spacing is below 2.5 original units, place grid lines 1 unit apart */
const SPACING_BOUND_A = Math.log10(2.5);
/** @type {number} if the desired grid line spacing is above 7.5 original units, place grid lines 10 units apart */
const SPACING_BOUND_B = Math.log10(7.5);

/**
 * Convert the possible childScale inputs for the ZoomableCanvas class into separate x- and y-scales
 * @param {number|[number, number]} [childScale] the childScale parameter passed to the ZoomableCanvas class
 * @return {[number, number]} the separate scales for the x- and y-axis
 */
function childScaleConverter(childScale) {
  if (typeof childScale === 'undefined') return [1, 1];
  else if (typeof childScale === 'number') return [childScale, childScale];
  else return childScale;
}

/**
 * A zoomable canvas, which adapt automatically to the parent object size
 */
class ZoomableCanvas {
  /**
   * Create a new zoomable canvas. Here, y-axis points upwards and the x-axis to the right.
   * @param {HTMLElement} boundingElement an element into which the canvas should be inserted
   * @param {function(): void} changeCallback a callback to call whenever the size, the zoom level, or the offset changes
   */
  constructor(boundingElement, changeCallback) {
    boundingElement.style.contain = 'size';
    boundingElement.innerHTML = '';
    /** @type {HTMLCanvasElement} the canvas that will be used for drawing */
    this.canvas = document.createElement('canvas');
    this.canvas.style.userSelect = 'none';
    boundingElement.appendChild(this.canvas);
    /** @type {HTMLElement} the element into which the scene should be drawn */
    this.boundingElement = boundingElement;
    /** @type {ResizeObserver} observer listening for bounding element size canges */
    this.resizeObserver = new ResizeObserver(entries => this.processSizeChange(entries));
    this.resizeObserver.observe(boundingElement, { box: 'content-box' });
    /** @type {function(): void} the callback to call whenever the size, the zoom level, or the offset changes */
    this.changeCallback = changeCallback;
    /** @type {number} the width of the canvas in pixels (change only using the adaptSize method!) */
    this.width = 0;
    /** @type {number} the height of the canvas in pixels (change only using the adaptSize method!) */
    this.height = 0;
    /** @type {number} the current canvas scale */
    this.scale = 1;
    /** @type {number} origin in the x-direction in pixels (0 = left) */
    this.xOrigin = 0;
    /** @type {number} origin in the y-direction in pixels (0 = top) */
    this.yOrigin = 0;
    /** @type {number} current x position of mouse (from top left) */
    this.mouseX = 0;
    /** @type {number} current y position of mouse (from top left) */
    this.mouseY = 0;
    /** @type {boolean} whether the left mouse button is currently pressed */
    this.mousePressed = false;
    this.canvas.addEventListener('wheel', evt => this.processWheel(evt), { passive: false });
    this.canvas.addEventListener('mousedown', evt => {
      if (evt.button === 0)
        this.mousePressed = true;
    });
    this.canvas.addEventListener('mouseup', evt => {
      if (evt.button === 0)
        this.mousePressed = false;
    });
    this.canvas.addEventListener('mouseleave', evt => {
      this.mousePressed = false;
    });
    this.canvas.addEventListener('mousemove', evt => {
      const dx = this.mouseX - evt.offsetX;
      const dy = this.mouseY - evt.offsetY;
      this.mouseX = evt.offsetX;
      this.mouseY = evt.offsetY;
      if (this.mousePressed)
        this.processMove(dx, dy);
    });
    /** @type {number} desired space between two grid lines in (CSS) pixels (i.e. not canvas pixels, which can be different, see property pxToCanPx) */
    this.desiredGridSpace = 50;
    /** @type {boolean} whether the grid legend for the y-axis should be placed on the left */
    this.gridLegendLeft = true;
    /** @type {boolean} whether the grid legend for the x-axis should be placed on the bottom  */
    this.gridLegendBelow = true;
    /** @type {number} how to convert CSS pixels to canvas pixels (can be necessary due to e.g. zoomed-in screens, see device pixel ratio) */
    this.pxToCanPx = 1;
  }

  /**
   * Process a size change of the bounding element
   * @param {ResizeObserverEntry[]} entries the entries returned by the resize observer
   */
  processSizeChange(entries) {
    for (const entry of entries) {
      if (entry.target === this.boundingElement) {
        if (entry.contentBoxSize) {
          if (Array.isArray(entry.contentBoxSize))
            this.adaptSize(entry.contentBoxSize[0].inlineSize, entry.contentBoxSize[0].blockSize);
          else
            this.adaptSize(entry.contentBoxSize.inlineSize, entry.contentBoxSize.blockSize);
        } else {
          this.adaptSize(entry.contentRect.width, entry.contentRect.height);
        }
        break;
      }
    }
  }

  /**
   * Process a mouse wheel event
   * @param {WheelEvent} evt the mouse wheel event
   */
  processWheel(evt) {
    evt.preventDefault();
    let scrollAmountPixels = evt.deltaY;
    if (evt.deltaMode == 1) scrollAmountPixels *= 10;
    if (evt.deltaMode == 2) scrollAmountPixels *= 100;
    const [mX, mY] = this.r(this.mouseX * this.pxToCanPx, this.mouseY * this.pxToCanPx, -1);
    this.scale *= Math.exp(-scrollAmountPixels / 500);
    const [nmX, nmY] = this.p(mX, mY, -1);
    this.xOrigin += this.mouseX * this.pxToCanPx - nmX;
    this.yOrigin += this.mouseY * this.pxToCanPx - nmY;
    this.changeCallback();
  }

  /**
   * Process a mouse move event
   * @param {number} dx the amount the mouse moved in the x-direction (in pixels)
   * @param {number} dy the amount the mouse moved in the y-direction (in pixels)
   */
  processMove(dx, dy) {
    this.xOrigin -= dx * this.pxToCanPx;
    this.yOrigin -= dy * this.pxToCanPx;
    this.changeCallback();
  }

  /**
   * Adapt the canvas size
   * @param {number} width the desired width in pixels
   * @param {number} height the desired height in pixels
   */
  adaptSize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    if (Math.abs(dpr - this.pxToCanPx) > 1e-4 || Math.abs(this.width - width * dpr) > 0.4 || Math.abs(this.height - height * dpr) > 0.4) {
      this.pxToCanPx = dpr;
      this.width = width * this.pxToCanPx;
      this.height = height * this.pxToCanPx;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.changeCallback();
    }
  }

  /**
   * Compute the canvas coordinates for a given pair of (x,y)-coordinates
   * @param {number|[number, number]} x the x coordinate or the pair of coordinates (if the pair is given, you have to skip the y parameter)
   * @param {number} [y] the y coordinate
   * @param {number|[number, number]} [childScale] the internal scale of the child element using this canvas (pass an array for separate x- and y-scales). If set to any value <0, the (x,y)-coordinates are assumed to be in the system of this parent element, instead of in the system of the child.
   * @param {number|[number, number]} [childXOrigin] the internal origin of the child in pixels the x-direction (from the lower left corner of the canvas) (or the pair for x- and y-direction)
   * @param {number} [childYOrigin] the internal origin of the child in pixels in the y-direction (from the lower left corner of the canvas)
   * @return {[number, number]} the final corresponding (x,y)-coordinates on the canvas, which may change according to user actions such as zooming or panning
   */
  p(x, y, childScale, childXOrigin, childYOrigin) {
    if (Array.isArray(x)) {
      childYOrigin = childXOrigin;
      childXOrigin = childScale;
      childScale = y;
      y = x[1];
      x = x[0];
    }
    if (Array.isArray(childXOrigin)) {
      childYOrigin = childXOrigin[1];
      childXOrigin = childXOrigin[0];
    }
    const [childScaleX, childScaleY] = childScaleConverter(childScale);
    if (typeof childXOrigin === 'undefined') childXOrigin = 0;
    if (typeof childYOrigin === 'undefined') childYOrigin = this.height;
    else childYOrigin = this.height - childYOrigin;
    if (childScaleX < 0 || childScaleY < 0)
      return [ this.xOrigin + x * this.scale, this.yOrigin + y * this.scale ];
    const childX = childXOrigin + x * childScaleX;
    const childY = childYOrigin - y * childScaleY;
    return [ this.xOrigin + childX * this.scale, this.yOrigin + childY * this.scale ];
  }

  /**
   * Compute the reverse of projecting a coordinate pair onto the canvas
   * @param {number|[number, number]} x the x coordinate on the canvas or the pair of coordinates (if the pair is given, you have to skip the y parameter)
   * @param {number} [y] the y coordinate on the canvas
   * @param {number|[number, number]} [childScale] the internal scale of the child element using this canvas (pass an array for separate x- and y-scales). If set to any value <0, the coordinates in the system of this parent element are given, instead of in the system of the child.
   * @param {number|[number, number]} [childXOrigin] the internal origin of the child in pixels the x-direction (from the lower left corner of the canvas) (or the pair for x- and y-direction)
   * @param {number} [childYOrigin] the internal origin of the child in pixels in the y-direction (from the lower left corner of the canvas)
   * @return {[number, number]} the final corresponding (x,y)-coordinates in the original coordinate system, which may change according to user actions such as zooming or panning
   */
  r(x, y, childScale, childXOrigin, childYOrigin) {
    if (Array.isArray(x)) {
      childYOrigin = childXOrigin;
      childXOrigin = childScale;
      childScale = y;
      y = x[1];
      x = x[0];
    }
    if (Array.isArray(childXOrigin)) {
      childYOrigin = childXOrigin[1];
      childXOrigin = childXOrigin[0];
    }
    const [childScaleX, childScaleY] = childScaleConverter(childScale);
    if (typeof childXOrigin === 'undefined') childXOrigin = 0;
    if (typeof childYOrigin === 'undefined') childYOrigin = this.height;
    else childYOrigin = this.height - childYOrigin;
    const childX = (x - this.xOrigin) / this.scale;
    const childY = (y - this.yOrigin) / this.scale;
    if (childScaleX < 0 || childScaleY < 0)
      return [ childX, childY ];
    return [ (childX - childXOrigin) / childScaleX, (-childY + childYOrigin) / childScaleY ];
  }

  /**
   * Draw a grid (e.g. in the background) for the original coordinate system
   * @param {function(number, string): string} [unitConverter] should convert a number for an axis label to the correct scientific presentation, including the unit.
   *                                                           The converter should accept the number as first parameter, and 'x' or 'y' as second parameter,
   *                                                           which indicates whether this conversion is for an x-axis or y-axis label (important if they have different units).
   *                                                           The converter should return the final formatted string, together with the correct unit.
   * @param {boolean} [gridMode] whether to draw the grid (if set to true) or the legend for the grid (if set to false)
   * @param {number|[number, number]} [childScale] the internal scale of the child element using this canvas (pass an array for separate x- and y-scales)
   * @param {number|[number, number]} [childXOrigin] the internal origin of the child in pixels the x-direction (from the lower left corner of the canvas) (or the pair for x- and y-direction)
   * @param {number} [childYOrigin] the internal origin of the child in pixels in the y-direction (from the lower left corner of the canvas)
   * @param {Color} [color] the grid color
   */
  drawGrid(unitConverter = '', gridMode = true, childScale, childXOrigin, childYOrigin, color = new Color(200, 200, 200)) {
    if (Array.isArray(childXOrigin)) {
      if (typeof childYOrigin !== 'undefined')
        color = childYOrigin;
      childYOrigin = childXOrigin[1];
      childXOrigin = childXOrigin[0];
    }
    const [childScaleX, childScaleY] = childScaleConverter(childScale);
    const lineSpacing = this.desiredGridSpace * this.pxToCanPx;
    const computeLineDist = (scale) => {
      const origLineSpacing = lineSpacing / (scale * this.scale);
      const origSpacingPower = Math.log10(origLineSpacing);
      const powerFloor = Math.floor(origSpacingPower);
      if (origSpacingPower - powerFloor < SPACING_BOUND_A) {
        return [Math.pow(10, powerFloor)];
      } else if (origSpacingPower - powerFloor > SPACING_BOUND_B) {
        return [Math.pow(10, powerFloor + 1)];
      } else {
        return [5 * Math.pow(10, powerFloor)];
      }
    };
    const [origGridLineDistX] = computeLineDist(childScaleX);
    const [origGridLineDistY] = computeLineDist(childScaleY);
    const [left, top] = this.r(0, 0, childScale, childXOrigin, childYOrigin);
    const [right, bottom] = this.r(this.width, this.height, childScale, childXOrigin, childYOrigin);
    const leftmostLine = Math.ceil(left / origGridLineDistX);
    const rightmostLine = Math.floor(right / origGridLineDistX);
    const topmostLine = Math.floor(top / origGridLineDistY);
    const bottommostLine = Math.ceil(bottom / origGridLineDistY);

    const ctx = this.ctx;
    for (let lr = leftmostLine; lr <= rightmostLine; lr++) {
      const origX = origGridLineDistX * lr;
      const finalX = Math.round(this.p(origX, 0, childScale, childXOrigin, childYOrigin)[0]);
      ctx.beginPath();
      ctx.moveTo(finalX - ((lr % 2 == 0) ? 0 : 0.5), 0);
      ctx.lineTo(finalX - ((lr % 2 == 0) ? 0 : 0.5), this.height);
      if (lr != 0) ctx.strokeStyle = color.toString();
      else ctx.strokeStyle = color.darken(0.4).toString();
      ctx.lineWidth = (lr % 2 == 0) ? 2 : 1;
      ctx.stroke();
      ctx.closePath();
    }
    for (let tb = bottommostLine; tb <= topmostLine; tb++) {
      const origY = origGridLineDistY * tb;
      const finalY = Math.round(this.p(0, origY, childScale, childXOrigin, childYOrigin)[1]);
      ctx.beginPath();
      ctx.moveTo(0, finalY - ((tb % 2 == 0) ? 0 : 0.5));
      ctx.lineTo(this.width, finalY - ((tb % 2 == 0) ? 0 : 0.5));
      if (tb != 0) ctx.strokeStyle = color.toString();
      else ctx.strokeStyle = color.darken(0.4).toString();
      ctx.lineWidth = (tb % 2 == 0) ? 2 : 1;
      ctx.stroke();
      ctx.closePath();
    }
  }

  /**
   * Transform a length to the correct length on the canvas
   * @param {number} length the length in the original coordinate system
   * @param {number} [childScale] the internal scale of the child element using this canvas
   * @return {number} the final corresponding length on the canvas, which may change according to user actions such as zooming
   */
  l(length, childScale = 1) {
    return length * childScale * this.scale;
  }

  /**
   * The rendering context of the canvas onto which to draw
   * @type {CanvasRenderingContext2D}
   */
  get ctx() {
    return this.canvas.getContext('2d');
  }

  /**
   * Destroy the zoomable canvas
   */
  destroy() {
    this.boundingElement.removeChild(this.canvas);
    this.resizeObserver.disconnect();
  }
}
