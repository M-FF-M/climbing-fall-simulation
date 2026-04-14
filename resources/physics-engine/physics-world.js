
/**
 * @typedef {Object} ClimbingFallSetup setup parameters for a climbing fall simulation
 * @property {number} wall-angle the angle of the climbing wall, in overhanging degrees
 * @property {number} climber-height height of climber above ground / belay in meters
 * @property {number} climber-weight weight of climber in kilograms
 * @property {number} [climber-wall-distance] distance of climber to wall in meters (measured parallel to the ground) (default is 0.3)
 * @property {number} climber-sideways number of meters the climber is placed to the right of the belay
 * @property {boolean} fixed-anchor whether the belay is a fixed anchor (otherwise it is assumed to be a moving mass)
 * @property {number} [belayer-weight] weight of belayer in kilograms (needed if belay is not a fixed anchor)
 * @property {number} [belayer-wall-distance] distance of belayer to wall in meters (measured parallel to the ground) (default is 0.5)
 * @property {number} draw-number number of quickdraws through which the rope passes (can be 0)
 * @property {number} [last-draw-height] height of last draw on climber's side above ground / belay in meters (needed if draw-number > 0)
 * @property {number} [draw-i-height] height of i-th draw (0-indexed) above ground / belay in meters (measured orthogonally to the ground). i should be replaced by a number in the property name.
 * @property {number} [draw-i-wall-distance] distance of i-th draw (0-indexed) to wall in meters (measured parallel to the ground) (default is 0.1). i should be replaced by a number in the property name.
 * @property {number} [draw-i-sideways] number of meters the i-th draw (0-indexed) is placed to the right of the belay. i should be replaced by a number in the property name.
 * @property {number} [friction-coefficient] friction coefficient of quickdraws (default is 0.125, see constructor of Body class)
 * @property {boolean} draw-slings whether to model the quickdraws as being attached to a bolt in the wall via a sling (otherwise, they are just fixed points)
 * @property {number} [slack] amount of rope slack in the system in meters (default is 0.1)
 * @property {number} rope-segments number of segments used for the simulation of the rope
 * @property {number} elasticity-constant elasticity constant of the rope in 10^-3 per Newton ("milli" per Newton)
 * @property {number} rope-weight weight of the rope in kilograms per meter
 * @property {number} rope-bend-damping the higher the value, the stiffer the rope (less bending)
 * @property {number} rope-stretch-damping the higher the value, the less springy the rope is
 * @property {boolean} ground-present whether the ground should be inserted as a barrier into the model (like the climbing wall); it might make sense to remove the ground in multi-pitch settings
 * @property {number} [ground-level] height of ground relative to the belay in meters, <= 0 because belay cannot be below ground (needed if ground-present is true)
 * @property {number} physics-step-size the time step size for a single step of the simulation in milliseconds
 * @property {number} frame-rate the rate at which snapshots are captured in the simulation in frames per second
 * @property {number} simulation-duration the time in seconds for which the fall simulation should be run (not computation time, but simulated time)
 * @property {string} version the version of the climbing simulation for which this setup object was created
 * @property {string} versionDate the date corresponding to the above version
 */

/** @type {number} gravity acceleration constant in m/s^2 */
const GRAVITY_OF_EARTH = 9.807;
/** @type {V} gravity acceleration vector pointing downward along the y-axis (i.e. y-axis is height above ground) */
const GRAVITY_VEC = new V(0, -GRAVITY_OF_EARTH, 0);

/**
 * The physics world contains all objects which are relevant to the physics simulation
 */
class PhysicsWorld {
  /**
   * Create a new physics world
   */
  constructor() {
    /** @type {(Body|Rope)[]} an array containing all bodies of the physics world */
    this.bodies = [];
    /** @type {boolean[]} an array containing a boolean indicating whether time-stepping should be executed for every body */
    this.bodyTimestepping = [];
    /** @type {boolean[]} an array containing a boolean indicating whether a snapshot should be captured for every body */
    this.bodyCapturing = [];
    /** @type {Map<number, number>} maps body ids to their index in the bodies array */
    this.bodyIdMap = new Map();
    /** @type {{normal:V, shift:number, name:string}[]} an array containing all barriers of the physics world */
    this.barriers = [];
  }
  
