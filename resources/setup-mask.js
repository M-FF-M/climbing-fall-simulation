
const SETUP_MASK_STEPS = {
  order: ['saved-configs', 'basic-setup', 'draw-setup', 'physics-setup', 'simulation-start'],
  'saved-configs': {
    inputs: []
  },
  'basic-setup': {
    inputs: [
      { type: 'float', id: 'wall-angle' },
      { type: 'boolean', id: 'ground-present' },
      { type: 'float', id: 'ground-level' },
      { type: 'float', id: 'climber-height' },
      { type: 'float', id: 'climber-sideways' },
      { type: 'float', id: 'climber-weight' },
      { type: 'float', id: 'last-draw-height' },
      { type: 'int', id: 'draw-number' },
      { type: 'boolean', id: 'fixed-anchor' },
      { type: 'boolean', id: 'belayer-fixed' },
      { type: 'float', id: 'belayer-weight' }
    ]
  },
  'draw-setup': {
    inputs: []
  },
  'physics-setup': {
    inputs: [
      { type: 'int', id: 'rope-segments' },
      { type: 'float', id: 'physics-step-size' }
    ]
  },
  'simulation-start': {
    inputs: [
      { type: 'int', id: 'frame-rate' },
      { type: 'float', id: 'simulation-duration' }
    ]
  }
}

/**
 * Ensure that a number value read from an input element meets the specified input limits
 * @param {HTMLInputElement} input the input element the number was read from
 * @param {number} value the parsed numeric value
 * @param {number} [additionalMinimum] if supplied, the value must also be >= this additionalMinimum
 * @return {number} the original parsed number if it is within the specified limits, otherwise one of the two limits, depending on which one is closer to the parsed number
 */
function ensureLimitsMet(input, value, additionalMinimum = -Infinity) {
  let min = -Infinity;
  let max = Infinity;
  if (input.getAttribute('min') !== null) {
    min = input.getAttribute('min');
    if (typeof min !== 'number') min = parseFloat(min);
  }
  if (input.getAttribute('max') !== null) {
    max = input.getAttribute('max');
    if (typeof max !== 'number') max = parseFloat(max);
  }
  if (value < min || value < additionalMinimum) return Math.max(min, additionalMinimum);
  if (value > max) return max;
  return value;
}

/**
 * Read a number from an input element, ensuring that it meets the specified limits and returning the default value if the input cannot be interpreted as a number
 * @param {HTMLInputElement} input the input element from which the number should be read
 * @param {'float'|'int'} type whether the number should be a floating point number or an integer
 * @param {number} [additionalMinimum] if supplied, the returned value must also satisfy >= this additionalMinimum
 * @return {number} the parsed numeric value
 */
function readNumberFromInput(input, type, additionalMinimum = -Infinity) {
  let val = input.value;
  if (type === 'float') {
    if (typeof val === 'string') val = parseFloat(val.replace(',', '.'));
    if (typeof val !== 'number') val = parseFloat(val);
    if (isNaN(val)) {
      val = input.defaultValue;
      if (typeof val === 'string') val = parseFloat(val.replace(',', '.'));
    }
  } else if (type === 'int') {
    if (typeof val !== 'number') val = parseInt(val);
    if (isNaN(val)) {
      val = input.defaultValue;
      if (typeof val === 'string') val = parseInt(val);
    }
  }
  return ensureLimitsMet(input, val, additionalMinimum);
}

/**
 * Read all the user-supplied values for one step in the setup mask and ensure that they meet the specifications
 * @param {number} stepNumber the number of the step in the setup mask for which the values should be read
 * @param {object} settingsObject an object in which the data from the inputs will be stored
 */
