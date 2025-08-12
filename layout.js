
/**
 * Page layout for displaying the progress and result of the fall simulation
 */
class FallSimulationLayout {
  /**
   * Create a new page layout for the fall simulation, and start the calculation.
   * The simulation must have been properly initialized first in the GLOBALS object.
   * In particular, GLOBALS.rope, GLOBALS.bodies, and GLOBALS.maxStep must be set properly.
   */
  constructor() {
    /** @type {HTMLDivElement} overall layout container */
    this.flexContainer = document.createElement('div');
    this.flexContainer.setAttribute('id', 'flex-container');
    this.flexContainer.classList.add('split-vertical');
    /** @type {HTMLDivElement} left (or top) panel */
    this.leftPanel = document.createElement('div');
    this.leftPanel.classList.add('panel');
    this.leftPanel.classList.add('panel-left');
    this.flexContainer.appendChild(this.leftPanel);
    /** @type {HTMLDivElement} draggable resize element */
    this.draggableResizer = document.createElement('div');
    this.draggableResizer.classList.add('resizer');
    this.flexContainer.appendChild(this.draggableResizer);
    /** @type {HTMLDivElement} right (or bottom) panel */
    this.rightPanel = document.createElement('div');
    this.rightPanel.classList.add('panel');
    this.rightPanel.classList.add('panel-right');
    this.flexContainer.appendChild(this.rightPanel);

    /** @type {HTMLDivElement} head panel with general information / headline */
    this.headPanel = document.createElement('div');
    this.headPanel.classList.add('left-head');
    this.headPanel.innerText = 'Climbing fall simulation';
    this.leftPanel.appendChild(this.headPanel);
    /** @type {HTMLDivElement} progress info panel */
    this.progressInfoPanel = document.createElement('div');
    this.headPanel.appendChild(this.progressInfoPanel);
    /** @type {HTMLSpanElement} progress info text */
    this.progressInfoText = document.createElement('span');
    this.progressInfoText.setAttribute('id', 'pinfo-text');
    this.progressInfoText.innerHTML = 'Please wait&hellip;';
    this.headPanel.appendChild(this.progressInfoText);
    const space = document.createElement('span');
    space.innerText = ' ';
    this.headPanel.appendChild(space);
    /** @type {HTMLInputElement} button for stopping the calculation */
    this.stopCalculationBtn = document.createElement('input');
    this.stopCalculationBtn.setAttribute('type', 'button');
    this.stopCalculationBtn.setAttribute('value', 'Stop');
    this.stopCalculationBtn.setAttribute('onclick', 'GLOBALS.interruptSimulation = true;');
    this.headPanel.appendChild(this.stopCalculationBtn);
    /** @type {HTMLDivElement} main body panel (displays the simulation result) */
    this.bodyPanel = document.createElement('div');
    this.bodyPanel.classList.add('left-body');
    this.bodyPanel.setAttribute('id', 'main-canvas-container');
    this.bodyPanel.innerHTML = '&hellip;';
    this.leftPanel.appendChild(this.bodyPanel);

    /** @type {HTMLDivElement[]} the subpanels of the right (or bottom) panel */
    this.rightSubpanels = [];
    for (let i = 0; i < 4; i++) {
      this.rightSubpanels.push(document.createElement('div'));
      this.rightSubpanels[i].classList.add('section');
      this.rightSubpanels[i].innerHTML = (i == 0) ? 'Simulation running&hellip;' : '&hellip;';
      this.rightPanel.appendChild(this.rightSubpanels[i]);
    }

    document.body.appendChild(this.flexContainer);

    /** @type {number} time at which the simulation playback was started in seconds (since 1970) */
    this.playbackStart = 0;
    /** @type {WorldGraphics} the main simulation drawing utility */
    this.graphicsManager = null;
    /** @type {GraphCanvas[]} the graph drawing utilities */
    this.graphCanvases = [];
  }

