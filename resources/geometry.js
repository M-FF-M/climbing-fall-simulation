
/** @type {number} the epsilon below which values are treated as zero */
const GEOMETRY_EPS = 1e-7;

/**
 * A class for representing certain subsets (full space, plane, line, point, empty set) of 3D space
 */
class GeometricObject {
  /**
   * Create a new geometric object
   */
  constructor() {}

  /**
   * Whether this object represents the entire 3D space
   * @type {boolean}
   */
  get isFullSpace() { return false; }
  /**
   * Whether this object represents a 2D plane in 3D space
   * @type {boolean}
   */
  get isPlane() { return false; }
  /**
   * Whether this object represents a 1D line in 3D space
   * @type {boolean}
   */
  get isLine() { return false; }
  /**
   * Whether this object represents a single point in 3D space
   * @type {boolean}
   */
  get isPoint() { return false; }
  /**
   * Whether this object represents the empty subset of 3D space
   * @type {boolean}
   */
  get isEmpty() { return true; }
  /**
   * Any point which is part of the set representing this object
   * @type {V|null}
   */
  get anyPoint() { return null; }
  /**
   * Dimension of the represented subset of 3D space (-1 = empty, 0 = point, 1 = line, 2 = plane, 3 = entire space)
   * @type {number}
   */
  get subsetDimension() { return -1; }

  /**
   * Check whether a point is contained in this object
   * @param {V} pt the point for which the method checks whether it is contained in this object
   * @return {boolean} whether the given point is contained in this object
   */
  contains(pt) {
    return false;
  }
}

/**
 * The full 3D space
 */
class FullSpace extends GeometricObject {
  /**
   * Create a new full 3D space
   */
  constructor() {
    super();
  }

  get isFullSpace() { return true; }
  get isEmpty() { return false; }
  get anyPoint() { return new V(0, 0, 0); }
  get subsetDimension() { return 3; }
  /**
   * Check whether a point is contained in this space
   * @param {V} pt the point for which the method checks whether it is contained in this space
   * @return {boolean} whether the given point is contained in this space
   */
  contains(pt) { return true; }
}

/**
 * A 2D plane in 3D space
 */
class Plane extends GeometricObject {
  /**
   * Create a new plane
   * @param {V} normal normal vector of the plane (does not need to have length 1)
   * @param {number} offset offset of the plane; all points x in the plane should satisfy x * normal (inner prod.) = offset
   */
  constructor(normal, offset) {
    super();
    /** @type {V} normal vector of the plane (has length 1) */
    this.normal = normal.normalize();
    /** @type {number} offset of the plane; all points x in the plane satisfy x * normal (inner prod.) = offset */
    this.offset = offset / normal.norm();
  }

  get isPlane() { return true; }
  get isEmpty() { return false; }
  get anyPoint() { return this.normal.times(this.offset); }
  get subsetDimension() { return 2; }
  /**
   * Check whether a point is contained in this plane
   * @param {V} pt the point for which the method checks whether it is contained in this plane
   * @return {boolean} whether the given point is contained in this plane
   */
  contains(pt) { return Math.abs(this.normal.dot(pt) - this.offset) < GEOMETRY_EPS; }

  /**
   * Calculate the intersection of this plane with another plane
   * @param {Plane} planeB the other plane
   * @return {GeometricObject} the intersection of the two planes
   */
  intersectionWithPlane(planeB) {
    if (Math.abs( Math.abs(this.normal.dot(planeB.normal)) - 1 ) < GEOMETRY_EPS) { // parallel planes
      if (this.contains(planeB.anyPoint)) // planes are identical
        return new Plane(this.normal, this.offset);
      else // empty intersection
        return new EmptySpace();
    } else { // intersection is a line
      const lineDir = this.normal.cross(planeB.normal);
      const pointOnLine = planeB.normal.times(this.offset).minus(this.normal.times(planeB.offset)).cross(lineDir).times(1 / lineDir.normsq());
      return new Line(pointOnLine, lineDir);
    }
  }

  /**
   * Calculate the intersection of this plane with a line
   * @param {Line} line the line
   * @return {GeometricObject} the intersection of this plane and the line
   */
  intersectionWithLine(line) {
    if (Math.abs(this.normal.dot(line.lineDir)) < GEOMETRY_EPS) { // line is parallel to plane
      if (this.contains(line.anyPoint))
        return new Line(line.pointOnLine, line.lineDir);
      else
        return new EmptySpace();
    } else {
      return new Point( line.pointOnLine.plus( line.lineDir.times( (this.offset - this.normal.dot(line.pointOnLine)) / (this.normal.dot(line.lineDir)) ) ) );
    }
  }
}

