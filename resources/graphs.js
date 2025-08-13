
const GRAPH_PROPERTIES = {
  'forces' : {
    property: 'forces',
    subProperties: ['current', 'average'],
    unit: 'N',
    legend: 'Forces:'
  },
  'positions' : {
    property: 'visibleState',
    subProperties: ['position'],
    unit: 'm',
    legend: 'Heights:'
  },
  'energy' : {
    property: 'energy',
    subProperties: ['kinetic', 'potential', 'elastic', 'overall'],
    unit: 'J',
    legend: 'Energy:'
  }
};

/**
 * A canvas for drawing graphs
 */
class GraphCanvas {
  /**
   * Create a new object responsible for drawing graphs
   * @param {HTMLElement} boundingElement an element into which the graphs should be drawn
   * @param {{time: number, bodies: ObjectSnapshot[]}[]} snapshots the object snapshots from which the graph should be generated
   * @param {'forces'|'positions'|'energy'} [type] the type of graph to draw
   */
  constructor(boundingElement, snapshots, type = 'forces') {
    boundingElement.replaceChildren();
    boundingElement.style.display = 'flex';
    boundingElement.style.flexDirection = 'column';
    /** @type {HTMLDivElement} the container for the canvas onto which the graph will be drawn */
    this.canvasContainer = document.createElement('div');
    this.canvasContainer.style.flex = '1 1 auto';
    this.canvasContainer.style.width = '100%';
    boundingElement.appendChild(this.canvasContainer);
    /** @type {HTMLDivElement} the container for the graph's legend */
    this.legendContainer = document.createElement('div');
    this.legendContainer.style.flex = '0 0 auto';
    this.legendContainer.style.padding = '0.5em';
    this.legendContainer.textContent = GRAPH_PROPERTIES[type].legend;
    boundingElement.appendChild(this.legendContainer);
    /** @type {ZoomableCanvas} the zoomable canvas onto which to draw */
    this.can = new ZoomableCanvas(this.canvasContainer, () => this.canvasChange())
    /** @type {number} the width of the canvas in pixels (change only using the canvasChange method!) */
    this.width = 0;
    /** @type {number} the height of the canvas in pixels (change only using the canvasChange method!) */
    this.height = 0;
    /** @type {number} the time which should be highlighted in the graph */
    this.currentTime = 0;
    /** @type {number} the scale of the x-axis (units to canvas pixels, without zoom) */
    this.scaleX = 0;
    /** @type {number} the scale of the y-axis (units to canvas pixels, without zoom) */
    this.scaleY = 0;
    /** @type {number} origin in the x-direction in pixels */
    this.xOrigin = 0;
    /** @type {number} origin in the y-direction in pixels */
    this.yOrigin = 0;
    /** @type {{time: number, bodies: ObjectSnapshot[]}[]} the object snapshots from which the graph should be generated */
    this.snapshots = snapshots;
    /** @type {number} minimal value of the x-axis */
    this.minX = Infinity;
    /** @type {number} maximal value of the x-axis */
    this.maxX = -Infinity;
    /** @type {number} minimal value of the y-axis */
    this.minY = Infinity;
    /** @type {number} maximal value of the y-axis */
    this.maxY = -Infinity;
    /** @type {{color: Color, lines: string[], coordinates: [number, number][][]}[]} the graphs to plot */
    this.graphs = [];
    /** @type {'forces'|'positions'|'energy'} the type of the displayed graph */
    this.graphType = type;
    const checkGraphInitialized = (idx, visibleState, prop) => {
      while (idx >= this.graphs.length)
        this.graphs.push({ lines: [], coordinates: [] });
      if (typeof this.graphs[idx].color === 'undefined' && typeof visibleState.color !== 'undefined')
        this.graphs[idx].color = visibleState.color;
      if (!this.graphs[idx].lines.includes(prop)) {
        this.graphs[idx].lines.push(prop);
        this.graphs[idx].coordinates.push([]);
      }
    };
    const addPlotCoordinatePair = (idx, prop, x, y) => {
      const lIdx = this.graphs[idx].lines.indexOf(prop);
      this.graphs[idx].coordinates[lIdx].push([x, y]);
    };
    let legendcreated = false;
    for (const snapshot of this.snapshots) {
      this.minX = Math.min(this.minX, snapshot.time);
      this.maxX = Math.max(this.maxX, snapshot.time);
      for (let i = 0; i < snapshot.bodies.length; i++) {
        const bodySnapshot = snapshot.bodies[i];
        let j = 0;
        if (typeof bodySnapshot[ GRAPH_PROPERTIES[type].property ] === 'object') {
          for (const subProp of GRAPH_PROPERTIES[type].subProperties) {
            if (typeof bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp] === 'number') {
              this.minY = Math.min(this.minY, bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp]);
              this.maxY = Math.max(this.maxY, bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp]);
              const timeShift = (type === 'forces' && subProp === 'average' && typeof bodySnapshot.forces.averageWindow === 'number')
                ? bodySnapshot.forces.averageWindow / 2 : 0;
              checkGraphInitialized(i, bodySnapshot.visibleState, subProp);
              addPlotCoordinatePair(i, subProp, snapshot.time - timeShift, bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp]);
              j++;
            } else if (Array.isArray(bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp])) {
              this.minY = Math.min(this.minY, bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp][1]); // we only plot the height (y-coordinate, index = 1)
              this.maxY = Math.max(this.maxY, bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp][1]);
              checkGraphInitialized(i, bodySnapshot.visibleState, subProp);
              addPlotCoordinatePair(i, subProp, snapshot.time, bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp][1]);
              j++;
            }
          }
        }
        if (!legendcreated && j > 0) {
          const color = (typeof bodySnapshot.visibleState.color !== 'undefined') ? bodySnapshot.visibleState.color.toString() : 'black';
          const legendSpan = document.createElement('span');
          const colorBox = document.createElement('span');
          colorBox.style.display = 'inline-block';
          colorBox.style.width = '0.8em';
          colorBox.style.height = '0.8em';
          colorBox.style.borderRadius = '0.4em';
          colorBox.style.marginRight = '0.4em';
          colorBox.style.backgroundColor = color;
          const nameSpan = document.createElement('span');
          nameSpan.textContent = bodySnapshot.name;
          legendSpan.appendChild(colorBox);
          legendSpan.appendChild(nameSpan);
          legendSpan.style.marginLeft = '0.3em';
          legendSpan.style.marginRight = '0.3em';
          this.legendContainer.appendChild(legendSpan);
        }
      }
      legendcreated = true;
    }
  }

  /**
   * Should be called when zoom level, shift, or size of the zoomable canvas change
   */
  canvasChange() {
    this.width = this.can.width;
    this.height = this.can.height;
    this.draw();
  }

  /**
   * Draw a plot of the graph
   */
  draw() {
    const can = this.can;
    can.clear();
    const ctx = can.ctx;
    ctx.lineJoin = 'round';
    if (this.scaleX == 0 || this.scaleY == 0 || can.inDefaultState) {
      if (this.width == 0 || this.height == 0) return;
      this.scaleX = this.width / (this.maxX - this.minX);
      this.scaleY = this.height / (this.maxY - this.minY);
      this.xOrigin = - this.minX * this.scaleX;
      this.yOrigin = - this.minY * this.scaleY;
      const [xL, yL] = can.drawGrid(['s', GRAPH_PROPERTIES[this.graphType].unit], 'measure', [this.scaleX, this.scaleY], this.xOrigin, this.yOrigin);
      this.scaleX = (this.width - xL - 2) / (this.maxX - this.minX);
      this.scaleY = (this.height - yL - 2) / (this.maxY - this.minY);
      this.xOrigin = - this.minX * this.scaleX + xL;
      this.yOrigin = - this.minY * this.scaleY + yL;
    }

    can.drawGrid(['s', GRAPH_PROPERTIES[this.graphType].unit], true, [this.scaleX, this.scaleY], this.xOrigin, this.yOrigin);

    // draw time marker
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(...can.p(this.currentTime, this.minY, [this.scaleX, this.scaleY], this.xOrigin, this.yOrigin));
    ctx.lineTo(...can.p(this.currentTime, this.maxY, [this.scaleX, this.scaleY], this.xOrigin, this.yOrigin));
    ctx.stroke();
    ctx.closePath();

    // draw graphs
    for (const graphObj of this.graphs) {
      for (let i = 0; i < graphObj.lines.length; i++) {
        let start = true;
        ctx.strokeStyle = (typeof graphObj.color !== 'undefined') ? graphObj.color.toString() : 'black';
        ctx.lineWidth = 2;
        if (graphObj.lines[i] === 'average') ctx.setLineDash([4, 2]);
        else if (graphObj.lines[i] === 'kinetic') ctx.setLineDash([2, 2]);
        else if (graphObj.lines[i] === 'potential') ctx.setLineDash([6, 2]);
        else if (graphObj.lines[i] === 'elastic') ctx.setLineDash([4, 2]);
        else ctx.setLineDash([]);
        ctx.beginPath();
        for (const [x, y] of graphObj.coordinates[i]) {
          const [px, py] = can.p(x, y, [this.scaleX, this.scaleY], this.xOrigin, this.yOrigin);
          if (start) {
            ctx.moveTo(px, py);
            start = false;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
        ctx.closePath();
      }
    }
    ctx.setLineDash([]);

    can.drawGrid(['s', GRAPH_PROPERTIES[this.graphType].unit], false, [this.scaleX, this.scaleY], this.xOrigin, this.yOrigin);
  }
}
