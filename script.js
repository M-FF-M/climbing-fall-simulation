
const GRAVITY_OF_EARTH = 9.807;
const GRAVITY_VEC = new V(0, -GRAVITY_OF_EARTH, 0);

const GLOBALS = {
  canvasWidth: 600,
  canvasHeight: 800,
  timeDelay: 0,
  cTime: 0,
  slowMotion: 1,
  maxStep: 0.0001,
  maxStepNum: 100,
  startingTime: 0
};

function main() {
  GLOBALS.startHeight = 3;
  GLOBALS.ropeLength = 5;
  GLOBALS.freeFall = GLOBALS.startHeight + GLOBALS.ropeLength;
  GLOBALS.fallFactor = GLOBALS.freeFall / GLOBALS.ropeLength;
  GLOBALS.climber = new Body(0.01 + Math.sqrt(GLOBALS.ropeLength * GLOBALS.ropeLength - GLOBALS.startHeight * GLOBALS.startHeight), GLOBALS.startHeight, 0, 70);
  GLOBALS.climber.velocityDamping = 0.95;
  GLOBALS.climber.velocity = new V(0, 0, 0);
  GLOBALS.rope = new Rope(GLOBALS.ropeLength, 30, new Body(0, 0, 0, 0), GLOBALS.climber);
  GLOBALS.expectedForce = GLOBALS.climber.mass * GRAVITY_OF_EARTH
    + Math.sqrt(GLOBALS.climber.mass * GRAVITY_OF_EARTH * GLOBALS.climber.mass * GRAVITY_OF_EARTH
                + 2 * GLOBALS.climber.mass * GRAVITY_OF_EARTH * GLOBALS.fallFactor / GLOBALS.rope.elasticityConstant);
  
  const FPS = 40;
  const snapshots = precalculatePositions(25, FPS);
  GLOBALS.startingTime = (new Date()).getTime() / 1000;
  window.requestAnimationFrame(() => playInLoop(snapshots, FPS));
  // GLOBALS.lastTimeStep = (new Date()).getTime() / 1000;
  // window.requestAnimationFrame(mainSimulationLoop);
}

function playInLoop(snapshots, FPS) {
  const cTime = (new Date()).getTime() / 1000 - GLOBALS.startingTime;

  drawRope(snapshots[Math.round(cTime * FPS) % snapshots.length]);
  
  window.requestAnimationFrame(() => playInLoop(snapshots, FPS));
}

function precalculatePositions(targetTime, FPS = 40) {
  const snapshots = [];
  const addSnapshot = (t) => {
    const ss = [];
    for (let i = 0; i < GLOBALS.rope.bodies.length; i++)
      ss.push(GLOBALS.rope.bodies[i].pos);
    snapshots.push({
      positions: ss, cTime: t, timeDelay: 0, maxStretchingForce: GLOBALS.rope.maxStretchingForce,
      expectedForce: GLOBALS.expectedForce, climberGravity: GLOBALS.climber.mass * GRAVITY_OF_EARTH,
      maxSpeed: GLOBALS.rope.maxEndSpeed
     });
  };
  addSnapshot(0);
  const numSteps = targetTime / GLOBALS.maxStep;
  let lastSnapshot = 0;
  for (let i = 1; i <= numSteps; i++) {
    GLOBALS.rope.applyGravity(GRAVITY_VEC);
    GLOBALS.rope.applyRopeForces();
    GLOBALS.rope.timeStep(GLOBALS.maxStep);
    if (i * GLOBALS.maxStep - lastSnapshot >= 1 / FPS) {
      addSnapshot(i * GLOBALS.maxStep);
      lastSnapshot = i * GLOBALS.maxStep;
    }
  }
  return snapshots;
}

