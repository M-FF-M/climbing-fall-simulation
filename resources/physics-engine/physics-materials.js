
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
  
}
