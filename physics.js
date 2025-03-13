
const PHYSICS_WORLD = {
  bodies: [],
  barriers: [],
  warningsShortRopeSegments: true,
  EPS: 1e-10
};

class Rope {
  // default: one fixed end at 0, 70kg hanging at the other end (straight down)
  constructor(length = 5, segments = 1, end1 = new Body(0, 0, 0, 0), end2 = new Body(0, -length, 0, 70), ...deflectionPoints) {
    this.restLength = length;
    this.mass = length * 0.062; // 62 g per meter of rope weight of typical climbing rope
    this.elasticityConstant = 0.079e-3; // 0.079e-3 1/N elasticity constant of typical climbing rope
    this.segmentLength = length / segments;
    this.minSegmentLength = this.segmentLength * 0.01;
    this.maxSegmentLength = this.segmentLength * 1.1;
    this.defaultSegmentLength = this.segmentLength;
    this.dampingCoefficient = 0.02; // / this.segmentLength; // damping for oscillations orthogonal to the rope
    this.internalDamping = 0.1; // / this.segmentLength; // damping for internal friction

    const deflPts = [end1, ...deflectionPoints, end2];
    let cumLen = 0;
    const lenArr = [];
    for (let i = 1; i < deflPts.length; i++) {
      const len = deflPts[i].pos.minus(deflPts[i-1].pos).norm();
      cumLen += len;
      lenArr.push(cumLen);
    }
    this.currentLength = cumLen;

    const currentStretchingFactor = this.currentLength / this.restLength;
    const segmentMass = this.mass / segments;
    this.ropeSegments = [];
    this.bodies = [end1];
    let lenArrIdx = 0;
    for (let i = 1; i <= segments; i++) {
      const dPoints = [], dPointPos = [], dPointSpeed = [];
      const partialRopeLen = i * (this.currentLength / segments);
      let prevPartRopeLen = (i-1) * (this.currentLength / segments);
      while (lenArrIdx < deflectionPoints.length && (partialRopeLen + ((i == segments) ? PHYSICS_WORLD.EPS : 0)) > lenArr[lenArrIdx]) {
        dPoints.push(deflectionPoints[lenArrIdx]);
        dPointPos.push((lenArr[lenArrIdx] - prevPartRopeLen) / currentStretchingFactor);
        dPointSpeed.push(0);
        prevPartRopeLen = lenArr[lenArrIdx];
        lenArrIdx++;
      }
      dPointPos.push((partialRopeLen - prevPartRopeLen) / currentStretchingFactor);
      if (i < segments) {
        const dSegLen = lenArr[lenArrIdx] - (lenArrIdx == 0 ? 0 : lenArr[lenArrIdx-1]);
        const dSegFac = (partialRopeLen - (lenArrIdx == 0 ? 0 : lenArr[lenArrIdx-1])) / dSegLen;
        this.bodies.push(new Body(...deflPts[lenArrIdx].pos.times(1 - dSegFac).plus(deflPts[lenArrIdx+1].pos.times(dSegFac)).arr,
          segmentMass * (1 + ((i == 1) ? 0.5 : 0) + ((i == segments-1) ? 0.5 : 0))));
      } else {
        this.bodies.push(end2);
      }
      this.ropeSegments.push(new RopeSegment(
        this.bodies[i-1], this.bodies[i], segmentMass,
        this.defaultSegmentLength, this.minSegmentLength, this.maxSegmentLength, this.defaultSegmentLength,
        this.elasticityConstant, this.dampingCoefficient, this.internalDamping
      ));
      this.ropeSegments[i-1].deflectionPointPositions = [];
      for (const dp of dPoints) this.ropeSegments[i-1].deflectionPoints.push(dp);
      for (const dp of dPointPos) this.ropeSegments[i-1].deflectionPointPositions.push(dp);
      for (const dp of dPointSpeed) this.ropeSegments[i-1].deflectionPointSlidingSpeeds.push(dp);
    }
    if (lenArrIdx != deflectionPoints.length || this.ropeSegments.length != segments)
      throw new Error(`not all deflection points included in rope (${lenArrIdx} of ${deflectionPoints.length}) or wrong number of segments (${this.ropeSegments.length} instead of ${segments})`);

    for (let i = 0; i < this.ropeSegments.length; i++) {
      if (i > 0) this.ropeSegments[i].previousSegment = this.ropeSegments[i-1];
      if (i+1 < this.ropeSegments.length) this.ropeSegments[i].followingSegment = this.ropeSegments[i+1];
      this.ropeSegments[i].rope = this;
      this.ropeSegments[i].indexInRope = i;
    }
    for (let i = 1; i+1 < this.bodies.length; i++) {
      this.bodies[i].mass = ((i == 1) ? 1 : 0.5) * this.ropeSegments[i-1].mass + ((i+1 == this.bodies.length-1) ? 1 : 0.5) * this.ropeSegments[i].mass;
    }
    this.postprocessTimeStep();

    this.currentStretchingForce = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    this.currentElasticEnergy = 0.5 * (this.currentLength - this.restLength) * (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    this.maxStretchingForce = this.currentStretchingForce;
    this.maxClimberForce = this.currentStretchingForce;
    this.maxBelayerForce = this.currentStretchingForce;
    this.maxEndSpeed = end2.velocity.norm();
  }

  removeRopeSegment(idx) {
    this.ropeSegments.splice(idx, 1);
    for (let i = idx; i < this.ropeSegments.length; i++)
      this.ropeSegments[i].indexInRope = i;
    if (idx > 0 && idx < this.ropeSegments.length) {
      this.ropeSegments[idx-1].followingSegment = this.ropeSegments[idx];
      this.ropeSegments[idx].previousSegment = this.ropeSegments[idx-1];
    } else {
      if (idx < this.ropeSegments) this.ropeSegments[idx].previousSegment = null;
      if (idx > 0) this.ropeSegments[idx-1].followingSegment = null;
    }
    this.bodies.splice(idx, 2, idx < this.ropeSegments.length ? this.ropeSegments[idx].bodyA : this.ropeSegments[idx-1].bodyB);
  }

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

  applyGravity(f) {
    for (let i = 0; i < this.ropeSegments.length; i++) {
      this.ropeSegments[i].applyGravity(f);
    }
  }

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
    if (Math.abs(checkRestLen - this.restLen) > PHYSICS_WORLD.EPS)
      throw new Error('The rest length of the rope segments is off!');
  }

