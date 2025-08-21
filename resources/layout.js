
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
    /** @type {HTMLDivElement[]} main body panels (display the simulation result) */
    this.bodyPanels = [];

    /** @type {HTMLDivElement[]} the subpanels of the right (or bottom) panel */
    this.rightSubpanels = [];
    this.rightSubpanels.push(document.createElement('div'));
    this.rightSubpanels[0].classList.add('section');
    this.rightSubpanels[0].textContent = 'Simulation running…';
    this.rightPanel.appendChild(this.rightSubpanels[0]);
    this.adjustPanelNumber(1, 1);

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
    /** @type {WorldGraphics[]} the main simulation drawing utilities (potential from multiple perspectives) */
    this.graphicsManagers = [];
    /** @type {GraphCanvas[]} the graph drawing utilities */
    this.graphCanvases = [];
    /** @type {{time: number, bodies: ObjectSnapshot[]}[]} the captured simulation snapshots */
    this.snapshots = null;
    /** @type {number} frame rate of the snapshots in the snapshots array */
    this.snapshotFPS = 0;
    /** @type {number} actual number of seconds for which the simulation was run */
    this.simulationDuration = 0;
    /** @type {number} current speed at which the animation should be run */
    this.currentAnimationSpeed = 1;
    /** @type {HTMLDivElement|null} the progress bar used to display the simulation progress */
    this.progressBar = null;
    /** @type {HTMLSpanElement|null} the hint text associated to the progress bar */
    this.progressBarText = null;
  }

  /**
   * Adjust how many panels should be visible
   * @param {number} leftPanelNum the number of panels on the left side (not counting the topmost panel with information text)
   * @param {number} rightPanelNum the number of panels on the right side (not counting the topmost panel with playback controls)
   */
  adjustPanelNumber(leftPanelNum, rightPanelNum) {
    while (this.bodyPanels.length > leftPanelNum) {
      this.leftPanel.removeChild(this.bodyPanels.pop());
      if (this.graphicsManagers.length > 0)
        this.graphicsManagers.pop();
    }
    while (this.bodyPanels.length < leftPanelNum) {
      this.bodyPanels.push(document.createElement('div'));
      const i = this.bodyPanels.length - 1;
      this.bodyPanels[i].classList.add('left-body');
      this.bodyPanels[i].setAttribute('id', `main-canvas-container-${i}`);
      this.bodyPanels[i].textContent = '…';
      this.leftPanel.appendChild(this.bodyPanels[i]);
    }
    while (this.rightSubpanels.length > rightPanelNum + 1) {
      this.rightPanel.removeChild(this.rightSubpanels.pop());
      if (this.graphCanvases.length > 0)
        this.graphCanvases.pop();
    }
    while (this.rightSubpanels.length < rightPanelNum + 1) {
      this.rightSubpanels.push(document.createElement('div'));
      const i = this.rightSubpanels.length - 1;
      this.rightSubpanels[i].classList.add('section');
      this.rightSubpanels[i].textContent = '…';
      this.rightPanel.appendChild(this.rightSubpanels[i]);
    }
    // TODO: should we also create new graphics managers and graph canvases here?
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
    if (prevSnapshots.length === 0 && stepsDone === 0 && lastSnapshot === 0) {
      this.adjustPanelNumber(1, 1);
      this.bodyPanels[0].replaceChildren();

      const hintText = document.createElement('div');
      hintText.textContent = 'Simulation progress: ';
      this.progressBarText = document.createElement('span');
      this.progressBarText.textContent = '0 %';
      hintText.appendChild(this.progressBarText);
      hintText.style.textAlign = 'center';
      hintText.style.marginBlock = '1em';
      this.bodyPanels[0].appendChild(hintText);

      const progrBar = document.createElement('div');
      progrBar.classList.add('progress-bar-outer');
      progrBar.style.width = '50%';
      this.progressBar = document.createElement('div');
      this.progressBar.classList.add('progress-bar-inner');
      this.progressBar.style.width = '0%';
      progrBar.appendChild(this.progressBar);
      this.bodyPanels[0].appendChild(progrBar);
    }
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
        if (this.progressBar !== null)
          this.progressBar.style.width = `${i / numSteps * 100}%`;
        if (this.progressBarText !== null)
          this.progressBarText.textContent = `${numToStr(i / numSteps * 100, 2, 5)} %`;
        this.progressInfoText.textContent = `Progress: ${numToStr(i / numSteps * 100, 2, 5)} %, currently at time ${numToStr(i * GLOBALS.maxStep, 2, 11)} s`;
        if (!GLOBALS.interruptSimulation) {
          window.setTimeout(() => this.precalculatePositions(targetTime, FPS, snapshots, i, lastSnapshot), 10);
          return;
        } else {
          i++;
          break;
        }
      }
      this.simulationDuration = i * GLOBALS.maxStep;
    }
    
    this.progressInfoText.textContent = `Simulation ${i-1 == numSteps ? '' : '(partially) '}completed, up to time ${numToStr((i-1) * GLOBALS.maxStep, 2, 11)} s`;
    
    this.adjustPanelNumber(2, 3);
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
    this.selectPlaybackSpeed = document.createElement('select');
    const opt1 = document.createElement('option'); opt1.textContent = '1×'; opt1.setAttribute('value', '1'); opt1.setAttribute('selected', 'selected');
    const opt2 = document.createElement('option'); opt2.textContent = '0.5×'; opt2.setAttribute('value', '1/2');
    const opt3 = document.createElement('option'); opt3.textContent = '0.25×'; opt3.setAttribute('value', '1/4');
    const opt4 = document.createElement('option'); opt4.textContent = '0.125×'; opt4.setAttribute('value', '1/8');
    this.selectPlaybackSpeed.classList.add('size-to-icon-button');
    this.selectPlaybackSpeed.appendChild(opt1);
    this.selectPlaybackSpeed.appendChild(opt2);
    this.selectPlaybackSpeed.appendChild(opt3);
    this.selectPlaybackSpeed.appendChild(opt4);
    this.selectPlaybackSpeed.addEventListener('change', () => {
      if (this.selectPlaybackSpeed.value === '1') this.currentAnimationSpeed = 1;
      else if (this.selectPlaybackSpeed.value === '1/2') this.currentAnimationSpeed = 0.5;
      else if (this.selectPlaybackSpeed.value === '1/4') this.currentAnimationSpeed = 0.25;
      else if (this.selectPlaybackSpeed.value === '1/8') this.currentAnimationSpeed = 0.125;
    });
    this.rightSubpanels[0].replaceChildren();
    this.rightSubpanels[0].appendChild(this.previousFrameBtn);
    this.rightSubpanels[0].appendChild(this.playPauseBtn);
    this.rightSubpanels[0].appendChild(this.selectPlaybackSpeed);
    this.rightSubpanels[0].appendChild(this.nextFrameBtn);

    const graphTypes = ['forces', 'energy', 'positions']; // + 'speed'
    for (let i = 1; i < this.rightSubpanels.length; i++) {
      this.graphCanvases.push(
        new GraphCanvas(this.rightSubpanels[i], snapshots, graphTypes[(i-1) % graphTypes.length])
      );
    }
    
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
    const currentSimulationTime = (this.lastFrameSimTime + (currentGlobalTime - this.lastFrameGlobTime) * this.currentAnimationSpeed) % this.simulationDuration;
    const csiGuess = Math.round(currentSimulationTime * this.snapshotFPS) % this.snapshots.length;
    const nextIdx = (csiGuess + 1) % this.snapshots.length;
    const prevIdx = (csiGuess + this.snapshots.length - 1) % this.snapshots.length;
    let currentSnapshotIndex = csiGuess;
    if (Math.abs(this.snapshots[nextIdx].time - currentSimulationTime) < Math.abs(this.snapshots[csiGuess].time - currentSimulationTime)
        || Math.abs(this.snapshots[prevIdx].time - currentSimulationTime) < Math.abs(this.snapshots[csiGuess].time - currentSimulationTime)) {
      let low = 0;
      let high = this.snapshots.length - 1;
      if (this.snapshots[csiGuess].time < currentSimulationTime) low = csiGuess;
      else high = csiGuess;
      while (high - low > 1) {
        const mid = Math.ceil((low + high) / 2);
        if (this.snapshots[mid].time < currentSimulationTime) low = mid;
        else high = mid;
      }
      if (Math.abs(this.snapshots[low].time - currentSimulationTime) < Math.abs(this.snapshots[high].time - currentSimulationTime))
        currentSnapshotIndex = low;
      else
        currentSnapshotIndex = high;
    }
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
    if (this.graphicsManagers.length === 0) {
      for (let i = 0; i < this.bodyPanels.length; i++) {
        this.graphicsManagers.push(new WorldGraphics(this.bodyPanels[i], (i % 2 == 0)));
      }
    }
    for (const graphicsManager of this.graphicsManagers)
      graphicsManager.drawSnapshot(cSnapshot.bodies, cSnapshot.time);
    for (const graphCan of this.graphCanvases) {
      graphCan.currentTime = cSnapshot.time;
      graphCan.draw();
    }
  }
}
