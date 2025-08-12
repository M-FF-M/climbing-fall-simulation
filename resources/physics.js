
// This script does not assume anything about the direction of gravity
// other parts of the code assume that gravity pulls along the negative y-axis

/**
 * @typedef {Object} ForceSnapshot snapshot of the forces applied to a body at a given time
 * @property {number} current the current force (in Newton) applied to a given body
 * @property {number} [average] the averaged force (in Newton) applied to a given body over the last averageWindow seconds
 * @property {number} [averageWindow] the length of the force averaging window in seconds
 */

/**
 * @typedef {Object} StateSnapshot snapshot of the visible state of a body at a given time (excludes e.g. speed or acceleration)
 * @property {[number, number, number]} [position] the current position of a given body (in 3D, coordinates are in meters); available for type 'point mass'
 * @property {[number, number, number][]} [segmentPositions] the current positions of the rope segments (in 3D, coordinates are in meters); available for type 'rope'
 * @property {Color} [color] the color of the body
 * @property {string} [radius] the radius used for drawing the point mass (in meters), or the radius used for drawing segment joints of a rope
 * @property {string} [thickness] the thickness of the rope, used for drawing purposes (in meters)
 */

/**
 * @typedef {Object} MaximaSnapshot snapshot of running maxima statistics of a body (e.g. maximal speed, maximal applied force up to current time point)
 * @property {number} [speed] the running maximal speed (in m/s) (maximal speed of the climber's rope end in case of a rope)
 * @property {number} [force] the running maximal force (in Newton) applied to the body (stretching force in case of a rope)
 * @property {number} [climberStretching] the running maximal stretching force (in Newton) at the climber's end of the rope
 * @property {number} [belayerStretching] the running maximal stretching force (in Newton) at the belayer's end of the rope
 */

/**
 * @typedef {Object} EnergySnapshot snapshot of the energy stored in a body
 * @property {number} kinetic the kinetic energy (in Joule)
 * @property {number} potential the potential energy (in Joule)
 * @property {number} [elastic] the elastic energy (in Joule) stored in a rope due to stretching
 * @property {number} [overall] the overall energy (in Joule) stored in the body
 */

/**
 * @typedef {Object} ObjectSnapshot snapshot of the state of a body at a given time
 * @property {'point mass'|'rope'} type the type of the body, can be used e.g. to draw the body appropriately
 * @property {string} id a unique string identifying this body
 * @property {string} name a name for this body, interpretable by a human
 * @property {ForceSnapshot} forces the current forces applied to the body
 * @property {StateSnapshot} visibleState the current visible state of the body (excludes e.g. speed or acceleration)
 * @property {EnergySnapshot} energy the current energy stored in the body
 * @property {MaximaSnapshot} [runningMaxima] some running maxima statistics (e.g. running maximal speed, etc.)
 */

/** The physics world contains all objects which are relevant to the physics simulation */
const PHYSICS_WORLD = {
  /** @type {Body[]} an array containing all bodies of the physics world */
  bodies: [],
  /** @type {{normal:V, shift:number, name:string}[]} an array containing all barriers of the physics world */
  barriers: [],
  /** @type {boolean} whether to display warnings when rope segments are too short compared to how far they move in a single simulation frame */
  warningsShortRopeSegments: true,
  /** @type {number} constant which is used for comparisons against zero */
  EPS: 1e-10,
  /** @type {number} counter used for generating unique body ids */
  idCounter: 0
};

/**
 * A class intended for modelling climbing ropes
 */
