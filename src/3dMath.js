import { mat4, vec3, vec4 } from 'wgpu-matrix';

export function extractFrustumPlanes(m) {
  const planes = [];

  function makePlane(a, b, c, d) {
    // normalize
    const len = Math.hypot(a, b, c);
    return {
      normal: [a / len, b / len, c / len],
      d: d / len
    };
  }

  // column-major indexing
  const m0 = m;

  // Left
  planes.push(makePlane(
    m0[3] + m0[0],
    m0[7] + m0[4],
    m0[11] + m0[8],
    m0[15] + m0[12]
  ));

  // Right
  planes.push(makePlane(
    m0[3] - m0[0],
    m0[7] - m0[4],
    m0[11] - m0[8],
    m0[15] - m0[12]
  ));

  // Bottom
  planes.push(makePlane(
    m0[3] + m0[1],
    m0[7] + m0[5],
    m0[11] + m0[9],
    m0[15] + m0[13]
  ));

  // Top
  planes.push(makePlane(
    m0[3] - m0[1],
    m0[7] - m0[5],
    m0[11] - m0[9],
    m0[15] - m0[13]
  ));

  // Near
  planes.push(makePlane(
    m0[3] + m0[2],
    m0[7] + m0[6],
    m0[11] + m0[10],
    m0[15] + m0[14]
  ));

  // Far
  planes.push(makePlane(
    m0[3] - m0[2],
    m0[7] - m0[6],
    m0[11] - m0[10],
    m0[15] - m0[14]
  ));

  return planes;
}

export function createFPSCamera(canvas,near = 1.0, maxDis = 40, userControlled = false, speed = 5, sensitivity = 0.002) {

  const position = vec3.create(0, 1.5, -30);
  let yaw = 0;
  let pitch = 0;

  const keys = {};
  const view = mat4.identity();
  const viewPrev = mat4.identity();
  let projection = mat4.perspective(Math.PI / 4,
    canvas.width / canvas.height,
    near,
    maxDis)

  // pointer lock
  canvas.addEventListener("click", () => {
    canvas.requestPointerLock();
  });

  // keyboard
  window.addEventListener("keydown", e => keys[e.code] = true);
  window.addEventListener("keyup", e => keys[e.code] = false);


 
  // mouse movement
  window.addEventListener("mousemove", e => {
    if (document.pointerLockElement !== canvas) return;

    if(userControlled){

    yaw -= e.movementX * sensitivity;
    pitch -= e.movementY * sensitivity;

    const limit = Math.PI / 2 - 0.01;
    pitch = Math.max(-limit, Math.min(limit, pitch));
    }
  });


  const camera = {
    view,
    projection,
    position,
    update: function(dt,setMat = false) {
      // forward vector
      const forward = [
        Math.cos(pitch) * Math.sin(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.cos(yaw),
      ];

      const right = [
        Math.sin(yaw - Math.PI / 2),
        0,
        Math.cos(yaw - Math.PI / 2),
      ];

      const move = speed * dt;
      
      if(userControlled){

      if (keys["KeyW"]) vec3.addScaled(position, forward, move, position);
      if (keys["KeyS"]) vec3.addScaled(position, forward, -move, position);
      if (keys["KeyA"]) vec3.addScaled(position, right, -move, position);
      if (keys["KeyD"]) vec3.addScaled(position, right, move, position);
      }

      const target = vec3.add(position, forward)
      

      mat4.clone(view, viewPrev);

      mat4.lookAt(
        position,
        target,
        [0, 1, 0],
        view
      );

      if(setMat){

        mat4.clone(setMat,view);

      }
      //alert(view)

      return { view, projection: this.projection, viewPrev };
    }
  };
  
  return camera;
}