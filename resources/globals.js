
/** @type {number} gravity acceleration constant in m/s^2 */
const GRAVITY_OF_EARTH = 9.807;
/** @type {V} gravity acceleration vector pointing downward along the y-axis (i.e. y-axis is height above ground) */
const GRAVITY_VEC = new V(0, -GRAVITY_OF_EARTH, 0);

/** @type {object} an object containing important global variables */
const GLOBALS = {
  /** @type {number} the maximal step size for the simulation in seconds */
  maxStep: 0.00001,
  /** @type {boolean} should be set to true when the user wants to interrupt the calculation */
  interruptSimulation: false,
  /** @type {Rope} the climbing rope in the simulation */
  rope: null,
  /** @type {Body[]} all the bodies relevant for displaying the simulation results */
  bodies: [],
  /** @type {string} current version number of the simulation */
  version: '0.9.5',
  /** @type {string} date of the current version */
  versionDate: '2025-08-29'
};
