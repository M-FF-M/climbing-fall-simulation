
/**
 * Convert a number to a formatted string, including a physical unit
 * @param {number} num the number to convert
 * @param {string} [unit] the unit, e.g. m, kg. Pass the empty string for no unit.
 * @param {number} [digitsAfterPoint=2] the number of digits after the decimal point
 * @param {number} [fixedLength=-1] the desired length of the string in characters (use -1 for variable length depending on the number)
 * @param {number} [dotPosition=6] how many characters should follow after the decimal point, only used if fixedLength > 0; useful for aligning numbers
 * @return {string} the formatted number
 */
function numToUnitStr(num, unit = '', digitsAfterPoint = 3, fixedLength = -1, dotPosition = 7) {
  if (unit === '') return numToStr(num, digitsAfterPoint, fixedLength, dotPosition);
  let iskunit = false;
  if (unit.length >= 2 && (unit.substring(0, 2) == 'kg' || unit.substring(0, 2) == 'km')) {
    num *= 1000;
    unit = unit.substring(1);
    iskunit = true;
  }
  if (unit.length >= 1 && unit.substring(0, 1) == 's' && Math.abs(num) >= 1) { // special case: time
    const absNum = Math.abs(num);
    if (absNum / 60 >= 1 && absNum / 60 < 60) return `${numToStr(num / 60, digitsAfterPoint, fixedLength, dotPosition)} min${unit.substring(1)}`;
    if (absNum / 60 / 60 >= 1 && absNum / 60 / 60 < 24) return `${numToStr(num / 60 / 60, digitsAfterPoint, fixedLength, dotPosition)} h${unit.substring(1)}`;
  }
  const powOf10 = Math.floor(Math.log10(Math.abs(num)));
  if (unit.length >= 1 && unit.substring(0, 1) == 'm') {
    if (powOf10 < 0 && powOf10 >= -2) return `${numToStr(num * 100, digitsAfterPoint, fixedLength, dotPosition)} c${unit}`;
  }
  if (powOf10 < 15 && powOf10 >= 12) return `${numToStr(num / 1000 / 1000 / 1000 / 1000, digitsAfterPoint, fixedLength, dotPosition)} T${unit}`;
  if (powOf10 < 12 && powOf10 >= 9) return `${numToStr(num / 1000 / 1000 / 1000, digitsAfterPoint, fixedLength, dotPosition)} G${unit}`;
  if (powOf10 < 9 && powOf10 >= 6) return `${numToStr(num / 1000 / 1000, digitsAfterPoint, fixedLength, dotPosition)} M${unit}`;
  if (powOf10 < 6 && powOf10 >= 3) return `${numToStr(num / 1000, digitsAfterPoint, fixedLength, dotPosition)} k${unit}`;
  if (powOf10 < 3 && powOf10 >= 0) return `${numToStr(num, digitsAfterPoint, fixedLength, dotPosition)} ${unit}`;
  if (powOf10 < 0 && powOf10 >= -3) return `${numToStr(num * 1000, digitsAfterPoint, fixedLength, dotPosition)} m${unit}`;
  if (powOf10 < -3 && powOf10 >= -6) return `${numToStr(num * 1000 * 1000, digitsAfterPoint, fixedLength, dotPosition)} μ${unit}`;
  if (powOf10 < -6 && powOf10 >= -9) return `${numToStr(num * 1000 * 1000 * 1000, digitsAfterPoint, fixedLength, dotPosition)} n${unit}`;
  if (powOf10 < -9 && powOf10 >= -12) return `${numToStr(num * 1000 * 1000 * 1000 * 1000, digitsAfterPoint, fixedLength, dotPosition)} p${unit}`;

  if (iskunit) return `${numToStr(num / 1000, digitsAfterPoint, fixedLength, dotPosition)} k${unit}`;
  return `${numToStr(num, digitsAfterPoint, fixedLength, dotPosition)} ${unit}`;
}
