
/**
 * Manages saving and loading simulation configurations and results
 */
class SimulationStorageManager {
  /**
   * Get all simulation results which have been auto-saved to local storage
   * @type {{date: string, configuration: object, result: {time: number, bodies: ObjectSnapshot[]}[]}[]}
   */
  static get autoSavedResults() {
    const autoSavedRes = localStorage.getItem('auto-saved-results');
    if (autoSavedRes === null) return [];
    const res = JSON.parse(autoSavedRes);
    for (const singleRes of res) {
      for (const snapshot of singleRes.result) {
        for (let i = 0; i < snapshot.bodies.length; i++)
          snapshot.bodies[i] = deserializeObjectSnapshot(snapshot.bodies[i]);
      }
    }
    return res;
  }

  /**
   * Auto save a simulation result (if the string length in serialized form is at most 200MB (approximately)).
   * This method automatically keeps only the last three simulation results that have been saved automatically, and discards older auto-saved results.
   * @param {object} configuration the simulation configuration object
   * @param {{time: number, bodies: ObjectSnapshot[]}[]} result the simulation result
   * @return {boolean} returns true if the result was saved (because its size was not too high), and false otherwise
   */
  static autoSaveResult(configuration, result) {
    const autoSaveObject = {
      date: (new Date()).toISOString(),
      configuration,
      result
    };
    const autoSaveString = JSON.stringify(autoSaveObject);
    if (autoSaveString.length <= 200 * 1024 * 1024) { // string length at most 200MB (assuming every character occupies only a single byte)
      const currentAutoSavedResults = this.autoSavedResults;
      if (currentAutoSavedResults.length == 3)
        currentAutoSavedResults.pop();
      currentAutoSavedResults.unshift(autoSaveObject);
      localStorage.setItem('auto-saved-results', JSON.stringify(currentAutoSavedResults));
      return true;
    } else {
      return false;
    }
  }
}

/**
 * Deserialize and object snapshot
 * @param {ObjectSnapshot|string} objSnapshot the serialized (using JSON.stringify) object snapshot, or the partly deserialized (using JSON.parse(JSON.stringify)) object snapshot.
 *                                            Important note: this method is required because object snapshots contain Color objects, which are not correctly deserialized by default.
 * @param {boolean} [mayNeedParsing=true] whether the parameter objSnapshot still might need to be deserialized using JSON.parse (if set to false, this is assumed to have been done already)
 * @return {ObjectSnapshot} the fully deserialized object snapshot. Attention: this method may also modify the object passed as the objSnapshot parameter!
 */
function deserializeObjectSnapshot(objSnapshot, mayNeedParsing = true) {
  if (mayNeedParsing && typeof objSnapshot === 'string')
    objSnapshot = JSON.parse(objSnapshot);
  for (const prop of Object.keys(objSnapshot)) {
    if (prop === 'color')
      objSnapshot[prop] = new Color(objSnapshot[prop]);
    else if (typeof objSnapshot[prop] === 'object')
      objSnapshot[prop] = deserializeObjectSnapshot(objSnapshot[prop], false);
  }
  return objSnapshot;
}
