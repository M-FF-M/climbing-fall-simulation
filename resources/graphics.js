
/**
 * A class responsible for managing the drawing of a scene
 */
class WorldGraphics {
  /**
   * Create a new object responsible for managing the drawing of a scene
   * @param {HTMLElement} boundingElement an element into which the scene should be drawn
   * @param {boolean} [xyProjection=true] whether to show (x,y)-coordinates (project along the z-axis), if set to false, show (z,y)-coordinates instead
   */
  constructor(boundingElement, xyProjection = true) {
    /** @type {ZoomableCanvas} the zoomable canvas onto which to draw */
    this.can = new ZoomableCanvas(boundingElement, () => this.canvasChange())
    /** @type {number} the width of the canvas in pixels (change only using the canvasChange method!) */
    this.width = 0;
    /** @type {number} the height of the canvas in pixels (change only using the canvasChange method!) */
    this.height = 0;
    /** @type {ObjectSnapshot[]|null} the current snapshot to draw */
    this.currentSnapshot = null;
    /** @type {number} the time at which the current snapshot was taken */
    this.currentTime = 0;
    /** @type {number} the scale of the drawing; this measures the ratio pixels / meter */
    this.scale = 50; // 1 meter = 50 pixels
    /** @type {boolean} whether to show (x,y)-coordinates (project along the z-axis), if set to false, show (z,y)-coordinates instead */
    this.xyProjectionMode = xyProjection;
  }

  /**
   * Should be called when zoom level, shift, or size of the zoomable canvas change
   */
  canvasChange() {
    this.width = this.can.width;
    this.height = this.can.height;
    if (typeof this.xOrigin === 'undefined' || this.can.inDefaultState) {
      /** @type {number} origin in the x-direction in pixels */
      this.xOrigin = this.width / 2;
      /** @type {number} origin in the y-direction in pixels */
      this.yOrigin = this.height / 2 - 3 * this.scale; // ground is placed 3 meters below the center of the canvas
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
      z = x.z;
      y = x.y;
      x = x.x;
    } else if (Array.isArray(x)) {
      z = x[2];
      y = x[1];
      x = x[0];
    }
    if (this.xyProjectionMode)
      return this.can.p(x, y, this.scale, this.xOrigin, this.yOrigin);
    else
      return this.can.p(z, y, this.scale, this.xOrigin, this.yOrigin);
  }

  /**
   * Draw a barrier according to the current settings
   * @param {CanvasRenderingContext2D} ctx the canvas context onto which to draw
   * @param {V} normal the normal vector of the barrier, which must have length 1 and should point away from the half-space which is blocked
   * @param {number} shift the dot product of the normal vector and a point in the barrier
   * @param {Color} [color] the barrier color
   * @param {number} [thickness] the barrier thickness (in meters)
   */
  drawBarrier(ctx, normal, shift, color = new Color(62, 43, 62), thickness = 0.1) {
    const normalLR = this.xyProjectionMode ? new V(1, 0, 0) : new V(0, 0, 1); // normal pointing from left camera side to right camera side
    const normalTB = new V(0, 1, 0); // normal pointing from bottom side to top side of camera
    const normalCam = this.xyProjectionMode ? new V(0, 0, 1) : new V(-1, 0, 0); // normal pointing from the camera towards the scene
    const can = this.can;
    // bounding box for barriers
    const leftBoundary = -30; // left boundary: 10 meters to the left of origin
    const rightBoundary = 30; // right boundary: 10 meters to the right of origin
    const bottomBoundary = -10; // bottom boundary: 2 meters below origin
    const topBoundary = 55; // top boundary: 20 meters above origin

    if (Math.abs(normal.dot(normalCam)) < GEOMETRY_EPS) { // only a line is visible from the direction of the camera
      // first, we project the barrier onto the "camera" plane
      const barrierLine = calculateGeomObjIntersection(new Plane(normal, shift), new Plane(normalCam, 0));
      const leftIntersec = calculateGeomObjIntersection(barrierLine, new Plane(normalLR, leftBoundary));
      const rightIntersec = calculateGeomObjIntersection(barrierLine, new Plane(normalLR, rightBoundary));
      if (leftIntersec.isPoint && rightIntersec.isPoint && leftIntersec.anyPoint.y >= bottomBoundary - GEOMETRY_EPS
          && leftIntersec.anyPoint.y <= topBoundary + GEOMETRY_EPS && rightIntersec.anyPoint.y >= bottomBoundary - GEOMETRY_EPS
          && rightIntersec.anyPoint.y <= topBoundary + GEOMETRY_EPS) {
        ctx.beginPath();
        ctx.moveTo(...this.p(...leftIntersec.anyPoint.arr));
        ctx.lineTo(...this.p(...rightIntersec.anyPoint.arr));
        ctx.strokeStyle = color.toString();
        ctx.lineWidth = Math.ceil(can.l(thickness, this.scale));
        ctx.stroke();
        ctx.closePath();
      } else {
        const bottomIntersec = calculateGeomObjIntersection(barrierLine, new Plane(normalTB, bottomBoundary));
        const topIntersec = calculateGeomObjIntersection(barrierLine, new Plane(normalTB, topBoundary));
        if (bottomIntersec.isPoint && topIntersec.isPoint) {
          ctx.beginPath();
          ctx.moveTo(...this.p(...bottomIntersec.anyPoint.arr));
          ctx.lineTo(...this.p(...topIntersec.anyPoint.arr));
          ctx.strokeStyle = color.toString();
          ctx.lineWidth = Math.ceil(can.l(thickness, this.scale));
          ctx.stroke();
          ctx.closePath();
        }
      }
    } else { // an area is visible from the direction of the camera
      color.a *= 0.3;
      const barrierPlane = new Plane(normal, shift);
      const leftLine = calculateGeomObjIntersection(barrierPlane, new Plane(normalLR, leftBoundary));
      const rightLine = calculateGeomObjIntersection(barrierPlane, new Plane(normalLR, rightBoundary));
      const bottomLine = calculateGeomObjIntersection(barrierPlane, new Plane(normalTB, bottomBoundary));
      const topLine = calculateGeomObjIntersection(barrierPlane, new Plane(normalTB, topBoundary));
      if (leftLine.isLine && rightLine.isLine && bottomLine.isLine && topLine.isLine) {
        const pt1 = calculateGeomObjIntersection(leftLine, topLine);
        const pt2 = calculateGeomObjIntersection(topLine, rightLine);
        const pt3 = calculateGeomObjIntersection(rightLine, bottomLine);
        const pt4 = calculateGeomObjIntersection(bottomLine, leftLine);
        if (pt1.isPoint && pt2.isPoint && pt3.isPoint && pt4.isPoint) {
          ctx.beginPath();
          ctx.moveTo(...this.p(...pt1.anyPoint.arr));
          ctx.lineTo(...this.p(...pt2.anyPoint.arr));
          ctx.lineTo(...this.p(...pt3.anyPoint.arr));
          ctx.lineTo(...this.p(...pt4.anyPoint.arr));
          ctx.lineTo(...this.p(...pt1.anyPoint.arr));
          ctx.fillStyle = color.toString();
          ctx.fill();
          ctx.closePath();
        }
      }
    }
  }