class Rope {
  /**
   * Create a new climbing rope
   * @param {number} [length=5] the length of the rope in meters
   * @param {number} [segments=1] the number of rope segments to use for modelling the rope
   * @param {Body} [end1] the body attached to one end / the belayer's of the rope (default is a body in the origin which is fixed, i.e., which cannot move)
   * @param {Body} [end2] the body attached to the other end / the climber's end of the rope (default is a point mass of 70 kg, hanging straight below the other, fixed rope end (in y-direction))
   * @param {Body[]} [deflectionPoints] an arbitrary number of deflection points (carabiners) through which the rope should pass.
   *                                    The rope passes through the deflection points in the order in which they are given, starting from end1 of the rope.
   */
  constructor(length = 5, segments = 1, end1 = new Body(0, 0, 0, 0, 'anchor'), end2 = new Body(0, -length, 0, 70, 'climber'), ...deflectionPoints) {
    /** @type {number} unique body id */
    this.id = PHYSICS_WORLD.idCounter;
    PHYSICS_WORLD.idCounter++;
    /** @type {string} a name for the body */
    this.name = 'rope';
    /** @type {number} the length of the unstretched rope in meters */
    this.restLength = length;
    /** @type {number} the weight of the entire rope in kilograms */
    this.mass = length * 0.062; // 62 g per meter of rope weight of typical climbing rope
    /** @type {number} the elasticity constant of the rope in 1/Newton */
    this.elasticityConstant = 0.079e-3; // 0.079e-3 1/N elasticity constant of typical climbing rope
    /** @type {number} the length of an unstretched standard rope segment in meters */
    this.segmentLength = length / segments;
    /** @type {number} required minimal rope segment length in meters */
    this.minSegmentLength = this.segmentLength * 0.01;
    /** @type {number} required maximal rope segment length in meters */
    this.maxSegmentLength = this.segmentLength * 1.1;
    /** @type {number} default rope segment length in meters */
    this.defaultSegmentLength = this.segmentLength;
    /** @type {number} damping coefficient for oscillations orthogonal to the rope, no direct physical background */
    this.dampingCoefficient = 0.02; // / this.segmentLength; // damping for oscillations orthogonal to the rope
    /** @type {number} damping coefficient for internal friction, no direct physical background */
    this.internalDamping = 0.1; // / this.segmentLength; // damping for internal friction

    const deflPts = [end1, ...deflectionPoints, end2];
    let cumLen = 0;
    const lenArr = []; // contains the cumulative rope lengths up to the respective deflection points
    for (let i = 1; i < deflPts.length; i++) {
      const len = deflPts[i].pos.minus(deflPts[i-1].pos).norm();
      cumLen += len;
      lenArr.push(cumLen);
    }
    /** @type {number} the current length of the rope (potentially stretched) in meters */
    this.currentLength = cumLen;

    const currentStretchingFactor = this.currentLength / this.restLength;
    const segmentMass = this.mass / segments;
    /** @type {RopeSegment[]} an array containing all the rope segments which are part of the rope */
    this.ropeSegments = [];
    /** @type {Body[]} an array containing all the bodies at the end of all of the rope segments */
    this.bodies = [end1]; // every rope segment is basically a spring connecting two bodies
    let lenArrIdx = 0;
    for (let i = 1; i <= segments; i++) {
      const dPoints = [], dPointPos = [], dPointSpeed = [];
      const partialRopeLen = i * (this.currentLength / segments); // length of first i segments
      let prevPartRopeLen = (i-1) * (this.currentLength / segments); // length of first (i-1) segments
      // insert all deflection points which lie within the current rope segment into the dPoints array
      while (lenArrIdx < deflectionPoints.length && (partialRopeLen + ((i == segments) ? PHYSICS_WORLD.EPS : 0)) > lenArr[lenArrIdx]) {
        dPoints.push(deflectionPoints[lenArrIdx]);
        dPointPos.push((lenArr[lenArrIdx] - prevPartRopeLen) / currentStretchingFactor); // rest length from previous up to the given deflection point
        dPointSpeed.push(0);
        prevPartRopeLen = lenArr[lenArrIdx];
        lenArrIdx++;
      }
      dPointPos.push((partialRopeLen - prevPartRopeLen) / currentStretchingFactor); // insert rest length from last deflection point up to end of rope segment
      if (i < segments) {
        const dSegLen = lenArr[lenArrIdx] - (lenArrIdx == 0 ? 0 : lenArr[lenArrIdx-1]); // length of the section from the last to the next deflection point
        const dSegFac = (partialRopeLen - (lenArrIdx == 0 ? 0 : lenArr[lenArrIdx-1])) / dSegLen; // fraction of that section at which the end of the current rope segment should lie
        // create new body at the end of the current deflection point
        this.bodies.push(new Body(...deflPts[lenArrIdx].pos.times(1 - dSegFac).plus(deflPts[lenArrIdx+1].pos.times(dSegFac)).arr,
          segmentMass * (1 + ((i == 1) ? 0.5 : 0) + ((i == segments-1) ? 0.5 : 0)), 'rope joint')); // body should have the mass of one rope segment; additional mass at beginning and end of rope because end1 and end2 bodies carry no rope mass
      } else { // this is the last segment => insert end2 as last body in the rope
        this.bodies.push(end2);
      }
      this.ropeSegments.push(new RopeSegment(
        this.bodies[i-1], this.bodies[i], segmentMass,
        this.defaultSegmentLength, this.minSegmentLength, this.maxSegmentLength, this.defaultSegmentLength,
        this.elasticityConstant, this.dampingCoefficient, this.internalDamping
      ));
      this.ropeSegments[i-1].deflectionPointPositions = []; // clear default entry from deflectionPointPositions array
      for (const dp of dPoints) this.ropeSegments[i-1].deflectionPoints.push(dp); // insert deflection points
      for (const dp of dPointPos) this.ropeSegments[i-1].deflectionPointPositions.push(dp);
      for (const dp of dPointSpeed) this.ropeSegments[i-1].deflectionPointSlidingSpeeds.push(dp);
    }
    if (lenArrIdx != deflectionPoints.length || this.ropeSegments.length != segments)
      throw new Error(`not all deflection points included in rope (${lenArrIdx} of ${deflectionPoints.length}) or wrong number of segments (${this.ropeSegments.length} instead of ${segments})`);

    for (let i = 0; i < this.ropeSegments.length; i++) { // set previous/followingSegment, rope and indexInRope properties of rope segments
      if (i > 0) this.ropeSegments[i].previousSegment = this.ropeSegments[i-1];
      if (i+1 < this.ropeSegments.length) this.ropeSegments[i].followingSegment = this.ropeSegments[i+1];
      this.ropeSegments[i].rope = this;
      this.ropeSegments[i].indexInRope = i;
    }
    for (let i = 1; i+1 < this.bodies.length; i++) { // check body weights
      const newMass = ((i == 1) ? 1 : 0.5) * this.ropeSegments[i-1].mass + ((i+1 == this.bodies.length-1) ? 1 : 0.5) * this.ropeSegments[i].mass;
      if (Math.abs(this.bodies[i].mass - newMass) > PHYSICS_WORLD.EPS)
        console.warn(`Unexplainable rope body weight inconsistency at body ${i}: ${newMass} vs. ${this.bodies[i].mass}`);
      this.bodies[i].mass = newMass;
    }
    this.postprocessTimeStep(); // if deflection points are too close to an end of a rope segment, this function will merge them to avoid rope segments which are too short

    /** @type {number} the force in Newton which is required to stretch the rope to its current length */
    this.currentStretchingForce = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    /** @type {number} the elastic energy in Joule which is stored in the (stretched) rope */
    this.currentElasticEnergy = 0.5 * (this.currentLength - this.restLength) * (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    /** @type {number} running maximum of currentStretchingForce */
    this.maxStretchingForce = this.currentStretchingForce;
    /** @type {number} running maximum of the force applied to the climber's end of the rope (end2) */
    this.maxClimberForce = this.currentStretchingForce;
    /** @type {number} running maximum of the force applied to the belayer's end of the rope (end1) */
    this.maxBelayerForce = this.currentStretchingForce;
    /** @type {number} running maximum of the velocity of the climber's end of the rope (end2) */
    this.maxEndSpeed = end2.velocity.norm();
    
    /** @type {Color} color used for drawing this rope */
    this.drawingColor = new Color(0, 0, 0);
    /** @type {number} thickness of the rope (in meters) used for drawing this rope */
    this.drawingThickness = 0.03; // default is 3 cm
    /** @type {number} radius of the rope segment joints (in meters) used for drawing this rope */
    this.drawingRadius = 0.03; // default is 3 cm
  }

  /**
   * Remove a rope segment. Updates the rope segment indices, the followingSegment and previousSegment properties,
   * and removes the indicated segment from the ropeSegments array, as well as the corresponding bodies from the bodies array.
   * The two bodies attached to the removed segment are removed, and replaced by the body attached to the appropriate end
   * of one of the two neighboring segments which are now joined. This function does not modify bodyA and bodyB properties
   * of the rope segments. This has to be done separately (before calling this function)!
   * @param {number} idx the index of the rope segment to remove
   */
  removeRopeSegment(idx) {
    this.ropeSegments.splice(idx, 1);
    for (let i = idx; i < this.ropeSegments.length; i++)
      this.ropeSegments[i].indexInRope = i;
    if (idx > 0 && idx < this.ropeSegments.length) {
      this.ropeSegments[idx-1].followingSegment = this.ropeSegments[idx];
      this.ropeSegments[idx].previousSegment = this.ropeSegments[idx-1];
    } else {
      if (idx < this.ropeSegments.length) this.ropeSegments[idx].previousSegment = null;
      if (idx > 0) this.ropeSegments[idx-1].followingSegment = null;
    }
    this.bodies.splice(idx, 2, idx < this.ropeSegments.length ? this.ropeSegments[idx].bodyA : this.ropeSegments[idx-1].bodyB);
  }

  /**
   * Insert a rope segment. Updates the rope segment indices, the followingSegment and previousSegment properties,
   * and inserts the indicated segment into the ropeSegments array, as well as the corresponding bodies into the bodies array.
   * The body between the two segments which are now separated by the new segment is removed.
   * This function does not modify bodyA and bodyB properties of the rope segments. This has to be done separately
   * (before calling this function)!
   * @param {number} idx the index at which to insert the rope segment
   * @param {RopeSegment} ropeSeg the rope segment to insert
   */
  insertRopeSegment(idx, ropeSeg) {
    ropeSeg.rope = this;
    this.ropeSegments.splice(idx, 0, ropeSeg);
    for (let i = idx; i < this.ropeSegments.length; i++)
      this.ropeSegments[i].indexInRope = i;
    if (idx > 0) {
      this.ropeSegments[idx].previousSegment = this.ropeSegments[idx-1];
      this.ropeSegments[idx-1].followingSegment = this.ropeSegments[idx];
    }
    if (idx+1 < this.ropeSegments.length) {
      this.ropeSegments[idx].followingSegment = this.ropeSegments[idx+1];
      this.ropeSegments[idx+1].previousSegment = this.ropeSegments[idx];
    }
    this.bodies.splice(idx, 1, ropeSeg.bodyA, ropeSeg.bodyB);
  }

  /**
   * Apply gravity to the rope. Calls the applyGravity functions of the rope segments.
   * @param {V} f the gravity acceleration vector in m / s^2
   */
  applyGravity(f) {
    for (let i = 0; i < this.ropeSegments.length; i++) {
      this.ropeSegments[i].applyGravity(f);
    }
  }

  /**
   * Apply the rope forces, i.e., the spring forces, to all bodies which are part of the rope.
   * Calls the applyRopeForces functions of the rope segments, and updates the current length and elastic energy of the rope,
   * as well as the running force maxima. Throws an error if the rope segments' rest length is not consistent with the rope rest length.
   */
  applyRopeForces() {
    this.currentLength = 0;
    this.currentElasticEnergy = 0;
    let checkRestLen = 0;
    for (let i = 0; i < this.ropeSegments.length; i++) {
      this.ropeSegments[i].applyRopeForces();
      this.currentLength += this.ropeSegments[i].currentLength;
      this.currentElasticEnergy += this.ropeSegments[i].currentElasticEnergy;
      checkRestLen += this.ropeSegments[i].restLength;
      if (i == 0) this.maxBelayerForce = Math.max(this.maxBelayerForce, this.ropeSegments[i].currentStretchingForce);
      if (i == this.ropeSegments.length-1) this.maxClimberForce = Math.max(this.maxClimberForce, this.ropeSegments[i].currentStretchingForce);
    }
    this.currentStretchingForce = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    this.maxStretchingForce = Math.max(this.currentStretchingForce, this.maxStretchingForce);
    if (Math.abs(checkRestLen - this.restLength) > PHYSICS_WORLD.EPS)
      throw new Error('The rest length of the rope segments is off!');
  }

  /**
   * Execute a time step for all bodies in the rope. Calls the timeStep functions of the rope segments and the postprocessTimeStep functions.
   * Updates the running maximum speed of the climber's rope end.
   * @param {number} delta the length of the time step in seconds
   * @param {boolean} [clearForces=true] whether to clear all forces currently applied to the bodies
   */
  timeStep(delta, clearForces = true) {
    for (let i = 0; i < this.ropeSegments.length; i++)
      this.ropeSegments[i].timeStep(delta, clearForces);
    this.postprocessTimeStep();
    this.maxEndSpeed = Math.max(this.maxEndSpeed, this.bodies[this.bodies.length - 1].velocity.norm());
  }

  /**
   * Postprocess a time step. First calls all the postprocessTimeStepA functions of the rope segments, then all the
   * postprocessTimeStepB functions.
   */
  postprocessTimeStep() {
    for (let i = 0; i < this.ropeSegments.length; i++)
      i = this.ropeSegments[i].postprocessTimeStepA();
    for (let i = 0; i < this.ropeSegments.length; i++)
      i = this.ropeSegments[i].postprocessTimeStepB();
  }
  
  /**
   * The current kinetic energy of the entire rope (in Joule)
   * @type {number}
   */
  get currentKineticEnergy() {
    let energy = 0;
    for (let i = 0; i < this.bodies.length; i++)
      energy += this.bodies[i].currentKineticEnergy;
    return energy;
  }

  /**
   * The current potential energy of the entire rope (in Joule); depends on the vector supplied to the applyGravity function
   * @type {number}
   */
  get currentPotentialEnergy() {
    let energy = 0;
    for (let i = 0; i < this.bodies.length; i++)
      energy += this.bodies[i].currentPotentialEnergy;
    return energy;
  }

  /**
   * Capture information about the current state of the rope (note: the energy snapshot includes kinetic and potential energy of belayer and climber)
   * @return {ObjectSnapshot} a snapshot of the current state of the rope
   */
  captureSnapshot() {
    const segPos = [];
    for (let i = 0; i < this.ropeSegments.length; i++) {
      segPos.push(this.ropeSegments[i].bodyA.pos.arr);
      if (this.ropeSegments[i].deflectionPoints.length > 0) {
        for (const dPoint of this.ropeSegments[i].deflectionPoints)
          segPos.push(dPoint.pos.arr);
      }
      if (i == this.ropeSegments.length - 1)
        segPos.push(this.ropeSegments[i].bodyB.pos.arr);
    }
    const kin = this.currentKineticEnergy;
    const pot = this.currentPotentialEnergy;
    const ela = this.currentElasticEnergy;
    return {
      type: 'rope',
      id: `${this.name} [${this.id}]`,
      name: this.name,
      visibleState: {
        segmentPositions: segPos,
        color: this.drawingColor,
        radius: this.drawingRadius,
        thickness: this.drawingThickness
      },
      forces: {
        current: this.currentStretchingForce
      },
      energy: {
        kinetic: kin,
        potential: pot,
        elastic: ela,
        overall: kin + pot + ela
      },
      runningMaxima: {
        speed: this.maxEndSpeed,
        force: this.maxStretchingForce,
        climberStretching: this.maxClimberForce,
        belayerStretching: this.maxBelayerForce
      }
    };
  }
}

/**
 * A single segment of a climbing rope - an extension of a simple linear spring
 */
class RopeSegment {
  /**
   * Create a new rope segment (which is an extension of a simple linear spring)
   * @param {Body} end1 the body at one end of the spring (the body closer to the belayer's end of the rope)
   * @param {Body} end2 the body at the other end of the spring (the body closer to the climber's end of the rope)
   * @param {number} mass the mass of the rope segment in kilograms
   * @param {number} restLength the (current) rest length of the rope segment in meters. Rope segments can be cut and
   *                            appended to one another, which might lead to changing rest lengths.
   * @param {number} minRLength the required minimal rest length of the (all) rope segment(s) in meters
   * @param {number} maxRLength the required maximal rest length of the (all) rope segment(s) in meters
   * @param {number} defaultRLength the default rest length of the (all) rope segment(s) in meters
   * @param {number} elasticityConstant the elasticity constant of the rope in 1/Newton
   * @param {number} dampingCoefficient damping coefficient for oscillations orthogonal to the rope, no direct physical background
   * @param {number} internalDamping damping coefficient for internal friction, no direct physical background
   */
  constructor(end1, end2, mass, restLength, minRLength, maxRLength, defaultRLength, elasticityConstant, dampingCoefficient, internalDamping) {
    /** @type {number} unique body id */
    this.id = PHYSICS_WORLD.idCounter;
    PHYSICS_WORLD.idCounter++;
    /** @type {Body} the body at one end of the segment/spring (the body closer to the belayer's end of the rope) */
    this.bodyA = end1;
    /** @type {Body} the body at the other end of the segment/spring (the body closer to the climber's end of the rope) */
    this.bodyB = end2;
    /** @type {number} the mass of the rope segment in kilograms */
    this.mass = mass;
    /** @type {number} the current length of the (potentially stretched) rope segment in meters */
    this.currentLength = this.bodyB.pos.minus(this.bodyA.pos).norm();
    /** @type {number} the rest length of the rope segment in meters */
    this.restLength = restLength;
    /** @type {number} the required minimal rest length of the (all) rope segment(s) in meters */
    this.minRestLength = minRLength;
    /** @type {number} the required maximal rest length of the (all) rope segment(s) in meters */
    this.maxRestLength = maxRLength;
    /** @type {number} the default rest length of the (all) rope segment(s) in meters */
    this.defaultRestLength = defaultRLength;
    /** @type {number} the elasticity constant of the rope in 1/Newton */
    this.elasticityConstant = elasticityConstant;
    /** @type {number} damping coefficient for oscillations orthogonal to the rope, no direct physical background */
    this.dampingCoefficient = dampingCoefficient;
    /** @type {number} damping coefficient for internal friction, no direct physical background */
    this.internalDamping = internalDamping;

    /** @type {number} the spring constant of the rope segment in Newton/meter */
    this.springConstant = 1 / (this.restLength * this.elasticityConstant);
    /** @type {RopeSegment|null} the previous segment in the rope (closer to the belayer's end, null if this segment is at the end) */
    this.previousSegment = null; // 2nd rope segment attached to bodyA (null if bodyA is the end of the rope)
    /** @type {RopeSegment|null} the next segment in the rope (closer to the climber's end, null if this segment is at the end) */
    this.followingSegment = null; // 2nd rope segment attached to bodyB (null if bodyB is the end of the rope)
    /** @type {Rope} the parent rope object */
    this.rope = null; // parent rope object
    /** @type {number} the index in the parent rope object's ropeSegments array */
    this.indexInRope = -1; // index of rope segment within entire rope
    /** @type {Body[]} the deflection points (carabiners) through which this rope segment passes (in the order from bodyA to bodyB) */
    this.deflectionPoints = []; // simulates that the rope passes through carabiners (order: from bodyA to bodyB)
    /** @type {number[]} specifies how the rest length of this rope segment is distributed between the deflection points */
    this.deflectionPointPositions = [this.restLength]; // rest lengths from bodyA or previous deflection point to indexed deflection point
      // plus rest length from last deflection point to bodyB
      // thus, this.deflectionPointPositions.length = this.deflectionPoints.length + 1
    /** @type {number[]} the speed in m/s at which the rope slides through the deflection points */
    this.deflectionPointSlidingSpeeds = []; // rope sliding speeds at deflection points (from bodyA to bodyB)
      // same length as this.deflectionPoints
    /** @type {number} the force in Newton which is required to stretch the rope segment to its current length */
    this.currentStretchingForce = 0;
    /** @type {number} the elastic energy in Joule which is stored in the (stretched) rope segment */
    this.currentElasticEnergy = 0;
  }

