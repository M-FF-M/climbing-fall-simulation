
/** @type {number} gravity acceleration constant in m/s^2 */
const GRAVITY_OF_EARTH = 9.807;
/** @type {V} gravity acceleration vector pointing downward along the y-axis (i.e. y-axis is height above ground) */
const GRAVITY_VEC = new V(0, -GRAVITY_OF_EARTH, 0);

/** @type {object} an object containing important global variables */
const GLOBALS = {
  /** @type {string} current version number of the simulation */
  version: '1.0.4',
  /** @type {string} date of the current version */
  versionDate: '2026-04-07'
};
