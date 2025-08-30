
/**
 * Page layout for displaying the progress and result of the fall simulation
 */
class FallSimulationLayout {
  /**
   * Create a new page layout for the fall simulation and the setup of the simulation.
   * Attention: this object should only be created once, and it does expect the setup UI to be present directly within the HTML body already, under the id #setup-mask,
   * as well as the menu UI to be present under the id #simulation-menu.
   */
  constructor() {
    /** @type {HTMLDivElement} overall layout container */
    this.flexContainer = document.createElement('div');
    this.flexContainer.setAttribute('id', 'flex-container');
    /** @type {number} 0 = default setting, 1 = show less elements (because of a small display), 2 = show even less elements */
    this.saveSpace = 0;
    if (window.innerWidth / window.innerHeight < 0.8) {
      this.flexContainer.classList.add('split-horizontal');
      if (window.innerHeight <= 1000) {
        document.body.classList.add('save-space');
        this.saveSpace = 1;
        if (window.innerHeight <= 750)
          this.saveSpace = 2;
      }
    } else {
      this.flexContainer.classList.add('split-vertical');
      if (window.innerHeight <= 600) {
        document.body.classList.add('save-space');
        this.saveSpace = 1;
        if (window.innerHeight <= 400)
          this.saveSpace = 2;
      }
    }
    /** @type {HTMLDivElement} left (or top) panel */
    this.leftPanel = document.createElement('div');
    this.leftPanel.classList.add('panel');
    this.leftPanel.classList.add('panel-left');
    this.flexContainer.appendChild(this.leftPanel);
    /** @type {HTMLDivElement} draggable resize element */
    this.draggableResizer = document.createElement('div');
    this.draggableResizer.classList.add('resizer');
    const resizerBullets = document.createElement('div');
    resizerBullets.classList.add('resizer-bullets');
    resizerBullets.textContent = '••••';
    this.draggableResizer.appendChild(resizerBullets);
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
    /** @type {HTMLDivElement[]} main body panels (display the simulation result) */
    this.bodyPanels = [];

    /** @type {HTMLDivElement[]} the subpanels of the right (or bottom) panel */
    this.rightSubpanels = [];
    this.rightSubpanels.push(document.createElement('div'));
    this.rightSubpanels[0].classList.add('section');
    this.rightSubpanels[0].textContent = 'Please wait…';
    this.rightPanel.appendChild(this.rightSubpanels[0]);
    this.adjustPanelNumber(1, 1);

    document.body.appendChild(this.flexContainer);

    /** @type {HTMLDivElement} the div element containing the UI for the simulation parameter selection */
    this.setupMask = document.getElementById('setup-mask');
    if (this.setupMask === null)
      throw new Error('FallSimulationLayout expects a node with id setup-mask to be present directly in the HTML body!');
    document.body.removeChild(this.setupMask);

    /** @type {HTMLDivElement} the div element containing the UI for the simulation menu (which can be accessed when viewing simulation results) */
    this.simulationMenu = document.getElementById('simulation-menu');
    if (this.simulationMenu === null)
      throw new Error('FallSimulationLayout expects a node with id simulation-menu to be present directly in the HTML body!');
    this.simulationMenu.style.display = 'none';

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
        if (window.innerHeight <= 1000) {
          document.body.classList.add('save-space');
          this.saveSpace = 1;
          if (window.innerHeight <= 750)
            this.saveSpace = 2;
        } else {
          document.body.classList.remove('save-space');
          this.saveSpace = 0;
        }
      } else {
        if (this.flexContainer.classList.contains('split-horizontal')) {
          this.flexContainer.classList.remove('split-horizontal');
          this.flexContainer.classList.add('split-vertical');
        }
        if (window.innerHeight <= 600) {
          document.body.classList.add('save-space');
          this.saveSpace = 1;
          if (window.innerHeight <= 400)
            this.saveSpace = 2;
        } else {
          document.body.classList.remove('save-space');
          this.saveSpace = 0;
        }
      }
      this.updatePanelsAfterResize();
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
    /** @type {WorldGraphics[]} the simulation preview drawing utilities */
    this.previewManagers = [];
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
    /** @type {HTMLDivElement|null} progress info panel */
    this.progressInfoPanel = null;
    /** @type {HTMLSpanElement|null} progress info text */
    this.progressInfoText = null;
    /** @type {HTMLInputElement|null} button for stopping the calculation */
    this.stopCalculationBtn = null;
    /** @type {boolean} whether the layout has already been switched to the simulation result layout */
    this.inSimResLayout = false;
  }

  /**
   * Adjust how many panels should be visible
   * @param {number} leftPanelNum the number of panels on the left side (not counting the topmost panel with information text)
   * @param {number} rightPanelNum the number of panels on the right side (not counting the topmost panel with playback controls)
   * @param {boolean} [resetStyle=false] wheter the CSS style of the left and right panels should be reset
   */
  adjustPanelNumber(leftPanelNum, rightPanelNum, resetStyle = false) {
    while (this.bodyPanels.length > leftPanelNum) {
      while (this.graphicsManagers.length > this.bodyPanels.length - 1)
        this.graphicsManagers.pop().destroy();
      this.leftPanel.removeChild(this.bodyPanels.pop());
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
      while (this.graphCanvases.length > this.rightSubpanels.length - 2)
        this.graphCanvases.pop().destroy();
      this.rightPanel.removeChild(this.rightSubpanels.pop());
    }
    while (this.rightSubpanels.length < rightPanelNum + 1) {
      this.rightSubpanels.push(document.createElement('div'));
      const i = this.rightSubpanels.length - 1;
      this.rightSubpanels[i].classList.add('section');
      this.rightSubpanels[i].textContent = '…';
      this.rightPanel.appendChild(this.rightSubpanels[i]);
    }
    if (resetStyle) {
      for (let i = 0; i < this.bodyPanels.length; i++) {
        this.bodyPanels[i].style.overflow = 'visible';
        this.bodyPanels[i].style.justifyContent = 'center';
        this.bodyPanels[i].style.alignItems = 'center';
        this.bodyPanels[i].style.contain = 'none';
      }
      for (let i = 1; i < this.rightSubpanels.length; i++) {
        this.rightSubpanels[i].style.overflow = 'visible';
        this.rightSubpanels[i].style.justifyContent = 'center';
        this.rightSubpanels[i].style.alignItems = 'center';
        this.rightSubpanels[i].style.contain = 'none';
      }
    }
  }

  /**
   * Should be called after a window resize to adjust the panel number
   */
  updatePanelsAfterResize() {
    if (this.inSimResLayout) {
      if (this.saveSpace == 0) {
        if (this.bodyPanels.length != 2 || this.rightSubpanels.length != 4)
          this.adjustPanelNumber(2, 3);
      } else if (this.saveSpace == 1) {
        if (this.bodyPanels.length != 1 || this.rightSubpanels.length != 3)
          this.adjustPanelNumber(1, 2);
      } else {
        if (this.bodyPanels.length != 1 || this.rightSubpanels.length != 2)
          this.adjustPanelNumber(1, 1);
      }

      const graphTypes = ['forces', 'energy', 'positions', 'speed'];
      for (let i = 1 + this.graphCanvases.length; i < this.rightSubpanels.length; i++) {
        this.graphCanvases.push(
          new GraphCanvas(this.rightSubpanels[i], this.snapshots, graphTypes[(i-1) % graphTypes.length])
        );
        this.graphCanvases[i-1].currentTime = this.lastFrameSimTime;
        this.graphCanvases[i-1].draw();
      }
      const drawSnapshot = (this.graphicsManagers.length < this.bodyPanels.length);
      for (let i = this.graphicsManagers.length; i < this.bodyPanels.length; i++) {
        this.graphicsManagers.push(new WorldGraphics(this.bodyPanels[i], (i % 2 == 0)));
      }
      if (drawSnapshot)
        this.drawSnapshotAtIndex(this.lastFrameDrawn);
    }
  }

  /**
   * Setup the layout used to allow the user to choose the simulation parameters
   * @param {object} [defaultSettings] an object containing the default values for all the inputs (useful if the user pre-loaded a configuration)
   */
  setupInitializationLayout(defaultSettings = {}) {
    this.adjustPanelNumber(1, 2, true);
    
    this.headPanel.textContent = 'Climbing fall simulation – Setup';
    this.rightSubpanels[0].textContent = 'Setup preview';
    for (let i = 1; i < this.rightSubpanels.length; i++) {
      this.previewManagers.push(new WorldGraphics(this.rightSubpanels[i], (i % 2 != 0)));
    }
    this.bodyPanels[0].replaceChildren(this.setupMask);
    this.bodyPanels[0].style.overflow = 'auto';
    this.bodyPanels[0].style.justifyContent = 'start';
    this.bodyPanels[0].style.alignItems = 'start';
    /** @type {object} an object with the current default setup settings */
    this.setupMaskDefaultSettings = { ...defaultSettings };
    delete this.setupMaskDefaultSettings['version'];
    delete this.setupMaskDefaultSettings['versionDate'];
    changeSetupDefaults(this.setupMaskDefaultSettings);

    document.getElementById('version-info').textContent = `(v${GLOBALS.version} from ${GLOBALS.versionDate})`;

    /** @type {HTMLDivElement[]} all the .setup-step elements in the setup workflow */
    this.stepElements = this.setupMask.getElementsByClassName('setup-step');
    /** @type {HTMLFormElement[]} all the form elements for every step in the setup workflow, same order as in the stepElements property */
    this.stepForms = [];
    /** @type {string[]} all the ids of the form elements for every step in the setup workflow, same order as in the stepForms property */
    this.stepFormTypes = [];
    /** @type {number} the current step in the setup workflow */
    this.currentSetupStep = 0;
    /** @type {object} an object with the current setup settings */
    this.setupMaskSettings = {
      version: GLOBALS.version,
      versionDate: GLOBALS.versionDate
    };

    const getDeleteButton = () => { // create a delete button
      const button = document.createElement('button');
      button.setAttribute('type', 'button');
      button.classList.add('material-symbols-outlined');
      button.classList.add('icon-button');
      button.textContent = 'delete_forever';
      button.setAttribute('title', 'Delete forever (cannot be undone)');
      return button;
    };

    const updatePhysicsStepSizeHint = () => { // update hint for step size of physics engine
      if (document.getElementById('physics-step-size-info') !== null) {
        const ropeSegments = GLOBALS.ropeSegmentNum;
        const ropeMass = GLOBALS.rope.mass;
        const segmentLength = GLOBALS.rope.defaultSegmentLength;
        const minSegmentLength = GLOBALS.rope.minSegmentLength;
        const percentage = numToStr(100 * minSegmentLength / segmentLength) + ' %';
        const segmentMass = ropeMass / ropeSegments;
        const stepSize = GLOBALS.maxStep;
        const segAccPerStep = stepSize * 5000 / segmentMass; // assume max. force of 5 kN
        const segMovementPerStep = stepSize * 50 / 3.6; // assume max. speed of 50 km/h
        const infoString = `If you assume that the attained speeds of the objects in the simulation do not exceed 50 km/h, then one rope segment may move by at most ${
          numToUnitStr(segMovementPerStep, 'm', 1)} during one simulation step of length ${
          numToUnitStr(stepSize, 's', 1)}. If this value exceeds ${percentage} of the rope segment length, that is, ${
          numToUnitStr(minSegmentLength, 'm', 1)}, instabilities in the simulation may occur. If the attained forces do not exceed 5 kN, then one rope segment's speed may increase by at most ${
          numToUnitStr(segAccPerStep, 'm', 1)}/s during one simulation step. This value should also be of a reasonable size.`;
        document.getElementById('physics-step-size-info').textContent = infoString;
      }
    };

    const drawPreview = (idx) => { // draw setup preview (and update physics step size hint)
      return (evt) => {
        if (idx !== this.currentSetupStep) return;
        if (evt.target && (evt.target.getAttribute('id') === 'draw-number' || evt.target.getAttribute('id') === 'last-draw-height' || evt.target.getAttribute('id') === 'climber-sideways')) {
          const drawSetupStep = this.stepFormTypes.indexOf('draw-setup');
          if (drawSetupStep != -1 && drawSetupStep > this.currentSetupStep) {
            const table = this.stepForms[drawSetupStep].getElementsByClassName('step-form-table')[0];
            table.replaceChildren(table.getElementsByTagName('tr')[0], table.getElementsByTagName('tr')[1], table.getElementsByTagName('tr')[2]);
          }
        }
        const currentSettings = this.setupMaskSettings;
        const allSettings = fillWithRemainingSteps(this.currentSetupStep, currentSettings, this.setupMaskDefaultSettings);
        this.setupMaskSettings = allSettings;
        this.prepareAndStartSimulation(false);
        this.setupMaskSettings = currentSettings;
        const bodyArr = [];
        for (const body of GLOBALS.bodies) {
          bodyArr.push(body.captureSnapshot());
        }
        for (const pm of this.previewManagers)
          pm.drawSnapshot(bodyArr, 0);
        if (this.stepFormTypes[this.currentSetupStep] === 'physics-setup') {
          updatePhysicsStepSizeHint();
        }
      };
    };

    const formSubmitEvtListener = (idx) => { // go to next setup step
      return (evt) => {
        evt.preventDefault();
        if (idx !== this.currentSetupStep) return;
        if (this.currentSetupStep === this.stepElements.length - 1) {
          verifySetupMaskStep(this.currentSetupStep, this.setupMaskSettings);
          this.prepareAndStartSimulation();
        } else {
          verifySetupMaskStep(this.currentSetupStep, this.setupMaskSettings);
          this.stepElements[this.currentSetupStep].getElementsByClassName('step-header')[0].style.color = '#4d884e';
          this.stepElements[this.currentSetupStep].getElementsByClassName('step-done')[0].style.opacity = '1';
          this.stepElements[this.currentSetupStep].getElementsByClassName('step-body')[0].style.display = 'none';
          this.currentSetupStep++;

          if (this.stepFormTypes[this.currentSetupStep] === 'draw-setup') { // draw setup step
            const numDraws = this.setupMaskSettings['draw-number'];
            const table = this.stepForms[this.currentSetupStep].getElementsByClassName('step-form-table')[0];
            table.replaceChildren(table.getElementsByTagName('tr')[0], table.getElementsByTagName('tr')[1], table.getElementsByTagName('tr')[2]);
            table.style.marginBottom = '1em';

            if (numDraws == 0) {
              const tr = document.createElement('tr');
              const td = document.createElement('td');
              td.setAttribute('colspan', '2');
              td.classList.add('fullwidth-text');
              td.textContent = 'There is nothing to do here, as you specified that no draws have been clipped.';
              tr.appendChild(td);
              table.appendChild(tr);

            } else {
              for (let i = 0; i < numDraws; i++) {
                const tr = document.createElement('tr');
                const leftTd = document.createElement('td');
                const label = document.createElement('label');
                label.setAttribute('for', `draw-${i}-height`);
                label.textContent = `Height of draw ${(i+1)}:`;
                leftTd.appendChild(label);
                const rightTd = document.createElement('td');
                const input = document.createElement('input');
                input.setAttribute('id', `draw-${i}-height`);
                input.setAttribute('type', 'number');
                input.setAttribute('min', '-2');
                input.setAttribute('max', '50');
                input.setAttribute('step', '0.01');
                if (i == numDraws - 1) input.setAttribute('disabled', 'disabled');
                input.value = this.setupMaskDefaultSettings.hasOwnProperty(`draw-${i}-height`)
                  ? this.setupMaskDefaultSettings[`draw-${i}-height`]
                  : Math.round(100 * (i+1) * this.setupMaskSettings['last-draw-height'] / numDraws) / 100;
                input.defaultValue = this.setupMaskDefaultSettings.hasOwnProperty(`draw-${i}-height`)
                  ? this.setupMaskDefaultSettings[`draw-${i}-height`]
                  : Math.round(100 * (i+1) * this.setupMaskSettings['last-draw-height'] / numDraws) / 100;
                const units = document.createElement('span');
                units.textContent = ' meters';
                rightTd.appendChild(input);
                rightTd.appendChild(units);
                tr.appendChild(leftTd);
                tr.appendChild(rightTd);
                table.appendChild(tr);
                
                const tr2 = document.createElement('tr');
                const leftTd2 = document.createElement('td');
                const label2 = document.createElement('label');
                label2.setAttribute('for', `draw-${i}-sideways`);
                label2.textContent = `Sideways shift of draw ${(i+1)}:`;
                leftTd2.appendChild(label2);
                const rightTd2 = document.createElement('td');
                const input2 = document.createElement('input');
                input2.setAttribute('id', `draw-${i}-sideways`);
                input2.setAttribute('type', 'number');
                input2.setAttribute('min', '-25');
                input2.setAttribute('max', '25');
                input2.setAttribute('step', '0.01');
                input2.value = this.setupMaskDefaultSettings.hasOwnProperty(`draw-${i}-sideways`)
                  ? this.setupMaskDefaultSettings[`draw-${i}-sideways`]
                  : Math.round(100 * (i+1) * this.setupMaskSettings['climber-sideways'] / (numDraws + 1)) / 100;
                input2.defaultValue = this.setupMaskDefaultSettings.hasOwnProperty(`draw-${i}-sideways`)
                  ? this.setupMaskDefaultSettings[`draw-${i}-sideways`]
                  : Math.round(100 * (i+1) * this.setupMaskSettings['climber-sideways'] / (numDraws + 1)) / 100;
                const units2 = document.createElement('span');
                units2.textContent = ' meters';
                rightTd2.appendChild(input2);
                rightTd2.appendChild(units2);
                tr2.appendChild(leftTd2);
                tr2.appendChild(rightTd2);
                table.appendChild(tr2);
              }
            }

          } else if (this.stepFormTypes[this.currentSetupStep] === 'physics-setup') {
            (drawPreview(this.currentSetupStep))({}); // to update physics step size hint

          } else if (this.stepFormTypes[this.currentSetupStep] === 'distance-setup') { // distance setup step
            const numDraws = this.setupMaskSettings['draw-number'];
            const table = this.stepForms[this.currentSetupStep].getElementsByClassName('step-form-table')[0];
            table.replaceChildren(table.getElementsByTagName('tr')[0], table.getElementsByTagName('tr')[1],
              table.getElementsByTagName('tr')[2], table.getElementsByTagName('tr')[3], table.getElementsByTagName('tr')[4]);
            table.style.marginBottom = '1em';

            if (numDraws == 0) {
              const tr = document.createElement('tr');
              const td = document.createElement('td');
              td.setAttribute('colspan', '2');
              td.classList.add('fullwidth-text');
              td.textContent = 'There is nothing to do here, as you specified that no draws have been clipped.';
              tr.appendChild(td);
              table.appendChild(tr);

            } else {
              for (let i = 0; i < numDraws; i++) {
                const tr = document.createElement('tr');
                const leftTd = document.createElement('td');
                const label = document.createElement('label');
                label.setAttribute('for', `draw-${i}-wall-distance`);
                label.textContent = `Wall distance of draw ${(i+1)}:`;
                leftTd.appendChild(label);
                const rightTd = document.createElement('td');
                const input = document.createElement('input');
                input.setAttribute('id', `draw-${i}-wall-distance`);
                input.setAttribute('type', 'number');
                input.setAttribute('min', '0.01');
                input.setAttribute('max', '10');
                input.setAttribute('step', '0.01');
                input.value = this.setupMaskDefaultSettings.hasOwnProperty(`draw-${i}-wall-distance`)
                  ? this.setupMaskDefaultSettings[`draw-${i}-wall-distance`] : 0.1;
                input.defaultValue = this.setupMaskDefaultSettings.hasOwnProperty(`draw-${i}-wall-distance`)
                  ? this.setupMaskDefaultSettings[`draw-${i}-wall-distance`] : 0.1;
                const units = document.createElement('span');
                units.textContent = ' meters';
                rightTd.appendChild(input);
                rightTd.appendChild(units);
                tr.appendChild(leftTd);
                tr.appendChild(rightTd);
                table.appendChild(tr);
              }
            }
          }

          this.stepElements[this.currentSetupStep].getElementsByClassName('step-body')[0].style.display = 'block';
          this.stepElements[this.currentSetupStep].getElementsByClassName('step-header')[0].scrollIntoView();
        }
      };
    };

    for (let i = 0; i < this.stepElements.length; i++) {
      const stepNumber = this.stepElements[i].getElementsByClassName('step-header-num')[0];
      stepNumber.textContent = `${i+1}.`;
      const form = this.stepElements[i].getElementsByTagName('form')[0];
      form.addEventListener('submit', formSubmitEvtListener(i));

      if (form.getElementsByClassName('back-button').length > 0) { // go to previous setup step
        for (const btn of form.getElementsByClassName('back-button')) {
          btn.addEventListener('click', (
            (idx) => {
              return (evt) => {
                if (idx !== this.currentSetupStep) {
                  evt.preventDefault();
                  return;
                }
                if (this.currentSetupStep === 0) return;
                deleteSetupMaskStepSettings(this.currentSetupStep, this.setupMaskSettings);
                this.stepElements[this.currentSetupStep].getElementsByClassName('step-body')[0].style.display = 'none';
                this.currentSetupStep--;
                this.stepElements[this.currentSetupStep].getElementsByClassName('step-header')[0].style.color = 'black';
                this.stepElements[this.currentSetupStep].getElementsByClassName('step-done')[0].style.opacity = '0';
                this.stepElements[this.currentSetupStep].getElementsByClassName('step-body')[0].style.display = 'block';
                this.stepElements[this.currentSetupStep].getElementsByClassName('step-header')[0].scrollIntoView();
              };
            }
          )(i));
        }
      }

      form.addEventListener('input', drawPreview(i));
      form.addEventListener('reset', evt => setTimeout(() => (drawPreview(i))(evt), 0));
      (drawPreview(0))({});
      this.stepForms.push(form);
      this.stepFormTypes.push(this.stepElements[i].getAttribute('id'));
      this.stepElements[i].getElementsByClassName('step-done')[0].style.opacity = '0';
      if (i > 0)
        this.stepElements[i].getElementsByClassName('step-body')[0].style.display = 'none';

      if (this.stepFormTypes[i] === 'saved-configs') { // setup options for loading stored results
        document.getElementById('uiaa-norm-fall-setup').addEventListener('click', () => {
          this.setupMaskDefaultSettings = UIAA_NORM_FALL_SETUP;
          changeSetupDefaults(UIAA_NORM_FALL_SETUP);
          const ropeIdx = SETUP_MASK_STEPS.order.indexOf('rope-setup');
          while (this.currentSetupStep < ropeIdx)
            formSubmitEvtListener(this.currentSetupStep)({ preventDefault: () => {} });
          (drawPreview(this.currentSetupStep))({});
        });
        const createSavedResultsTable = (table, savedResults, automatic = false) => {
          const firstChild = table.getElementsByTagName('tr')[0];
          table.replaceChildren(firstChild);
          table.style.marginBottom = '1em';
          if (savedResults.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.setAttribute('colspan', '3');
            td.classList.add('fullwidth-text');
            td.textContent = `No ${automatic ? 'automatically ' : ''}saved simulation results are available.`;
            tr.appendChild(td);
            table.appendChild(tr);
          } else {
            for (let k = 0; k < savedResults.length; k++) {
              const res = savedResults[k];
              const tr = document.createElement('tr');
              const leftTd = document.createElement('td');
              const rightTd = document.createElement('td');
              const resultDescr = `${(typeof res.name === 'string') ? `${res.name}, s` : 'S'}aved on ${(new Date(res.date)).toLocaleString(undefined, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
              })} (${numToUnitStr(JSON.stringify(res).length, 'Byte', 1)})`;
              leftTd.textContent = resultDescr;
              const loadButton = document.createElement('button');
              loadButton.setAttribute('type', 'button');
              loadButton.textContent = 'Load';
              loadButton.addEventListener('click', ((config, res, userName) => {
                return (evt) => {
                  this.setupMaskSettings = config;
                  this.setupSimulationRunningLayout();
                  this.simulationDuration = this.setupMaskSettings['simulation-duration'];
                  this.simResAutoSaved = false;
                  this.simResUserSaved = null;
                  if (userName === null || typeof userName === 'undefined')
                    this.simResAutoSaved = true;
                  else
                    this.simResUserSaved = userName;
                  this.progressInfoText.textContent = `Simulation completed, up to time ${numToStr(this.simulationDuration, 2, 11)} s`;
                  this.prepareAndStartSimulation(false);
                  this.setupSimulationResultLoop(res, config['frame-rate']);
                };
              })(res.configuration, res.result, automatic ? null : res.name))
              rightTd.appendChild(loadButton);
              tr.appendChild(leftTd);
              tr.appendChild(rightTd);

              const delTd = document.createElement('td');
              const deleteButton = getDeleteButton();
              deleteButton.addEventListener('click', ((idx, automatic, name) => {
                return () => {
                  if (confirm(`The simulation result\n${name}\nwill be deleted permanently.`)) {
                    if (automatic) {
                      SimulationStorageManager.deleteAutoSavedResult(idx);
                      const autoSavedTable = document.getElementById('load-auto-saved-results');
                      const autoSavedResults = SimulationStorageManager.autoSavedResults;
                      createSavedResultsTable(autoSavedTable, autoSavedResults, true);
                    } else {
                      SimulationStorageManager.deleteSavedResult(idx);
                      const savedTable = document.getElementById('load-saved-results');
                      const savedResults = SimulationStorageManager.savedResults;
                      createSavedResultsTable(savedTable, savedResults);
                    }
                  }
                };
              })(i, automatic, resultDescr));
              delTd.appendChild(deleteButton);
              tr.appendChild(delTd);
              table.appendChild(tr);
            }
          }
        };
        const autoSavedTable = document.getElementById('load-auto-saved-results');
        const autoSavedResults = SimulationStorageManager.autoSavedResults;
        createSavedResultsTable(autoSavedTable, autoSavedResults, true);
        const savedTable = document.getElementById('load-saved-results');
        const savedResults = SimulationStorageManager.savedResults;
        createSavedResultsTable(savedTable, savedResults);

        document.getElementById('simulation-file-loader').addEventListener('change', async (e) => { // initialize file loader
          const file = e.target.files && e.target.files[0];
          if (!file) return; // user canceled
          document.getElementById('simulation-file-loader-text').textContent = 'Please wait, loading…';
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            for (const snapshot of data.result) {
              for (let i = 0; i < snapshot.bodies.length; i++)
                snapshot.bodies[i] = deserializeObjectSnapshot(snapshot.bodies[i]);
            }
            this.setupMaskSettings = data.configuration;
            this.setupSimulationRunningLayout();
            this.simulationDuration = this.setupMaskSettings['simulation-duration'];
            this.simResAutoSaved = false;
            this.simResUserSaved = null;
            this.progressInfoText.textContent = `Simulation completed, up to time ${numToStr(this.simulationDuration, 2, 11)} s`;
            this.prepareAndStartSimulation(false);
            this.setupSimulationResultLoop(data.result, data.configuration['frame-rate']);
          } catch (e) {
            console.error('Failed to read/parse JSON:', e);
            document.getElementById('simulation-file-loader-text').textContent = 'Failed to parse file.';
          }
        });

      } else if (this.stepFormTypes[i] === 'rope-setup') { // setup mask to input rope manufacturer data
        const manufacturerDataInput = ((idx) => {
          return () => {
            if (idx !== this.currentSetupStep) return;
            const impactForce = readNumberFromInput(document.getElementById('impact-force'), 'float') * 1000;
            const staticElongation = readNumberFromInput(document.getElementById('static-elongation'), 'float') / 100;
            const dynamicElongation = readNumberFromInput(document.getElementById('dynamic-elongation'), 'float') / 100;
            const staticElConst = staticElongation / (80 * GRAVITY_OF_EARTH);
            const dynamicElConst = dynamicElongation / impactForce;
            const estimatedElConst = Math.round(1000 * 1000 * (0.9 * staticElConst + 0.1 * dynamicElConst)) / 1000;
            document.getElementById('elasticity-constant').value = estimatedElConst;
            document.getElementById('elasticity-constant-hint').innerHTML = `The static elongation leads to an approximate elasticity constant of ${
              Math.round(1000 * 1000 * staticElConst) / 1000}&times;10<sup>-3</sup> per Newton. The dynamic elongation and impact force lead to an approximate elasticity constant of ${
              Math.round(1000 * 1000 * dynamicElConst) / 1000}&times;10<sup>-3</sup> per Newton. A weighted average of the two will be used as elasticity constant (90 % weight on static value, 10 % weight on dynamic value).`;
          };
        })(i);
        document.getElementById('change-elasticity-setup').addEventListener('click', ((idx) => {
          return () => {
            if (idx !== this.currentSetupStep) return;
            const table = this.stepForms[this.currentSetupStep].getElementsByClassName('step-form-table')[0];
            if (table.classList.contains('rope-manufacturer-info'))
              table.classList.remove('rope-manufacturer-info');
            else
              table.classList.add('rope-manufacturer-info');
            const ropeManInputActive = table.classList.contains('rope-manufacturer-info');
            if (ropeManInputActive) {
              document.getElementById('change-elasticity-setup').textContent = 'Enter elasticity constant directly';
              document.getElementById('elasticity-constant').setAttribute('disabled', 'disabled');
              document.getElementById('impact-force').scrollIntoView();
              manufacturerDataInput();
            } else {
              document.getElementById('change-elasticity-setup').textContent = 'Enter rope manufacturer data';
              document.getElementById('elasticity-constant').removeAttribute('disabled');
              document.getElementById('elasticity-constant-hint').textContent = '';
              document.getElementById('change-elasticity-setup').scrollIntoView();
            }
          };
        })(i));
        document.getElementById('impact-force').addEventListener('input', manufacturerDataInput);
        document.getElementById('static-elongation').addEventListener('input', manufacturerDataInput);
        document.getElementById('dynamic-elongation').addEventListener('input', manufacturerDataInput);
      }
    }
  }

  /**
   * Prepare the simulation objects and start the simulation. Settings are read from the setupMaskSettings property.
   * @param {boolean} [startSimulation=true] whether to start the simulation. If set to false, only the simulation objects are set up
   */
  prepareAndStartSimulation(startSimulation = true) {
    clearPhysicsWorld();

    const belayerWallDistance = this.setupMaskSettings.hasOwnProperty('belayer-wall-distance') ? this.setupMaskSettings['belayer-wall-distance'] : 0.5;
    const climberWallDistance = this.setupMaskSettings.hasOwnProperty('climber-wall-distance') ? this.setupMaskSettings['climber-wall-distance'] : 0.3;

    GLOBALS.wallAngle = this.setupMaskSettings['wall-angle']; // overhanging degrees

    GLOBALS.startHeight = this.setupMaskSettings['climber-height']; // height of climber above ground / belay
    GLOBALS.climberMass = this.setupMaskSettings['climber-weight'];
    GLOBALS.climber = new Body(
      GLOBALS.startHeight * Math.tan(Math.PI * GLOBALS.wallAngle / 180) + (climberWallDistance - belayerWallDistance) - 0.01 + 0.02 * Math.random(),
      GLOBALS.startHeight,
      this.setupMaskSettings['climber-sideways'] - 0.01 + 0.02 * Math.random(),
      GLOBALS.climberMass,
      'climber'
    );
    GLOBALS.climber.drawingColor = new Color(151, 95, 96);
    // GLOBALS.climber.velocity = new V(0, 0, 0);

    GLOBALS.anchorHeight = 0;
    GLOBALS.anchorMass = this.setupMaskSettings['fixed-anchor'] ? 0 : this.setupMaskSettings['belayer-weight'];
    GLOBALS.anchor = new Body(-0.01 + 0.02 * Math.random(), GLOBALS.anchorHeight, -0.01 + 0.02 * Math.random(), GLOBALS.anchorMass, 'belayer');
    GLOBALS.anchor.drawingColor = new Color(77, 136, 78);

    GLOBALS.ropeLength = 0;
    GLOBALS.lastDrawHeight = (this.setupMaskSettings['draw-number'] > 0) ? this.setupMaskSettings['last-draw-height'] : 0; // height of last draw above ground / belay (set to 0 for no deflection point)
    const deflectionPoints = [];
    let lastPos = GLOBALS.anchor.pos;
    for (let i = 0; i < this.setupMaskSettings['draw-number']; i++) {
      const drawWallDistance = this.setupMaskSettings.hasOwnProperty(`draw-${i}-wall-distance`) ? this.setupMaskSettings[`draw-${i}-wall-distance`] : 0.1;
      const nDeflPt = new Body(
        this.setupMaskSettings[`draw-${i}-height`] * Math.tan(Math.PI * GLOBALS.wallAngle / 180) + (drawWallDistance - belayerWallDistance) - 0.01 + 0.02 * Math.random(), // x coordinate
        this.setupMaskSettings[`draw-${i}-height`], // y coordinate
        this.setupMaskSettings[`draw-${i}-sideways`] - 0.01 + 0.02 * Math.random(), // z coordinate
        0,
        'quickdraw'
      );
      if (this.setupMaskSettings.hasOwnProperty('friction-coefficient'))
        nDeflPt.frictionCoefficient = this.setupMaskSettings['friction-coefficient'];
      nDeflPt.drawingColor = new Color(52, 90, 93);
      if (i != this.setupMaskSettings['draw-number'] - 1)
        nDeflPt.ignoreInGraphs = true;
      deflectionPoints.push(nDeflPt);
      const segLen = nDeflPt.pos.minus(lastPos).norm();
      GLOBALS.ropeLength += segLen;
      lastPos = nDeflPt.pos;
    }
    const finalSegLen = GLOBALS.climber.pos.minus(lastPos).norm();
    GLOBALS.ropeLength += finalSegLen + (this.setupMaskSettings.hasOwnProperty('slack') ? this.setupMaskSettings['slack'] : 0.1); // 10 cm slack
    GLOBALS.ropeSegmentNum = this.setupMaskSettings['rope-segments'];
    // GLOBALS.climber.mass = (GLOBALS.ropeLength * 0.062) / (GLOBALS.ropeSegmentNum - 1); GLOBALS.climberMass = GLOBALS.climber.mass; // no climber at the end of the rope

    GLOBALS.deflectionPoint = (this.setupMaskSettings['draw-number'] > 0) ? deflectionPoints[deflectionPoints.length - 1] : null;
    // GLOBALS.deflectionPoint.frictionCoefficient = 0;

    GLOBALS.rope = new Rope(GLOBALS.ropeLength, GLOBALS.ropeSegmentNum, GLOBALS.anchor, GLOBALS.climber, {
      elasticityConstant: this.setupMaskSettings['elasticity-constant'] / 1000,
      weightPerMeter: this.setupMaskSettings['rope-weight'],
      bendDamping: this.setupMaskSettings['rope-bend-damping'],
      stretchDamping: this.setupMaskSettings['rope-stretch-damping']
    }, ...deflectionPoints);
    GLOBALS.rope.drawingColor = new Color(241, 160, 45);
    
    addWorldBarrier(new V(Math.cos(Math.PI * GLOBALS.wallAngle / 180), -Math.sin(Math.PI * GLOBALS.wallAngle / 180), 0), new V(-belayerWallDistance, 0, 0), 'wall');
    if (this.setupMaskSettings['ground-present'])
      addWorldBarrier(new V(0, 1, 0), new V(0, this.setupMaskSettings['ground-level'], 0), 'floor');

    if (GLOBALS.startHeight > GLOBALS.lastDrawHeight)
      GLOBALS.fallFactor = 2 * (GLOBALS.startHeight - GLOBALS.lastDrawHeight) / GLOBALS.ropeLength;
    else
      GLOBALS.fallFactor = 0;

    GLOBALS.gravityOnClimber = GRAVITY_OF_EARTH * GLOBALS.climberMass;
    GLOBALS.gravityOnBelayer = GRAVITY_OF_EARTH * GLOBALS.anchorMass;

    GLOBALS.bodies = [
      ...deflectionPoints,
      GLOBALS.rope,
      GLOBALS.anchor,
      GLOBALS.climber
    ];

    GLOBALS.maxStep = this.setupMaskSettings['physics-step-size'] / 1000;

    document.getElementById('gravity-force-climber').textContent = numToUnitStr(GLOBALS.gravityOnClimber, 'N', 2);
    document.getElementById('gravity-force-belayer').textContent = numToUnitStr(GLOBALS.gravityOnBelayer, 'N', 2);
    
    if (startSimulation) {
      const FPS = this.setupMaskSettings['frame-rate'];
      const targetTime = this.setupMaskSettings['simulation-duration'];
      for (const pm of this.previewManagers)
        pm.destroy();
      this.precalculatePositions(targetTime, FPS);
    }
  }

  /**
   * Setup the layout to show information about the currently running simulation
   */
  setupSimulationRunningLayout() {
    this.adjustPanelNumber(1, 1, true);

    this.headPanel.textContent = 'Climbing fall simulation';
    this.progressInfoPanel = document.createElement('div');
    this.headPanel.appendChild(this.progressInfoPanel);
    this.progressInfoText = document.createElement('span');
    this.progressInfoText.setAttribute('id', 'pinfo-text');
    this.progressInfoText.textContent = 'Please wait…';
    this.headPanel.appendChild(this.progressInfoText);
    const space = document.createElement('span');
    space.textContent = ' ';
    this.headPanel.appendChild(space);
    this.stopCalculationBtn = document.createElement('input');
    this.stopCalculationBtn.setAttribute('type', 'button');
    this.stopCalculationBtn.setAttribute('value', 'Stop');
    this.stopCalculationBtn.setAttribute('onclick', 'GLOBALS.interruptSimulation = true;');
    this.headPanel.appendChild(this.stopCalculationBtn);

    this.rightSubpanels[0].textContent = 'Simulation running…';
    const infoTextDiv = document.createElement('div');
    infoTextDiv.style.width = '50%';
    infoTextDiv.textContent = 'You may stop the simulation at any time with the [Stop] button on the upper left to view partial simulation results. Simulation results will be displayed here automatically once the simulation is complete.'; // TODO: If the simulation progress is very slow, you might also want to consider loading one of the precalculated scenarios instead.';
    this.rightSubpanels[1].replaceChildren(infoTextDiv);

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

  /**
   * Setup the layout to show the simulation results
   */
  setupSimulationResultLayout() {
    this.headPanel.removeChild(this.stopCalculationBtn);
    if (this.saveSpace == 0)
      this.adjustPanelNumber(2, 3, true);
    else if (this.saveSpace == 1)
      this.adjustPanelNumber(1, 2, true);
    else
      this.adjustPanelNumber(1, 1, true);

    this.previousFrameBtn = document.createElement('button');
    this.previousFrameBtn.setAttribute('type', 'button');
    this.previousFrameBtn.classList.add('material-symbols-outlined');
    this.previousFrameBtn.classList.add('icon-button');
    this.previousFrameBtn.textContent = 'skip_previous';
    this.previousFrameBtn.setAttribute('title', 'Jump to previous frame');
    this.previousFrameBtn.addEventListener('click', () => {
      this.isPaused = true;
      this.playPauseBtn.textContent = 'play_arrow';
      this.lastFrameDrawn = (this.lastFrameDrawn + this.snapshots.length - 1) % this.snapshots.length;
      this.lastFrameSimTime = this.snapshots[this.lastFrameDrawn].time;
      this.drawSnapshotAtIndex(this.lastFrameDrawn);
    });
    this.nextFrameBtn = document.createElement('button');
    this.nextFrameBtn.setAttribute('type', 'button');
    this.nextFrameBtn.classList.add('material-symbols-outlined');
    this.nextFrameBtn.classList.add('icon-button');
    this.nextFrameBtn.textContent = 'skip_next';
    this.nextFrameBtn.setAttribute('title', 'Jump to next frame');
    this.nextFrameBtn.addEventListener('click', () => {
      this.isPaused = true;
      this.playPauseBtn.textContent = 'play_arrow';
      this.lastFrameDrawn = (this.lastFrameDrawn + 1) % this.snapshots.length;
      this.lastFrameSimTime = this.snapshots[this.lastFrameDrawn].time;
      this.drawSnapshotAtIndex(this.lastFrameDrawn);
    });
    this.playPauseBtn = document.createElement('button');
    this.playPauseBtn.setAttribute('type', 'button');
    this.playPauseBtn.classList.add('material-symbols-outlined');
    this.playPauseBtn.classList.add('icon-button');
    this.playPauseBtn.textContent = 'pause'; // or play_arrow
    this.playPauseBtn.setAttribute('title', 'Play / pause');
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
    this.selectPlaybackSpeed.setAttribute('title', 'Select playback speed');
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
    this.playbackControls = document.createElement('span');
    this.playbackControls.classList.add('playback-controls');
    this.playbackControls.appendChild(this.previousFrameBtn);
    this.playbackControls.appendChild(this.playPauseBtn);
    this.playbackControls.appendChild(this.selectPlaybackSpeed);
    this.playbackControls.appendChild(this.nextFrameBtn);

    this.saveBtn = document.createElement('button');
    this.saveBtn.setAttribute('type', 'button');
    this.saveBtn.classList.add('material-symbols-outlined');
    this.saveBtn.classList.add('icon-button');
    this.saveBtn.textContent = 'file_save';
    this.saveBtn.setAttribute('title', 'Save simulation result on disk');
    this.saveBtn.addEventListener('click', () => {
      SimulationStorageManager.saveResultAsFile(this.setupMaskSettings, this.snapshots);
    });
    this.settingsBtn = document.createElement('button');
    this.settingsBtn.setAttribute('type', 'button');
    this.settingsBtn.classList.add('material-symbols-outlined');
    this.settingsBtn.classList.add('icon-button');
    this.settingsBtn.textContent = 'settings';
    this.settingsBtn.setAttribute('title', 'Settings & Menu');
    this.settingsBtn.addEventListener('click', () => {
      this.simulationMenu.style.display = 'block';
    });
    document.getElementById('close-menu').addEventListener('click', () => {
      this.simulationMenu.style.display = 'none';
    });
    initializeMenu(this);
    const space = document.createElement('span'); space.style.display = 'inline-block'; space.style.width = '0.5em';
    this.playbackControls.appendChild(space);
    this.playbackControls.appendChild(this.saveBtn);
    this.playbackControls.appendChild(this.settingsBtn);
    this.rightSubpanels[0].replaceChildren(this.playbackControls);

    const graphTypes = ['forces', 'energy', 'positions', 'speed'];
    for (let i = 1; i < this.rightSubpanels.length; i++) {
      this.graphCanvases.push(
        new GraphCanvas(this.rightSubpanels[i], this.snapshots, graphTypes[(i-1) % graphTypes.length])
      );
    }
    
    for (let i = 0; i < this.bodyPanels.length; i++) {
      this.graphicsManagers.push(new WorldGraphics(this.bodyPanels[i], (i % 2 == 0)));
    }

    this.inSimResLayout = true;
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
    if (prevSnapshots.length === 0 && stepsDone === 0 && lastSnapshot === 0)
      this.setupSimulationRunningLayout();
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
      this.simulationDuration = i * GLOBALS.maxStep;
      if ((new Date()).getTime() - lastTime > 500) {
        if (this.progressBar !== null)
          this.progressBar.style.width = `${i / numSteps * 100}%`;
        if (this.progressBarText !== null)
          this.progressBarText.textContent = `${numToStr(i / numSteps * 100, 2, 5)} %`;
        if (this.progressInfoText !== null)
          this.progressInfoText.textContent = `Progress: ${numToStr(i / numSteps * 100, 2, 5)} %, currently at time ${numToStr(this.simulationDuration, 2, 11)} s`;
        if (!GLOBALS.interruptSimulation) {
          window.setTimeout(() => this.precalculatePositions(targetTime, FPS, snapshots, i, lastSnapshot), 10);
          return;
        } else {
          i++;
          break;
        }
      }
    }
    this.setupMaskSettings['simulation-duration'] = this.simulationDuration;
    /** @type {boolean} whether the simulation result was saved automatically */
    this.simResAutoSaved = SimulationStorageManager.autoSaveResult(this.setupMaskSettings, snapshots);
    /** @type {string|null} the name given to the simulation by the user for saving it, or null if the user didn't save it yet */
    this.simResUserSaved = null;
    
    this.progressInfoText.textContent = `Simulation ${i-1 == numSteps ? '' : '(partially) '}completed, up to time ${numToStr(this.simulationDuration, 2, 11)} s`;
    this.setupSimulationResultLoop(snapshots, FPS);
  }

  /**
   * Start the loop playing the simulation results
   * @param {{time: number, bodies: ObjectSnapshot[]}[]} snapshots array with the captured snapshots
   * @param {number} FPS the frame rate of the snapshots
   */
  setupSimulationResultLoop(snapshots, FPS) {
    this.snapshots = snapshots;
    this.snapshotFPS = FPS;
    this.setupSimulationResultLayout();
    
    const lastSnapshot = this.snapshots[this.snapshots.length - 1];
    for (const bodySnap of lastSnapshot.bodies) {
      if (!bodySnap.hasOwnProperty('runningMaxima')) continue;
      if (bodySnap.name === 'climber') {
        document.getElementById('peak-force-climber').textContent = numToUnitStr(bodySnap.runningMaxima.force, 'N', 2);
        document.getElementById('peak-speed-climber').textContent = numToUnitStr(bodySnap.runningMaxima.speed * 3600, 'm/h', 2);
        if (bodySnap.runningMaxima.hasOwnProperty('forceAvgWindow'))
          document.getElementById('peak-force-climber-hint').textContent = ` (averaged over ${numToUnitStr(bodySnap.runningMaxima.forceAvgWindow, 's', 1)})`;
      } else if (bodySnap.name === 'belayer') {
        document.getElementById('peak-force-belayer').textContent = numToUnitStr(bodySnap.runningMaxima.force, 'N', 2);
        document.getElementById('peak-speed-belayer').textContent = numToUnitStr(bodySnap.runningMaxima.speed * 3600, 'm/h', 2);
        if (bodySnap.runningMaxima.hasOwnProperty('forceAvgWindow'))
          document.getElementById('peak-force-belayer-hint').textContent = ` (averaged over ${numToUnitStr(bodySnap.runningMaxima.forceAvgWindow, 's', 1)})`;
      } else if (bodySnap.name === 'rope') {
        document.getElementById('peak-impact-climber').textContent = numToUnitStr(bodySnap.runningMaxima.climberStretching, 'N', 2);
        document.getElementById('peak-impact-belayer').textContent = numToUnitStr(bodySnap.runningMaxima.belayerStretching, 'N', 2);
        document.getElementById('peak-rope-elongation').textContent = numToStr(bodySnap.runningMaxima.relativeElongation * 100) + ' %';
      } else if (bodySnap.name === 'quickdraw') {
        document.getElementById('peak-force-draw').textContent = numToUnitStr(bodySnap.runningMaxima.force, 'N', 2);
        if (bodySnap.runningMaxima.hasOwnProperty('forceAvgWindow'))
          document.getElementById('peak-force-draw-hint').textContent = ` (averaged over ${numToUnitStr(bodySnap.runningMaxima.forceAvgWindow, 's', 1)})`;
      }
    }
    document.getElementById('fall-factor').textContent = numToStr(GLOBALS.fallFactor);

    this.lastFrameGlobTime = (new Date()).getTime() / 1000;
    this.lastFrameSimTime = 0;
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
    document.getElementById('menu-stats-time').textContent = `${numToStr(cSnapshot.time, 2, 5, 2, true)} s`;
    for (const bodySnap of cSnapshot.bodies) {
      if (!bodySnap.hasOwnProperty('runningMaxima')) continue;
      if (bodySnap.name === 'climber') {
        document.getElementById('peak-force-climber-running').textContent = numToUnitStr(bodySnap.runningMaxima.force, 'N', 2);
        document.getElementById('peak-speed-climber-running').textContent = numToUnitStr(bodySnap.runningMaxima.speed * 3600, 'm/h', 2);
      } else if (bodySnap.name === 'belayer') {
        document.getElementById('peak-force-belayer-running').textContent = numToUnitStr(bodySnap.runningMaxima.force, 'N', 2);
        document.getElementById('peak-speed-belayer-running').textContent = numToUnitStr(bodySnap.runningMaxima.speed * 3600, 'm/h', 2);
      } else if (bodySnap.name === 'rope') {
        document.getElementById('peak-impact-climber-running').textContent = numToUnitStr(bodySnap.runningMaxima.climberStretching, 'N', 2);
        document.getElementById('peak-impact-belayer-running').textContent = numToUnitStr(bodySnap.runningMaxima.belayerStretching, 'N', 2);
        document.getElementById('peak-rope-elongation-running').textContent = numToStr(bodySnap.runningMaxima.relativeElongation * 100) + ' %';
      } else if (bodySnap.name === 'quickdraw') {
        document.getElementById('peak-force-draw-running').textContent = numToUnitStr(bodySnap.runningMaxima.force, 'N', 2);
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
