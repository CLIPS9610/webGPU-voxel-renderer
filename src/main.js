import { mat4, vec3} from 'wgpu-matrix';

import { extractFrustumPlanes, createFPSCamera } from './3dMath.js'

import {createWebgpuResources } from './webgpuResources.js';

import { createPipeline, initWebgpu, createModule } from './initateWebgpu.js';

import { setInstance, generateVoxelData, addVoxel } from './generateVoxelData.js';

import { render,shadowMapRender,lightMapRender } from './renderFrame.js';

import { resize } from './eventListeners.js';

const originalLog = console.log;
const originalError = console.error;

function appendToPage(type, args) {
  const container = document.getElementById("console-output");

  const message = document.createElement("div");
  message.textContent = `[${type}] ` + args.map(a => 
    typeof a === "object" ? JSON.stringify(a) : a
  ).join(" ");

  message.style.color = type === "error" ? "red" : "black";

  container.appendChild(message);
}

window.addEventListener("error", function (event) {
  appendToPage("error", [event.message]);
});

window.addEventListener("unhandledrejection", function (event) {
  appendToPage("error", [event.reason]);
});
// Override console.log
console.log = function (...args) {
  appendToPage("log", args);
  originalLog.apply(console, args);
};

// Override console.error
console.error = function (...args) {
  appendToPage("error", args);
  originalError.apply(console, args);
};


async function main() {

  const webgpuInfo = await initWebgpu();
  //console.log(webgpuInfo.presentationFormat)
  
  const mipCount = 11
  const SIZE = 32

  const voxelInfo = generateVoxelData(webgpuInfo.device, SIZE)
  let totalVoxels = voxelInfo.voxelCount;
  

  const renderModule = await createModule(webgpuInfo.device);
  const pipelineFormat = await createPipeline(webgpuInfo, renderModule.module)
  const resources = createWebgpuResources(renderModule, webgpuInfo, voxelInfo.voxelCount, pipelineFormat, voxelInfo.storageBuffer, voxelInfo.voxels);
  //alert()
  const camera = createFPSCamera(webgpuInfo.context.canvas,0.1,500,true);
  const lightSourceCamera = createFPSCamera(webgpuInfo.context.canvas,1.0,50,true);

  window.addEventListener("resize", () => {

  resize(resources, webgpuInfo, pipelineFormat, camera, voxelInfo.storageBuffer,mipCount)

  })

  webgpuInfo.device.queue.writeBuffer(voxelInfo.storageBuffer, 0, voxelInfo.storageValues);
  webgpuInfo.device.queue.writeBuffer(resources.storageData.storageBuffer, 0, voxelInfo.storageValues);
  webgpuInfo.device.queue.writeBuffer(resources.indirectBuffer.storageBuffer, 0, new Uint32Array([(voxelInfo.voxelCount + 1) * 6, 1, 0, 0]));

  let t = 0
  let keyP = true
  document.addEventListener("keydown", e => {
    //console.log("pressed")

    if (e.repeat) return
    if (e.key == "p")
      {keyP = !keyP;

        if(keyP){

     // console.log("culling pipeline disabled, rendering static mesh")

    }else{

      //console.log("culling pipeline re-enabled")

    }

      }


    
    
  })

  document.addEventListener("click", e => {

    addVoxel(webgpuInfo, voxelInfo, camera, resources, SIZE,totalVoxels)
    let cell = [Math.floor(camera.position[0]),Math.floor(camera.position[1]),Math.floor(camera.position[2])]
    //alert(cell)
    
    if(cell[0]>=0 && cell[0] < 32 && cell[1]>=0 && cell[1] < 32 && cell[2]>=0 && cell[2] < 32){
      //alert("filled")
    resources.cellBuffer[cell[0] + cell[1] * 32 + cell[2] * 32 * 32] = 255
    webgpuInfo.device.queue.writeTexture(
  { texture: resources.cellTexture },
  resources.cellBuffer, // Your typed array containing the 3D data
  {
    bytesPerRow: 32,
    rowsPerImage: 32,
  },
  {width:32, height:32, depthOrArrayLayers: 32}
);
    }

    
    totalVoxels = voxelInfo.voxelCount
    lightMapRender(webgpuInfo,pipelineFormat,resources,totalVoxels)
//shadowMapRender(webgpuInfo,pipelineFormat,resources,totalVoxels)
    
  })


//lightSourceCamera.position = [0, 200, 0]
//lightSourceCamera.update(0)
const lightView = mat4.identity()
let a = 1
let b = 0
let t1 = 0
  function loop() {
      t1 +=0.005
    
    //alert(lightView)
    a = Math.cos(t1)*30 + 16
    b = Math.sin(t1)*30 + 16


    mat4.lookAt([20+16,20.0,0+16],[16,1,16],[0,1, 0],lightView)
    //alert(lightView)

    const lightInfo = lightSourceCamera.update(0.03,lightView);
  
      //alert(lightInfo.lightView)
      //resources.uniformValues.set(lightView, 0)
      //resources.uniformValues.set(lightInfo.projection, 16)
      
      //resources.uniformValues.set(lightInfo.projection, 16)

const { view, projection, viewPrev } = camera.update(0.03);

const left = -10;
const right = 10;
const bottom = -10;
const top = 10;
const near = 1.0;
const far = 60;

// Create the orthographic matrix
const orthographicMatrix = mat4.ortho(left, right, bottom, top, near, far);
//alert(orthographicMatrix)

resources.uniformValues.set(lightInfo.view, 32 + 4 * 5 + 4 + 4 * 4)
      resources.uniformValues.set(orthographicMatrix, 32 + 4 * 5 + 4 + 4 * 4 + 4 * 4)


//shadowMapRender(webgpuInfo,pipelineFormat,resources,totalVoxels)

    
          
    const viewProj = mat4.mul(projection, view)
    const planes = extractFrustumPlanes(viewProj)

    resources.uniformValues.set(view, 0)
    resources.uniformValues.set(projection, 16)

    for (let i = 0; i < 6; i++) {

      resources.uniformValues[32 + 4 * i + 0] = planes[i].normal[0]
      resources.uniformValues[32 + 4 * i + 1] = planes[i].normal[1]
      resources.uniformValues[32 + 4 * i + 2] = planes[i].normal[2]
      resources.uniformValues[32 + 4 * i + 3] = planes[i].d

    }


    resources.uniformValues.set(viewPrev, 32 + 4 * 5 + 4)
    resources.uniformValues.set(lightView, 32 + 4 * 5 + 4 + 4 * 4)
    //resources.uniformValues[resources.uniformValues.length - 4] = t
    t += 1.0

    
      
      //alert("run")
    render(
    webgpuInfo,
    pipelineFormat,
    resources,
    mipCount,
    voxelInfo.voxelCount,
    keyP)

    

    requestAnimationFrame(loop)
  }

  loop()
}

main()

