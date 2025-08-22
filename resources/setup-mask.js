
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
 * @param {HTMLInputElement} input
 * @param {number} value
 * @param {number} [additionalMinimum]
 * @return {number}
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
 * @param {HTMLInputElement} input
 * @param {'float'|'int'} type
 * @param {number} [additionalMinimum]
 * @return {number}
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
 * @param {number} stepNumber
 * @param {object} settingsObject
 */
function verifySetupMaskStep(stepNumber, settingsObject) {
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
 * @param {number} stepNumber
 * @param {object} settingsObject
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
