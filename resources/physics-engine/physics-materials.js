
/**
 * A general class representing a spring
 */
class Spring {
  /**
   * Create a new spring
   * @param {Body} end1 the body at one end of the spring
   * @param {Body} end2 the body at the other end of the spring
   * @param {number} restLength the (current) rest length of the spring in meters
   */
  constructor(end1, end2, restLength) {
    /** @type {Body} the body at one end of the spring */
    this.bodyA = end1;
    /** @type {Body} the body at the other end of the spring */
    this.bodyB = end2;
    /** @type {V} vector pointing from bodyA to bodyB */
    this.diff = this.bodyB.pos.minus(this.bodyA.pos);
    /** @type {number} the current length of the (potentially stretched) spring in meters */
    this.currentLength = this.diff.norm();
    /** @type {number} the rest length of the spring in meters */
    this.restLength = restLength;
    /** @type {number} tension of the spring in Newton */
    this.tension = 0;
    /** @type {number} the energy stored in the spring in Joule */
    this.elasticEnergy = 0;
  }

  /**
   * Update the spring tension (this method should be called when the spring's end bodies have moved)
   */
  updateTension() {
    this.diff = this.bodyB.pos.minus(this.bodyA.pos);
    this.currentLength = this.diff.norm();
  }

  /**
   * Execute a time step for this spring. Required if there are internal spring states which need to be
   * updated such as the viscous extension.
   * @param {number} delta the length of the time step in seconds
   */
  timeStep(delta) {
    // nothing to do for simple springs
  }

  /**
   * Shift rest length from this spring to another spring
   * @param {Spring} spring2 the spring to which to transfer the rest length
   * @param {number} [restLength=null] the amount of rest length to shift in meters. If set to null, the entire rest length of
   *                                   this spring will be shifted.
   */
  shiftRestLengthTo(spring2, restLength = null) {
    console.warn('Spring.shiftRestLengthTo() is only an abstract method which should be implemented by child classes');
  }
  
  /**
   * Merge this spring into an adjacent spring so that the original connecting body is no longer a spring end.
   * This spring should not be used anymore after merging (it will have rest length 0).
   * @param {Spring} spring2 the spring into which to merge this spring
   */
  mergeInto(spring2) {
    console.warn('Spring.mergeInto() is only an abstract method which should be implemented by child classes');
  }

  /**
   * Split this spring into two springs
   * @param {number} restLength the rest length (in meters) of the newly created spring (will be subtracted from this spring's rest length)
   * @param {Body} connectingBody the body connecting this spring to the newly created spring
   * @param {'start'|'end'} [splitAt='start'] whether the newly created spring will be on the side of bodyA (start) or bodyB (end)
   * @return {Spring} the newly created spring
   */
  splitOffSpring(restLength, connectingBody, splitAt = 'start') {
    console.warn('Spring.splitOffSpring() is only an abstract method which should be implemented by child classes');
  }
}

/**
 * A simple linear spring connecting two bodies
 */
class LinearSpring extends Spring {
  /**
   * Create a new simple linear spring
   * @param {Body} end1 the body at one end of the spring
   * @param {Body} end2 the body at the other end of the spring
   * @param {number} restLength the (current) rest length of the spring in meters
   * @param {number} elasticityConstant the elasticity constant of the spring in 1/Newton
   */
  constructor(end1, end2, restLength, elasticityConstant) {
    super(end1, end2, restLength);
    /** @type {number} the elasticity constant of the spring in 1/Newton */
    this.elasticityConstant = elasticityConstant;
    /** @type {number} tension of the spring in Newton */
    this.tension = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
  }

