
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
  },
  'speed' : {
    property: 'speed',
    subProperties: ['current'],
    unit: 'm/s',
    legend: 'Speeds:'
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
   * @param {'forces'|'positions'|'energy'|'speed'} [type] the type of graph to draw
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
    this.legendContainer.style.textAlign = 'center';
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
    /** @type {'forces'|'positions'|'energy'|'speed'} the type of the displayed graph */
    this.graphType = type;
    /** @type {boolean} whether to show what the different line types in the graph mean */
    this.showLineTypeLegend = false;
    /** @type {number} force averaging window in seconds */
    this.forceAvgWindow = 0;
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
    const createdLegends = {};
    for (const snapshot of this.snapshots) {
      this.minX = Math.min(this.minX, snapshot.time);
      this.maxX = Math.max(this.maxX, snapshot.time);
      const totalEnergy = {};
      if (type === 'energy') {
        for (const subProp of GRAPH_PROPERTIES[type].subProperties)
          totalEnergy[subProp] = 0;
      }
      for (let i = 0; i < snapshot.bodies.length; i++) {
        const bodySnapshot = snapshot.bodies[i];
        let j = 0;
        if (typeof bodySnapshot[ GRAPH_PROPERTIES[type].property ] === 'object') {
          for (const subProp of GRAPH_PROPERTIES[type].subProperties) {
            if (typeof bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp] === 'number') {
              const factor = (GRAPH_PROPERTIES[type].unit === 'm/s') ? 3600 : 1;
              this.minY = Math.min(this.minY, bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp]);
              this.maxY = Math.max(this.maxY, bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp] * factor);
              const timeShift = (type === 'forces' && subProp === 'average' && typeof bodySnapshot.forces.averageWindow === 'number')
                ? bodySnapshot.forces.averageWindow / 2 : 0;
              if (type === 'forces' && subProp === 'average' && typeof bodySnapshot.forces.averageWindow === 'number')
                this.forceAvgWindow = bodySnapshot.forces.averageWindow;
              checkGraphInitialized(i, bodySnapshot.visibleState, subProp);
              addPlotCoordinatePair(i, subProp, snapshot.time - timeShift, bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp] * factor);
              if (type === 'energy')
                totalEnergy[subProp] += bodySnapshot[ GRAPH_PROPERTIES[type].property ][subProp];
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
          if (!(color in createdLegends) || createdLegends[color].indexOf(bodySnapshot.name) == -1) {
            const legendSpan = document.createElement('span');
            legendSpan.classList.add('legend-box');
            const colorBox = document.createElement('span');
            colorBox.classList.add('legend-color-dot');
            colorBox.style.backgroundColor = color;
            const nameSpan = document.createElement('span');
            nameSpan.textContent = bodySnapshot.name;
            legendSpan.appendChild(colorBox);
            legendSpan.appendChild(nameSpan);
            this.legendContainer.appendChild(legendSpan);
            if (!(color in createdLegends)) createdLegends[color] = [];
            createdLegends[color].push(bodySnapshot.name);
          }
        }
      }
      if (type === 'energy') {
        for (const subProp of GRAPH_PROPERTIES[type].subProperties) {
          checkGraphInitialized(snapshot.bodies.length, { 'color': RAINBOW_COLORS[RAINBOW_COLORS.length - 1] }, subProp);
          addPlotCoordinatePair(snapshot.bodies.length, subProp, snapshot.time, totalEnergy[subProp]);
          this.maxY = Math.max(this.maxY, totalEnergy[subProp]);
        }
        if (!legendcreated) {
          const legendSpan = document.createElement('span');
          legendSpan.classList.add('legend-box');
          const colorBox = document.createElement('span');
          colorBox.classList.add('legend-color-dot');
          colorBox.style.backgroundColor = RAINBOW_COLORS[RAINBOW_COLORS.length - 1].toString();
          const nameSpan = document.createElement('span');
          nameSpan.textContent = 'entire system';
          legendSpan.appendChild(colorBox);
          legendSpan.appendChild(nameSpan);
          this.legendContainer.appendChild(legendSpan);
        }
      }
      legendcreated = true;
    }
    if (this.graphType === 'forces' || this.graphType === 'energy') {
      const legendSpan = document.createElement('span');
      legendSpan.classList.add('info-box');
      legendSpan.setAttribute('title', 'Show a legend for the line types');
      const iconBox = document.createElement('span');
      iconBox.classList.add('material-symbols-outlined');
      iconBox.classList.add('info-icon');
      iconBox.textContent = 'info';
      const textSpan = document.createElement('span');
      textSpan.textContent = 'line types';
      legendSpan.appendChild(iconBox);
      legendSpan.appendChild(textSpan);
      legendSpan.addEventListener('click', () => {
        this.showLineTypeLegend = !this.showLineTypeLegend;
        if (this.showLineTypeLegend) {
          iconBox.textContent = 'close';
          legendSpan.setAttribute('title', 'Hide legend for the line types');
        } else {
          iconBox.textContent = 'info';
          legendSpan.setAttribute('title', 'Show a legend for the line types');
        }
        this.draw();
      });
      this.legendContainer.appendChild(legendSpan);
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
    const yUnit = (GRAPH_PROPERTIES[this.graphType].unit === 'm/s') ? 'm/h' : GRAPH_PROPERTIES[this.graphType].unit;
    if (this.scaleX == 0 || this.scaleY == 0 || can.inDefaultState) {
      if (this.width == 0 || this.height == 0) return;
      this.scaleX = this.width / (this.maxX - this.minX);
      this.scaleY = this.height / (this.maxY - this.minY);
      this.xOrigin = - this.minX * this.scaleX;
      this.yOrigin = - this.minY * this.scaleY;
      const [xL, yL] = can.drawGrid(['s', yUnit], 'measure', [this.scaleX, this.scaleY], this.xOrigin, this.yOrigin);
      this.scaleX = (this.width - xL - 2) / (this.maxX - this.minX);
      this.scaleY = (this.height - yL - 2) / (this.maxY - this.minY);
      this.xOrigin = - this.minX * this.scaleX + xL;
      this.yOrigin = - this.minY * this.scaleY + yL;
    }

    can.drawGrid(['s', yUnit], true, [this.scaleX, this.scaleY], this.xOrigin, this.yOrigin);

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

    if (this.showLineTypeLegend && (this.graphType === 'energy' || this.graphType === 'forces')) {
      const [xL, yL] = can.drawGrid(['s', yUnit], 'measure', [this.scaleX, this.scaleY], this.xOrigin, this.yOrigin);
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.font = `${0.75 * can.pxToCanPx}em ${getComputedStyle(can.canvas).fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const lineTypes = {
        'energy' : [
          ['total energy', []],
          ['kinetic energy', [2, 2]],
          ['potential energy', [6, 2]],
          ['elastic energy', [4, 2]]
        ],
        'forces' : [
          ['current force', []],
          [`force averaged over ${numToUnitStr(this.forceAvgWindow, 's', 1)}`, [4, 2]]
        ]
      };
      const legendMetrics = [];
      const padding = ctx.measureText('o').width;
      const legendLineWidths = 7 * padding;
      let maxWidth = 0;
      let totalHeight = padding;
      for (const [legend, dash] of lineTypes[this.graphType]) {
        const metrics = ctx.measureText(legend);
        legendMetrics.push(metrics);
        const textW = metrics.width;
        const textH = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        maxWidth = Math.max(maxWidth, textW + (dash === null ? 0 : legendLineWidths + padding));
        totalHeight += textH + padding;
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(xL, this.height - yL - totalHeight, maxWidth + 2*padding, totalHeight);
      ctx.fillStyle = 'black';
      let ycoordLow = this.height - yL - padding;
      for (let i = lineTypes[this.graphType].length - 1; i >= 0; i--) {
        const [legend, dash] = lineTypes[this.graphType][i];
        const textH = legendMetrics[i].actualBoundingBoxAscent + legendMetrics[i].actualBoundingBoxDescent;
        if (dash !== null) {
          ctx.setLineDash(dash);
          ctx.beginPath();
          ctx.moveTo(Math.round(xL + padding), Math.round(ycoordLow - textH / 2));
          ctx.lineTo(Math.round(xL + padding + legendLineWidths), Math.round(ycoordLow - textH / 2));
          ctx.stroke();
          ctx.closePath();
          ctx.fillText(legend, xL + 2*padding + legendLineWidths, ycoordLow - legendMetrics[i].actualBoundingBoxDescent);
        } else {
          ctx.fillText(legend, xL + padding, ycoordLow - legendMetrics[i].actualBoundingBoxDescent);
        }
        ycoordLow -= textH + padding;
      }
      ctx.setLineDash([]);
    }

    can.drawGrid(['s', yUnit], false, [this.scaleX, this.scaleY], this.xOrigin, this.yOrigin);
  }

  /**
   * Destroy the zoomable canvas (remove canvas from parent)
   */
  destroy() {
    this.can.destroy();
  }
}
