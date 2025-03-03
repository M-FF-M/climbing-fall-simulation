
const AMMO_PHYSICS = {};
const GLOBALS = {
  canvasWidth: 600,
  canvasHeight: 800,
  timeStep: 1/60,
  maxSubSteps: 1,
  lastTimeStep: 0
};
const GRAVITY_OF_EARTH = 9.807;

function getBodyPosition(body) {
  const transform = new AMMO_PHYSICS.Ammo.btTransform();
  body.getMotionState().getWorldTransform(transform);
  const origin = transform.getOrigin();
  return {
    x: origin.x(),
    y: origin.y(),
    z: origin.z()
  };
}

function setBodyPosition(body, x, y, z) {
  // Create a new transform object.
  const transform = new AMMO_PHYSICS.Ammo.btTransform();
  // Get the current world transform of the body.
  body.getMotionState().getWorldTransform(transform);
  // Update the origin to the new position.
  transform.setOrigin(new AMMO_PHYSICS.Ammo.btVector3(x, y, z));
  // Set the new world transform to the body.
  body.setWorldTransform(transform);
  // Also update the motion state with the new transform.
  body.getMotionState().setWorldTransform(transform);
}

function applySpringForce(bodyA, bodyB, restLength, stiffness, damping) {
  const posA = getBodyPosition(bodyA);
  const posB = getBodyPosition(bodyB);
  
  const dx = posB.x - posA.x;
  const dy = posB.y - posA.y;
  const dz = posB.z - posA.z;
  
  const currentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const extension = currentLength - restLength;
  
  // Normalize the direction vector
  const nx = dx / currentLength;
  const ny = dy / currentLength;
  const nz = dz / currentLength;
  
  if (extension < 0)
    stiffness = 0;
  // Compute spring force magnitude
  const forceMag = Math.min(stiffness * extension, 2);
  
  // Optionally, compute relative velocity and add damping here
  
  // Create the force vector
  const fx = forceMag * nx;
  const fy = forceMag * ny;
  const fz = forceMag * nz;
  
  // Apply forces in opposite directions to both bodies
  bodyA.applyCentralForce(new AMMO_PHYSICS.Ammo.btVector3(fx, fy, fz));
  bodyB.applyCentralForce(new AMMO_PHYSICS.Ammo.btVector3(-fx, -fy, -fz));
}

function initializeAmmoAndRun(fct) {
  Ammo().then((Ammo) => {
    AMMO_PHYSICS.Ammo = Ammo;
    AMMO_PHYSICS.collisionConfiguration = new Ammo.btSoftBodyRigidBodyCollisionConfiguration();
		AMMO_PHYSICS.dispatcher = new Ammo.btCollisionDispatcher( AMMO_PHYSICS.collisionConfiguration );
		AMMO_PHYSICS.broadphase = new Ammo.btDbvtBroadphase();
		AMMO_PHYSICS.solver = new Ammo.btSequentialImpulseConstraintSolver();
		AMMO_PHYSICS.softBodySolver = new Ammo.btDefaultSoftBodySolver();
		AMMO_PHYSICS.physicsWorld = new Ammo.btSoftRigidDynamicsWorld( AMMO_PHYSICS.dispatcher,
      AMMO_PHYSICS.broadphase, AMMO_PHYSICS.solver, AMMO_PHYSICS.collisionConfiguration,
      AMMO_PHYSICS.softBodySolver );
		AMMO_PHYSICS.physicsWorld.setGravity( new Ammo.btVector3( 0, -GRAVITY_OF_EARTH, 0 ) );
		AMMO_PHYSICS.physicsWorld.getWorldInfo().set_m_gravity( new Ammo.btVector3( 0, -GRAVITY_OF_EARTH, 0 ) );
    fct(AMMO_PHYSICS.Ammo, AMMO_PHYSICS.physicsWorld);
  });
}

function main() {
  initializeAmmoAndRun(setupRope);
}

