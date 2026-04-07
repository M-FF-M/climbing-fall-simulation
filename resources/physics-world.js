
/**
 * The physics world contains all objects which are relevant to the physics simulation
 */
class PhysicsWorld {
  /**
   * Create a new physics world
   */
  constructor() {
    /** @type {Body[]} an array containing all bodies of the physics world */
    this.bodies = [];
    /** @type {Map<number, number>} maps body ids to their index in the bodies array */
    this.bodyIdMap = new Map();
    /** @type {{normal:V, shift:number, name:string}[]} an array containing all barriers of the physics world */
    this.barriers = [];
  }
  
  /**
   * Add a body to the physics world
   * @param {Body|Rope} body the body to add
   */
  addBody(body) {
    if (this.bodyIdMap.has(body.id))
      return;
    body.parentWorld = this;
    this.bodyIdMap.set(body.id, this.bodies.length);
    this.bodies.push(body);
    if (body instanceof Rope) {
      for (const subBody of body.bodies)
        this.addBody(subBody);
      for (const ropeSeg of body.ropeSegments)
        ropeSeg.parentWorld = this;
    }
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
    for (let i = idx; i < this.bodies.length; i++)
      this.bodyIdMap.set(this.bodies[i].id, i);
    this.bodyIdMap.delete(body.id);
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
   * Remove all bodies and barriers from the physics world
   */
  clear() {
    this.bodies = [];
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
   */
  constructor() {
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

    /** @type {(Body|Rope)[]} the bodies relevant for drawing and snapshot capturing */
    this.bodies = [];
    /** @type {PhysicsWorld} the physics world containing all the bodies of this climbing fall setup */
    this.physicsWorld = null;

    /** @type {number} the maximal simulation step size in seconds */
    this.maxStep = 0.01 / 1000;

    /** @type {number} the duration of the current simulation in seconds (potentially the partial progress of the currently running simulation) */
    this.simulationDuration = 0;
    /** @type {boolean} whether the current simulation should be interrupted after the next progress report */
    this.interruptSimulation = false;
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
      const bodyArr = [];
      for (const body of this.bodies) {
        bodyArr.push(body.captureSnapshot());
      }
      snapshots.push({
        time: t,
        bodies: bodyArr
      });
    };

    if (prevSnapshots.length == 0) {
      this.rope.applyGravity(GRAVITY_VEC);
      this.rope.applyRopeForces();
      addSnapshot(0);
    }
    const numSteps = Math.ceil(targetTime / this.maxStep);
    let i = stepsDone + 1;
    for (; i <= numSteps; i++) {
      this.rope.timeStep(this.maxStep);
      this.physicsWorld.ensureBarrierConstraints();
      this.rope.applyGravity(GRAVITY_VEC);
      this.rope.applyRopeForces();
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
