
class Rope {
  // default: one fixed end at 0, 70kg hanging at the other end (straight down)
  constructor(length = 5, segments = 1, end1 = new Body(0, 0, 0, 0), end2 = new Body(0, -length, 0, 70), ...deflectionPoints) {
    this.significantMassAtEnd2 = (end2.mass > 10 * this.segmentMass);
    this.restLength = length;
    this.mass = length * 0.062; // 62 g per meter of rope weight of typical climbing rope
    this.elasticityConstant = 0.079e-3; // 0.079e-3 1/N elasticity constant of typical climbing rope
    this.segmentLength = length / segments;
    this.segmentSpringConstant = 1 / (this.segmentLength * this.elasticityConstant);
    this.dampingCoefficient = 0.02 / this.segmentLength; // damping for oscillations orthogonal to the rope
    this.internalDamping = 0.1 / this.segmentLength; // damping for internal friction
    this.segmentMass = (segments > 1) ? this.mass / (segments - 1) : 0; // ends have their own predefined masses
    this.ropeSegments = [];
    this.bodies = [end1];
    for (let i = 1; i < segments; i++) {
      this.bodies.push(new Body(...end1.pos.plus(end2.pos.minus(end1.pos).times(i / segments)).arr, this.segmentMass));
      // if (this.significantMassAtEnd2)
        // this.bodies[i].velocityDamping = 0.6;
      this.ropeSegments.push(new RopeSegment(this.bodies[i-1], this.bodies[i],
        this.segmentLength, this.segmentSpringConstant, this.dampingCoefficient, this.internalDamping));
    }
    this.bodies.push(end2);
    this.ropeSegments.push(new RopeSegment(this.bodies[this.bodies.length-2], this.bodies[this.bodies.length-1],
      this.segmentLength, this.segmentSpringConstant, this.dampingCoefficient, this.internalDamping));
    for (let i = 0; i < this.ropeSegments.length; i++) {
      if (i > 0) this.ropeSegments[i].previousSegment = this.ropeSegments[i-1];
      if (i+1 < this.ropeSegments.length) this.ropeSegments[i].followingSegment = this.ropeSegments[i+1];
    }
    if (deflectionPoints.length > 0) {
      const deflPts = [end1, ...deflectionPoints, end2];
      let cumLen = 0;
      const lenArr = [];
      for (let i = 1; i < deflPts.length; i++) {
        const len = deflPts[i].pos.minus(deflPts[i-1].pos).norm();
        cumLen += len;
        lenArr.push(cumLen);
      }
      this.currentLength = cumLen;
      let lenArrIdx = 0;
      for (let i = 1; i+1 < this.bodies.length; i++) {
        const partialRopeLen = i * (this.currentLength / segments);
        while (lenArrIdx < lenArr.length && partialRopeLen > lenArr[lenArrIdx]) {
          this.ropeSegments[i-1].deflectionPoints.push(deflectionPoints[lenArrIdx]);
          lenArrIdx++;
        }
        const dSegLen = lenArr[lenArrIdx] - (lenArrIdx == 0 ? 0 : lenArr[lenArrIdx-1]);
        const dSegFac = (partialRopeLen - (lenArrIdx == 0 ? 0 : lenArr[lenArrIdx-1])) / dSegLen;
        this.bodies[i].pos = deflPts[lenArrIdx].pos.times(1 - dSegFac).plus(deflPts[lenArrIdx+1].pos.times(dSegFac));
      }
      while (lenArrIdx < deflectionPoints.length) {
        this.ropeSegments[this.ropeSegments.length - 1].deflectionPoints.push(deflectionPoints[lenArrIdx]);
        lenArrIdx++;
      }
    } else {
      this.currentLength = end2.pos.minus(end1.pos).norm();
    }
    this.currentStretchingForce = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    this.maxStretchingForce = this.currentStretchingForce;
    this.maxEndSpeed = end2.velocity.norm();
  }

  applyGravity(f) {
    for (let i = 0; i < this.ropeSegments.length; i++) {
      this.ropeSegments[i].applyGravity(f);
    }
  }

  applyRopeForces() {
    this.currentLength = 0;
    for (let i = 0; i < this.ropeSegments.length; i++) {
      this.ropeSegments[i].applyRopeForces();
      this.currentLength += this.ropeSegments[i].currentLength;
    }
    this.currentStretchingForce = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    this.maxStretchingForce = Math.max(this.currentStretchingForce, this.maxStretchingForce);
  }

  timeStep(delta, clearForces = true, debug = false) {
    for (let i = 0; i < this.ropeSegments.length; i++) {
      this.ropeSegments[i].timeStep(delta, clearForces, debug);
    }
    this.maxEndSpeed = Math.max(this.maxEndSpeed, this.bodies[this.bodies.length - 1].velocity.norm());
  }
}

