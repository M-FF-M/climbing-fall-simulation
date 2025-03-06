
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
  GLOBALS.startHeight = 7; // height of climber above ground / belay
  GLOBALS.lastDrawHeight = 5; // height of last draw above ground / belay
  GLOBALS.ropeLength = GLOBALS.startHeight + 0.1; // 10 cm slack
  GLOBALS.ropeSegmentNum = 70;
  GLOBALS.freeFall = 2 * (GLOBALS.startHeight - GLOBALS.lastDrawHeight);
  GLOBALS.fallFactor = GLOBALS.freeFall / GLOBALS.ropeLength;
  GLOBALS.anchor = new Body(0, 0, 0, 0);
  GLOBALS.deflectionPoint = new Body(0.005, GLOBALS.lastDrawHeight, 0, 0);
  GLOBALS.anchorDPointLen = GLOBALS.deflectionPoint.pos.minus(GLOBALS.anchor.pos).norm();
  GLOBALS.dPointClimLen = GLOBALS.ropeLength - GLOBALS.anchorDPointLen;
  GLOBALS.climber = new Body(
    0.01 + Math.sqrt(GLOBALS.dPointClimLen * GLOBALS.dPointClimLen - (GLOBALS.startHeight - GLOBALS.lastDrawHeight) * (GLOBALS.startHeight - GLOBALS.lastDrawHeight)),
    GLOBALS.startHeight, 0, 70
  );
  GLOBALS.climber.velocityDamping = 0.95; // TODO: improve
  GLOBALS.climber.velocity = new V(0, 0, 0);
  // GLOBALS.climber.mass = (GLOBALS.ropeLength * 0.062) / (GLOBALS.ropeSegmentNum - 1); // no climber at the end of the rope
  if (GLOBALS.lastDrawHeight == 0)
    GLOBALS.rope = new Rope(GLOBALS.ropeLength, GLOBALS.ropeSegmentNum, GLOBALS.anchor, GLOBALS.climber);
  else
    GLOBALS.rope = new Rope(GLOBALS.ropeLength, GLOBALS.ropeSegmentNum, GLOBALS.anchor, GLOBALS.climber, GLOBALS.deflectionPoint);
  GLOBALS.expectedForce = GLOBALS.climber.mass * GRAVITY_OF_EARTH
    + Math.sqrt(GLOBALS.climber.mass * GRAVITY_OF_EARTH * GLOBALS.climber.mass * GRAVITY_OF_EARTH
                + 2 * GLOBALS.climber.mass * GRAVITY_OF_EARTH * GLOBALS.fallFactor / GLOBALS.rope.elasticityConstant);
  
  const FPS = 40;
  const snapshots = precalculatePositions(8, FPS);
  GLOBALS.startingTime = (new Date()).getTime() / 1000;
  // framePerFrame(snapshots);

  window.requestAnimationFrame(() => playInLoop(snapshots, FPS));

  // GLOBALS.lastTimeStep = (new Date()).getTime() / 1000;
  // window.requestAnimationFrame(mainSimulationLoop);
}

function framePerFrame(snapshots) {
  let cIdx = 0;
  drawRope(snapshots[cIdx]);

  window.addEventListener('click', () => {
    cIdx++;
    cIdx %= snapshots.length;
    drawRope(snapshots[cIdx]);
  });
  window.addEventListener('keydown', () => {
    cIdx++;
    cIdx %= snapshots.length;
    drawRope(snapshots[cIdx]);
  });
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
    const ss_defl = [];
    const ss_forc = [];
    for (let i = 0; i < GLOBALS.rope.bodies.length; i++) {
      ss.push(GLOBALS.rope.bodies[i].pos);
      ss_forc.push(GLOBALS.rope.bodies[i].appliedForces);
      ss_defl.push([]);
      if (i+1 < GLOBALS.rope.bodies.length) {
        for (let k = 0; k < GLOBALS.rope.ropeSegments[i].deflectionPoints.length; k++)
          ss_defl[i].push(GLOBALS.rope.ropeSegments[i].deflectionPoints[k].pos);
      }
    }
    snapshots.push({
      positions: ss, deflectionPoints: ss_defl, cTime: t, timeDelay: 0, maxStretchingForce: GLOBALS.rope.maxStretchingForce,
      expectedForce: GLOBALS.expectedForce, climberGravity: GLOBALS.climber.mass * GRAVITY_OF_EARTH,
      maxSpeed: GLOBALS.rope.maxEndSpeed,
      forces: ss_forc
     });
  };
  GLOBALS.rope.applyGravity(GRAVITY_VEC);
  GLOBALS.rope.applyRopeForces();
  addSnapshot(0);
  const numSteps = targetTime / GLOBALS.maxStep;
  let lastSnapshot = 0;
  for (let i = 1; i <= numSteps; i++) {
    GLOBALS.rope.timeStep(GLOBALS.maxStep);
    GLOBALS.rope.applyGravity(GRAVITY_VEC);
    GLOBALS.rope.applyRopeForces();
    if (i * GLOBALS.maxStep - lastSnapshot >= 1 / FPS) {
      addSnapshot(i * GLOBALS.maxStep);
      lastSnapshot = i * GLOBALS.maxStep;
    }
  }
  return snapshots;
}