function drawRope(infoObj) {
  const { positions, cTime, timeDelay, maxStretchingForce, expectedForce, climberGravity, maxSpeed } = infoObj;

  const canvas = document.getElementById('main-canvas');
  if (canvas.width != GLOBALS.canvasWidth || canvas.height !=  GLOBALS.canvasHeight) {
    canvas.width = GLOBALS.canvasWidth;
    canvas.height = GLOBALS.canvasHeight;
    canvas.style.width = `${GLOBALS.canvasWidth}px`;
    canvas.style.height = `${GLOBALS.canvasHeight}px`;
  }
  const XORIG = GLOBALS.canvasWidth / 2;
  const YORIG = 200;
  const SCALE = 50;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, GLOBALS.canvasWidth, GLOBALS.canvasHeight);
  ctx.lineJoin = 'round';

  for (let i = 0; i <= 20; i++) {
    ctx.beginPath();
    ctx.moveTo(0, YORIG + 0.5 * i*SCALE - 0.5);
    ctx.lineTo(GLOBALS.canvasWidth, YORIG + 0.5 * i*SCALE - 0.5);
    if (i % 2 == 0)
      ctx.strokeStyle = 'rgb(190, 190, 190)';
    else
      ctx.strokeStyle = 'rgb(220, 220, 220)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.closePath();
    ctx.font = '0.75em Arial';
    ctx.fillStyle = 'black';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(`${numToStr(i * 0.5)} m`, 5, YORIG + 0.5 * i*SCALE);
  }
  ctx.font = '0.75em Arial';
  ctx.fillStyle = 'black';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText(`${numToStr(cTime, 2, 11)} s`, GLOBALS.canvasWidth - 5, GLOBALS.canvasHeight / 2);
  ctx.fillText(`(+ ${numToStr(timeDelay, 2, 11)} s)`, GLOBALS.canvasWidth - 5, GLOBALS.canvasHeight / 2 + 20);
  ctx.fillText(`max. force on rope: ${numToStr(maxStretchingForce, 2, 11)} N`, GLOBALS.canvasWidth - 5, GLOBALS.canvasHeight / 2 + 40);
  ctx.fillText(`expected force (vertical fall): ${numToStr(expectedForce, 2, 11)} N`, GLOBALS.canvasWidth - 5, GLOBALS.canvasHeight / 2 + 60);
  ctx.fillText(`gravity on climber: ${numToStr(climberGravity, 2, 11)} N`, GLOBALS.canvasWidth - 5, GLOBALS.canvasHeight / 2 + 80);
  ctx.fillText(`max. speed of climber: ${numToStr(maxSpeed * 3.6, 2, 11)} km/h`, GLOBALS.canvasWidth - 5, GLOBALS.canvasHeight / 2 + 100);

  ctx.beginPath();
  const fPos = positions[0];
  ctx.arc(XORIG + fPos.x*SCALE, YORIG - fPos.y*SCALE, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'red';
  ctx.fill();
  ctx.closePath();

  ctx.beginPath();
  const hPos = positions[positions.length - 1];
  ctx.arc(XORIG + hPos.x*SCALE, YORIG - hPos.y*SCALE, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'green';
  ctx.fill();
  ctx.closePath();

  // for (let i = 1; i < positions.length - 1; i++) {
  //   const segPos = positions[i];
  //   ctx.beginPath();
  //   ctx.arc(XORIG + segPos.x*SCALE, YORIG - segPos.y*SCALE, 4, 0, Math.PI * 2);
  //   ctx.strokeStyle = 'gray';
  //   ctx.lineWidth = 1;
  //   ctx.stroke();
  //   ctx.closePath();
  // }

  ctx.beginPath();
  const topPos = positions[0];
  ctx.moveTo(XORIG + topPos.x*SCALE, YORIG - topPos.y*SCALE);
  for (let i = 1; i < positions.length; i++) {
    const segPos = positions[i];
    ctx.lineTo(XORIG + segPos.x*SCALE, YORIG - segPos.y*SCALE);
  }
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.closePath();
}

function mainSimulationLoop() {
  const cTime = (new Date()).getTime() / 1000;
  const delta_t = cTime - GLOBALS.lastTimeStep;
  if (delta_t == 0) {
    window.requestAnimationFrame(mainSimulationLoop);
    return;
  }
  
  const tStep = Math.min(GLOBALS.slowMotion * delta_t, GLOBALS.maxStep);
  const numSteps = Math.min(GLOBALS.maxStepNum, Math.floor(GLOBALS.slowMotion * delta_t / tStep));
  for (let i = 0; i < numSteps; i++) {
    GLOBALS.rope.applyGravity(GRAVITY_VEC);
    GLOBALS.rope.applyRopeForces();
    GLOBALS.rope.timeStep(tStep);
  }
  GLOBALS.timeDelay += delta_t - numSteps * tStep;
  GLOBALS.cTime += numSteps * tStep;

  drawRope({
    positions: GLOBALS.rope.bodies.map(item => item.pos), cTime: GLOBALS.cTime, timeDelay: GLOBALS.timeDelay, maxStretchingForce: GLOBALS.rope.maxStretchingForce,
    expectedForce: GLOBALS.expectedForce, climberGravity: GLOBALS.climber.mass * GRAVITY_OF_EARTH,
    maxSpeed: GLOBALS.rope.maxEndSpeed
   });
  
  GLOBALS.lastTimeStep = cTime;
  window.requestAnimationFrame(mainSimulationLoop);
}