class RopeSegment {
  constructor(end1, end2, restLength, springConstant, dampingCoefficient, internalDamping) {
    this.bodyA = end1;
    this.bodyB = end2;
    this.currentLength = this.bodyB.pos.minus(this.bodyA.pos).norm();
    this.restLength = restLength;
    this.springConstant = springConstant;
    this.dampingCoefficient = dampingCoefficient;
    this.internalDamping = internalDamping;
    this.previousSegment = null; // 2nd rope segment attached to bodyA (null if bodyA is the end of the rope)
    this.followingSegment = null; // 2nd rope segment attached to bodyB (null if bodyB is the end of the rope)
    this.deflectionPoints = []; // simulates that the rope passes through carabiners
  }

  applyGravity(f) {
    this.bodyA.applyGravity(f);
    if (this.followingSegment === null)
      this.bodyB.applyGravity(f);
  }

  applyRopeForces() {
    this.currentLength = 0;
    let len = 0;
    this.tmpDiffArr = [];
    this.tmpLenArr = [];
    const deflPts = [this.bodyA, ...this.deflectionPoints, this.bodyB];
    let startDiff = null; let startDiffLen = 0;
    let endDiff = null; let endDiffLen = 0;
    this.tmpPosA = this.bodyA.pos;
    for (let i = 1; i < deflPts.length; i++) {
      const bodyA = deflPts[i-1];
      const bodyB = deflPts[i];
      const diff = bodyB.pos.minus(bodyA.pos);
      const diffLen = diff.norm();
      len += diffLen;
      this.tmpDiffArr.push(diff);
      this.tmpLenArr.push(diffLen);
      if (diffLen > 0) {
        if (startDiffLen == 0) {
          startDiff = diff;
          startDiffLen = diffLen;
        }
        endDiff = diff;
        endDiffLen = diffLen;
      }
    }
    this.tmpStartDiff = startDiff;
    this.tmpStartDiffLen = startDiffLen;
    this.tmpEndDiff = endDiff;
    this.tmpEndDiffLen = endDiffLen;
    this.tmpDeflectionPoints = [...this.deflectionPoints];
    this.currentLength = len;

    const diffTot = this.bodyB.pos.minus(this.bodyA.pos);
    const lenTot = diffTot.norm();
    if (len > 0) {
      const directionA = startDiff.times(1 / startDiffLen);
      const directionB = endDiff.times(1 / endDiffLen);
      this.tmpDirectionA = directionA;
      this.tmpDirectionB = directionB;
      const springForceMag = (len - this.restLength) * this.springConstant;
      this.bodyA.applyForce(directionA.times(springForceMag));
      this.bodyB.applyForce(directionB.times(-springForceMag));

      if (lenTot > 0) {
        const lengthChangeRateA = -this.bodyA.velocity.dot(directionA);
        const lengthChangeRateB = this.bodyB.velocity.dot(directionB);

        if (this.bodyA.mass > 0 && this.bodyB.mass > 0) {
          const relativeParallelA = directionA.times(lengthChangeRateA);
          const relativeParallelB = directionB.times(lengthChangeRateB);
          const relativePerpA = this.bodyA.velocity.times(-1).minus(relativeParallelA);
          const relativePerpB = this.bodyB.velocity.minus(relativeParallelB);
          const relativePerp = relativePerpA.plus(relativePerpB);

          const dampingForce = relativePerp.times(this.dampingCoefficient);
          this.bodyA.applyForce(dampingForce);
          this.bodyB.applyForce(dampingForce.times(-1));
        }
      
        const lengthChangeRate = lengthChangeRateA + lengthChangeRateB;
        this.bodyA.applyForce(directionA.times(lengthChangeRate * this.internalDamping));
        this.bodyB.applyForce(directionB.times(-lengthChangeRate * this.internalDamping));
      }
    }
  }
  
  forwardDeflectionPointHelper(delta_pos, delta_fac) { // bodyA moves towards first deflection point of this rope segment
    // here, we don't need this.tmpDeflectionPoints as the deflection points of this segment cannot have changed yet
    if (delta_fac <= this.tmpLenArr[0]) { // bodyA does not pass through the deflection point
      this.bodyA.pos = this.bodyA.pos.plus(delta_pos);
    } else { // bodyA passes through the deflection point
      const additionalFreeMovement = delta_pos.minus(this.tmpDirectionA.times(delta_fac));
      let csum = 0;
      let didx = 0;
      while (delta_fac > csum && didx < this.tmpLenArr.length) {
        csum += this.tmpLenArr[didx];
        didx++;
      }
      didx--;
      const prevLen = csum - this.tmpLenArr[didx];
      const currLen = this.tmpLenArr[didx];
      const deflPt2Weight = (delta_fac - prevLen) / currLen;
      if (didx+1 < this.tmpLenArr.length) { // bodyA is now exactly between two deflection points
        this.bodyA.pos = this.deflectionPoints[didx-1].pos.times(1 - deflPt2Weight).plus(this.deflectionPoints[didx].pos.times(deflPt2Weight)).plus(additionalFreeMovement);
        for (let i = 0; i < didx; i++) {
          const dPoint = this.deflectionPoints.shift();
          if (this.previousSegment !== null)
            this.previousSegment.deflectionPoints.push(dPoint);
        }
      } else { // bodyA passed through all deflection points
        this.bodyA.pos = this.deflectionPoints[didx-1].pos.plus(this.tmpDirectionB.times(delta_fac - prevLen)).plus(additionalFreeMovement);
        if (this.previousSegment !== null) {
          for (let i = 0; i < this.deflectionPoints.length; i++)
            this.previousSegment.deflectionPoints.push(this.deflectionPoints[i]);
        }
        this.deflectionPoints = [];
      }
    }
  }

