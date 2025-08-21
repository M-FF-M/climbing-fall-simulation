
function main() {
  document.body.style.fontFamily = 'Arial';

  GLOBALS.startHeight = 6; // height of climber above ground / belay
  GLOBALS.lastDrawHeight = 5; // height of last draw above ground / belay (set to 0 for no deflection point)
  GLOBALS.anchorHeight = 0;
  GLOBALS.ropeLength = GLOBALS.startHeight - GLOBALS.anchorHeight + 0.1; // 10 cm slack
  GLOBALS.ropeSegmentNum = 70;
  const dy = GLOBALS.startHeight - (GLOBALS.lastDrawHeight == 0 ? GLOBALS.anchorHeight : GLOBALS.lastDrawHeight);
  GLOBALS.freeFall = 2 * dy;
  GLOBALS.fallFactor = GLOBALS.freeFall / GLOBALS.ropeLength;
  GLOBALS.anchorMass = 70;
  GLOBALS.anchor = new Body(0, GLOBALS.anchorHeight, -0.2, GLOBALS.anchorMass, 'belayer');
  GLOBALS.deflectionPoint = new Body(0.005, GLOBALS.lastDrawHeight, 0.1, 0, 'quickdraw');
  // GLOBALS.deflectionPoint.frictionCoefficient = 0;
  GLOBALS.anchorDPointLen = GLOBALS.lastDrawHeight == 0 ? 0 : GLOBALS.deflectionPoint.pos.minus(GLOBALS.anchor.pos).norm();
  GLOBALS.dPointClimLen = GLOBALS.ropeLength - GLOBALS.anchorDPointLen;
  GLOBALS.climberMass = 70;
  GLOBALS.climber = new Body(
    0.01 + Math.sqrt(GLOBALS.dPointClimLen * GLOBALS.dPointClimLen - dy * dy),
    GLOBALS.startHeight, 0.2, GLOBALS.climberMass, 'climber'
  );
  // GLOBALS.climber.velocityDamping = 0.95; // TODO: improve
  // GLOBALS.anchor.velocityDamping = 0.95; // TODO: improve
  GLOBALS.climber.velocity = new V(0, 0, 0);
  // GLOBALS.climber.mass = (GLOBALS.ropeLength * 0.062) / (GLOBALS.ropeSegmentNum - 1); GLOBALS.climberMass = GLOBALS.climber.mass; // no climber at the end of the rope
  if (GLOBALS.lastDrawHeight == 0)
    GLOBALS.rope = new Rope(GLOBALS.ropeLength, GLOBALS.ropeSegmentNum, GLOBALS.anchor, GLOBALS.climber);
  else
    GLOBALS.rope = new Rope(GLOBALS.ropeLength, GLOBALS.ropeSegmentNum, GLOBALS.anchor, GLOBALS.climber, GLOBALS.deflectionPoint);
  GLOBALS.rope.drawingColor = new Color(241, 160, 45);
  GLOBALS.deflectionPoint.drawingColor = new Color(52, 90, 93);
  GLOBALS.climber.drawingColor = new Color(151, 95, 96);
  GLOBALS.anchor.drawingColor = new Color(77, 136, 78);
  GLOBALS.expectedForce = GLOBALS.climber.mass * GRAVITY_OF_EARTH
    + Math.sqrt(GLOBALS.climber.mass * GRAVITY_OF_EARTH * GLOBALS.climber.mass * GRAVITY_OF_EARTH
                + 2 * GLOBALS.climber.mass * GRAVITY_OF_EARTH * GLOBALS.fallFactor / GLOBALS.rope.elasticityConstant);
  
  GLOBALS.wallAngle = 10; // overhanging degrees
  addWorldBarrier(new V(Math.cos(Math.PI * GLOBALS.wallAngle / 180), -Math.sin(Math.PI * GLOBALS.wallAngle / 180), 0), GLOBALS.deflectionPoint.pos.minus(new V(0.3, 0, 0)), 'wall');
  addWorldBarrier(new V(0, 1, 0), new V(0, 0, 0), 'floor');

  const FPS = 40;
  GLOBALS.bodies = [
    GLOBALS.rope,
    GLOBALS.deflectionPoint,
    GLOBALS.anchor,
    GLOBALS.climber
  ];
  const layoutManager = new FallSimulationLayout();
  layoutManager.precalculatePositions(4, FPS);
  // window.setTimeout(() => precalculatePositions(4, FPS), 10);
}
