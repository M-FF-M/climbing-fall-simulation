
/**
 * A class responsible for managing the drawing of a scene
 */
class WorldGraphics {
  /**
   * Create a new object responsible for managing the drawing of a scene
   * @param {HTMLElement} boundingElement an element into which the scene should be drawn
   */
  constructor(boundingElement) {
    boundingElement.style.contain = 'size';
    boundingElement.innerHTML = '';
    /** @type {HTMLCanvasElement} the canvas that will be used for drawing */
    this.canvas = document.createElement('canvas');
    boundingElement.appendChild(this.canvas);
    /** @type {HTMLElement} the element into which the scene should be drawn */
    this.boundingElement = boundingElement;
    /** @type {ResizeObserver} observer listening for bounding element size canges */
    this.resizeObserver = new ResizeObserver(entries => this.processSizeChange(entries));
    this.resizeObserver.observe(boundingElement, { box: 'content-box' });
    /** @type {number} the width of the canvas in pixels (change only using the adaptSize method!) */
    this.width = 0;
    /** @type {number} the height of the canvas in pixels (change only using the adaptSize method!) */
    this.height = 0;
    /** @type {ObjectSnapshot[]|null} the current snapshot to draw */
    this.currentSnapshot = null;
    /** @type {number} the time at which the current snapshot was taken */
    this.currentTime = 0;
    /** @type {number} the scale of the drawing; this measures the ratio pixels / meter */
    this.scale = 50; // 1 meter = 50 pixels
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
   * Adapt the canvas size
   * @param {number} width the desired width in pixels
   * @param {number} height the desired height in pixels
   */
  adaptSize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.width = width * dpr;
    this.height = height * dpr;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    if (typeof this.xOrigin === 'undefined') {
      /** @type {number} origin in the x-direction in pixels */
      this.xOrigin = this.width / 2;
      /** @type {number} origin in the y-direction in pixels */
      this.yOrigin = this.height / 2 + 5 * this.scale; // y origin is placed 5 meters above the ground
    }
    this.draw();
  }

  /**
   * Draw a scene snapshot
   * @param {ObjectSnapshot[]} snapshot the snapshot to draw
   * @param {number} time the time at which the snapshot was taken
   */
  drawSnapshot(snapshot, time) {
    this.currentSnapshot = snapshot;
    this.currentTime = time;
    this.draw();
  }

  /**
   * Project a 3D vector onto the 2D canvas with the current settings
   * @param {V|[number, number, number]|number} x either the point as a vector, or the coordinates as an array, or only the x coordinate (in meters)
   * @param {number} [y] the y coordinate (in meters)
   * @param {number} [z] the z coordinate (in meters)
   * @return {[number, number]} the x and y coordinates of the point on the 2D canvas
   */
  p(x, y, z) {
    if (x instanceof V) {
      y = x.y;
      z = x.z;
      x = x.x;
    } else if (Array.isArray(x)) {
      y = x[1];
      z = x[2];
      x = x[0];
    }
    return [ this.xOrigin + x * this.scale, this.yOrigin - y * this.scale ];
  }