function setupRope(Ammo, physicsWorld) {
  // Parameters
  const numSegments = 10;
  const ropeLength = 20;
  const segmentLength = ropeLength / numSegments;
  const segmentRadius = segmentLength * 0.25;
  const segmentMass = 0.01 / numSegments;
  const massMass = 4; // mass at the rope's end
  GLOBALS.segmentLength = segmentLength;

  // Arrays to store rope segments
  const ropeSegments = [];

  // 1. Create rope segments as small spheres
  for (let i = 0; i < numSegments; i++) {
    const shape = new Ammo.btSphereShape(segmentRadius);
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    // Position segments vertically (hanging down)
    transform.setOrigin(new Ammo.btVector3(-i * segmentLength, 0, 0));
    
    const motionState = new Ammo.btDefaultMotionState(transform);
    const localInertia = new Ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(segmentMass, localInertia);
    
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(segmentMass, motionState, shape, localInertia);
    const body = new Ammo.btRigidBody(rbInfo);
    physicsWorld.addRigidBody(body);
    ropeSegments.push(body);
  }

  // // 2. Connect each segment with a point-to-point constraint
  // for (let i = 1; i < numSegments; i++) {
  //   const bodyA = ropeSegments[i - 1];
  //   const bodyB = ropeSegments[i];

  //   // Create frames in the local coordinate systems of bodyA and bodyB
  //   const frameInA = new Ammo.btTransform();
  //   frameInA.setIdentity();
  //   frameInA.setOrigin(new Ammo.btVector3(-segmentLength/2, 0, 0));  // pivot on one end

  //   const frameInB = new Ammo.btTransform();
  //   frameInB.setIdentity();
  //   frameInB.setOrigin(new Ammo.btVector3(segmentLength/2, 0, 0)); // pivot on the other end

  //   // Create the spring constraint
  //   const springConstraint = new Ammo.btGeneric6DofSpringConstraint(bodyA, bodyB, frameInA, frameInB, true);

  //   // For the axis along the rope (axis 0 in this case), enable the spring
  //   springConstraint.enableSpring(1, true);

  //   // Set the lower and upper limits (allowing stretch)
  //   // Here we set limits such that the rest length is segmentLength, but it can extend a bit.
  //   springConstraint.setLinearLowerLimit(new Ammo.btVector3(-segmentLength * 0.5, 0, 0));
  //   springConstraint.setLinearUpperLimit(new Ammo.btVector3(segmentLength * 3, 0, 0));

  //   // Configure the spring properties: stiffness and damping
  //   const stiffness = numSegments * 10000000; // Adjust for how rigid or stretchy you want it to be
  //   const damping = numSegments * 100000000;  // Adjust for energy loss during stretching
  //   springConstraint.setStiffness(0, stiffness);
  //   springConstraint.setDamping(0, damping);

  //   // Add the constraint to the physics world
  //   physicsWorld.addConstraint(springConstraint, true);

  //   // // Pivots relative to each body's local frame
  //   // const pivotA = new Ammo.btVector3(0, -segmentLength / 2, 0);
  //   // const pivotB = new Ammo.btVector3(0, segmentLength / 2, 0);
    
  //   // const constraint = new Ammo.btPoint2PointConstraint(bodyA, bodyB, pivotA, pivotB);
  //   // physicsWorld.addConstraint(constraint, true);
  // }

  // 3. Attach the top segment to a fixed point
  // Create a static rigid body at the fixed point (mass = 0)
  const fixedShape = new Ammo.btSphereShape(0.01);
  const fixedTransform = new Ammo.btTransform();
  fixedTransform.setIdentity();
  fixedTransform.setOrigin(new Ammo.btVector3(0, 0, 0)); // fixed point at origin
  const fixedMotionState = new Ammo.btDefaultMotionState(fixedTransform);
  const fixedInertia = new Ammo.btVector3(0, 0, 0);
  const fixedRbInfo = new Ammo.btRigidBodyConstructionInfo(0, fixedMotionState, fixedShape, fixedInertia);
  const fixedBody = new Ammo.btRigidBody(fixedRbInfo);
  physicsWorld.addRigidBody(fixedBody);
  GLOBALS.fixPoint = fixedBody;

  // // Attach the top rope segment to the fixed body
  // const topSegment = ropeSegments[0];
  // const pivotRope = new Ammo.btVector3(segmentLength / 2, 0, 0);
  // const pivotFixed = new Ammo.btVector3(0, 0, 0);
  // const topConstraint = new Ammo.btPoint2PointConstraint(topSegment, fixedBody, pivotRope, pivotFixed);
  // topConstraint.setParam(Ammo.CONSTRAINT_ERP, 0.99, 0);
  // topConstraint.setParam(Ammo.CONSTRAINT_CFM, 0.0, 0);
  // physicsWorld.addConstraint(topConstraint, true);

  // 4. Attach a point mass at the free end of the rope
  const massShape = new Ammo.btSphereShape(0.1);
  const massTransform = new Ammo.btTransform();
  massTransform.setIdentity();
  // Position the mass at the expected free end location
  massTransform.setOrigin(new Ammo.btVector3(-numSegments * segmentLength, 0, 0));
  const massMotionState = new Ammo.btDefaultMotionState(massTransform);
  const massInertia = new Ammo.btVector3(0, 0, 0);
  massShape.calculateLocalInertia(massMass, massInertia);
  const massRbInfo = new Ammo.btRigidBodyConstructionInfo(massMass, massMotionState, massShape, massInertia);
  const massBody = new Ammo.btRigidBody(massRbInfo);
  physicsWorld.addRigidBody(massBody);
  GLOBALS.hangingBody = massBody;

  // // Connect the last rope segment to the mass
  // const bottomSegment = ropeSegments[ropeSegments.length - 1];
  // const pivotBottom = new Ammo.btVector3(-segmentLength / 2, 0, 0);
  // const pivotMass = new Ammo.btVector3(0.1, 0, 0);
  // const bottomConstraint = new Ammo.btPoint2PointConstraint(bottomSegment, massBody, pivotBottom, pivotMass);
  // physicsWorld.addConstraint(bottomConstraint, true);

  GLOBALS.ropeSegments = ropeSegments;

  GLOBALS.lastTimeStep = (new Date()).getTime() / 1000;
  window.requestAnimationFrame(mainSimulationLoop);
}