  timeStep(delta, clearForces = true) {
    for (let i = 0; i < this.ropeSegments.length; i++)
      this.ropeSegments[i].timeStep(delta, clearForces);
    this.postprocessTimeStep();
    this.maxEndSpeed = Math.max(this.maxEndSpeed, this.bodies[this.bodies.length - 1].velocity.norm());
  }

  postprocessTimeStep() {
    for (let i = 0; i < this.ropeSegments.length; i++)
      i = this.ropeSegments[i].postprocessTimeStepA();
    for (let i = 0; i < this.ropeSegments.length; i++)
      i = this.ropeSegments[i].postprocessTimeStepB();
  }
}

class RopeSegment {
  constructor(end1, end2, mass, restLength, minRLength, maxRLength, defaultRLength, elasticityConstant, dampingCoefficient, internalDamping) {
    this.bodyA = end1;
    this.bodyB = end2;
    this.mass = mass;
    this.currentLength = this.bodyB.pos.minus(this.bodyA.pos).norm();
    this.restLength = restLength;
    this.minRestLength = minRLength;
    this.maxRestLength = maxRLength;
    this.defaultRestLength = defaultRLength;
    this.elasticityConstant = elasticityConstant;
    this.dampingCoefficient = dampingCoefficient;
    this.internalDamping = internalDamping;

    this.springConstant = 1 / (this.restLength * this.elasticityConstant);
    this.previousSegment = null; // 2nd rope segment attached to bodyA (null if bodyA is the end of the rope)
    this.followingSegment = null; // 2nd rope segment attached to bodyB (null if bodyB is the end of the rope)
    this.rope = null; // parent rope object
    this.indexInRope = -1; // index of rope segment within entire rope
    this.deflectionPoints = []; // simulates that the rope passes through carabiners (order: from bodyA to bodyB)
    this.deflectionPointPositions = [this.restLength]; // rest lengths from bodyA or previous deflection point to indexed deflection point
      // plus rest length from last deflection point to bodyB
      // thus, this.deflectionPointPositions.length = this.deflectionPoints.length + 1
    this.deflectionPointSlidingSpeeds = []; // rope sliding speeds at deflection points (from bodyA to bodyB)
      // same length as this.deflectionPoints
    this.currentStretchingForce = 0;
    this.currentElasticEnergy = 0;
  }