  /**
   * Update the spring tension (this method should be called when the spring's end bodies have moved)
   */
  updateTension() {
    super.updateTension();
    this.tension = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    this.elasticEnergy = 0.5 * (this.currentLength - this.restLength) * (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
  }

  /**
   * Shift rest length from this spring to another spring
   * @param {Spring} spring2 the spring to which to transfer the rest length
   * @param {number} [restLength=null] the amount of rest length to shift in meters. If set to null, the entire rest length of
   *                                   this spring will be shifted.
   */
  shiftRestLengthTo(spring2, restLength = null) {
    if (restLength === null || typeof restLength === 'undefined')
      restLength = this.restLength;
    if (spring2 instanceof LinearSpring) {
      this.restLength -= restLength;
      spring2.restLength += restLength;
    } else {
      throw new Error(`LinearSpring.shiftRestLengthTo(): parameter spring2's type is not supported`);
    }
  }

  /**
   * Merge this spring into an adjacent spring so that the original connecting body is no longer a spring end.
   * This spring should not be used anymore after merging (it will have rest length 0).
   * @param {Spring} spring2 the spring into which to merge this spring
   */
  mergeInto(spring2) {
    if (spring2.bodyA === this.bodyB) {
      this.shiftRestLengthTo(spring2);
      spring2.bodyA = this.bodyA;
    } else if (spring2.bodyB === this.bodyA) {
      this.shiftRestLengthTo(spring2);
      spring2.bodyB = this.bodyB;
    } else {
      throw new Error(`LinearSpring.mergeInto() called with non-adjacent springs`);
    }
  }

  /**
   * Split this spring into two springs
   * @param {number} restLength the rest length (in meters) of the newly created spring (will be subtracted from this spring's rest length)
   * @param {Body} connectingBody the body connecting this spring to the newly created spring
   * @param {'start'|'end'} [splitAt='start'] whether the newly created spring will be on the side of bodyA (start) or bodyB (end)
   * @return {Spring} the newly created spring
   */
  splitOffSpring(restLength, connectingBody, splitAt = 'start') {
    if (splitAt === 'start') {
      const newSpring = new LinearSpring(this.bodyA, connectingBody, 0, this.elasticityConstant);
      this.shiftRestLengthTo(newSpring, restLength);
      this.bodyA = connectingBody;
      return newSpring;
    } else {
      const newSpring = new LinearSpring(connectingBody, this.bodyB, 0, this.elasticityConstant);
      this.shiftRestLengthTo(newSpring, restLength);
      this.bodyB = connectingBody;
      return newSpring;
    }
  }
}

/**
 * A viscoelastic spring connecting two bodies
 */
class ViscoelasticSpring extends Spring {
  /**
   * Create a new viscoelastic spring (Standard Linear Solid model: spring 1 in parallel with Maxwell arm, which consists of spring 2 and viscous damping)
   * @param {Body} end1 the body at one end of the spring
   * @param {Body} end2 the body at the other end of the spring
   * @param {number} restLength the (current) rest length of the spring in meters
   * @param {number} elasticityConstant1 the elasticity constant of spring 1 in 1/Newton
   * @param {number} elasticityConstant2 the elasticity constant of spring 2 (in the Maxwell arm) in 1/Newton
   * @param {number} viscosity the material viscosity in the Maxwell arm in Newton * seconds
   */
  constructor(end1, end2, restLength, elasticityConstant1, elasticityConstant2, viscosity) {
    super(end1, end2, restLength);
    /** @type {number} the elasticity constant of spring 1 in 1/Newton */
    this.elasticityConstant = elasticityConstant1;
    /** @type {number} the elasticity constant of spring 2 (in the Maxwell arm) in 1/Newton */
    this.elasticityConstant2 = elasticityConstant2;
    /** @type {number} the material viscosity in the Maxwell arm in Newton * seconds */
    this.viscosity = viscosity;
    /** @type {number} internal viscous extension of Maxwell arm in meters */
    this.viscExt = this.currentLength - this.restLength;
    this.updateTension();
  }

