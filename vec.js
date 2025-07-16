
/**
 * Convert a number to a formatted string
 * @param {number} num the number to convert
 * @param {number} [digitsAfterPoint=2] the number of digits after the decimal point
 * @param {number} [fixedLength=-1] the desired length of the string in characters (use -1 for variable length depending on the number)
 * @param {number} [dotPosition=6] how many characters should follow after the decimal point, only used if fixedLength > 0; useful for aligning numbers
 * @return {string} the formatted number
 */
function numToStr(num, digitsAfterPoint = 2, fixedLength = -1, dotPosition = 6) {
  let numFormatted;
  const sign = (num < 0) ? '-' : '';
  num = Math.abs(num);
  if ((num >= 0.01 && num < 1000) || (num == 0)) numFormatted = num.toFixed(digitsAfterPoint);
  else numFormatted = num.toExponential(digitsAfterPoint);
  numFormatted = `${sign}${numFormatted}`;
  if (fixedLength == -1) {
    numFormatted = numFormatted.replace(/\.0+(?=e|$)/, '');
    numFormatted = numFormatted.replace(/(?<=\.[0-9]*?)0+(?=e|$)/, '');
  } else {
    const dotPos = numFormatted.indexOf('.');
    const toAdd = dotPosition - (numFormatted.length - dotPos - 1);
    for (let i = 0; i < toAdd; i++) numFormatted += ' ';
    while (numFormatted.length < fixedLength) numFormatted = ` ${numFormatted}`;
  }
  return numFormatted;
}

/**
 * A 3D vector
 */
class V {
  /**
   * Create a new vector
   * @param {number} [x=0] the x coordinate of the vector
   * @param {number} [y=0] the y coordinate of the vector
   * @param {number} [z=0] the z coordinate of the vector
   */
  constructor(x = 0, y = 0, z = 0) {
    if (x instanceof Array) {
      [x, y, z] = x;
    }
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * Add this vector to another vector. Returns a new vector
   * @param {V} vec the vector to add
   * @return {V} the sum of this vector and the second vector
   */
  plus(vec) {
    return new V(this.x + vec.x, this.y + vec.y, this.z + vec.z);
  }

  /**
   * Subtract another vector from this vector. Returns a new vector
   * @param {V} vec the vector to subtract
   * @return {V} the difference of this vector and the second vector
   */
  minus(vec) {
    return new V(this.x - vec.x, this.y - vec.y, this.z - vec.z);
  }

  /**
   * Multiply this vector with a scalar. Returns a new vector
   * @param {number} scalar the scalar factor
   * @return {V} a new, scaled version of this vector
   */
  times(scalar) {
    return new V(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  /**
   * Get the euclidean norm of this vector
   * @return {number} the euclidean norm
   */
  norm() {
    return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
  }

  /**
   * Get the square of the euclidean norm of this vector
   * @return {number} the square of the euclidean norm
   */
  normsq() {
    return this.x*this.x + this.y*this.y + this.z*this.z;
  }

  /**
   * Calculate the scalar/inner product of this vector with another vector
   * @param {V} vec the second vector
   * @return {number} the scalar/inner product of the two vectors
   */
  dot(vec) {
    return this.x * vec.x + this.y * vec.y + this.z * vec.z;
  }

  /**
   * Calculate the cross product of this vector with another vector
   * @param {V} vec the second vector
   * @return {number} the cross product of the two vectors
   */
  cross(vec) {
    return new V(this.y * vec.z - this.z * vec.y, this.z * vec.x - this.x * vec.z, this.x * vec.y - this.y * vec.x);
  }

  /**
   * The three coordinates of this vector as an array
   * @type {number[]}
   */
  get arr() {
    return [this.x, this.y, this.z];
  }

  /**
   * Get a new copy of this vector
   * @return {V} a copy of this vector
   */
  copy() {
    return new V(this.x, this.y, this.z);
  }

  /**
   * Get a new normalized copy of this vector
   * @return {V} a normalized copy of this vector (or the zero vector if the original vector was zero)
   */
  normalize() {
    if (this.x == 0 && this.y == 0 && this.z == 0) return this.copy();
    return this.times(1 / this.norm());
  }

  /**
   * Get a string representation of this vector
   * @return {string} the vector as a string
   */
  toString() {
    return `(${numToStr(this.x)}, ${numToStr(this.y)}, ${numToStr(this.z)})`;
  }
}

/**
 * Calculate the intersection of two planes in 3D space (a line). Attention: fails for parallel planes!
 * @param {V} n1 normal vector of the first plane (does not need to have length 1)
 * @param {number} d1 offset of the first plane; all points x in the first plane satisfy x * n1 (inner prod.) = d1
 * @param {V} n2 normal vector of the second plane (does not need to have length 1)
 * @param {number} d2 offset of the second plane; all points x in the second plane satisfy x * n2 (inner prod.) = d2
 * @return {[V, V]} the first element is a vector pointing in the direction of the line, the second element is a vector which lies on the line
 */
function calculatePlaneIntersection(n1, d1, n2, d2) {
  const lineDir = n1.cross(n2);
  const pointOnLine = n2.times(d1).minus(n1.times(d2)).cross(lineDir).times(1 / lineDir.normsq());
  return [lineDir, pointOnLine];
}
