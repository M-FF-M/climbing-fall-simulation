
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

class V {
  constructor(x = 0, y = 0, z = 0) {
    if (x instanceof Array) {
      [x, y, z] = x;
    }
    this.x = x;
    this.y = y;
    this.z = z;
  }

  plus(vec) {
    return new V(this.x + vec.x, this.y + vec.y, this.z + vec.z);
  }

  minus(vec) {
    return new V(this.x - vec.x, this.y - vec.y, this.z - vec.z);
  }

  times(scalar) {
    return new V(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  norm() {
    return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
  }

  normsq() {
    return this.x*this.x + this.y*this.y + this.z*this.z;
  }

  dot(vec) {
    return this.x * vec.x + this.y * vec.y + this.z * vec.z;
  }

  cross(vec) {
    return new V(this.y * vec.z - this.z * vec.y, this.z * vec.x - this.x * vec.z, this.x * vec.y - this.y * vec.x);
  }

  get arr() {
    return [this.x, this.y, this.z];
  }

  copy() {
    return new V(this.x, this.y, this.z);
  }

  normalize() {
    if (this.x == 0 && this.y == 0 && this.z == 0) return this.copy();
    return this.copy().times(1 / this.norm());
  }

  toString() {
    return `(${numToStr(this.x)}, ${numToStr(this.y)}, ${numToStr(this.z)})`;
  }
}

function calculatePlaneIntersection(n1, d1, n2, d2) {
  const lineDir = n1.cross(n2);
  const pointOnLine = n2.times(d1).minus(n1.times(d2)).cross(lineDir).times(1 / lineDir.normsq());
  return [lineDir, pointOnLine];
}