  /**
   * Run the simulation and save the body positions. Once the simulation is complete, the animation loop is started.
   * @param {number} targetTime the duration (in seconds) for which the simulation should be run
   * @param {number} [FPS=40] the frame rate at which snapshots should be captured
   * @param {{time: number, bodies: ObjectSnapshot[]}[]} [prevSnapshots] array of snapshots that were already captured
   * @param {number} [stepsDone=0] number of simulation steps that were already executed
   * @param {number} [lastSnapshot=0] simulation time (in seconds) at which the last snapshot was captured
   */
  precalculatePositions(targetTime, FPS = 40, prevSnapshots = [], stepsDone = 0, lastSnapshot = 0) {
    const lastTime = (new Date()).getTime();
    const snapshots = [...prevSnapshots];
    const addSnapshot = (t) => {
      const bodyArr = [];
      for (const body of GLOBALS.bodies) {
        bodyArr.push(body.captureSnapshot());
      }
      snapshots.push({
        time: t,
        bodies: bodyArr
      });
    };

    if (prevSnapshots.length == 0) {
      GLOBALS.rope.applyGravity(GRAVITY_VEC);
      GLOBALS.rope.applyRopeForces();
      addSnapshot(0);
    }
    const numSteps = Math.ceil(targetTime / GLOBALS.maxStep);
    let i = stepsDone + 1;
    for (; i <= numSteps; i++) {
      GLOBALS.rope.timeStep(GLOBALS.maxStep);
      ensureBarrierConstraints();
      GLOBALS.rope.applyGravity(GRAVITY_VEC);
      GLOBALS.rope.applyRopeForces();
      if (i * GLOBALS.maxStep - lastSnapshot >= 1 / FPS) {
        addSnapshot(i * GLOBALS.maxStep);
        lastSnapshot = i * GLOBALS.maxStep;
      }
      if ((new Date()).getTime() - lastTime > 500) {
        this.progressInfoText.innerText = `Progress: ${numToStr(i / numSteps * 100, 2, 5)} %, currently at time ${numToStr(i * GLOBALS.maxStep, 2, 11)} s`;
        if (!GLOBALS.interruptSimulation) {
          window.setTimeout(() => this.precalculatePositions(targetTime, FPS, snapshots, i, lastSnapshot), 10);
          return;
        } else {
          i++;
          break;
        }
      }
    }
    
    this.progressInfoText.innerText = `Simulation ${i-1 == numSteps ? '' : '(partially) '}completed, up to time ${numToStr((i-1) * GLOBALS.maxStep, 2, 11)} s`;
    this.rightSubpanels[0].innerHTML = 'Playback control to appear here&hellip;';
    this.graphCanvases.push(
      new GraphCanvas(this.rightSubpanels[1], snapshots, 'forces')
    );
    this.graphCanvases.push(
      new GraphCanvas(this.rightSubpanels[2], snapshots, 'energy')
    );
    this.graphCanvases.push(
      new GraphCanvas(this.rightSubpanels[3], snapshots, 'positions')
    );
    
    this.playbackStart = (new Date()).getTime() / 1000;
    window.requestAnimationFrame(() => this.playInLoop(snapshots, FPS));
  }

  /**
   * Animate the simulation results in a loop
   * @param {{time: number, bodies: ObjectSnapshot[]}[]} snapshots the captured snapshots
   * @param {number} FPS the frame rate at which the snapshots were captured
   */
  playInLoop(snapshots, FPS) {
    const cTime = /*GLOBALS.slowMotion * */ ((new Date()).getTime() / 1000 - this.playbackStart);

    const cSnapshot = snapshots[Math.round(cTime * FPS) % snapshots.length]; // TODO: adapt this if non-uniform step sizes are allowed
    if (this.graphicsManager === null)
      this.graphicsManager = new WorldGraphics(this.bodyPanel);
    this.graphicsManager.drawSnapshot(cSnapshot.bodies, cSnapshot.time);
    for (const graphCan of this.graphCanvases) {
      graphCan.currentTime = cSnapshot.time;
      graphCan.draw();
    }

    window.requestAnimationFrame(() => this.playInLoop(snapshots, FPS));
  }
}
