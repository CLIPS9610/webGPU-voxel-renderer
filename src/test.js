import { mat4, vec3, vec4 } from 'wgpu-matrix';

import { extractFrustumPlanes, createFPSCamera } from './3dMath.js'

import { createUniformBuffer, createStorageBuffer, createIndirectBuffer, createWebgpuResources } from './webgpuResources.js';

import { createPipeline, initWebgpu, createModule } from './initateWebgpu.js';

import { setInstance, generateVoxelData } from './generateVoxelData.js';

import { render } from './renderFrame.js';

import { addEventListeners, resize} from './eventListeners.js';

const originalLog = console.log;
const originalError = console.error;

// Helper to append messages to the page
function appendToPage(type, args) {
  const container = document.getElementById("console-output");

  const message = document.createElement("div");
  message.textContent = `[${type}] ` + args.map(a => 
    typeof a === "object" ? JSON.stringify(a) : a
  ).join(" ");

  message.style.color = type === "error" ? "red" : "black";

  container.appendChild(message);
}

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

try{
/**
 * Swap-remove elements from a typed array and add new ones.
 * Order is NOT preserved.
 *
 * @param {Array} arr - The original array (modified in place)
 * @param {number[]} removeIndices - Indices to remove
 * @param {Array} toAdd - Elements to append
 * @param {number} size - Size the array is treated to have
 * @returns {Array} The modified array
 */
function swapRemoveAndAddStaticArray(arr, removeIndices, toAdd, size) {
  // Remove duplicates and filter valid indices
  const toRemove = [...new Set(removeIndices)]
    .filter(i => i >= 0 && i < arr.length);

  let lastElement = size - 1;
  // Sort descending so index positions don't shift incorrectly
  toRemove.sort((a, b) => b - a);

  for (let idx of toRemove) {
    const lastIndex = lastElement;

    if (idx !== lastIndex) {
      // Swap with last element
      arr[idx] = arr[lastIndex];
      arr[lastIndex] = undefined;
    }

    // Remove last element
    lastElement--;
    
  }

  // Add new elements
  let i = 0
  for (let el of toAdd) {
    arr[lastElement + 1 + i] = el;
    i++
  }

  return arr;
}

function getQuadData(storageValues, x,y,z,normal, size) {

 for(let i = 0; i< size; i++) {

    let o = i * 8

    if (storageValues[o] == x && storageValues[o + 1] == y && storageValues[o + 2] == z && storageValues[o + 3] == normal) {

      return o

    }

 }

 return -1

}


async function main() {

  const { device, context, presentationFormat } = await initWebgpu();
  const mipCount = 4
  const SIZE = 32
  const { storageBuffer, storageValues, voxelCount, voxels} = generateVoxelData(device, SIZE)
  let it = voxelCount;
  
  const renderModule = await createModule(device);
  const pipelineFormat = await createPipeline(device, context, renderModule.module, presentationFormat)
let {
    cullingPipeline,
    indirectBufferPipeline,
    generateMipZeroPipeline,
    generateNextMipPipeline,
    debugQuadPipeline,
    hizTexture,
    debugQuadBindGroup,
    uniformBuffer,
    uniformValues,
    storageData,
    atomicStorageData,
    indirectBuffer,
    cullingBindGroup,
    indirectBindGroup,
    generateMipZeroBindgroup,
    renderBindGroup
  } = createWebgpuResources(renderModule, device, presentationFormat,context, it, pipelineFormat, storageBuffer);

  let camera = createFPSCamera(context.canvas);



window.addEventListener("resize", () => {

  const devicePixelRatio = window.devicePixelRatio || 1;
  const width = Math.floor(window.innerWidth * devicePixelRatio);
  const height = Math.floor(window.innerHeight * devicePixelRatio);

  context.canvas.width = width
  context.canvas.height = height

  context.configure({
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: 'opaque',
    size: [width, height], // important
  });

    const depthTextureDescriptor = {
    size: {
      width: context.canvas.width,
      height: context.canvas.height,
      depthOrArrayLayers: 1, // For 2D texture, depth is 1
    },
    dimension: '2d',
    format: 'depth24plus', // A common format, "depth32float" is another option
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC, // TEXTURE_BINDING is useful for debugging/sampling later
    mipLevelCount: 1,
    sampleCount: 1,
  };


  const depthTexture = device.createTexture(depthTextureDescriptor);

  const depthTextureView = depthTexture.createView();

  const renderPassDescriptor = {
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    loadOp: 'clear',
    storeOp: 'store',
    clearValue: { r: 0.3, g: 0.3, b: 0.3, a: 1 },
  }],
  depthStencilAttachment: {
    view: depthTextureView,
    depthLoadOp: 'clear',
    depthClearValue: 1.0,
    depthStoreOp: 'store',
  },
};

pipelineFormat.depthTextureView = depthTextureView
//alert(pipelineFormat.depthTextureView)

pipelineFormat.renderPassDescriptor = renderPassDescriptor

    hizTexture = device.createTexture({
    size: [width, height],
    mipLevelCount: mipCount,
    format: "r32float",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT
  });

  cullingBindGroup = device.createBindGroup({
    layout: cullingPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 1, resource: storageBuffer },
      { binding: 2, resource: storageData.storageBuffer },
      { binding: 0, resource: uniformBuffer },
      { binding: 3, resource: atomicStorageData.storageBuffer },
      {
        binding: 6, resource: hizTexture.createView({
          baseMipLevel: 0,
          mipLevelCount: mipCount
        }),
      }

    ],
  });

   generateMipZeroBindgroup = device.createBindGroup({
    label: "generate Mip zero bindgroup",
    layout: generateMipZeroPipeline.getBindGroupLayout(0),
    entries: [

      {
        binding: 6, resource: hizTexture.createView({
          baseMipLevel: 0,
          mipLevelCount: 1
        }),

      },

      {
        binding: 5, resource: pipelineFormat.depthTextureView
      }


    ],
  });

   debugQuadBindGroup = device.createBindGroup({
    layout: debugQuadPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 6, resource: hizTexture.createView({
          baseMipLevel: 0,
          mipLevelCount: mipCount
        }),

      }]
    
    })

