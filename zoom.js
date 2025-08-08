
/** @type {number} if the desired grid line spacing is below 2.5 original units, place grid lines 1 unit apart */
const SPACING_BOUND_A = Math.log10(2.5);
/** @type {number} if the desired grid line spacing is above 7.5 original units, place grid lines 10 units apart */
const SPACING_BOUND_B = Math.log10(7.5);

/**
 * Convert an input to separate values for x- and y-axis (just duplicate the input if only one input is given)
 * @param {number|[number, number]|string|[string, string]} [param] the input parameter, either a single value, or an array of two values
 * @param {'number'|'string'} [type] the expected parameter type
 * @return {[number, number]|[string, string]} the separate parameters for the x- and y-axis
 */
function parameterXYConverter(param, type = 'number') {
  if (typeof param === 'undefined') {
    if (type === 'number') return [1, 1];
    else if (type === 'string') return ['', ''];
  } else if (typeof param === type) return [param, param];
  else return param;
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
    /** @type {number} the tolerance in deviations in CSS pixels for the canvas size from its desired size (in order to get lines which are precisely aligned with screen pixels, see device pixel ratio) */
    this.sizeTolerance = 4;
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
      this.canvas.width = Math.round(this.width);
      this.canvas.height = Math.round(this.height);
      this.canvas.style.width = `${Math.round(width)}px`;
      this.canvas.style.height = `${Math.round(height)}px`;

      // The rounded CSS and canvas pixel sizes might not hit the device pixel ratio exactly.
      // This can again lead to blurred lines which are not pixel-aligned.
      // Therefore, we try to find canvas dimensions close by which allow matching the device pixel ratio exactly, within a specified tolerance from the original dimensions.
      const TOLERANCE = Math.floor(this.sizeTolerance * this.pxToCanPx);
      const findBestSize = (desiredS, desiredCssS, type) => {
        for (let i = 0; i <= TOLERANCE; i++) {
          let done = false;
          for (let j = -1; j <= 1; j += 2) {
            const actS = desiredS + i * j;
            if (Math.abs(actS / desiredCssS - this.pxToCanPx) < 1e-6) {
              if (type == 'width') {
                this.canvas.width = actS;
                this.canvas.style.width = `${desiredCssS}px`;
              } else {
                this.canvas.height = actS;
                this.canvas.style.height = `${desiredCssS}px`;
              }
              done = true;
              break;
            } else {
              const actCssS = actS / this.pxToCanPx;
              if (Math.abs(Math.round(actCssS) - actCssS) < 1e-3) {
                if (type == 'width') {
                  this.canvas.width = actS;
                  this.canvas.style.width = `${Math.round(actCssS)}px`;
                } else {
                  this.canvas.height = actS;
                  this.canvas.style.height = `${desiredCssS}px`;
                }
                done = true;
                break;
              }
            }
          }
          if (done) break;
        }
      };
      findBestSize(Math.round(this.width), Math.round(width), 'width');
      findBestSize(Math.round(this.height), Math.round(height), 'height');

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
    const [childScaleX, childScaleY] = parameterXYConverter(childScale);
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
    const [childScaleX, childScaleY] = parameterXYConverter(childScale);
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
   * Clear the canvas (erase everything)
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw a grid (e.g. in the background) for the original coordinate system
   * @param {string|[string, string]} [unit] the unit of the original coordinate system. Pass the empty string for no unit, and pass an array if there are different units for the x- and y-axis.
   * @param {boolean} [gridMode] whether to draw the grid (if set to true) or the legend for the grid (if set to false). Note: the class properties desiredGridSpace, gridLegendLeft and gridLegendBelow affect the appearance of the grid!
   * @param {number|[number, number]} [childScale] the internal scale of the child element using this canvas (pass an array for separate x- and y-scales)
   * @param {number|[number, number]} [childXOrigin] the internal origin of the child in pixels the x-direction (from the lower left corner of the canvas) (or the pair for x- and y-direction)
   * @param {number} [childYOrigin] the internal origin of the child in pixels in the y-direction (from the lower left corner of the canvas)
   * @param {Color} [color] the grid color
   */
  drawGrid(unit = '', gridMode = true, childScale, childXOrigin, childYOrigin, color = new Color(200, 200, 200)) {
    if (Array.isArray(childXOrigin)) {
      if (typeof childYOrigin !== 'undefined')
        color = childYOrigin;
      childYOrigin = childXOrigin[1];
      childXOrigin = childXOrigin[0];
    }
    const [unitX, unitY] = parameterXYConverter(unit, 'string');
    const [childScaleX, childScaleY] = parameterXYConverter(childScale);
    const lineSpacing = this.desiredGridSpace * this.pxToCanPx;
    const computeLineDist = (scale) => {
      const origLineSpacing = lineSpacing / (scale * this.scale);
      const origSpacingPower = Math.log10(origLineSpacing);
      const powerFloor = Math.floor(origSpacingPower);
      if (origSpacingPower - powerFloor < SPACING_BOUND_A) {
        return [Math.pow(10, powerFloor), 1];
      } else if (origSpacingPower - powerFloor > SPACING_BOUND_B) {
        return [Math.pow(10, powerFloor + 1), 1];
      } else {
        return [5 * Math.pow(10, powerFloor), 5];
      }
    };
    const [origGridLineDistX, lineMultiplierX] = computeLineDist(childScaleX);
    const [origGridLineDistY, lineMultiplierY] = computeLineDist(childScaleY);
    const [left, top] = this.r(0, 0, childScale, childXOrigin, childYOrigin);
    const [right, bottom] = this.r(this.width, this.height, childScale, childXOrigin, childYOrigin);
    const leftmostLine = Math.ceil(left / origGridLineDistX);
    const rightmostLine = Math.floor(right / origGridLineDistX);
    const topmostLine = Math.floor(top / origGridLineDistY);
    const bottommostLine = Math.ceil(bottom / origGridLineDistY);

    const useOffsetLegendX = (Math.sign(leftmostLine) == Math.sign(rightmostLine)) && (Math.abs(leftmostLine * lineMultiplierX) >= 1000 || Math.abs(rightmostLine * lineMultiplierX) >= 1000);
    const useOffsetLegendY = (Math.sign(bottommostLine) == Math.sign(topmostLine)) && (Math.abs(bottommostLine * lineMultiplierY) >= 1000 || Math.abs(topmostLine * lineMultiplierY) >= 1000);
    const labelOffsetX = useOffsetLegendX ? (this.gridLegendLeft ? origGridLineDistX * leftmostLine : origGridLineDistX * rightmostLine) : 0;
    const labelOffsetY = useOffsetLegendY ? (this.gridLegendBelow ? origGridLineDistY * bottommostLine : origGridLineDistY * topmostLine) : 0;

    const ctx = this.ctx;
    ctx.font = `${0.75 * this.pxToCanPx}em ${getComputedStyle(this.canvas).fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    const labelsX = [];
    const labelsY = [];
    let maxXLabelAscent = 0;
    let maxXLabelDescent = 0;
    let maxYLabelWidth = 0;
    let padding = 2;
    if (!gridMode) { // create tick labels and measure their size
      padding = Math.max(padding, ctx.measureText('o').width);
      for (let lr = leftmostLine; lr <= rightmostLine; lr++) {
        const numX = origGridLineDistX * lr - labelOffsetX;
        const nLabelX = (labelOffsetX != 0 && numX > 0 ? '+' : (labelOffsetX != 0 && numX == 0 ? '±' : '')) + numToUnitStr(numX, unitX);
        labelsX.push(nLabelX);
        if (lr % 2 == 0) {
          const metrics = ctx.measureText(nLabelX);
          maxXLabelAscent = Math.max(maxXLabelAscent, metrics.actualBoundingBoxAscent);
          maxXLabelDescent = Math.max(maxXLabelDescent, metrics.actualBoundingBoxDescent);
        }
      }
      for (let tb = bottommostLine; tb <= topmostLine; tb++) {
        const numY = origGridLineDistY * tb - labelOffsetY;
        const nLabelY = (labelOffsetY != 0 && numY > 0 ? '+' : (labelOffsetY != 0 && numY == 0 ? '±' : '')) + numToUnitStr(numY, unitY);
        labelsY.push(nLabelY);
        if (tb % 2 == 0) maxYLabelWidth = Math.max(maxYLabelWidth, ctx.measureText(nLabelY).width);
      }
    }

    let xLeft = 0;
    let xRight = this.width;
    let yTop = 0;
    let yBottom = this.height;
    let xBorder = 0;
    let yBorder = 0;
    if (!gridMode) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      if (this.gridLegendBelow) { // draw semi-transparent white background for legend
        yBottom = this.height - maxXLabelAscent - maxXLabelDescent - padding*2.5;
        yBorder = yBottom;
        ctx.fillRect(0, this.height - maxXLabelAscent - maxXLabelDescent - padding*2.5, this.width, maxXLabelAscent + maxXLabelDescent + padding*2.5);
      } else {
        yTop = maxXLabelAscent + maxXLabelDescent + padding*2.5;
        yBorder = yTop;
        ctx.fillRect(0, 0, this.width, maxXLabelAscent + maxXLabelDescent + padding*2.5);
      }
      if (this.gridLegendLeft) {
        xLeft = maxYLabelWidth + padding*2.5;
        xBorder = xLeft;
        ctx.fillRect(0, yTop - 0.5, maxYLabelWidth + padding*2.5, 1 + yBottom - yTop);
      } else {
        xRight = this.width - maxYLabelWidth - padding*2.5;
        xBorder = xRight;
        ctx.fillRect(this.width - maxYLabelWidth - padding*2.5, yTop - 0.5, maxYLabelWidth + padding*2.5, 1 + yBottom - yTop);
      }
      ctx.lineWidth = 2; // draw separation line for legend
      ctx.strokeStyle = color.darken(0.4).toString();
      ctx.beginPath();
      ctx.moveTo(xLeft, Math.round(yBorder));
      ctx.lineTo(xRight, Math.round(yBorder));
      ctx.stroke();
      ctx.closePath();
      ctx.beginPath();
      ctx.moveTo(Math.round(xBorder), yTop);
      ctx.lineTo(Math.round(xBorder), yBottom);
      ctx.stroke();
      ctx.closePath();
    }

    for (let lr = leftmostLine; lr <= rightmostLine; lr++) {
      const origX = origGridLineDistX * lr;
      const finalX = Math.round(this.p(origX, 0, childScale, childXOrigin, childYOrigin)[0]);
      let startY = 0;
      let endY = this.height;
      if (!gridMode) { // draw only tick marks in legend mode
        if (finalX < xLeft || finalX > xRight) continue;
        if (this.gridLegendBelow) {
          startY = this.height - maxXLabelAscent - maxXLabelDescent - padding*2.5;
          endY = this.height - maxXLabelAscent - maxXLabelDescent - padding*1.5;
        } else {
          startY = maxXLabelAscent + maxXLabelDescent + padding*1.5;
          endY = maxXLabelAscent + maxXLabelDescent + padding*2.5;
        }
      }
      ctx.beginPath(); // draw grid line (or tick mark)
      ctx.moveTo(finalX - ((lr % 2 == 0) ? 0 : 0.5), startY);
      ctx.lineTo(finalX - ((lr % 2 == 0) ? 0 : 0.5), endY);
      if (lr != 0) ctx.strokeStyle = color.toString();
      else ctx.strokeStyle = color.darken(0.4).toString();
      ctx.lineWidth = (lr % 2 == 0) ? 2 : 1;
      ctx.stroke();
      ctx.closePath();
      if (!gridMode && lr % 2 == 0) { // add tick label
        ctx.fillStyle = 'black';
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'center';
        if (this.gridLegendBelow)
          ctx.fillText(labelsX[lr - leftmostLine], finalX, this.height - padding - maxXLabelDescent);
        else
          ctx.fillText(labelsX[lr - leftmostLine], finalX, padding + maxXLabelAscent);
      }
    }
    for (let tb = bottommostLine; tb <= topmostLine; tb++) {
      const origY = origGridLineDistY * tb;
      const finalY = Math.round(this.p(0, origY, childScale, childXOrigin, childYOrigin)[1]);
      let startX = 0;
      let endX = this.width;
      if (!gridMode) { // draw only tick marks in legend mode
        if (finalY < yTop || finalY > yBottom) continue;
        if (this.gridLegendLeft) {
          startX = maxYLabelWidth + padding*1.5;
          endX = maxYLabelWidth + padding*2.5;
        } else {
          startX = this.width - maxYLabelWidth - padding*2.5;
          endX = this.width - maxYLabelWidth - padding*1.5;
        }
      }
      ctx.beginPath(); // draw grid line (or tick mark)
      ctx.moveTo(startX, finalY - ((tb % 2 == 0) ? 0 : 0.5));
      ctx.lineTo(endX, finalY - ((tb % 2 == 0) ? 0 : 0.5));
      if (tb != 0) ctx.strokeStyle = color.toString();
      else ctx.strokeStyle = color.darken(0.4).toString();
      ctx.lineWidth = (tb % 2 == 0) ? 2 : 1;
      ctx.stroke();
      ctx.closePath();
      if (!gridMode && tb % 2 == 0) { // add tick label
        ctx.fillStyle = 'black';
        ctx.textBaseline = 'middle';
        if (this.gridLegendLeft) {
          ctx.textAlign = 'right';
          ctx.fillText(labelsY[tb - bottommostLine], padding + maxYLabelWidth, finalY);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(labelsY[tb - bottommostLine], this.width - padding - maxYLabelWidth, finalY);
        }
      }
    }

    if (!gridMode) {
      if (labelOffsetX != 0 || labelOffsetY != 0) { // draw reference point if user shifted coordinate system far away from origin
        let offsetXLoc = this.p(labelOffsetX, 0, childScale, childXOrigin, childYOrigin)[0];
        let offsetYLoc = this.p(0, labelOffsetY, childScale, childXOrigin, childYOrigin)[1];
        let offsetString = '';
        if (labelOffsetX != 0) {
          offsetString += `X: ${numToUnitStr(labelOffsetX, unitX, 9)}`;
        } else {
          offsetXLoc = xBorder;
        }
        if (labelOffsetY != 0) {
          if (offsetString !== '') offsetString += ', ';
          offsetString += `Y: ${numToUnitStr(labelOffsetY, unitY, 9)}`;
        } else {
          offsetYLoc = yBorder;
        }
        ctx.textAlign = this.gridLegendLeft ? 'left' : 'right';
        ctx.textBaseline = 'alphabetic';
        const metrics = ctx.measureText(offsetString);
        const textW = metrics.width;
        const textH = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        ctx.fillStyle = 'white';
        ctx.strokeStyle = color.darken(0.4).toString();
        ctx.lineWidth = 1;
        ctx.fillRect(offsetXLoc - (this.gridLegendLeft ? 0 : textW + 2*padding), offsetYLoc - (this.gridLegendBelow ? textH + 2*padding : 0), textW + 2*padding, textH + 2*padding);
        ctx.strokeRect(offsetXLoc - (this.gridLegendLeft ? 0 : textW + 2*padding), offsetYLoc - (this.gridLegendBelow ? textH + 2*padding : 0), textW + 2*padding, textH + 2*padding);
        ctx.fillStyle = 'black';
        ctx.fillText(offsetString, offsetXLoc + padding * (this.gridLegendLeft ? 1 : -1), offsetYLoc + padding * (this.gridLegendBelow ? -1 : 1) + (this.gridLegendBelow ? -metrics.actualBoundingBoxDescent : metrics.actualBoundingBoxAscent));
        ctx.fillStyle = color.darken(0.4).toString();
        ctx.beginPath();
        ctx.arc(offsetXLoc, offsetYLoc, padding / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
      }
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