  /**
   * Draw the current scene snapshot
   */
  draw() {
    if (this.width <= 0 || this.height <= 0 || this.currentSnapshot === null || this.scale <= 0)
      return;
    const can = this.can;
    can.clear();
    const ctx = can.ctx;
    ctx.lineJoin = 'round';

    can.drawGrid('m', true, this.scale, this.xOrigin, this.yOrigin);

    if (typeof PHYSICS_WORLD === 'object' && typeof PHYSICS_WORLD.barriers !== 'undefined') { // draw barriers
      for (const barrier of PHYSICS_WORLD.barriers)
        this.drawBarrier(ctx, barrier.normal, barrier.shift);
    }

    for (const objSnap of this.currentSnapshot) { // draw bodies

      if (objSnap.type === 'point mass') {
        ctx.beginPath();
        ctx.arc(...this.p(objSnap.visibleState.position), can.l(objSnap.visibleState.radius, this.scale), 0, Math.PI * 2);
        ctx.fillStyle = objSnap.visibleState.color.toString();
        ctx.fill();
        ctx.closePath();

      } else if (objSnap.type === 'rope') {
        ctx.beginPath();
        ctx.moveTo(...this.p(objSnap.visibleState.segmentPositions[0]));
        for (let i = 1; i < objSnap.visibleState.segmentPositions.length; i++)
          ctx.lineTo(...this.p(objSnap.visibleState.segmentPositions[i]));
        ctx.strokeStyle = objSnap.visibleState.color.toString();
        ctx.lineWidth = Math.ceil(can.l(objSnap.visibleState.thickness, this.scale));
        ctx.stroke();
        ctx.closePath();

        for (let i = 0; i < objSnap.visibleState.segmentPositions.length; i++) {
          ctx.beginPath();
          ctx.arc(...this.p(objSnap.visibleState.segmentPositions[i]), can.l(objSnap.visibleState.radius, this.scale), 0, Math.PI * 2);
          ctx.fillStyle = objSnap.visibleState.color.toString();
          ctx.fill();
          ctx.closePath();
        }
      }
    }
    
    const timeString = `${(this.xyProjectionMode ? 'side view' : 'frontal view')} at time ${numToStr(this.currentTime, 2, 5, 2, true)} s`;
    ctx.font = `${can.pxToCanPx}em ${getComputedStyle(this.can.canvas).fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'right';
    const padding = Math.ceil(Math.max(2, ctx.measureText('o').width / 2));
    const metrics = ctx.measureText(timeString);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(this.width - metrics.width - 2*padding, 0, metrics.width + 2*padding, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + 2*padding);
    ctx.fillStyle = 'black';
    ctx.textBaseline = 'top';
    ctx.fillText(timeString, this.width - padding, padding);

    can.drawGrid('m', false, this.scale, this.xOrigin, this.yOrigin);
  }

  /**
   * Destroy the zoomable canvas (remove canvas from parent)
   */
  destroy() {
    this.can.destroy();
  }
}