  applyGravity(f) {
    this.bodyA.applyGravity(f);
    if (this.followingSegment === null)
      this.bodyB.applyGravity(f);
  }

  applyRopeForces() {
    this.currentLength = 0;
    this.currentElasticEnergy = 0;
    let len = 0;
    this.tmpDiffArr = [];
    this.tmpLenArr = [];
    this.tmpTensionArr = [];
    this.tmpAngleArr = [];
    const deflPts = [this.bodyA, ...this.deflectionPoints, this.bodyB];
    let startDiff = null; let startDiffLen = 0; let startTension = 0;
    let endDiff = null; let endDiffLen = 0; let endTension = 0;
    let currentRestLength = 0;
    for (let i = 1; i < deflPts.length; i++) {
      const bodyA = deflPts[i-1];
      const bodyB = deflPts[i];
      const diff = bodyB.pos.minus(bodyA.pos);
      const diffLen = diff.norm();
      if (diffLen == 0) throw new Error(`zero actual length of part of rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
      len += diffLen;
      this.tmpDiffArr.push(diff);
      this.tmpLenArr.push(diffLen);

      const restLen = this.deflectionPointPositions[i-1];
      if (restLen < 0) console.warn(`detected negative rest length of part of rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
      else if (restLen > 0 && restLen < this.minRestLength / 2 && PHYSICS_WORLD.warningsShortRopeSegments) console.warn(`detected small rest length ${restLen} of part of rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
      else if (restLen == 0) throw new Error(`zero rest length of part of rope segment no. ${this.indexInRope} with ${this.deflectionPoints.length} deflection point(s)`);
      currentRestLength += restLen;
      const tension = (diffLen - restLen) / (restLen * this.elasticityConstant);
      this.currentElasticEnergy += 0.5 * (diffLen - restLen) * (diffLen - restLen) / (restLen * this.elasticityConstant);
      this.tmpTensionArr.push(tension);
      
      if (endDiff !== null) { // calculate angle between incoming and outgoing rope at deflection point
        this.tmpAngleArr.push(Math.acos(diff.dot(endDiff) / (diffLen * endDiffLen)));
      } else {
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
    this.tmpStartDiff = startDiff;
    this.tmpStartDiffLen = startDiffLen;
    this.tmpEndDiff = endDiff;
    this.tmpEndDiffLen = endDiffLen;
    this.currentLength = len;
    if (Math.abs(this.restLength - currentRestLength) > PHYSICS_WORLD.EPS) console.warn(`rope segment with changing rest length: ${this.restLength} to ${currentRestLength}`);
    this.restLength = currentRestLength;
    this.currentStretchingForce = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);

    const directionA = startDiff.times(1 / startDiffLen);
    const directionB = endDiff.times(1 / endDiffLen);
    this.tmpDirectionA = directionA;
    this.tmpDirectionB = directionB;
    this.bodyA.applyForce(directionA.times(startTension));
    this.bodyB.applyForce(directionB.times(-endTension));

    const lengthChangeRateA = -this.bodyA.velocity.dot(directionA);
    const lengthChangeRateB = this.bodyB.velocity.dot(directionB);

    if (this.bodyA.mass > 0 && this.bodyB.mass > 0) {
      const relativeParallelA = directionA.times(lengthChangeRateA);
      const relativeParallelB = directionB.times(lengthChangeRateB);
      const relativePerpA = this.bodyA.velocity.times(-1).minus(relativeParallelA);
      const relativePerpB = this.bodyB.velocity.minus(relativeParallelB);
      const relativePerp = relativePerpA.plus(relativePerpB);

      const dampingForce = relativePerp.times(this.dampingCoefficient / this.restLength);
      this.bodyA.applyForce(dampingForce);
      this.bodyB.applyForce(dampingForce.times(-1));
    }
  
    const lengthChangeRate = lengthChangeRateA + lengthChangeRateB;
    this.bodyA.applyForce(directionA.times(lengthChangeRate * this.internalDamping / this.restLength));
    this.bodyB.applyForce(directionB.times(-lengthChangeRate * this.internalDamping / this.restLength));
  }

  timeStep(delta, clearForces = true) {
    for (let i = 0; i < this.deflectionPoints.length; i++) {
      let tensionLeft = this.tmpTensionArr[i];
      let tensionRight = this.tmpTensionArr[i+1];
      const slidingForce = tensionRight - tensionLeft; // force pulling the rope over the deflection point from bodyA to bodyB
      const frictionForce = (tensionLeft > 0 && tensionRight > 0)
        ? Math.min(tensionLeft, tensionRight) * (Math.exp(this.deflectionPoints[i].frictionCoefficient * this.tmpAngleArr[i+1]) - 1)
        : 0;
      let effectiveSlidingForce = 0;
      if (this.deflectionPointSlidingSpeeds[i] != 0) {
        if (this.deflectionPointSlidingSpeeds[i] > 0) effectiveSlidingForce = slidingForce - frictionForce;
        else effectiveSlidingForce = slidingForce + frictionForce;
      } else {
        if (frictionForce < Math.abs(slidingForce)) {
          if (slidingForce > 0) effectiveSlidingForce = slidingForce - frictionForce;
          else effectiveSlidingForce = slidingForce + frictionForce;
        }
      }
      
      const slidingAcc = effectiveSlidingForce / this.mass;
      this.deflectionPointSlidingSpeeds[i] += slidingAcc * delta;
      if ((Math.abs(this.deflectionPointSlidingSpeeds[i]) < Math.abs(slidingAcc * delta) - PHYSICS_WORLD.EPS)
          && (frictionForce >= Math.abs(slidingForce)))
        this.deflectionPointSlidingSpeeds[i] = 0;
      this.deflectionPointPositions[i] -= this.deflectionPointSlidingSpeeds[i] * delta;
      this.deflectionPointPositions[i+1] += this.deflectionPointSlidingSpeeds[i] * delta;
    }

    this.bodyA.timeStep(delta, clearForces);
    if (this.followingSegment === null)
      this.bodyB.timeStep(delta, clearForces);
  }

  postprocessTimeStepA() {
    if (this.deflectionPointPositions[0] < this.minRestLength) {
      if (this.previousSegment === null) {
        if (this.deflectionPoints.length > 0) { // rope slips out of first deflection point
          this.deflectionPointPositions[1] += this.deflectionPointPositions[0];
          this.deflectionPoints.shift();
          this.deflectionPointSlidingSpeeds.shift();
          this.deflectionPointPositions.shift();
        } else { // no deflection points and rest length becomes smaller than minimal rest length: should not be possible
          if (PHYSICS_WORLD.warningsShortRopeSegments) console.warn(`first segment of rope too short: ${this.deflectionPointPositions[0]}`);
        }
      } else {
        this.mass += this.previousSegment.mass;
        if (this.previousSegment.previousSegment === null) {
          if (this.followingSegment !== null)
            this.bodyB.mass = 0.5 * this.followingSegment.mass + this.mass;
        } else {
          if (this.followingSegment !== null) {
            this.bodyB.mass = 0.5 * this.followingSegment.mass + 0.5 * this.mass;
            this.previousSegment.bodyA.mass = 0.5 * this.mass + 0.5 * this.previousSegment.previousSegment.mass;
          } else {
            this.previousSegment.bodyA.mass = this.mass + 0.5 * this.previousSegment.previousSegment.mass;
          }
        }
        this.restLength += this.previousSegment.restLength;
        this.deflectionPointPositions[0] += this.previousSegment.deflectionPointPositions.pop();
        while (this.previousSegment.deflectionPointPositions.length > 0)
          this.deflectionPointPositions.unshift(this.previousSegment.deflectionPointPositions.pop());
        while (this.previousSegment.deflectionPointSlidingSpeeds.length > 0)
          this.deflectionPointSlidingSpeeds.unshift(this.previousSegment.deflectionPointSlidingSpeeds.pop());
        while (this.previousSegment.deflectionPoints.length > 0)
          this.deflectionPoints.unshift(this.previousSegment.deflectionPoints.pop());
        this.bodyA = this.previousSegment.bodyA;
        this.rope.removeRopeSegment(this.indexInRope - 1);
      }
    }
    if (this.deflectionPoints.length > 0 && this.deflectionPointPositions[this.deflectionPoints.length] < this.minRestLength) {
      if (this.followingSegment === null) {
        if (this.deflectionPoints.length > 0) { // rope slips out of last deflection point
          this.deflectionPointPositions[this.deflectionPoints.length - 1] += this.deflectionPointPositions[this.deflectionPoints.length];
          this.deflectionPoints.pop();
          this.deflectionPointSlidingSpeeds.pop();
          this.deflectionPointPositions.pop();
        } else { // no deflection points and rest length becomes smaller than minimal rest length: should not be possible
          if (PHYSICS_WORLD.warningsShortRopeSegments) console.warn(`last segment of rope too short: ${this.deflectionPointPositions[0]}`);
        }
      } else {
        this.mass += this.followingSegment.mass;
        if (this.followingSegment.followingSegment === null) {
          if (this.previousSegment !== null)
            this.bodyA.mass = 0.5 * this.previousSegment.mass + this.mass;
        } else {
          if (this.previousSegment !== null) {
            this.bodyA.mass = 0.5 * this.previousSegment.mass + 0.5 * this.mass;
            this.followingSegment.bodyB.mass = 0.5 * this.mass + 0.5 * this.followingSegment.followingSegment.mass;
          } else {
            this.followingSegment.bodyB.mass = this.mass + 0.5 * this.followingSegment.followingSegment.mass;
          }
        }
        this.restLength += this.followingSegment.restLength;
        this.deflectionPointPositions[this.deflectionPoints.length] += this.followingSegment.deflectionPointPositions.shift();
        while (this.followingSegment.deflectionPointPositions.length > 0)
          this.deflectionPointPositions.push(this.followingSegment.deflectionPointPositions.shift());
        while (this.followingSegment.deflectionPointSlidingSpeeds.length > 0)
          this.deflectionPointSlidingSpeeds.push(this.followingSegment.deflectionPointSlidingSpeeds.shift());
        while (this.followingSegment.deflectionPoints.length > 0)
          this.deflectionPoints.push(this.followingSegment.deflectionPoints.shift());
        this.bodyB = this.followingSegment.bodyB;
        this.rope.removeRopeSegment(this.indexInRope + 1);
      }
    }
    return this.indexInRope;
  }

  postprocessTimeStepB() {
    for (let i = 0; i < this.deflectionPointPositions.length; i++) {
      if (this.deflectionPointPositions[i] > this.maxRestLength) {
        if (this.deflectionPoints.length == 0) throw new Error(`segment without deflection points too long: ${this.deflectionPointPositions[i]}`);
        if (i == 0) {
          const frac = this.defaultRestLength / this.deflectionPointPositions[0];
          const newMass = this.defaultRestLength / this.restLength * this.mass;
          this.mass -= newMass;
          this.deflectionPointPositions[0] -= this.defaultRestLength;
          this.restLength -= this.defaultRestLength;
          const nBody = new Body(
            ...this.bodyA.pos.times(1-frac).plus(this.deflectionPoints[0].pos.times(frac)).arr,
            ((this.previousSegment === null) ? 1 : 0.5) * newMass + ((this.followingSegment === null) ? 1 : 0.5) * this.mass
          );
          nBody.velocity = this.bodyA.velocity;
          if (this.previousSegment !== null) this.bodyA.mass = 0.5 * newMass + 0.5 * this.previousSegment.mass;
          if (this.followingSegment !== null) this.bodyB.mass = 0.5 * this.followingSegment.mass + 0.5 * this.mass;
          const newBodyA = this.bodyA;
          this.bodyA = nBody;
          const nRopeSeg = new RopeSegment(newBodyA, this.bodyA, newMass,
            this.defaultRestLength, this.minRestLength, this.maxRestLength,
            this.defaultRestLength, this.elasticityConstant, this.dampingCoefficient,
            this.internalDamping
          );
          this.rope.insertRopeSegment(this.indexInRope, nRopeSeg);
          return this.indexInRope - 1;
        } else if (i == this.deflectionPointPositions.length - 1) {
          const frac = this.defaultRestLength / this.deflectionPointPositions[this.deflectionPoints.length];
          const newMass = this.defaultRestLength / this.restLength * this.mass;
          this.mass -= newMass;
          this.deflectionPointPositions[this.deflectionPoints.length] -= this.defaultRestLength;
          this.restLength -= this.defaultRestLength;
          const nBody = new Body(
            ...this.bodyB.pos.times(1-frac).plus(this.deflectionPoints[this.deflectionPoints.length-1].pos.times(frac)).arr,
            ((this.followingSegment === null) ? 1 : 0.5) * newMass + ((this.previousSegment === null) ? 1 : 0.5) * this.mass
          );
          nBody.velocity = this.bodyB.velocity;
          if (this.followingSegment !== null) this.bodyB.mass = 0.5 * newMass + 0.5 * this.followingSegment.mass;
          if (this.previousSegment !== null) this.bodyA.mass = 0.5 * this.previousSegment.mass + 0.5 * this.mass;
          const newBodyB = this.bodyB;
          this.bodyB = nBody;
          const nRopeSeg = new RopeSegment(this.bodyB, newBodyB, newMass,
            this.defaultRestLength, this.minRestLength, this.maxRestLength,
            this.defaultRestLength, this.elasticityConstant, this.dampingCoefficient,
            this.internalDamping
          );
          this.rope.insertRopeSegment(this.indexInRope + 1, nRopeSeg);
          return this.indexInRope - 1;
        } else {
          throw new Error(`Currently not supported: rope segment splitting between deflection points! Length: ${this.deflectionPointPositions[i]}`);
        }
      }
    }
    return this.indexInRope;
  }
}

class Body {
  // mass 0: body cannot move
  constructor(x = 0, y = 0, z = 0, mass = 0) {
    this.pos = new V(x, y, z);
    this.velocity = new V(0, 0, 0);
    this.appliedForces = new V(0, 0, 0);
    this.mass = mass;
    this.velocityDamping = 1; // 0.9;
    this.frictionCoefficient = 0.125;
    this.maxForce = 0;
    this.currentAveragedForce = 0;
    this.runningForces = [];
    this.runningTimeDeltas = [];
    this.runningTimeSum = 0;
    this.runningAvgForce = 0;
    this.time = 0;
    this.forceAvgWindow = 0.05; // average force over 50 ms to get a more "stable" maximum force
    PHYSICS_WORLD.bodies.push(this);
  }

  clearForces() {
    this.appliedForces = new V(0, 0, 0);
  }

  applyForce(f) {
    this.appliedForces = this.appliedForces.plus(f);
  }

  applyGravity(f) {
    this.appliedForces = this.appliedForces.plus(f.times(this.mass));
  }

  timeStep(delta, clearForces = true, applyChanges = true) {
    this.time += delta;
    const cForce = this.appliedForces.norm();
    this.runningAvgForce += delta * cForce;
    this.runningForces.push(cForce);
    this.runningTimeDeltas.push(delta);
    this.runningTimeSum += delta;
    while (this.runningTimeSum - this.runningTimeDeltas[0] >= this.forceAvgWindow) {
      this.runningTimeSum -= this.runningTimeDeltas[0];
      this.runningAvgForce -= this.runningTimeDeltas[0] * this.runningForces[0];
      this.runningTimeDeltas.shift();
      this.runningForces.shift();
    }
    if (this.mass > 0) {
      const acceleration = this.appliedForces.times(1 / this.mass);
      this.velocity = this.velocity.plus(acceleration.times(delta)).times(Math.pow(this.velocityDamping, delta));
      if (applyChanges)
        this.pos = this.pos.plus(this.velocity.times(delta));
    }
    this.currentAveragedForce = (this.runningAvgForce - (this.runningTimeSum - this.forceAvgWindow) * this.runningForces[0]) / this.forceAvgWindow;
    this.maxForce = Math.max(this.maxForce, this.currentAveragedForce);
    if (clearForces) this.clearForces();
    if (!applyChanges)
      return this.velocity.times(delta);
  }
}

// assume that normalVec is a vector of length 1 !
// normalVec should point away from the half-space which is blocked
function addWorldBarrier(normalVec, pointInBarrier, name) {
  const barrierInfo = {
    normal: normalVec,
    shift: normalVec.dot(pointInBarrier),
    name: name
  };
  PHYSICS_WORLD.barriers.push(barrierInfo);
}

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
