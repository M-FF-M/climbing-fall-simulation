
class Rope {
  // default: one fixed end at 0, 70kg hanging at the other end (straight down)
  constructor(length = 5, segments = 1, end1 = new Body(0, 0, 0, 0), end2 = new Body(0, -length, 0, 70)) {
    this.restLength = length;
    this.mass = length * 0.062; // 62 g per meter of rope weight of typical climbing rope
    this.elasticityConstant = 0.079e-3; // 0.079e-3 1/N elasticity constant of typical climbing rope
    this.segmentLength = length / segments;
    this.segmentSpringConstant = 1 / (this.segmentLength * this.elasticityConstant);
    this.dampingCoefficient = 0.1 / this.segmentLength; // damping for oscillations orthogonal to the rope
    this.internalDamping = 0.01 / this.segmentLength; // damping for internal friction
    this.segmentMass = (segments > 1) ? this.mass / (segments - 1) : 0; // ends have their own predefined masses
    this.bodies = [end1];
    for (let i = 1; i < segments; i++) {
      this.bodies.push(new Body(...end1.pos.plus(end2.pos.minus(end1.pos).times(i / segments)).arr, this.segmentMass));
      this.bodies[i].velocityDamping = 0.6;
    }
    this.bodies.push(end2);
    this.currentLength = end2.pos.minus(end1.pos).norm();
    this.currentStretchingForce = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    this.maxStretchingForce = this.currentStretchingForce;
    this.maxEndSpeed = end2.velocity.norm();
  }

  applyGravity(f) {
    for (let i = 0; i < this.bodies.length; i++) {
      this.bodies[i].applyGravity(f);
    }
  }

  applyRopeForces() {
    this.currentLength = 0;
    for (let i = 1; i < this.bodies.length; i++) {
      const bA = this.bodies[i-1];
      const bB = this.bodies[i];
      const diff = bB.pos.minus(bA.pos);
      const len = diff.norm();
      this.currentLength += len;
      if (len > 0) {
        const direction = diff.times(1 / len);
        const springForceMag = (len - this.segmentLength) * this.segmentSpringConstant;
        const springForce = direction.times(springForceMag);
        bA.applyForce(springForce);
        bB.applyForce(springForce.times(-1));

        const relativeVelocity = bB.velocity.minus(bA.velocity);
        const lengthChangeRate = relativeVelocity.dot(direction);
        if (bA.mass > 0 && bB.mass > 0) {
          const relativeParallel = direction.times(lengthChangeRate);
          const relativePerp = relativeVelocity.minus(relativeParallel);
          const dampingForce = relativePerp.times(this.dampingCoefficient);
          bA.applyForce(dampingForce);
          bB.applyForce(dampingForce.times(-1));
        }
        
        const internalDampingForce = direction.times(lengthChangeRate * this.internalDamping);
        bA.applyForce(internalDampingForce);
        bB.applyForce(internalDampingForce.times(-1));
      }
    }
    this.currentStretchingForce = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    this.maxStretchingForce = Math.max(this.currentStretchingForce, this.maxStretchingForce);
  }

  timeStep(delta, clearForces = true) {
    for (let i = 1; i < this.bodies.length; i++) {
      this.bodies[i].timeStep(delta, clearForces);
    }
    this.maxEndSpeed = Math.max(this.maxEndSpeed, this.bodies[this.bodies.length - 1].velocity.norm());
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

  timeStep(delta, clearForces = true) {
    if (this.mass > 0) {
      const acceleration = this.appliedForces.times(1 / this.mass);
      this.velocity = this.velocity.plus(acceleration.times(delta)).times(Math.pow(this.velocityDamping, delta));
      this.pos = this.pos.plus(this.velocity.times(delta));
    }
    if (clearForces) this.clearForces();
  }
}