function drawRope(infoObj) {
  const { positions, deflectionPoints, forces, cTime, timeDelay, maxStretchingForce, expectedForce, climberGravity, maxSpeed } = infoObj;

  const canvas = document.getElementById('main-canvas');
  if (canvas.width != GLOBALS.canvasWidth || canvas.height !=  GLOBALS.canvasHeight) {
    canvas.width = GLOBALS.canvasWidth;
    canvas.height = GLOBALS.canvasHeight;
    canvas.style.width = `${GLOBALS.canvasWidth}px`;
    canvas.style.height = `${GLOBALS.canvasHeight}px`;
  }
  const XORIG = GLOBALS.canvasWidth / 2;
  const YORIG = GLOBALS.canvasHeight - 50;
  const SCALE = 50;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, GLOBALS.canvasWidth, GLOBALS.canvasHeight);
  ctx.lineJoin = 'round';

  for (let i = 0; i <= 20; i++) {
    ctx.beginPath();
    ctx.moveTo(0, YORIG - 0.5 * i*SCALE - 0.5);
    ctx.lineTo(GLOBALS.canvasWidth, YORIG - 0.5 * i*SCALE - 0.5);
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
    ctx.fillText(`${numToStr(i * 0.5)} m`, 5, YORIG - 0.5 * i*SCALE);
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
  const dPos = GLOBALS.deflectionPoint.pos;
  ctx.arc(XORIG + dPos.x*SCALE, YORIG - dPos.y*SCALE, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'blue';
  ctx.fill();
  ctx.closePath();

  ctx.beginPath();
  const fPos = positions[0];
  ctx.arc(XORIG + fPos.x*SCALE, YORIG - fPos.y*SCALE, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'red';
  ctx.fill();
  ctx.closePath();

  ctx.beginPath();
  const hPos = positions[positions.length - 1];
  ctx.arc(XORIG + hPos.x*SCALE, YORIG - hPos.y*SCALE, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'green';
  ctx.fill();
  ctx.closePath();

  for (let i = 1; i < positions.length - 1; i++) {
    const segPos = positions[i];
    ctx.beginPath();
    ctx.arc(XORIG + segPos.x*SCALE, YORIG - segPos.y*SCALE, 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'gray';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.closePath();
  }

  let started = false;
  for (let i = 0; i < positions.length; i++) {
    const segPos = positions[i];
    if (!started) {
      ctx.beginPath();
      ctx.moveTo(XORIG + segPos.x*SCALE, YORIG - segPos.y*SCALE);
    } else {
      ctx.lineTo(XORIG + segPos.x*SCALE, YORIG - segPos.y*SCALE);
    }
    started = true;
    const deflPos = deflectionPoints[i];
    for (let k = 0; k < deflPos.length; k++)
      ctx.lineTo(XORIG + deflPos[k].x*SCALE, YORIG - deflPos[k].y*SCALE);
    if (deflPos.length > 0) {
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.closePath();
      ctx.beginPath();
      ctx.moveTo(XORIG + deflPos[deflPos.length-1].x*SCALE, YORIG - deflPos[deflPos.length-1].y*SCALE);
    }
  }
  ctx.strokeStyle = 'rgb(60,60,60)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.closePath();
  
  // const FORCE_SCALE = 5;
  // for (let i = 0; i < positions.length; i++) {
  //   const segPos = positions[i];
  //   const force = forces[i];
  //   ctx.beginPath();
  //   ctx.moveTo(XORIG + segPos.x*SCALE, YORIG - segPos.y*SCALE);
  //   ctx.lineTo(XORIG + (segPos.x + force.x*FORCE_SCALE)*SCALE, YORIG - (segPos.y + force.y*FORCE_SCALE)*SCALE);
  //   ctx.strokeStyle = `rgb(${Math.round((i / (positions.length-1))*255)},123,123)`;
  //   ctx.lineWidth = 1;
  //   ctx.stroke();
  //   ctx.closePath();
  // }

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
    maxSpeed: GLOBALS.rope.maxEndSpeed,
    deflectionPoints: GLOBALS.rope.bodies.map(item => []), // TODO!
    forces: GLOBALS.rope.bodies.map(item => item.appliedForces)
   });
  
  GLOBALS.lastTimeStep = cTime;
  window.requestAnimationFrame(mainSimulationLoop);
}