  /**
   * Add a body to the physics world. When adding a rope, all its constituent bodies will also be added automatically.
   * When adding a rope with capturing=true, the bodies at its ends will also be added with capturing=true, but all constituent
   * bodies of a rope will always be added with timeStepping=false as the rope's timeStep and applyGravity functions already
   * propagate to the constituent bodies. If the body to add is already present, overwrite the timeStepping and capturing
   * parameters associated to it.
   * @param {Body|Rope} body the body to add
   * @param {boolean} [timeStepping=false] whether time stepping should be executed for this body when calling the timeStep function
   * @param {boolean} [capturing=false] whether this body's state should be captured when calling the captureSnapshot function
   */
  addBody(body, timeStepping = false, capturing = false) {
    if (this.bodyIdMap.has(body.id)) {
      const idx = this.bodyIdMap.get(body.id);
      this.bodyTimestepping[idx] = timeStepping;
      this.bodyCapturing[idx] = capturing;
      return;
    }
    body.parentWorld = this;
    this.bodyIdMap.set(body.id, this.bodies.length);
    this.bodies.push(body);
    this.bodyTimestepping.push(timeStepping);
    this.bodyCapturing.push(capturing);
    if (body instanceof Rope) {
      for (let i = 0; i < body.bodies.length; i++) {
        if (!capturing || (i > 0 && i < body.bodies.length - 1))
          this.addBody(body.bodies[i]);
        else
          this.addBody(body.bodies[i], false, true);
      }
      for (const ropeSeg of body.ropeSegments)
        ropeSeg.parentWorld = this;
    }
  }

  /**
   * Add a body to the physics world, if it isn't already contained in the world. Calls addBody if the body is not
   * already contained in the world. This method does not overwrite the timeStepping and capturing parameters associated
   * to a body which is already contained in the physics world.
   * @param {Body|Rope} body the body to add
   * @param {boolean} [timeStepping=false] whether time stepping should be executed for this body when calling the timeStep function
   * @param {boolean} [capturing=false] whether this body's state should be captured when calling the captureSnapshot function
   */
  addBodyIfNotPresent(body, timeStepping = false, capturing = false) {
    if (this.bodyIdMap.has(body.id))
      return;
    this.addBody(body, timeStepping, capturing);
  }

  /**
   * Remove a body from the physics world
   * @param {Body|Rope} body the body to remove
   */
  removeBody(body) {
    if (!this.bodyIdMap.has(body.id))
      return;
    const idx = this.bodyIdMap.get(body.id);
    this.bodies.splice(idx, 1);
    this.bodyTimestepping.splice(idx, 1);
    this.bodyCapturing.splice(idx, 1);
    for (let i = idx; i < this.bodies.length; i++)
      this.bodyIdMap.set(this.bodies[i].id, i);
    this.bodyIdMap.delete(body.id);
    body.parentWorld = null;
    if (body instanceof Rope) {
      for (const subBody of body.bodies)
        this.removeBody(subBody);
      for (const ropeSeg of body.ropeSegments)
        ropeSeg.parentWorld = null;
    }
  }

  /**
   * Add a barrier to the physics world which no objects may pass (blocks an entire half-space for all objects)
   * @param {V} normalVec the normal vector of the barrier, which must have length 1 and should point away from the half-space which is blocked
   * @param {V} pointInBarrier a point lying on the barrier
   * @param {string} name a name for the barrier
   */
  addBarrier(normalVec, pointInBarrier, name) {
    if (Math.abs(normalVec.normsq() - 1) > PHYSICS_GLOBALS.EPS)
      throw new Error('A normal vector of a barrier must have length 1!');
    const barrierInfo = {
      normal: normalVec,
      shift: normalVec.dot(pointInBarrier),
      name: name
    };
    this.barriers.push(barrierInfo);
  }
  