  /**
   * Apply gravity to the rope segment. Calls the applyGravity function of bodyA, and also of bodyB if this is the last segment in the rope.
   * @param {V} f the gravity acceleration vector in m / s^2
   */
  applyGravity(f) {
    this.bodyA.applyGravity(f);
    if (this.followingSegment === null)
      this.bodyB.applyGravity(f);
  }

  /**
   * Apply the rope forces, i.e., the spring forces, to the two bodies attached to this rope segment.
   * May throw errors or warnings if inconsistencies in the current system state are detected. For details, check the code.
   */
  applyRopeForces() {
    this.currentLength = 0; // current (stretched) length of the rope segment
    this.currentElasticEnergy = 0; // current elastic energy stored in the rope segment
    let len = 0; // temporary variable for calculating the current length of the rope segment
    /** @type {V[]} contains vectors pointing from one deflection point (or rope segment end) to the next */
    this.tmpDiffArr = [];
    /** @type {number[]} contains the actual distance between the deflection points, and between the deflection points and the two ends of the rope segment */
    this.tmpLenArr = [];
    /** @type {number[]} contains the current tensions (in Newton) within the parts (between deflection points) of the rope segment */
    this.tmpTensionArr = [];
    /** @type {number[]} contains the angles (always >= 0) between incoming and outgoing rope at the deflection points */
    this.tmpAngleArr = [];
    const deflPts = [this.bodyA, ...this.deflectionPoints, this.bodyB]; // array containing deflection points as well as rope segment ends
    let startDiff = null; let startDiffLen = 0; let startTension = 0; // first entry of tmpDiffArr, tmpLenArr, tmpTensionArr
    let endDiff = null; let endDiffLen = 0; let endTension = 0; // last entry of tmpDiffArr, tmpLenArr, tmpTensionArr
    let currentRestLength = 0; // temporary variable for calculating and checking the current rest length of the rope segment
    for (let i = 1; i < deflPts.length; i++) {
      const bodyA = deflPts[i-1];
      const bodyB = deflPts[i];
      const diff = bodyB.pos.minus(bodyA.pos); // vector pointing from one deflection point to the next
      const diffLen = diff.norm(); // distance between the two deflection points
      if (diffLen == 0) throw new Error(`zero actual length of part of rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
      len += diffLen; // calculate current (stretched) length of the rope segment
      this.tmpDiffArr.push(diff);
      this.tmpLenArr.push(diffLen);

      const restLen = this.deflectionPointPositions[i-1]; // rest length of the rope segment between the two deflection points
      if (restLen < 0) console.warn(`detected negative rest length of part of rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
      else if (restLen > 0 && restLen < this.minRestLength / 2 && PHYSICS_WORLD.warningsShortRopeSegments) console.warn(`detected small rest length ${restLen} of part of rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
      else if (restLen == 0) throw new Error(`zero rest length of part of rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
      currentRestLength += restLen; // calculate current rest length of the rope segment
      const tension = (diffLen - restLen) / (restLen * this.elasticityConstant); // tension (= stretching force) within the segment between the two deflection points
      this.currentElasticEnergy += 0.5 * (diffLen - restLen) * (diffLen - restLen) / (restLen * this.elasticityConstant); // stored elastic energy
      this.tmpTensionArr.push(tension);
      
      if (endDiff !== null) { // calculate angle between incoming and outgoing rope at deflection point (endDiff contains vector pointing from previous deflection point to current local bodyA)
        this.tmpAngleArr.push(
          Math.acos( Math.min(1, Math.max(-1,
            diff.dot(endDiff) / (diffLen * endDiffLen)
          )) )
        );
      } else { // only in first iteration
        this.tmpAngleArr.push(0);
      }

      if (startDiffLen == 0) {
        startDiff = diff;
        startDiffLen = diffLen;
        startTension = tension;
      }
      endDiff = diff;
      endDiffLen = diffLen;
      endTension = tension;
    }

    if (len == 0) throw new Error(`zero actual length of entire rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
    else if (currentRestLength < 0) console.warn(`detected negative rest length entire rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
    else if (currentRestLength > 0 && currentRestLength < this.minRestLength / 2 && PHYSICS_WORLD.warningsShortRopeSegments) console.warn(`detected small rest length ${currentRestLength} of entire rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
    else if (currentRestLength == 0) throw new Error(`zero rest length of entire rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
    /** @type {V} vector pointing from bodyA to first deflection point (or bodyB) */
    this.tmpStartDiff = startDiff;
    /** @type {number} distance of bodyA to first deflection point (or bodyB) */
    this.tmpStartDiffLen = startDiffLen;
    /** @type {V} vector pointing from last deflection point (or bodyA) to bodyB */
    this.tmpEndDiff = endDiff;
    /** @type {number} distance of last deflection point (or bodyA) to bodyB */
    this.tmpEndDiffLen = endDiffLen;
    this.currentLength = len;
    if (Math.abs(this.restLength - currentRestLength) > PHYSICS_WORLD.EPS) console.warn(`rope segment with changing rest length: ${this.restLength} to ${currentRestLength}`);
    this.restLength = currentRestLength;
    this.currentStretchingForce = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant); // update stretching force

    const directionA = startDiff.times(1 / startDiffLen);
    const directionB = endDiff.times(1 / endDiffLen);
    /** @type {V} normalized vector (length 1) pointing from bodyA to first deflection point (or bodyB) */
    this.tmpDirectionA = directionA;
    /** @type {V} normalized vector (length 1) pointing from last deflection point (or bodyA) to bodyB */
    this.tmpDirectionB = directionB;
    this.bodyA.applyForce(directionA.times(startTension)); // bodyA is pulled in direction of (or pushed away from) first deflection point (or bodyB)
    this.bodyB.applyForce(directionB.times(-endTension)); // bodyB is pulled in direction of (or pushed away from) last deflection point (or bodyA)

    const lengthChangeRateA = -this.bodyA.velocity.dot(directionA); // rate at which (stretched) rope segment length changes due to movement of bodyA
    const lengthChangeRateB = this.bodyB.velocity.dot(directionB); // rate at which (stretched) rope segment length changes due to movement of bodyB

    if (this.bodyA.mass > 0 && this.bodyB.mass > 0) { // if both bodies can move (recall: mass 0 => fixed body), apply damping perpendicular to rope (prevent sharp corner from appearing, rope should curve smoothly)
      const relativeParallelA = directionA.times(lengthChangeRateA); // velocity component of bodyA in -directionA
      const relativeParallelB = directionB.times(lengthChangeRateB); // velocity component of bodyB in directionB
      const relativePerpA = this.bodyA.velocity.times(-1).minus(relativeParallelA); // (negative of) velocity component of bodyA perpendicular to rope
      const relativePerpB = this.bodyB.velocity.minus(relativeParallelB); // velocity component of bodyB perpendicular to rope
      const relativePerp = relativePerpA.plus(relativePerpB); // relative velocity of rope segment ends perpendicular to rope

      const dampingForce = relativePerp.times(this.dampingCoefficient / this.restLength); // damping should be proportional to damping coefficient, and damping should be stronger for shorter rope segments (less curvature in short rope segments)
      this.bodyA.applyForce(dampingForce); // align bodyA's movement (perpendicular component to rope) closer with bodyB's movement
      this.bodyB.applyForce(dampingForce.times(-1)); // align bodyB's movement (perpendicular component to rope) closer with bodyA's movement
    }
  
    const lengthChangeRate = lengthChangeRateA + lengthChangeRateB; // rate at which (stretched) rope segment length changes
    // damping along rope direction should be proportional to damping coefficient, and damping should be stronger for shorter rope segments (short rope segments are stiffer / their length is harder to change)
    this.bodyA.applyForce(directionA.times(lengthChangeRate * this.internalDamping / this.restLength)); // damping force opposed to, and proportional to, rope stretching rate, applied to bodyA
    this.bodyB.applyForce(directionB.times(-lengthChangeRate * this.internalDamping / this.restLength)); // damping force in opposed to, and proportional to, rope stretching rate, applied to bodyB
  }

  /**
   * Execute a time step for this rope segment. Calls the timeStep function of bodyA, and also of bodyB if this is the last rope segment.
   * Calculates friction and sliding forces at the deflection points and updates the sliding speeds as well as the deflection point positions
   * (or rather, how the rest length is distributed between the deflection points).
   * @param {number} delta the length of the time step in seconds
   * @param {boolean} [clearForces=true] whether to clear all forces currently applied to the bodies
   */
  timeStep(delta, clearForces = true) {
    for (let i = 0; i < this.deflectionPoints.length; i++) {
      let tensionLeft = this.tmpTensionArr[i]; // read calculated tensions (see applyRopeForces()) to the left and to the right of the deflection point
      let tensionRight = this.tmpTensionArr[i+1];
      const slidingForce = tensionRight - tensionLeft; // force pulling the rope over the deflection point from bodyA to bodyB
      // calculate the friction force, which is proportional to the normal force (the force pushing the rope against the carabiner)
      // for details, search for Capstan equation: https://en.wikipedia.org/wiki/Capstan_equation
      const frictionForce = (tensionLeft > 0 && tensionRight > 0)
        ? Math.min(tensionLeft, tensionRight) * (Math.exp(this.deflectionPoints[i].frictionCoefficient * this.tmpAngleArr[i+1]) - 1)
        : 0; // no friction force (approximation!) if the rope is not under tension on at least one side of the deflection point
      let effectiveSlidingForce = 0; // positive sign: in direction of bodyB, negative sign: in direction of bodyA
      if (this.deflectionPointSlidingSpeeds[i] != 0) { // the rope already slides through the carabiner
        if (this.deflectionPointSlidingSpeeds[i] > 0) effectiveSlidingForce = slidingForce - frictionForce; // friction force opposes the direction of movement => different calculation depending on direction
        else effectiveSlidingForce = slidingForce + frictionForce; // note: direction of slidingForce and direction of movement usually agree, unless the rope is in a phase where it changes sliding directions
      } else { // rope doesn't move yet => the sliding force must exceed the friction force before it starts moving
        if (frictionForce < Math.abs(slidingForce)) { // if sliding force exceeds friction force
          if (slidingForce > 0) effectiveSlidingForce = slidingForce - frictionForce; // friction force opposes the sliding force => different calculation depending on direction
          else effectiveSlidingForce = slidingForce + frictionForce;
        }
      }
      
      const slidingAcc = effectiveSlidingForce / this.mass; // calculate the rope acceleration
      this.deflectionPointSlidingSpeeds[i] += slidingAcc * delta; // update sliding speed
      if ((Math.abs(this.deflectionPointSlidingSpeeds[i]) < Math.abs(slidingAcc * delta) - PHYSICS_WORLD.EPS) // if sliding speed close to 0 or if it changed signs
          && (frictionForce >= Math.abs(slidingForce))) // and if the friction force is bigger than the sliding force
        this.deflectionPointSlidingSpeeds[i] = 0; // then, the rope stops sliding
      this.deflectionPointPositions[i] -= this.deflectionPointSlidingSpeeds[i] * delta; // update rest length of segment to the left of the deflection point
      this.deflectionPointPositions[i+1] += this.deflectionPointSlidingSpeeds[i] * delta; // update rest length of segment to the right of the deflection point
    }

    this.bodyA.timeStep(delta, clearForces); // execute end body (bodies) timeStep functions
    if (this.followingSegment === null)
      this.bodyB.timeStep(delta, clearForces);
  }

  /**
   * First time step postprocessing task: merge rope segments which are too short. Also handle the rope
   * slipping out of a deflection point.
   * @return {number} the index of this rope segment in the rope (after processing)
   */
  postprocessTimeStepA() {
    if (this.deflectionPointPositions[0] < this.minRestLength) { // the part between bodyA and first deflection point has become too short
      if (this.previousSegment === null) { // first rope segment
        if (this.deflectionPoints.length > 0) { // rope slips out of first deflection point
          this.deflectionPointPositions[1] += this.deflectionPointPositions[0];
          this.deflectionPoints.shift(); // remove deflection point from which the rope has slipped
          this.deflectionPointSlidingSpeeds.shift();
          this.deflectionPointPositions.shift();
        } else { // no deflection points and rest length becomes smaller than minimal rest length: should not be possible
          if (PHYSICS_WORLD.warningsShortRopeSegments) console.warn(`first segment of rope too short: ${this.deflectionPointPositions[0]}`);
        }
      } else { // not the first rope segment => merge with previous rope segment (delete previous rope segment as well as bodyA of this segment (= bodyB of previous segment))
        this.mass += this.previousSegment.mass; // sum masses
        if (this.previousSegment.previousSegment === null) { // if previous segment is the first segment (then this segment now becomes the first segment)
          if (this.followingSegment !== null) // and if there is a segment after this one
            this.bodyB.mass = 0.5 * this.followingSegment.mass + this.mass; // then, the new bodyA will be the belayer (which does not carry rope mass), so bodyB must carry all the weight of this segment and half of the following's one
        } else { // if previous segment is NOT the first segment
          if (this.followingSegment !== null) { // and if there is a segment after this one
            this.bodyB.mass = 0.5 * this.followingSegment.mass + 0.5 * this.mass; // bodyB carries half the weight of this and the following segment
            this.previousSegment.bodyA.mass = 0.5 * this.mass + 0.5 * this.previousSegment.previousSegment.mass; // same holds for bodyA of the previous segment (bodyA of this segment (= bodyB of previous segment) will be removed)
          } else { // if there is NO segment after this one
            this.previousSegment.bodyA.mass = this.mass + 0.5 * this.previousSegment.previousSegment.mass; // then, bodyB is the climber (which does not carry rope mass), so the new bodyA (= bodyA of previous segment) must carry all the weight of this (new) segment and half of the previous' one
          }
        }
        this.restLength += this.previousSegment.restLength; // sum rest lengths
        this.deflectionPointPositions[0] += this.previousSegment.deflectionPointPositions.pop(); // merge deflection point arrays of previous segment into this one
        while (this.previousSegment.deflectionPointPositions.length > 0)
          this.deflectionPointPositions.unshift(this.previousSegment.deflectionPointPositions.pop());
        while (this.previousSegment.deflectionPointSlidingSpeeds.length > 0)
          this.deflectionPointSlidingSpeeds.unshift(this.previousSegment.deflectionPointSlidingSpeeds.pop());
        while (this.previousSegment.deflectionPoints.length > 0)
          this.deflectionPoints.unshift(this.previousSegment.deflectionPoints.pop());
        this.bodyA = this.previousSegment.bodyA; // the old bodyA of this segment is deleted and replaced by bodyA of the previousSegment (which will be deleted)
        this.rope.removeRopeSegment(this.indexInRope - 1); // remove the previous segment from the rope
      }
    }
    // if the part between bodyB and the last deflection point has become too short
    if (this.deflectionPoints.length > 0 && this.deflectionPointPositions[this.deflectionPoints.length] < this.minRestLength) {
      if (this.followingSegment === null) { // last rope segment
        if (this.deflectionPoints.length > 0) { // rope slips out of last deflection point
          this.deflectionPointPositions[this.deflectionPoints.length - 1] += this.deflectionPointPositions[this.deflectionPoints.length];
          this.deflectionPoints.pop(); // remove deflection point from which the rope has slipped
          this.deflectionPointSlidingSpeeds.pop();
          this.deflectionPointPositions.pop();
        } else { // no deflection points and rest length becomes smaller than minimal rest length: should not be possible
          if (PHYSICS_WORLD.warningsShortRopeSegments) console.warn(`last segment of rope too short: ${this.deflectionPointPositions[0]}`);
        }
      } else { // not the last rope segment => merge with following rope segment (delete following segment as well as bodyB of this segment (= bodyA of the following segment))
        this.mass += this.followingSegment.mass; // sum masses
        if (this.followingSegment.followingSegment === null) { // if following segment is the last segment (then this segment now becomes the last segment)
          if (this.previousSegment !== null) // and if there is a segment before this one
            this.bodyA.mass = 0.5 * this.previousSegment.mass + this.mass; // then, the new bodyB will be the climber (which does not carry rope mass), so bodyA must carry all the weight of this segment and half of the previous' one
        } else { // if following segment is NOT the last segment
          if (this.previousSegment !== null) { // and if there is a segment before this one
            this.bodyA.mass = 0.5 * this.previousSegment.mass + 0.5 * this.mass; // bodyA carries half the weight of this and the previous segment
            this.followingSegment.bodyB.mass = 0.5 * this.mass + 0.5 * this.followingSegment.followingSegment.mass; // same holds for bodyB of the following segment (bodyB of this segment (= bodyA of following segment) will be removed)
          } else { // if there is NO segment before this one
            this.followingSegment.bodyB.mass = this.mass + 0.5 * this.followingSegment.followingSegment.mass; // then, bodyA is the belayer (which does not carry rope mass), so the new bodyB (= bodyB of following segment) must carry all the weight of this (new) segment and half of the following's one
          }
        }
        this.restLength += this.followingSegment.restLength; // sum rest lengths
        this.deflectionPointPositions[this.deflectionPoints.length] += this.followingSegment.deflectionPointPositions.shift(); // merge deflection point arrays of next segment into this one
        while (this.followingSegment.deflectionPointPositions.length > 0)
          this.deflectionPointPositions.push(this.followingSegment.deflectionPointPositions.shift());
        while (this.followingSegment.deflectionPointSlidingSpeeds.length > 0)
          this.deflectionPointSlidingSpeeds.push(this.followingSegment.deflectionPointSlidingSpeeds.shift());
        while (this.followingSegment.deflectionPoints.length > 0)
          this.deflectionPoints.push(this.followingSegment.deflectionPoints.shift());
        this.bodyB = this.followingSegment.bodyB; // the old bodyB of this segment is deleted and replaced by bodyB of the followingSegment (which will be deleted)
        this.rope.removeRopeSegment(this.indexInRope + 1); // remove the following segment from the rope
      }
    }
    return this.indexInRope;
  }

  /**
   * Second time step postprocessing task: split rope segments which are too long
   * @return {number} the index of the last fully processed rope segment in the rope (i.e. the next index might still need to be split )
   */
  postprocessTimeStepB() {
    for (let i = 0; i < this.deflectionPointPositions.length; i++) {
      if (this.deflectionPointPositions[i] > this.maxRestLength) { // if segment is too long
        if (this.deflectionPoints.length == 0) throw new Error(`segment without deflection points too long: ${this.deflectionPointPositions[i]}`);
        if (i == 0) { // part from rope segment end (closer to belayer) to first deflection point is too long
          const frac = this.defaultRestLength / this.deflectionPointPositions[0]; // new segment with defaultRestLength will be inserted
          const newMass = this.defaultRestLength / this.restLength * this.mass; // mass of the new segment
          this.mass -= newMass; // this segment will be shortened; calculate its new mass
          this.deflectionPointPositions[0] -= this.defaultRestLength; // this segment will be shortened; calculate its new rest length
          this.restLength -= this.defaultRestLength;
          const nBody = new Body(
            ...this.bodyA.pos.times(1-frac).plus(this.deflectionPoints[0].pos.times(frac)).arr,
            ((this.previousSegment === null) ? 1 : 0.5) * newMass + ((this.followingSegment === null) ? 1 : 0.5) * this.mass,
            'rope joint'
          ); // create new body connecting this segment and the one which will be inserted
          nBody.velocity = this.bodyA.velocity; // the new body should have the same speed as the old end of this segment
          if (this.previousSegment !== null) this.bodyA.mass = 0.5 * newMass + 0.5 * this.previousSegment.mass; // adapt end body masses (which should change because the rope segment's mass changes)
          if (this.followingSegment !== null) this.bodyB.mass = 0.5 * this.followingSegment.mass + 0.5 * this.mass;
          const newBodyA = this.bodyA; // bodyA will become the new bodyA of the new segment
          this.bodyA = nBody; // this segment will have the new connecting body as bodyA
          const nRopeSeg = new RopeSegment(newBodyA, this.bodyA, newMass,
            this.defaultRestLength, this.minRestLength, this.maxRestLength,
            this.defaultRestLength, this.elasticityConstant, this.dampingCoefficient,
            this.internalDamping
          ); // create new rope segment (with default rest length)
          this.rope.insertRopeSegment(this.indexInRope, nRopeSeg); // insert segment into rope
          return this.indexInRope - 1; // the current segment (this) might still be too long => process it again
        } else if (i == this.deflectionPointPositions.length - 1) { // part from rope segment end (closer to climber) to last deflection point is too long
          const frac = this.defaultRestLength / this.deflectionPointPositions[this.deflectionPoints.length]; // new segment with defaultRestLength will be inserted
          const newMass = this.defaultRestLength / this.restLength * this.mass; // mass of the new segment
          this.mass -= newMass; // this segment will be shortened; calculate its new mass
          this.deflectionPointPositions[this.deflectionPoints.length] -= this.defaultRestLength; // this segment will be shortened; calculate its new rest length
          this.restLength -= this.defaultRestLength;
          const nBody = new Body(
            ...this.bodyB.pos.times(1-frac).plus(this.deflectionPoints[this.deflectionPoints.length-1].pos.times(frac)).arr,
            ((this.followingSegment === null) ? 1 : 0.5) * newMass + ((this.previousSegment === null) ? 1 : 0.5) * this.mass,
            'rope joint'
          ); // create new body connecting this segment and the one which will be inserted
          nBody.velocity = this.bodyB.velocity; // the new body should have the same speed as the old end of this segment
          if (this.followingSegment !== null) this.bodyB.mass = 0.5 * newMass + 0.5 * this.followingSegment.mass; // adapt end body masses (which should change because the rope segment's mass changes)
          if (this.previousSegment !== null) this.bodyA.mass = 0.5 * this.previousSegment.mass + 0.5 * this.mass;
          const newBodyB = this.bodyB; // bodyB will become the new bodyB of the new segment
          this.bodyB = nBody; // this segment will have the new connecting body as bodyB
          const nRopeSeg = new RopeSegment(this.bodyB, newBodyB, newMass,
            this.defaultRestLength, this.minRestLength, this.maxRestLength,
            this.defaultRestLength, this.elasticityConstant, this.dampingCoefficient,
            this.internalDamping
          ); // create new rope segment (with default rest length)
          this.rope.insertRopeSegment(this.indexInRope + 1, nRopeSeg); // insert segment into rope
          return this.indexInRope - 1; // the current segment (this) might still be too long => process it again
        } else {
          throw new Error(`Currently not supported: rope segment splitting between deflection points! Length: ${this.deflectionPointPositions[i]}`);
        }
      }
    }
    return this.indexInRope;
  }
}

/**
 * A physical body (a point mass in the current implementation)
 */
class Body {
  /**
   * Create a new body (a new point mass)
   * @param {number} [x=0] x coordinate of the new point mass (in meters)
   * @param {number} [y=0] y coordinate of the new point mass (in meters)
   * @param {number} [z=0] z coordinate of the new point mass (in meters)
   * @param {number} [mass=0] mass (in kilograms) of the new point mass (default is 0, which means that the body is fixed and cannot move)
   * @param {string} [name] a name for the created body
   */
  constructor(x = 0, y = 0, z = 0, mass = 0, name = 'body') {
    // mass 0: body cannot move
    /** @type {number} unique body id */
    this.id = PHYSICS_WORLD.idCounter;
    PHYSICS_WORLD.idCounter++;
    /** @type {string} a name for the body */
    this.name = name;
    /** @type {V} current position of the body (in 3D and in meters) */
    this.pos = new V(x, y, z);
    /** @type {V} current velocity of the body (in m/s) */
    this.velocity = new V(0, 0, 0);
    /** @type {V} current forces applied to the body (in Newton); forces are applied in every time step of the simulation */
    this.appliedForces = new V(0, 0, 0);
    /** @type {number} mass of the body (in kilograms) */
    this.mass = mass;
    /** @type {number} damping coefficient for the velocity (1 = no damping, 0 = body doesn't move, all velocity absorbed immediately) */
    this.velocityDamping = 1; // 0.9;
    /** @type {number} friction coefficient of the body (the higher, the more friction occurs between a carabiner and the rope) */
    this.frictionCoefficient = 0.125;
    /** @type {number} running maximum of the force (in Newton) which the body has been subjected to (forces are averaged over small time frames for more stability) */
    this.maxForce = 0;
    /** @type {number} current force (in Newton) which the body is subjected to, averaged over a small time frame */
    this.currentAveragedForce = 0;
    /** @type {number[]} forces (in Newton) which the body has been subjected to within the current averaging window */
    this.runningForces = [];
    /** @type {number[]} time step lengths (in seconds) within the current averaging window, corresponding to forces in runningForces array */
    this.runningTimeDeltas = [];
    /** @type {number} sum of all the values in runningTimeDeltas, i.e. length of the captured time interval */
    this.runningTimeSum = 0;
    /** @type {number} weighted sum of the forces in runningForces (weights are the corresponding time step lengths) */
    this.runningAvgForce = 0;
    /** @type {number} local time of the body (in seconds), updated whenever a time step is performed */
    this.time = 0;
    /** @type {number} length (in seconds) of the averaging window used to average forces applied to the body */
    this.forceAvgWindow = 0.05; // average force over 50 ms to get a more "stable" maximum force
    PHYSICS_WORLD.bodies.push(this); // add body to physcics world (important to ensure that the body meets barrier constraints)

    /** @type {Color} color used for drawing this body */
    this.drawingColor = new Color(0, 0, 0);
    /** @type {number} radius (in meters) used for drawing this body */
    this.drawingRadius = 0.07; // default is 7 cm
  }

  /**
   * Clear all forces currently applied to the body
   */
  clearForces() {
    this.appliedForces = new V(0, 0, 0);
  }

  /**
   * Apply a force to the body
   * @param {V} f the force (in Newton) which should be applied
   */
  applyForce(f) {
    this.appliedForces = this.appliedForces.plus(f);
  }

  /**
   * Apply gravity to the body
   * @param {V} f the gravity acceleration vector in m / s^2
   */
  applyGravity(f) {
    this.appliedForces = this.appliedForces.plus(f.times(this.mass));
    /** @type {V} the gravity acceleration vector in m / s^2 used during the last applyGravity call */
    this.lastGravityVector = f;
  }

  /**
   * Execute a time step for this body. Accelerates the body according to the forces which are currently applied, and moves the body
   * according to its current speed.
   * @param {number} delta the length of the time step in seconds
   * @param {boolean} [clearForces=true] whether to clear all forces currently applied to the body
   * @param {boolean} [applyChanges=true] whether to update the body position (default is true). Velocity is always updated
   * @return {void|V} returns nothing if applyChanges is true, otherwise, the function returns the vector containing the body's displacement within the current time step in meters
   */
  timeStep(delta, clearForces = true, applyChanges = true) {
    this.time += delta; // update local body time
    const cForce = this.appliedForces.norm(); // current force (in Newton) acting on the body
    this.runningAvgForce += delta * cForce; // update weighted force sum
    this.runningForces.push(cForce); // push to forces array containing all forces within the averaging window
    this.runningTimeDeltas.push(delta); // do the same for the time step length
    this.runningTimeSum += delta; // update length of the captured window
    while (this.runningTimeSum - this.runningTimeDeltas[0] >= this.forceAvgWindow) { // if captured window becomes too long: forget old values
      this.runningTimeSum -= this.runningTimeDeltas[0];
      this.runningAvgForce -= this.runningTimeDeltas[0] * this.runningForces[0];
      this.runningTimeDeltas.shift();
      this.runningForces.shift();
    }
    if (this.mass > 0) { // if the body can move
      const acceleration = this.appliedForces.times(1 / this.mass); // calculate acceleration
      this.velocity = this.velocity.plus(acceleration.times(delta)).times(Math.pow(this.velocityDamping, delta)); // update velocity, including potential damping
      if (applyChanges)
        this.pos = this.pos.plus(this.velocity.times(delta)); // update body position
    }
    // update current averaged force and the maximum force the body has been subjected to
    this.currentAveragedForce = (this.runningAvgForce - (this.runningTimeSum - this.forceAvgWindow) * this.runningForces[0]) / this.forceAvgWindow;
    this.maxForce = Math.max(this.maxForce, this.currentAveragedForce);
    if (clearForces) this.clearForces();
    if (!applyChanges)
      return this.velocity.times(delta); // return displacement if the displacement was not actually applied
  }
  
  /**
   * The current kinetic energy of the body (in Joule)
   * @type {number}
   */
  get currentKineticEnergy() {
    return 0.5 * this.velocity.normsq() * this.mass;
  }

  /**
   * The current potential energy of the body (in Joule); depends on the vector supplied to the applyGravity function
   * @type {number}
   */
  get currentPotentialEnergy() {
    if (typeof this.lastGravityVector === 'undefined')
      return 0;
    return - this.pos.dot(this.lastGravityVector) * this.mass;
  }

  /**
   * Capture information about the current state of the body
   * @return {ObjectSnapshot} a snapshot of the current state of the body
   */
  captureSnapshot() {
    const kin = this.currentKineticEnergy;
    const pot = this.currentPotentialEnergy;
    return {
      type: 'point mass',
      id: `${this.name} [${this.id}]`,
      name: this.name,
      visibleState: {
        position: this.pos.arr,
        color: this.drawingColor,
        radius: this.drawingRadius
      },
      forces: {
        current: this.appliedForces.norm(),
        average: this.currentAveragedForce,
        averageWindow : this.forceAvgWindow
      },
      energy: {
        kinetic: kin,
        potential: pot,
        overall: kin + pot
      }
    };
  }
}

/**
 * Add a barrier to the physics world which no objects may pass (blocks an entire half-space for all objects)
 * @param {V} normalVec the normal vector of the barrier, which must have length 1 and should point away from the half-space which is blocked
 * @param {V} pointInBarrier a point lying on the barrier
 * @param {string} name a name for the barrier
 */
function addWorldBarrier(normalVec, pointInBarrier, name) {
  if (Math.abs(normalVec.normsq() - 1) > PHYSICS_WORLD.EPS)
    throw new Error('A normal vector of a barrier must have length 1!');
  const barrierInfo = {
    normal: normalVec,
    shift: normalVec.dot(pointInBarrier),
    name: name
  };
  PHYSICS_WORLD.barriers.push(barrierInfo);
}

/**
 * Ensure that all objects satisfy the constraints imposed by barriers (blocked half-spaces). In particular, if a body is located
 * within a blocked half-space, it will be moved to the closest unblocked point directly on the barrier. Any velocity components
 * pointing into the blocked half-space will be nullified.
 */
function ensureBarrierConstraints() {
  for (const body of PHYSICS_WORLD.bodies) {
    for (const barrier of PHYSICS_WORLD.barriers) {
      const dist = barrier.normal.dot(body.pos);
      if (dist <= barrier.shift) {
        body.pos = body.pos.plus(barrier.normal.times(barrier.shift - dist));
        const velocityIntoBarrier = -barrier.normal.dot(body.velocity);
        if (velocityIntoBarrier > 0)
          body.velocity = body.velocity.plus(barrier.normal.times(velocityIntoBarrier));
      }
    }
  }
}
