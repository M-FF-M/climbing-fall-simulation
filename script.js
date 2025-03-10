
const GRAVITY_OF_EARTH = 9.807;
const GRAVITY_VEC = new V(0, -GRAVITY_OF_EARTH, 0);

const GLOBALS = {
  canvasWidth: 900,
  canvasHeight: 700,
  timeDelay: 0,
  cTime: 0,
  slowMotion: 0.5,
  maxStep: 0.0001,
  maxStepNum: 100,
  startingTime: 0,
  forceGraphWidth: 800,
  forceGraphHeight: 300,
  maxy: -Infinity,
  miny: Infinity
};

function main() {
  GLOBALS.startHeight = 6; // height of climber above ground / belay
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
  // GLOBALS.climber.velocityDamping = 0.95; // TODO: improve
  GLOBALS.climber.velocity = new V(0, 0, 0);
  // GLOBALS.climber.mass = (GLOBALS.ropeLength * 0.062) / (GLOBALS.ropeSegmentNum - 1); // no climber at the end of the rope
  if (GLOBALS.lastDrawHeight == 0)
    GLOBALS.rope = new Rope(GLOBALS.ropeLength, GLOBALS.ropeSegmentNum, GLOBALS.anchor, GLOBALS.climber);
  else
    GLOBALS.rope = new Rope(GLOBALS.ropeLength, GLOBALS.ropeSegmentNum, GLOBALS.anchor, GLOBALS.climber, GLOBALS.deflectionPoint);
  GLOBALS.expectedForce = GLOBALS.climber.mass * GRAVITY_OF_EARTH
    + Math.sqrt(GLOBALS.climber.mass * GRAVITY_OF_EARTH * GLOBALS.climber.mass * GRAVITY_OF_EARTH
                + 2 * GLOBALS.climber.mass * GRAVITY_OF_EARTH * GLOBALS.fallFactor / GLOBALS.rope.elasticityConstant);
  
  GLOBALS.wallAngle = 10; // overhanging degrees
  addWorldBarrier(new V(Math.cos(Math.PI * GLOBALS.wallAngle / 180), -Math.sin(Math.PI * GLOBALS.wallAngle / 180), 0), GLOBALS.deflectionPoint.pos.minus(new V(0.3, 0, 0)), 'wall');
  addWorldBarrier(new V(0, 1, 0), GLOBALS.anchor.pos, 'floor');

  const FPS = 50;
  const snapshots = precalculatePositions(8, FPS);
  GLOBALS.startingTime = (new Date()).getTime() / 1000;
  // framePerFrame(snapshots);

  window.requestAnimationFrame(() => playInLoop(snapshots, FPS));
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
  const cTime = GLOBALS.slowMotion * ((new Date()).getTime() / 1000 - GLOBALS.startingTime);

  drawRope(snapshots[Math.round(cTime * FPS) % snapshots.length], snapshots);
  
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
    GLOBALS.maxy = Math.max(GLOBALS.maxy, GLOBALS.climber.pos.y);
    GLOBALS.miny = Math.min(GLOBALS.miny, GLOBALS.climber.pos.y);
    snapshots.push({
      positions: ss, deflectionPoints: ss_defl, cTime: t, timeDelay: 0, maxStretchingForce: GLOBALS.rope.maxStretchingForce,
      expectedForce: GLOBALS.expectedForce, climberGravity: GLOBALS.climber.mass * GRAVITY_OF_EARTH,
      maxSpeed: GLOBALS.rope.maxEndSpeed, maxStretchingFClimber: GLOBALS.rope.maxClimberForce,
      maxStretchingFBelayer: GLOBALS.rope.maxBelayerForce, forces: ss_forc,
      maxClimberForce: GLOBALS.climber.maxForce,
      maxBelayerForce: GLOBALS.anchor.maxForce,
      currentStretchingForce: GLOBALS.rope.currentStretchingForce,
      currentClimberForce: GLOBALS.climber.currentAveragedForce,
      currentBelayerForce: GLOBALS.anchor.currentAveragedForce,
      climberY: GLOBALS.climber.pos.y,
      belayerY: GLOBALS.anchor.pos.y,
      topDrawY: GLOBALS.deflectionPoint.pos.y
     });
  };
  GLOBALS.rope.applyGravity(GRAVITY_VEC);
  GLOBALS.rope.applyRopeForces();
  addSnapshot(0);
  const numSteps = targetTime / GLOBALS.maxStep;
  let lastSnapshot = 0;
  for (let i = 1; i <= numSteps; i++) {
    GLOBALS.rope.timeStep(GLOBALS.maxStep);
    ensureBarrierConstraints();
    GLOBALS.rope.applyGravity(GRAVITY_VEC);
    GLOBALS.rope.applyRopeForces();
    if (i * GLOBALS.maxStep - lastSnapshot >= 1 / FPS) {
      addSnapshot(i * GLOBALS.maxStep);
      lastSnapshot = i * GLOBALS.maxStep;
    }
  }
  return snapshots;
}