  /**
   * Ensure that all objects satisfy the constraints imposed by barriers (blocked half-spaces). In particular, if a body is located
   * within a blocked half-space, it will be moved to the closest unblocked point directly on the barrier. Any velocity components
   * pointing into the blocked half-space will be nullified.
   */
  ensureBarrierConstraints() {
    for (const body of this.bodies) {
      if (body instanceof Rope) continue;
      for (const barrier of this.barriers) {
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

  /**
   * Execute a time step for this physics world. Calls the timeStep and applyGravity (and potentially applyRopeForces) methods
   * of all bodies in the world which were added with parameter timeStepping=true (see addBody). Also calls ensureBarrierConstraints.
   * Note that this method first executes a time step with the forces currently applied to the bodies, then ensures barrier
   * constraints, and then applies appropriate gravity and rope forces for the new body positions. This is intended behavior,
   * but this also means that forces have to be initialized before the first real time step. Call the method with delta=0 to
   * initialize forces.
   * @param {number} delta the length of the time step in seconds (set to 0 to only initialize forces)
   */
  timeStep(delta) {
    if (delta > 0) {
      for (let i = 0; i < this.bodies.length; i++) {
        if (this.bodyTimestepping[i]) {
          this.bodies[i].timeStep(delta);
        }
      }
    } else {
      for (let i = 0; i < this.bodies.length; i++) {
        if (this.bodyTimestepping[i]) {
          this.bodies[i].clearForces();
        }
      }
    }
    this.ensureBarrierConstraints();
    for (let i = 0; i < this.bodies.length; i++) {
      if (this.bodyTimestepping[i]) {
        this.bodies[i].applyGravity(GRAVITY_VEC);
        if (this.bodies[i] instanceof Rope)
          this.bodies[i].applyRopeForces();
      }
    }
  }

  /**
   * Capture a snapshot of the current state of the bodies in this world. Only bodies added with parameter
   * capturing=true (see addBody) will be taken into account.
   * @return {ObjectSnapshot[]} an array with the captured snapshots for every relevant body
   */
  captureSnapshot() {
    const snapshotArr = [];
    for (let i = 0; i < this.bodies.length; i++) {
      if (this.bodyCapturing[i])
        snapshotArr.push(this.bodies[i].captureSnapshot());
    }
    return snapshotArr;
  }

  /**
   * An array of all bodies which were added with parameter capturing=true (see addBody) 
   * @type {(Body|Rope)[]}
   */
  get capturedBodies() {
    const bodyArr = [];
    for (let i = 0; i < this.bodies.length; i++) {
      if (this.bodyCapturing[i])
        bodyArr.push(this.bodies[i]);
    }
    return bodyArr;
  }

  /**
   * Remove all bodies and barriers from the physics world
   */
  clear() {
    for (const body of this.bodies) {
      body.parentWorld = null;
      if (body instanceof Rope) {
        for (const subBody of body.bodies)
          subBody.parentWorld = null;
        for (const ropeSeg of body.ropeSegments)
          ropeSeg.parentWorld = null;
      }
    }
    this.bodies = [];
    this.bodyTimestepping = [];
    this.bodyCapturing = [];
    this.bodyIdMap.clear();
    this.barriers = [];
  }
}

/**
 * A class containing all relevant information for a given climbing fall setup
 */
class ClimbingFallWorld {
  /**
   * Create a new climbing fall environment
   * @param {ClimbingFallSetup|null} [setupSettings] the setup parameters for the climbing fall. If not supplied,
   *                                                 the variables will be initialized with default values and need
   *                                                 to be set properly by the user.
   * @param {PhysicsWorld|null} [physicsWorld] the physics world into which all the simulation objects should be inserted
   */
  constructor(setupSettings = null, physicsWorld = null) {
    /** @type {number} the wall angle given as overhanging degrees */
    this.wallAngle = 0;
    /** @type {number} height of climber above ground / belay in meters */
    this.startHeight = 10;
    /** @type {number} mass of climber in kilograms */
    this.climberMass = 70;
    /** @type {Body} the body object representing the climber */
    this.climber = null;

    /** @type {number} height of the belayer (or anchor to which the rope is attached) above ground */
    this.anchorHeight = 0;
    /** @type {number} mass of belayer (or anchor to which the rope is attached) in kilograms */
    this.anchorMass = 0;
    /** @type {Body} the body object representing the belayer / anchor */
    this.anchor = null;

    /** @type {number} (rest) length of rope in meters */
    this.ropeLength = 1;
    /** @type {number} height of last draw above ground / belay (set to 0 for no deflection point) */
    this.lastDrawHeight = 0;
    /** @type {number} number of rope segments */
    this.ropeSegmentNum = 1;
    
    /** @type {Body} the body object representing the last deflection point (the draw closest to the climber) */
    this.deflectionPoint = null;

    /** @type {Rope} the rope object representing the climbing rope */
    this.rope = null;

    /** @type {number} the fall factor for the given setup */
    this.fallFactor = 0;

    /** @type {number} the force acting on the climber through gravity in Newton */
    this.gravityOnClimber = 0;
    /** @type {number} the force acting on the belayer through gravity in Newton */
    this.gravityOnBelayer = 0;

    /** @type {PhysicsWorld} the physics world containing all the bodies of this climbing fall setup */
    this.physicsWorld = physicsWorld;

    /** @type {number} the maximal simulation step size in seconds */
    this.maxStep = 0.01 / 1000;

    /** @type {number} the duration of the current simulation in seconds (potentially the partial progress of the currently running simulation) */
    this.simulationDuration = 0;
    /** @type {boolean} whether the current simulation should be interrupted after the next progress report */
    this.interruptSimulation = false;

    if (setupSettings !== null && (typeof setupSettings === 'object')) {
      if (this.physicsWorld === null || (typeof this.physicsWorld !== 'object'))
        this.physicsWorld = new PhysicsWorld();
      else
        this.physicsWorld.clear();

      const belayerWallDistance = setupSettings.hasOwnProperty('belayer-wall-distance') ? setupSettings['belayer-wall-distance'] : 0.5;
      const climberWallDistance = setupSettings.hasOwnProperty('climber-wall-distance') ? setupSettings['climber-wall-distance'] : 0.3;

      this.wallAngle = setupSettings['wall-angle']; // overhanging degrees

      this.startHeight = setupSettings['climber-height']; // height of climber above ground / belay
      this.climberMass = setupSettings['climber-weight'];
      this.climber = new Body(
        this.startHeight * Math.tan(Math.PI * this.wallAngle / 180) + (climberWallDistance - belayerWallDistance) - 0.01 + 0.02 * Math.random(),
        this.startHeight,
        setupSettings['climber-sideways'] - 0.01 + 0.02 * Math.random(),
        this.climberMass,
        'climber'
      );
      this.physicsWorld.addBody(this.climber, false, true);
      this.climber.drawingColor = new Color(151, 95, 96);
      // this.climber.velocity = new V(0, 0, 0);

      this.anchorHeight = 0;
      this.anchorMass = setupSettings['fixed-anchor'] ? 0 : setupSettings['belayer-weight'];
      this.anchor = new Body(-0.01 + 0.02 * Math.random(), this.anchorHeight, -0.01 + 0.02 * Math.random(), this.anchorMass, 'belayer');
      this.physicsWorld.addBody(this.anchor, false, true);
      this.anchor.drawingColor = new Color(77, 136, 78);

      this.ropeLength = 0;
      const deflectionPoints = [];
      let lastPos = this.anchor.pos;
      for (let i = 0; i < setupSettings['draw-number']; i++) {
        const drawWallDistance = setupSettings['draw-slings'] ? 0 : (setupSettings.hasOwnProperty(`draw-${i}-wall-distance`) ? setupSettings[`draw-${i}-wall-distance`] : 0.1);
        const slingLength = 0.2;
        const boltX = setupSettings[`draw-${i}-height`] * Math.tan(Math.PI * this.wallAngle / 180) + (drawWallDistance - belayerWallDistance) - 0.01 + 0.02 * Math.random();
        const boltY = setupSettings[`draw-${i}-height`];
        const boltZ = setupSettings[`draw-${i}-sideways`] - 0.01 + 0.02 * Math.random();
        const bolt = new Body(boltX, boltY, boltZ, 0, 'bolt');
        const carabinerPos = setupSettings['draw-slings']
          ? (
            (this.wallAngle < 0)
            ? bolt.pos.plus(new V(Math.cos(Math.PI * (90 + this.wallAngle) / 180) * slingLength, -Math.sin(Math.PI * (90 + this.wallAngle) / 180) * slingLength, 0))
            : bolt.pos.plus(new V(0, -slingLength, 0))
          ) : bolt.pos;
        bolt.drawingColor = new Color(153, 153, 153);
        bolt.drawingRadius = 0.04; // 4 cm
        bolt.ignoreInGraphs = true;
        const nDeflPt = new Body(...carabinerPos.arr, setupSettings['draw-slings'] ? 0.04 : 0, 'quickdraw');
        this.physicsWorld.addBody(nDeflPt, !setupSettings['draw-slings'], true); // time-stepping of deflection points is not done automatically by the rope, but if the deflection point is also a sling end, then sling time-stepping takes care of it
        if (setupSettings.hasOwnProperty('friction-coefficient'))
          nDeflPt.frictionCoefficient = setupSettings['friction-coefficient'];
        nDeflPt.drawingColor = new Color(52, 90, 93);
        if (i != setupSettings['draw-number'] - 1)
          nDeflPt.ignoreInGraphs = true;
        deflectionPoints.push(nDeflPt);
        const segLen = nDeflPt.pos.minus(lastPos).norm();
        this.ropeLength += segLen;
        lastPos = nDeflPt.pos;

        if (setupSettings['draw-slings']) {
          this.physicsWorld.addBody(bolt, false, true); // time-stepping of sling ends happens automatically through sling time-stepping
          const sling = new StaticSling(slingLength, 3, bolt, nDeflPt);
          sling.drawingColor = new Color(102, 102, 102);
          sling.ignoreInGraphs = true;
          this.physicsWorld.addBody(sling, true, true);
        }
      }
      const finalSegLen = this.climber.pos.minus(lastPos).norm();
      this.ropeLength += finalSegLen + (setupSettings.hasOwnProperty('slack') ? setupSettings['slack'] : 0.1); // 10 cm slack
      this.ropeSegmentNum = setupSettings['rope-segments'];
      // this.climber.mass = (this.ropeLength * 0.062) / (this.ropeSegmentNum - 1); this.climberMass = this.climber.mass; // no climber at the end of the rope

      this.deflectionPoint = (setupSettings['draw-number'] > 0) ? deflectionPoints[deflectionPoints.length - 1] : null;
      // this.deflectionPoint.frictionCoefficient = 0;
      this.lastDrawHeight = (setupSettings['draw-number'] > 0) ? this.deflectionPoint.pos.y : 0; // height of last draw above ground / belay

      this.rope = new Rope(this.ropeLength, this.ropeSegmentNum, this.anchor, this.climber, {
        elasticityConstant: setupSettings['elasticity-constant'] / 1000,
        weightPerMeter: setupSettings['rope-weight'],
        bendDamping: setupSettings['rope-bend-damping'],
        stretchDamping: setupSettings['rope-stretch-damping']
      }, ...deflectionPoints);
      this.physicsWorld.addBody(this.rope, true, true);
      this.rope.drawingColor = new Color(241, 160, 45);
      
      this.physicsWorld.addBarrier(new V(Math.cos(Math.PI * this.wallAngle / 180), -Math.sin(Math.PI * this.wallAngle / 180), 0), new V(-belayerWallDistance, 0, 0), 'wall');
      if (setupSettings['ground-present'])
        this.physicsWorld.addBarrier(new V(0, 1, 0), new V(0, setupSettings['ground-level'], 0), 'floor');

      if (this.startHeight > this.lastDrawHeight)
        this.fallFactor = 2 * (this.startHeight - this.lastDrawHeight) / this.ropeLength;
      else
        this.fallFactor = 0;

      this.gravityOnClimber = GRAVITY_OF_EARTH * this.climberMass;
      this.gravityOnBelayer = GRAVITY_OF_EARTH * this.anchorMass;

      this.maxStep = setupSettings['physics-step-size'] / 1000;
    }
  }
  
  /**
   * Run the climbing fall simulation and save the body positions. Once the simulation is complete, a callback is called.
   * @param {(percent: number, time: number) => void} progressCallback this callback is called to report on intermediate progress.
   *                                                                   percent will be the percentage of the simulation which has been completed.
   *                                                                   time will be the time in seconds up to which the simulation has been completed.
   * @param {(completed: boolean, time: number, snapshots: {time: number, bodies: ObjectSnapshot[]}[]) => void} doneCallback this callback is called when the simulation is completed.
   *                                                                   completed will be true if the simulation was completed up to the pre-defined target time.
   *                                                                   time will be the total simulation time in seconds.
   *                                                                   snapshots will be the array containing the captured simulation snapshots.
   * @param {number} targetTime the duration (in seconds) for which the simulation should be run
   * @param {number} [FPS=40] the frame rate at which snapshots should be captured
   * @param {{time: number, bodies: ObjectSnapshot[]}[]} [prevSnapshots] array of snapshots that were already captured
   * @param {number} [stepsDone=0] number of simulation steps that were already executed
   * @param {number} [lastSnapshot=0] simulation time (in seconds) at which the last snapshot was captured
   * @param {number} [progressReports=500] approximate time interval in milliseconds at which progressCallback will be called with progress reports
   */
  precalculatePositions(progressCallback, doneCallback, targetTime, FPS = 40, prevSnapshots = [], stepsDone = 0, lastSnapshot = 0, progressReports = 500) {
    const lastTime = (new Date()).getTime();
    const snapshots = [...prevSnapshots];
    const addSnapshot = (t) => {
      const bodyArr = this.physicsWorld.captureSnapshot();
      snapshots.push({
        time: t,
        bodies: bodyArr
      });
    };

    if (prevSnapshots.length == 0) {
      this.physicsWorld.timeStep(0);
      addSnapshot(0);
    }
    const numSteps = Math.ceil(targetTime / this.maxStep);
    let i = stepsDone + 1;
    for (; i <= numSteps; i++) {
      this.physicsWorld.timeStep(this.maxStep);
      if (i * this.maxStep - lastSnapshot >= 1 / FPS) {
        addSnapshot(i * this.maxStep);
        lastSnapshot = i * this.maxStep;
      }
      this.simulationDuration = i * this.maxStep;
      if ((new Date()).getTime() - lastTime > progressReports) {
        progressCallback(i / numSteps * 100, this.simulationDuration);
        if (!this.interruptSimulation) {
          window.setTimeout(() => this.precalculatePositions(progressCallback, doneCallback, targetTime, FPS, snapshots, i, lastSnapshot, progressReports), 10);
          return;
        } else {
          i++;
          break;
        }
      }
    }

    doneCallback(i-1 == numSteps, this.simulationDuration, snapshots);
  }
}