camera.projection = mat4.perspective(Math.PI / 4, width / height, 0.1, 1000)

  })



  device.queue.writeBuffer(storageBuffer, 0, storageValues);
  device.queue.writeBuffer(storageData.storageBuffer, 0, storageValues);
  device.queue.writeBuffer(indirectBuffer.storageBuffer, 0, new Uint32Array([(it + 1) * 6, 1, 0, 0]));

  

  let t = 0
  let keyP = false
  document.addEventListener("keydown", e => {

    if (e.key == "p")
      keyP = !keyP

  })

  document.addEventListener("click", e => {
    //console.log(Math.floor(camera.position[] - 20));

      const normals = [
    [0, 0, 1],
    [-1, 0, 0],
    [0, 0, -1],
    [1, 0, 0],
    [0, 1, 0],
    [0, -1, 0]]

    if(voxels[Math.floor(camera.position[0])][Math.floor(camera.position[1])][Math.floor(camera.position[2])] == 0) {
    voxels[Math.floor(camera.position[0])][Math.floor(camera.position[1])][Math.floor(camera.position[2])] = 1
    for (let p = 0; p < 6; p++) {


      let normal = normals[p]
      let neighbor = [Math.floor(camera.position[0]) - normal[0], Math.floor(camera.position[1]) - normal[1], Math.floor(camera.position[2]) - normal[2]]
      let addVoxel = false;
      if (neighbor[0] >= 0 && neighbor[0] < SIZE && neighbor[1] >= 0 && neighbor[1] < SIZE && neighbor[2] >= 0 && neighbor[2] < SIZE) {

        let o = getQuadData(storageValues, neighbor[0], neighbor[1], neighbor[2], p * 6, it * 8)
        //alert(o)
if (o>=0){
  
  //alert(o)
  //setInstance(storageValues,o/8, neighbor[0], neighbor[1], neighbor[2], p, 0, 0, 0)
  try{
  swapRemoveAndAddStaticArray(storageValues, [o, o + 1, o + 2, o + 3, o + 4, o + 5, o + 6, o+7], [], it * 8)
    it--
}
  catch(e) {
    alert(e)
  }
  //setInstance(storageValues,it-1, neighbor[0], neighbor[1], neighbor[2], p, 0, 0, 0)

}

let otherNeighbor = [Math.floor(camera.position[0]) + normal[0], Math.floor(camera.position[1]) + normal[1], Math.floor(camera.position[2]) + normal[2]]

if (otherNeighbor[0] >= 0 && otherNeighbor[0] < SIZE && otherNeighbor[1] >= 0 && otherNeighbor[1] < SIZE && otherNeighbor[2] >= 0 && otherNeighbor[2] < SIZE) {

  if (voxels[otherNeighbor[0]][otherNeighbor[1]][otherNeighbor[2]] == 0) {

  setInstance(storageValues, it, Math.floor(camera.position[0]), Math.floor(camera.position[1]), Math.floor(camera.position[2]), p, 1, 1, 1)
  it++  

  }

}




//it++
      
          

      //voxels[Math.floor(camera.position[0])][Math.floor(camera.position[1])][Math.floor(camera.position[2])] = 1

        
        

      }

     
      //setInstance(storageValues, 2, Math.floor(camera.position[0]), Math.floor(camera.position[1]), Math.floor(camera.position[2]), p, 0, 0, 0)
          //it++
          

      device.queue.writeBuffer(storageBuffer, 0, storageValues);
      device.queue.writeBuffer(storageData.storageBuffer, 0, storageValues);


    }

  }
  })

  function loop() {

    
    const { view, projection, viewPrev } = camera.update(0.03);

    const viewProj = mat4.mul(projection, view)
    const planes = extractFrustumPlanes(viewProj)
    //console.log(planes)

    uniformValues.set(view, 0)
    uniformValues.set(projection, 16)

    for (let i = 0; i < 6; i++) {

      uniformValues[32 + 4 * i + 0] = planes[i].normal[0]
      uniformValues[32 + 4 * i + 1] = planes[i].normal[1]
      uniformValues[32 + 4 * i + 2] = planes[i].normal[2]
      uniformValues[32 + 4 * i + 3] = planes[i].d

    }
    //console.log(viewProj)
    uniformValues.set(viewPrev, 32 + 4 * 5 + 4)

    uniformValues[uniformValues.length - 4] = t
    t += 1.0

    render(
    device, 
    context, 
    pipelineFormat,
    camera, 
    cullingPipeline,
    indirectBufferPipeline,
    generateMipZeroPipeline,
    generateNextMipPipeline,
    debugQuadPipeline,
    hizTexture,
    debugQuadBindGroup,
    uniformBuffer,
    uniformValues,
    storageData,
    atomicStorageData,
    indirectBuffer,
    cullingBindGroup,
    indirectBindGroup,
    generateMipZeroBindgroup,
    renderBindGroup, 
    mipCount,
    it,
    keyP)

    

    requestAnimationFrame(loop)
  }

  loop()
}

main()

}catch(e) {
  alert(e)
}