  /**
   * Draw a barrier according to the current settings
   * @param {CanvasRenderingContext2D} ctx the canvas context onto which to draw
   * @param {V} normal the normal vector of the barrier, which must have length 1 and should point away from the half-space which is blocked
   * @param {number} shift the dot product of the normal vector and a point in the barrier
   * @param {string} [color] the barrier color
   * @param {number} [thickness] the barrier thickness (in meters)
   */
  drawBarrier(ctx, normal, shift, color = 'rgb(62, 43, 62)', thickness = 0.1) {
    if (Math.abs(normal.dot(new V(0, 1, 0))) == 1) {
      const ycoord = shift * normal.dot(new V(0, 1, 0));
      ctx.beginPath();
      ctx.moveTo(0, this.yOrigin - ycoord*this.scale);
      ctx.lineTo(this.width, this.yOrigin - ycoord*this.scale);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.ceil(thickness * this.scale);
      ctx.stroke();
      ctx.closePath();
    } else if (normal.dot(new V(0, 1, 0)) == 0) {
      const xcoord = shift * normal.dot(new V(1, 0, 0));
      ctx.beginPath();
      ctx.moveTo(this.xOrigin + xcoord*this.scale, 0);
      ctx.lineTo(this.xOrigin + xcoord*this.scale, this.height);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.ceil(thickness * this.scale);
      ctx.stroke();
      ctx.closePath();
    } else {
      const normalLR = new V(1, 0, 0);
      const leftShift = -this.xOrigin / this.scale;
      const rightShift = (this.width - this.xOrigin) / this.scale;
      const normalTB = new V(0, 1, 0);
      const topShift = this.yOrigin / this.scale;
      const bottomShift = -(this.height - this.yOrigin) / this.scale;
      const bndCoords = [];
      for (const [shiftB, normalB, coord, otherCoord] of [
            [leftShift, normalLR, 'y', 0], [rightShift, normalLR, 'y', this.width], [topShift, normalTB, 'x', 0], [bottomShift, normalTB, 'x', this.height]
          ]) {
        const [lineDir, pointOnLine] = calculatePlaneIntersection(normal, shift, normalB, shiftB);
        const coordVal = ((coord == 'x') ? pointOnLine.x : pointOnLine.y) * this.scale;
        const graphCoord = (coord == 'x') ? this.xOrigin + coordVal : this.yOrigin - coordVal;
        if (coord == 'x' && graphCoord >= 0 && graphCoord <= this.width) {
          bndCoords.push([graphCoord, otherCoord]);
        } else if (coord == 'y' && graphCoord >= 0 && graphCoord <= this.height) {
          bndCoords.push([graphCoord, otherCoord]);
        }
      }
      if (bndCoords.length > 1) {
        ctx.beginPath();
        ctx.moveTo(bndCoords[0][0], bndCoords[0][1]);
        for (let i = 1; i < bndCoords.length; i++)
          ctx.lineTo(bndCoords[i][0], bndCoords[i][1]);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.ceil(thickness * this.scale);
        ctx.stroke();
        ctx.closePath();
      }
    }
  }

  /**
   * Draw height markers onto the canvas
   * @param {CanvasRenderingContext2D} ctx the canvas context onto which to draw
   */
  drawHeightMarkers(ctx) {
    for (let i = 0; i <= 20; i++) {
      ctx.beginPath();
      ctx.moveTo(0, this.yOrigin - 0.5 * i*this.scale - 0.5);
      ctx.lineTo(this.width, this.yOrigin - 0.5 * i*this.scale - 0.5);
      if (i % 2 == 0)
        ctx.strokeStyle = 'rgb(190, 190, 190)';
      else
        ctx.strokeStyle = 'rgb(220, 220, 220)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.closePath();
      ctx.font = '0.75em Arial';
      ctx.fillStyle = 'black';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(`${numToStr(i * 0.5)} m`, 5, this.yOrigin - 0.5 * i*this.scale);
    }
    ctx.font = '1em Arial';
    ctx.fillStyle = 'black';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillText(`t = ${numToStr(this.currentTime, 2, 5, 2)} s`, this.width - 5, 5);
  }

  /**
   * Draw the current scene snapshot
   */
  draw() {
    if (this.width <= 0 || this.height <= 0 || this.currentSnapshot === null || this.scale <= 0)
      return;
    const w = this.width; const h = this.height;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = 'round';

    if (typeof PHYSICS_WORLD === 'object' && typeof PHYSICS_WORLD.barriers !== 'undefined') { // draw barriers
      for (const barrier of PHYSICS_WORLD.barriers)
        this.drawBarrier(ctx, barrier.normal, barrier.shift);
    }

    this.drawHeightMarkers(ctx);

    for (const objSnap of this.currentSnapshot) { // draw bodies

      if (objSnap.type === 'point mass') {
        ctx.beginPath();
        ctx.arc(...this.p(objSnap.visibleState.position), objSnap.visibleState.radius * this.scale, 0, Math.PI * 2);
        ctx.fillStyle = objSnap.visibleState.color;
        ctx.fill();
        ctx.closePath();

      } else if (objSnap.type === 'rope') {
        ctx.beginPath();
        ctx.moveTo(...this.p(objSnap.visibleState.segmentPositions[0]));
        for (let i = 1; i < objSnap.visibleState.segmentPositions.length; i++)
          ctx.lineTo(...this.p(objSnap.visibleState.segmentPositions[i]));
        ctx.strokeStyle = objSnap.visibleState.color;
        ctx.lineWidth = Math.ceil(objSnap.visibleState.thickness * this.scale);
        ctx.stroke();
        ctx.closePath();

        for (let i = 0; i < objSnap.visibleState.segmentPositions.length; i++) {
          ctx.beginPath();
          ctx.arc(...this.p(objSnap.visibleState.segmentPositions[i]), objSnap.visibleState.radius * this.scale, 0, Math.PI * 2);
          ctx.fillStyle = objSnap.visibleState.color;
          ctx.fill();
          ctx.closePath();
        }
      }
    }
  }
}