  /**
   * Update the spring tension (this method should be called when the spring's end bodies have moved)
   */
  updateTension() {
    super.updateTension();
    if (this.elasticityConstant2 == 0 && this.viscosity == 0 && this.elasticityConstant > 0) { // simple linear spring case
      this.viscExt = this.currentLength - this.restLength; // not needed in this case
      this.tension = (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
      this.elasticEnergy = 0.5 * (this.currentLength - this.restLength) * (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    } else if (this.elasticityConstant2 == 0 && this.viscosity > 0 && this.elasticityConstant > 0) { // Kelvin model (no spring in Maxwell arm)
      this.viscExt = this.currentLength - this.restLength; // not needed in this case (it is equal to the actual extension)
      const direction = this.diff.times(1 / this.currentLength);
      const lengthChangeRate = -this.bodyA.velocity.dot(direction) + this.bodyB.velocity.dot(direction);
      this.tension =
        (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant)
        + this.viscosity / this.restLength * lengthChangeRate;
      this.elasticEnergy = 0.5 * (this.currentLength - this.restLength) * (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant);
    } else { // full SLS model
      const extensionOffset = this.currentLength - this.restLength - this.viscExt;
      this.tension =
        (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant)
        + extensionOffset / (this.restLength * this.elasticityConstant2);
      this.elasticEnergy =
        0.5 * (this.currentLength - this.restLength) * (this.currentLength - this.restLength) / (this.restLength * this.elasticityConstant)
        + 0.5 * extensionOffset * extensionOffset / (this.restLength * this.elasticityConstant2);
    }
  }

  /**
   * Execute a time step for this spring. Updates the internal viscous extension.
   * @param {number} delta the length of the time step in seconds
   */
  timeStep(delta) {
    if (this.elasticityConstant2 == 0 && this.viscosity == 0 && this.elasticityConstant > 0) { // simple linear spring case
      this.viscExt = this.currentLength - this.restLength; // nothing to do, viscous extension not needed
    } else if (this.elasticityConstant2 == 0 && this.viscosity > 0 && this.elasticityConstant > 0) { // Kelvin model (no spring in Maxwell arm)
      this.viscExt = this.currentLength - this.restLength; // nothing to do, viscous extension not needed
    } else { // full SLS model
      this.viscExt += delta * (this.currentLength - this.restLength - this.viscExt) / (this.viscosity * this.elasticityConstant2)
    }
  }

  /**
   * Shift rest length from this spring to another spring
   * @param {Spring} spring2 the spring to which to transfer the rest length
   * @param {number} [restLength=null] the amount of rest length to shift in meters. If set to null, the entire rest length of
   *                                   this spring will be shifted.
   */
  shiftRestLengthTo(spring2, restLength = null) {
    if (restLength === null || typeof restLength === 'undefined')
      restLength = this.restLength;
    if (spring2 instanceof ViscoelasticSpring) {
      const viscExtShift = restLength / this.restLength * this.viscExt;
      this.restLength -= restLength;
      spring2.restLength += restLength;
      this.viscExt -= viscExtShift;
      spring2.viscExt += viscExtShift;
    } else {
      throw new Error(`ViscoelasticSpring.shiftRestLengthTo(): parameter spring2's type is not supported`);
    }
  }

  /**
   * Merge this spring into an adjacent spring so that the original connecting body is no longer a spring end.
   * This spring should not be used anymore after merging (it will have rest length 0).
   * @param {Spring} spring2 the spring into which to merge this spring
   */
  mergeInto(spring2) {
    if (spring2.bodyA === this.bodyB) {
      this.shiftRestLengthTo(spring2);
      spring2.bodyA = this.bodyA;
    } else if (spring2.bodyB === this.bodyA) {
      this.shiftRestLengthTo(spring2);
      spring2.bodyB = this.bodyB;
    } else {
      throw new Error(`ViscoelasticSpring.mergeInto() called with non-adjacent springs`);
    }
  }

  /**
   * Split this spring into two springs
   * @param {number} restLength the rest length (in meters) of the newly created spring (will be subtracted from this spring's rest length)
   * @param {Body} connectingBody the body connecting this spring to the newly created spring
   * @param {'start'|'end'} [splitAt='start'] whether the newly created spring will be on the side of bodyA (start) or bodyB (end)
   * @return {Spring} the newly created spring
   */
  splitOffSpring(restLength, connectingBody, splitAt = 'start') {
    if (splitAt === 'start') {
      const newSpring = new ViscoelasticSpring(this.bodyA, connectingBody, 0, this.elasticityConstant, this.elasticityConstant2, this.viscosity);
      newSpring.viscExt = 0;
      this.shiftRestLengthTo(newSpring, restLength);
      this.bodyA = connectingBody;
      return newSpring;
    } else {
      const newSpring = new ViscoelasticSpring(connectingBody, this.bodyB, 0, this.elasticityConstant, this.elasticityConstant2, this.viscosity);
      newSpring.viscExt = 0;
      this.shiftRestLengthTo(newSpring, restLength);
      this.bodyB = connectingBody;
      return newSpring;
    }
  }
}

/**
 * Create a new viscoelastic spring using the LinearSpring interface (with automatic selection of reasonable values for the SLS model)
 * @param {Body} end1 the body at one end of the spring
 * @param {Body} end2 the body at the other end of the spring
 * @param {number} restLength the (current) rest length of the spring in meters
 * @param {number} elasticityConstant the elasticity constant of the spring in 1/Newton
 * @param {number} [p=0.75] fraction of the spring behavior corresponding to a simple linear spring. The remaining behavior is governed by the Maxwell arm.
 * @param {number} [t=0.1] target relaxation time (approximate time in which the internal viscous extension catches up with the actual extension)
 * @return {ViscoelasticSpring} a new viscoelastic spring somewhat similar in behavior to a LinearSpring with the given parameters
 */
function linearSpringWithViscoelasticDamping(end1, end2, restLength, elasticityConstant, p = 0.6, t = 0.1) {
  const elasticityConstant1 = elasticityConstant / p;
  const elasticityConstant2 = elasticityConstant / (1 - p)
  const viscosity = t * (1 - p) / elasticityConstant;
  return new ViscoelasticSpring(end1, end2, restLength, elasticityConstant1, elasticityConstant2, viscosity);
}