/**
 * A 1D line in 3D space
 */
class Line extends GeometricObject {
  /**
   * Create a new line
   * @param {V} pointOnLine a point lying on the line
   * @param {V} lineDir a vector pointing in direction of the line (does not need to have length 1)
   */
  constructor(pointOnLine, lineDir) {
    super();
    /** @type {V} a point lying on the line */
    this.pointOnLine = pointOnLine;
    /** @type {V} a vector pointing in direction of the line (has length 1) */
    this.lineDir = lineDir.normalize();
  }

  get isLine() { return true; }
  get isEmpty() { return false; }
  get anyPoint() { return this.pointOnLine; }
  get subsetDimension() { return 1; }
  /**
   * Check whether a point is contained in this line
   * @param {V} pt the point for which the method checks whether it is contained in this line
   * @return {boolean} whether the given point is contained in this line
   */
  contains(pt) {
    const ptOffset = pt.minus(this.pointOnLine);
    return (ptOffset.normsq() < GEOMETRY_EPS * GEOMETRY_EPS) || (ptOffset.normalize().cross(this.lineDir).normsq() < GEOMETRY_EPS * GEOMETRY_EPS);
  }

  /**
   * Calculate the intersection of this line with another line
   * @param {Line} lineB the other line
   * @return {GeometricObject} the intersection of the two lines
   */
  intersectionWithLine(lineB) {
    if (Math.abs( Math.abs(this.lineDir.dot(lineB.lineDir)) - 1 ) < GEOMETRY_EPS) { // parallel lines
      if (this.contains(lineB.anyPoint))
        return new Line(this.pointOnLine, this.lineDir);
      else
        return new EmptySpace();
    } else {
      const ptOffset = this.pointOnLine.minus(lineB.pointOnLine);
      const normalDir = this.lineDir.cross(lineB.lineDir);
      if (Math.abs(ptOffset.dot(normalDir)) < GEOMETRY_EPS * (ptOffset.norm() + 1) * (normalDir.norm() + 1)) {
        const b = this.lineDir.dot(lineB.lineDir);
        const d = this.lineDir.dot(ptOffset);
        const e = lineB.lineDir.dot(ptOffset);
        const t = (b*e - d) / (1 - b*b);
        const s = (e - b*d) / (1 - b*b);
        const intPtA = this.pointOnLine.plus(this.lineDir.times(t));
        const intPtB = lineB.pointOnLine.plus(lineB.lineDir.times(s));
        if (intPtA.minus(intPtB).normsq() < GEOMETRY_EPS * GEOMETRY_EPS)
          return new Point(intPtA);
        else
          return new EmptySpace();
      } else {
        return new EmptySpace();
      }
    }
  }
}

/**
 * A single point in 3D space
 */
class Point extends GeometricObject {
  /**
   * Create a new point
   * @param {V} point the location of the point
   */
  constructor(point) {
    super();
    /** @type {V} the location of the point */
    this.point = point;
  }

  get isPoint() { return true; }
  get isEmpty() { return false; }
  get anyPoint() { return this.point; }
  get subsetDimension() { return 0; }
  /**
   * Check whether a point is equal to this point
   * @param {V} pt the point for which the method checks whether it is equal to this point
   * @return {boolean} whether the given point is equal to this point
   */
  contains(pt) { return this.point.minus(pt).normsq() < GEOMETRY_EPS * GEOMETRY_EPS; }
}

/**
 * The empty subset of 3D space
 */
class EmptySpace extends GeometricObject {
  /**
   * Create a new empty subset
   */
  constructor() {
    super();
  }
}

/**
 * Calculate the intersection between two geometric objects
 * @param {GeometricObject} o1 the first object
 * @param {GeometricObject} o2 the second object
 * @return {GeometricObject} their intersection
 */
function calculateGeomObjIntersection(o1, o2) {
  if (o1.subsetDimension > o2.subsetDimension)
    [o1, o2] = [o2, o1];
  // o1 is now the smaller object, o2 is the bigger object
  if (o2.isFullSpace) return o1;
  if (o1.isEmpty) return o1;
  if (o1.isPoint) {
    if (o2.contains(o1.anyPoint)) return o1;
    else return new EmptySpace();
  }
  if (o2.isLine) return o1.intersectionWithLine(o2);
  if (o2.isPlane) {
    if (o1.isLine) return o2.intersectionWithLine(o1);
    else return o2.intersectionWithPlane(o1);
  }
  throw new Error('unknown object types in calculateGeomObjIntersection');
}