  backwardDeflectionPointHelper(delta_pos, delta_fac) { // bodyB moves towards last deflection point of this rope segment
    // here, we need this.tmpDeflectionPoints as the deflection points of this segment might already have changed if bodyA moved over deflection points
    if (-delta_fac <= this.tmpLenArr[this.tmpLenArr.length - 1]) { // bodyB does not pass through the last deflection point
      this.bodyB.pos = this.bodyB.pos.plus(delta_pos);
    } else { // bodyB passes through the last deflection point
      const additionalFreeMovement = delta_pos.minus(this.tmpDirectionB.times(delta_fac));
      let csum = 0;
      let didx = this.tmpLenArr.length - 1;
      while (-delta_fac > csum && didx >= 0) {
        csum += this.tmpLenArr[didx];
        didx--;
      }
      didx++;
      const prevLen = csum - this.tmpLenArr[didx];
      const currLen = this.tmpLenArr[didx];
      const deflPt2Weight = (-delta_fac - prevLen) / currLen;
      if (didx > 0) { // bodyB is now exactly between two deflection points
        this.bodyB.pos = this.tmpDeflectionPoints[didx].pos.times(1 - deflPt2Weight).plus(this.tmpDeflectionPoints[didx-1].pos.times(deflPt2Weight)).plus(additionalFreeMovement);
        for (let i = 0; i < this.tmpLenArr.length - 1 - didx; i++) {
          const dPoint = this.deflectionPoints.pop();
          if (this.followingSegment !== null)
            this.followingSegment.deflectionPoints.unshift(dPoint);
        }
      } else { // bodyB passed through all deflection points
        this.bodyB.pos = this.tmpDeflectionPoints[0].pos.plus(this.tmpDirectionA.times(delta_fac + prevLen)).plus(additionalFreeMovement);
        for (let i = 0; i < this.tmpDeflectionPoints.length; i++) {
          const dPoint = this.deflectionPoints.pop();
          if (this.followingSegment !== null)
            this.followingSegment.deflectionPoints.unshift(dPoint);
        }
      }
    }
  }

  timeStep(delta, clearForces = true) {
    if (this.deflectionPoints.length == 0 && (this.previousSegment === null || this.previousSegment.tmpDeflectionPoints.length == 0)) {
      this.bodyA.timeStep(delta, clearForces);
    } else {
      const delta_pos = this.bodyA.timeStep(delta, clearForces, false);
      const delta_fac = this.deflectionPoints.length > 0 ? this.tmpDirectionA.dot(delta_pos) : 0;
      if (delta_fac > 0) { // bodyA moves towards first deflection point of this rope segment
        this.forwardDeflectionPointHelper(delta_pos, delta_fac);
      } else if (this.previousSegment !== null && this.previousSegment.tmpDeflectionPoints.length > 0) {
        const delta2_fac = this.previousSegment.tmpDirectionB.dot(delta_pos);
        if (delta2_fac < 0) { // bodyA moves towards last deflection point of previous rope segment
          this.previousSegment.backwardDeflectionPointHelper(delta_pos, delta2_fac);
        } else {
          this.bodyA.pos = this.bodyA.pos.plus(delta_pos);
        }
      } else {
        this.bodyA.pos = this.bodyA.pos.plus(delta_pos);
      }
    }
    if (this.followingSegment === null) {
      if (this.tmpDeflectionPoints.length == 0) {
        this.bodyB.timeStep(delta, clearForces);
      } else {
        const delta_pos = this.bodyB.timeStep(delta, clearForces, false);
        const delta_fac = this.tmpDirectionB.dot(delta_pos);
        if (delta_fac < 0) { // bodyB moves towards last deflection point of this rope segment
          this.backwardDeflectionPointHelper(delta_pos, delta_fac);
        } else {
          this.bodyB.pos = this.bodyB.pos.plus(delta_pos);
        }
      }
    }
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
    if (this.mass > 0) {
      const acceleration = this.appliedForces.times(1 / this.mass);
      this.velocity = this.velocity.plus(acceleration.times(delta)).times(Math.pow(this.velocityDamping, delta));
      if (applyChanges)
        this.pos = this.pos.plus(this.velocity.times(delta));
    }
    if (clearForces) this.clearForces();
    if (!applyChanges)
      return this.velocity.times(delta);
  }
}