function mainSimulationLoop() {
  const cTime = (new Date()).getTime() / 1000;
  const delta_t = cTime - GLOBALS.lastTimeStep;
  setBodyPosition(GLOBALS.ropeSegments[0], 0, 0, 0);
  for (let i = 1; i < GLOBALS.ropeSegments.length; i++) {
    applySpringForce(GLOBALS.ropeSegments[i-1], GLOBALS.ropeSegments[i], GLOBALS.segmentLength, 0.1 / GLOBALS.ropeSegments.length, 0);
  }
  AMMO_PHYSICS.physicsWorld.stepSimulation(delta_t, GLOBALS.maxSubSteps, GLOBALS.timeStep);
  setBodyPosition(GLOBALS.ropeSegments[0], 0, 0, 0);

  const canvas = document.getElementById('main-canvas');
  canvas.width = GLOBALS.canvasWidth;
  canvas.height = GLOBALS.canvasHeight;
  canvas.style.width = `${GLOBALS.canvasWidth}px`;
  canvas.style.height = `${GLOBALS.canvasHeight}px`;
  const XORIG = GLOBALS.canvasWidth / 2;
  const YORIG = 20;
  const SCALE = 5;

  const ctx = canvas.getContext('2d');

  ctx.beginPath();
  const fPos = getBodyPosition(GLOBALS.fixPoint);
  ctx.arc(XORIG + fPos.x*SCALE, YORIG - fPos.y*SCALE, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'red';
  ctx.fill();
  ctx.closePath();

  ctx.beginPath();
  const hPos = getBodyPosition(GLOBALS.hangingBody);
  ctx.arc(XORIG + hPos.x*SCALE, YORIG - hPos.y*SCALE, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'green';
  ctx.fill();
  ctx.closePath();

  ctx.beginPath();
  const topPos = getBodyPosition(GLOBALS.ropeSegments[0]);
  ctx.moveTo(XORIG + topPos.x*SCALE, YORIG - topPos.y*SCALE);
  for (let i = 1; i < GLOBALS.ropeSegments.length; i++) {
    const segPos = getBodyPosition(GLOBALS.ropeSegments[i]);
    ctx.lineTo(XORIG + segPos.x*SCALE, YORIG - segPos.y*SCALE);
  }
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.closePath();
  
  GLOBALS.lastTimeStep = cTime;
  window.requestAnimationFrame(mainSimulationLoop);
}