function drawRope(infoObj, snapshots) {
  const {
    positions, deflectionPoints, forces, cTime, timeDelay, maxStretchingForce, expectedForce, climberGravity, maxSpeed,
    maxStretchingFClimber, maxStretchingFBelayer, maxClimberForce, maxBelayerForce
  } = infoObj;

  const lastSnapshot = snapshots[snapshots.length - 1];
  const maxTime = lastSnapshot.cTime;
  const maxForce = Math.max(lastSnapshot.maxStretchingForce, lastSnapshot.maxClimberForce, lastSnapshot.maxBelayerForce);

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.getElementById('main-canvas');
  const forceGraphCanvas = document.getElementById('force-canvas');
  if (canvas.width != GLOBALS.canvasWidth || canvas.height !=  GLOBALS.canvasHeight) {
    canvas.width = GLOBALS.canvasWidth;
    canvas.height = GLOBALS.canvasHeight;
    canvas.style.width = `${GLOBALS.canvasWidth / dpr}px`;
    canvas.style.height = `${GLOBALS.canvasHeight / dpr}px`;
  }
  if (forceGraphCanvas.width != GLOBALS.forceGraphWidth || forceGraphCanvas.height !=  GLOBALS.forceGraphHeight) {
    forceGraphCanvas.width = GLOBALS.forceGraphWidth;
    forceGraphCanvas.height = GLOBALS.forceGraphHeight;
    forceGraphCanvas.style.width = `${GLOBALS.forceGraphWidth / dpr}px`;
    forceGraphCanvas.style.height = `${GLOBALS.forceGraphHeight / dpr}px`;
    forceGraphCanvas.style.position = 'absolute';
    forceGraphCanvas.style.right = '0px';
    forceGraphCanvas.style.bottom = '0px';
  }

  const gctx = forceGraphCanvas.getContext('2d');
  gctx.clearRect(0, 0, GLOBALS.forceGraphWidth, GLOBALS.forceGraphHeight);

  const forcesToPlot = ['climberGravity', 'currentStretchingForce', 'currentClimberForce', 'currentBelayerForce', 'topDrawY', 'climberY', 'belayerY'];
  const forceColors = ['green', 'black', 'green', 'red', 'blue', 'green', 'red'];
  const forceStrokeStyle = ['dotted', 'solid', 'solid', 'solid', 'dashed', 'dashed', 'dashed'];
  const minmax = [[0, maxForce], [0, maxForce], [0, maxForce], [0, maxForce], [Math.min(0, GLOBALS.miny), GLOBALS.maxy], [Math.min(0, GLOBALS.miny), GLOBALS.maxy], [Math.min(0, GLOBALS.miny), GLOBALS.maxy]];
  for (let i = 0; i < forcesToPlot.length; i++) {
    gctx.beginPath();
    for (let x = 0; x <= GLOBALS.forceGraphWidth; x++) {
      let yval = 0;
      if (snapshots.length > GLOBALS.forceGraphWidth) {
        const sIdx = Math.round((x / GLOBALS.forceGraphWidth) * (snapshots.length - 1));
        yval = (1 - (snapshots[sIdx][forcesToPlot[i]] - minmax[i][0]) / (minmax[i][1] - minmax[i][0])) * GLOBALS.forceGraphHeight;
      } else {
        const sIdx = Math.floor((x / GLOBALS.forceGraphWidth) * (snapshots.length - 1));
        const frac = (x / GLOBALS.forceGraphWidth) * (snapshots.length - 1) - sIdx;
        if (sIdx == snapshots.length - 1) yval = (1 - (snapshots[sIdx][forcesToPlot[i]] - minmax[i][0]) / (minmax[i][1] - minmax[i][0])) * GLOBALS.forceGraphHeight;
        else {
          yval = (1 - frac) * (1 - (snapshots[sIdx][forcesToPlot[i]] - minmax[i][0]) / (minmax[i][1] - minmax[i][0])) * GLOBALS.forceGraphHeight
            + frac * (1 - (snapshots[sIdx+1][forcesToPlot[i]] - minmax[i][0]) / (minmax[i][1] - minmax[i][0])) * GLOBALS.forceGraphHeight;
        }
      }
      if (x == 0) gctx.moveTo(x, yval);
      else gctx.lineTo(x, yval);
    }
    if (forceStrokeStyle[i] == 'dashed')
      gctx.setLineDash([10, 5]);
    else if (forceStrokeStyle[i] == 'dotted')
      gctx.setLineDash([1, 2]);
    else
      gctx.setLineDash([]);
    gctx.strokeStyle = forceColors[i];
    gctx.lineWidth = 1;
    gctx.stroke();
    gctx.closePath();
  }
  gctx.setLineDash([]);
  
  gctx.beginPath();
  gctx.moveTo(cTime / maxTime * GLOBALS.forceGraphWidth, 0);
  gctx.lineTo(cTime / maxTime * GLOBALS.forceGraphWidth, GLOBALS.forceGraphHeight);
  gctx.strokeStyle = 'black';
  gctx.lineWidth = 1;
  gctx.stroke();
  gctx.closePath();

  const XORIG = GLOBALS.canvasWidth / 2;
  const YORIG = GLOBALS.canvasHeight - 50;
  const SCALE = 50;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, GLOBALS.canvasWidth, GLOBALS.canvasHeight);
  ctx.lineJoin = 'round';
  for (const barrier of PHYSICS_WORLD.barriers) {
    if (Math.abs(barrier.normal.dot(new V(0, 1, 0))) == 1) {
      const ycoord = barrier.shift * barrier.normal.dot(new V(0, 1, 0));
      ctx.beginPath();
      ctx.moveTo(0, YORIG - ycoord*SCALE);
      ctx.lineTo(GLOBALS.canvasWidth, YORIG - ycoord*SCALE);
      ctx.strokeStyle = 'brown';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.closePath();
    } else if (barrier.normal.dot(new V(0, 1, 0)) == 0) {
      const xcoord = barrier.shift * barrier.normal.dot(new V(1, 0, 0));
      ctx.beginPath();
      ctx.moveTo(XORIG + xcoord*SCALE, 0);
      ctx.lineTo(XORIG + xcoord*SCALE, GLOBALS.canvasHeight);
      ctx.strokeStyle = 'brown';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.closePath();
    } else {
      const normalLR = new V(1, 0, 0);
      const leftShift = -XORIG / SCALE;
      const rightShift = (GLOBALS.canvasWidth - XORIG) / SCALE;
      const normalTB = new V(0, 1, 0);
      const topShift = YORIG / SCALE;
      const bottomShift = -(GLOBALS.canvasHeight - YORIG) / SCALE;
      const bndCoords = [];
      for (const [shift, normal, coord, otherCoord] of [
            [leftShift, normalLR, 'y', 0], [rightShift, normalLR, 'y', GLOBALS.canvasWidth], [topShift, normalTB, 'x', 0], [bottomShift, normalTB, 'x', GLOBALS.canvasHeight]
          ]) {
        const [lineDir, pointOnLine] = calculatePlaneIntersection(barrier.normal, barrier.shift, normal, shift);
        const coordVal = ((coord == 'x') ? pointOnLine.x : pointOnLine.y) * SCALE;
        const graphCoord = (coord == 'x') ? XORIG + coordVal : YORIG - coordVal;
        if (coord == 'x' && graphCoord >= 0 && graphCoord <= GLOBALS.canvasWidth) {
          bndCoords.push([graphCoord, otherCoord]);
        } else if (coord == 'y' && graphCoord >= 0 && graphCoord <= GLOBALS.canvasHeight) {
          bndCoords.push([graphCoord, otherCoord]);
        }
      }
      if (bndCoords.length > 1) {
        ctx.beginPath();
        ctx.moveTo(bndCoords[0][0], bndCoords[0][1]);
        for (let i = 1; i < bndCoords.length; i++)
          ctx.lineTo(bndCoords[i][0], bndCoords[i][1]);
        ctx.strokeStyle = 'brown';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();
      }
    }
  }

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
  ctx.fillText(`max. rope force, climber's end: ${numToStr(maxStretchingFClimber, 2, 11)} N`, GLOBALS.canvasWidth - 5, GLOBALS.canvasHeight / 2 + 120);
  ctx.fillText(`max. rope force, belayer's end: ${numToStr(maxStretchingFBelayer, 2, 11)} N`, GLOBALS.canvasWidth - 5, GLOBALS.canvasHeight / 2 + 140);
  ctx.fillText(`max. force on climber: ${numToStr(maxClimberForce, 2, 11)} N`, GLOBALS.canvasWidth - 5, GLOBALS.canvasHeight / 2 + 160);
  ctx.fillText(`max. force on belayer: ${numToStr(maxBelayerForce, 2, 11)} N`, GLOBALS.canvasWidth - 5, GLOBALS.canvasHeight / 2 + 180);

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