function verifySetupMaskStep(stepNumber, settingsObject) {
  if (stepNumber < 0 || stepNumber >= SETUP_MASK_STEPS.order.length) {
    console.warn(`Invalid step number in verifySetupMaskStep: ${stepNumber}`);
    return;
  }
  const stepId = SETUP_MASK_STEPS.order[stepNumber];
  if (stepId === 'draw-setup') {
    let i = 0;
    while (document.getElementById(`draw-${i}-height`) !== null) {
      if (settingsObject['ground-present'])
        settingsObject[`draw-${i}-height`] = readNumberFromInput(document.getElementById(`draw-${i}-height`), 'float', settingsObject['ground-level']);
      else
        settingsObject[`draw-${i}-height`] = readNumberFromInput(document.getElementById(`draw-${i}-height`), 'float');
      settingsObject[`draw-${i}-sideways`] = readNumberFromInput(document.getElementById(`draw-${i}-sideways`), 'float');
      i++;
    }
  } else {
    for (const { type, id } of SETUP_MASK_STEPS[stepId].inputs) {
      if (type === 'float' || type === 'int') {
        if (settingsObject['ground-present'] && (id === 'climber-height' || id === 'last-draw-height'))
          settingsObject[id] = readNumberFromInput(document.getElementById(id), type, settingsObject['ground-level']);
        else
          settingsObject[id] = readNumberFromInput(document.getElementById(id), type);
      } else if (type === 'boolean') {
        const val = document.getElementById(id).checked;
        settingsObject[id] = val;
      }
    }
  }
}

/**
 * Remove all the properties added to the settings object after a given step of the setup mask
 * @param {number} stepNumber the number of the step in the setup mask for which the values should be read
 * @param {object} settingsObject the object from which the relevant properties (relevant for the given step) will be removed
 */
function deleteSetupMaskStepSettings(stepNumber, settingsObject) {
  const stepId = SETUP_MASK_STEPS.order[stepNumber];
  if (stepId === 'draw-setup') {
    let i = 0;
    while (settingsObject.hasOwnProperty(`draw-${i}-height`)) {
      delete settingsObject[`draw-${i}-height`];
      delete settingsObject[`draw-${i}-sideways`];
      i++;
    }
  } else {
    for (const { id } of SETUP_MASK_STEPS[stepId].inputs) {
      delete settingsObject[id];
    }
  }
}

/**
 * Change the default values of all the inputs if the user pre-loaded a specific configuration
 * @param {object} defaultObject the desired default values
 */
function changeSetupDefaults(defaultObject) {
  for (const prop of Object.keys(defaultObject)) {
    if (document.getElementById(prop) !== null) {
      document.getElementById(prop).value = defaultObject[prop];
      document.getElementById(prop).defaultValue = defaultObject[prop];
    }
  }
}

/**
 * Read all the user-supplied values for the steps which were not yet completed in the setup mask (will result in reading the default values from the inputs)
 * @param {number} stepNumber the number of the first step in the setup mask which was not yet completed by the user
 * @param {object} settingsObject an object in which the data from the steps which were already completed is stored
 * @param {object} [defaultObject] an object containing the default values (useful if the user pre-loaded a configuration)
 * @return {object} a copy of settingsObject, filled with the properties from the remaining steps
 */
function fillWithRemainingSteps(stepNumber, settingsObject, defaultObject = {}) {
  const retObj = { ...settingsObject };
  for (let i = stepNumber; i < SETUP_MASK_STEPS.order.length; i++) {
    verifySetupMaskStep(i, retObj);
    if ((SETUP_MASK_STEPS.order[i] === 'draw-setup') && (retObj['draw-number'] > 0) && (!retObj.hasOwnProperty('draw-0-height'))) {
      for (let k = 0; k < retObj['draw-number']; k++) {
        retObj[`draw-${k}-height`] = defaultObject.hasOwnProperty(`draw-${k}-height`) ? defaultObject[`draw-${k}-height`] : Math.round(100 * (k+1) * retObj['last-draw-height'] / retObj['draw-number']) / 100;
        retObj[`draw-${k}-sideways`] = defaultObject.hasOwnProperty(`draw-${k}-sideways`) ? defaultObject[`draw-${k}-sideways`] : Math.round(100 * (k+1) * retObj['climber-sideways'] / (retObj['draw-number'] + 1)) / 100;
      }
    }
  }
  return retObj;
}
