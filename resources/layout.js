
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
    if (window.innerWidth / window.innerHeight < 0.8) this.flexContainer.classList.add('split-horizontal');
    else this.flexContainer.classList.add('split-vertical');
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
    this.headPanel.textContent = 'Climbing fall simulation';
    this.leftPanel.appendChild(this.headPanel);
    /** @type {HTMLDivElement} progress info panel */
    this.progressInfoPanel = document.createElement('div');
    this.headPanel.appendChild(this.progressInfoPanel);
    /** @type {HTMLSpanElement} progress info text */
    this.progressInfoText = document.createElement('span');
    this.progressInfoText.setAttribute('id', 'pinfo-text');
    this.progressInfoText.textContent = 'Please wait…';
    this.headPanel.appendChild(this.progressInfoText);
    const space = document.createElement('span');
    space.textContent = ' ';
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
    this.bodyPanel.textContent = '…';
    this.leftPanel.appendChild(this.bodyPanel);

    /** @type {HTMLDivElement[]} the subpanels of the right (or bottom) panel */
    this.rightSubpanels = [];
    for (let i = 0; i < 4; i++) {
      this.rightSubpanels.push(document.createElement('div'));
      this.rightSubpanels[i].classList.add('section');
      this.rightSubpanels[i].textContent = (i == 0) ? 'Simulation running…' : '…';
      this.rightPanel.appendChild(this.rightSubpanels[i]);
    }

    document.body.appendChild(this.flexContainer);

    /** @type {boolean} whether the resizer is currently dragged by the user */
    this.resizerIsDragged = false;
    /** @type {number} the id of the currently active pointer */
    this.activePointerId = null;
    const startDrag = (evt) => {
      if (evt.pointerType === 'mouse' && evt.button !== 0) return;
      evt.preventDefault();
      this.resizerIsDragged = true;
      this.activePointerId = evt.pointerId;
      this.draggableResizer.setPointerCapture(this.activePointerId);
      document.body.style.userSelect = 'none';
    };
    const processDrag = (evt) => {
      if (!this.resizerIsDragged || evt.pointerId !== this.activePointerId) return;
      if (this.flexContainer.classList.contains('split-vertical')) {
        const percent = Math.max(2, Math.min(98, (evt.clientX / window.innerWidth) * 100));
        this.leftPanel.style.flexBasis = percent + '%';
        this.rightPanel.style.flexBasis = (100 - percent) + '%';
      } else {
        const percent = Math.max(2, Math.min(98, (evt.clientY / window.innerHeight) * 100));
        this.leftPanel.style.flexBasis = percent + '%';
        this.rightPanel.style.flexBasis = (100 - percent) + '%';
      }
    };
    const stopDrag = (evt) => {
      const correctPointer = (typeof evt !== 'object') || (typeof evt.pointerId !== 'number') || (evt.pointerId === this.activePointerId);
      if (this.resizerIsDragged && correctPointer) {
        try { this.draggableResizer.releasePointerCapture(this.activePointerId); } catch (e) {  }
        this.resizerIsDragged = false;
        this.activePointerId = null;
        document.body.style.userSelect = 'auto';
      }
    };
    this.draggableResizer.addEventListener('pointerdown', evt => startDrag(evt));
    this.draggableResizer.addEventListener('pointermove', evt => processDrag(evt));
    this.draggableResizer.addEventListener('pointerup', evt => stopDrag(evt));
    this.draggableResizer.addEventListener('pointercancel', evt => stopDrag(evt));
    this.draggableResizer.addEventListener('lostpointercapture', evt => stopDrag(evt));
    window.addEventListener('blur', evt => stopDrag(evt));
    window.addEventListener('resize', () => {
      if (window.innerWidth / window.innerHeight < 0.8) {
        if (this.flexContainer.classList.contains('split-vertical')) {
          this.flexContainer.classList.remove('split-vertical');
          this.flexContainer.classList.add('split-horizontal');
        }
      } else {
        if (this.flexContainer.classList.contains('split-horizontal')) {
          this.flexContainer.classList.remove('split-horizontal');
          this.flexContainer.classList.add('split-vertical');
        }
      }
    });

    /** @type {number} index of the last drawn frame in the snapshots array */
    this.lastFrameDrawn = 0;
    /** @type {number} time at which the last frame was drawn in seconds (since 1970) */
    this.lastFrameGlobTime = 0;
    /** @type {number} simulation time of the last frame which was drawn */
    this.lastFrameSimTime = 0;
    /** @type {number} whether the animation of the simulation result is currently paused */
    this.isPaused = false;
    /** @type {WorldGraphics} the main simulation drawing utility */
    this.graphicsManager = null;
    /** @type {GraphCanvas[]} the graph drawing utilities */
    this.graphCanvases = [];
    /** @type {{time: number, bodies: ObjectSnapshot[]}[]} the captured simulation snapshots */
    this.snapshots = null;
    /** @type {number} frame rate of the snapshots in the snapshots array */
    this.snapshotFPS = 0;
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
        this.progressInfoText.textContent = `Progress: ${numToStr(i / numSteps * 100, 2, 5)} %, currently at time ${numToStr(i * GLOBALS.maxStep, 2, 11)} s`;
        if (!GLOBALS.interruptSimulation) {
          window.setTimeout(() => this.precalculatePositions(targetTime, FPS, snapshots, i, lastSnapshot), 10);
          return;
        } else {
          i++;
          break;
        }
      }
    }
    
    this.progressInfoText.textContent = `Simulation ${i-1 == numSteps ? '' : '(partially) '}completed, up to time ${numToStr((i-1) * GLOBALS.maxStep, 2, 11)} s`;
    
    this.previousFrameBtn = document.createElement('button');
    this.previousFrameBtn.classList.add('material-symbols-outlined');
    this.previousFrameBtn.classList.add('icon-button');
    this.previousFrameBtn.textContent = 'skip_previous';
    this.previousFrameBtn.addEventListener('click', () => {
      this.isPaused = true;
      this.playPauseBtn.textContent = 'play_arrow';
      this.lastFrameDrawn = (this.lastFrameDrawn + this.snapshots.length - 1) % this.snapshots.length;
      this.lastFrameSimTime = this.snapshots[this.lastFrameDrawn].time;
      this.drawSnapshotAtIndex(this.lastFrameDrawn);
    });
    this.nextFrameBtn = document.createElement('button');
    this.nextFrameBtn.classList.add('material-symbols-outlined');
    this.nextFrameBtn.classList.add('icon-button');
    this.nextFrameBtn.textContent = 'skip_next';
    this.nextFrameBtn.addEventListener('click', () => {
      this.isPaused = true;
      this.playPauseBtn.textContent = 'play_arrow';
      this.lastFrameDrawn = (this.lastFrameDrawn + 1) % this.snapshots.length;
      this.lastFrameSimTime = this.snapshots[this.lastFrameDrawn].time;
      this.drawSnapshotAtIndex(this.lastFrameDrawn);
    });
    this.playPauseBtn = document.createElement('button');
    this.playPauseBtn.classList.add('material-symbols-outlined');
    this.playPauseBtn.classList.add('icon-button');
    this.playPauseBtn.textContent = 'pause'; // or play_arrow
    this.playPauseBtn.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      if (this.isPaused) {
        this.playPauseBtn.textContent = 'play_arrow';
      } else {
        this.playPauseBtn.textContent = 'pause';
        this.lastFrameGlobTime = (new Date()).getTime() / 1000;
        window.requestAnimationFrame(() => this.playInLoop());
      }
    });
    this.rightSubpanels[0].replaceChildren();
    this.rightSubpanels[0].appendChild(this.previousFrameBtn);
    this.rightSubpanels[0].appendChild(this.playPauseBtn);
    this.rightSubpanels[0].appendChild(this.nextFrameBtn);

    this.graphCanvases.push(
      new GraphCanvas(this.rightSubpanels[1], snapshots, 'forces')
    );
    this.graphCanvases.push(
      new GraphCanvas(this.rightSubpanels[2], snapshots, 'energy')
    );
    this.graphCanvases.push(
      new GraphCanvas(this.rightSubpanels[3], snapshots, 'positions')
    );
    
    this.lastFrameGlobTime = (new Date()).getTime() / 1000;
    this.lastFrameSimTime = 0;
    this.snapshots = snapshots;
    this.snapshotFPS = FPS;
    window.requestAnimationFrame(() => this.playInLoop());
  }

  /**
   * Animate the simulation results in a loop
   */
  playInLoop() {
    if (this.isPaused) return;
    const currentGlobalTime = (new Date()).getTime() / 1000;
    const currentSimulationTime = this.lastFrameSimTime + (currentGlobalTime - this.lastFrameGlobTime);
    const currentSnapshotIndex = Math.round(currentSimulationTime * this.snapshotFPS) % this.snapshots.length; // TODO: adapt this if non-uniform step sizes are allowed
    this.drawSnapshotAtIndex(currentSnapshotIndex);
    this.lastFrameDrawn = currentSnapshotIndex;
    this.lastFrameGlobTime = currentGlobalTime;
    this.lastFrameSimTime = currentSimulationTime;
    window.requestAnimationFrame(() => this.playInLoop());
  }

  /**
   * Draw the snapshot at a given index
   * @param {number} idx the snapshot index
   */
  drawSnapshotAtIndex(idx) {
    const cSnapshot = this.snapshots[idx];
    if (this.graphicsManager === null)
      this.graphicsManager = new WorldGraphics(this.bodyPanel);
    this.graphicsManager.drawSnapshot(cSnapshot.bodies, cSnapshot.time);
    for (const graphCan of this.graphCanvases) {
      graphCan.currentTime = cSnapshot.time;
      graphCan.draw();
    }
  }
}
