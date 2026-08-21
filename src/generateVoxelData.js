import { createStorageBuffer } from "./webgpuResources.js";

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
export function setInstance(buffer, i, px, py, pz, pn, sx, sy, sz) {
    const o = i * 8;
    let scale = 0.0;
    // pos
    buffer[o + 0] = px;
    buffer[o + 1] = py;
    buffer[o + 2] = pz;
    buffer[o + 3] = pn * 6;

    // scale
    buffer[o + 4] = sx;
    buffer[o + 5] = sy;
    buffer[o + 6] = sz;
    buffer[o + 7] = scale;
  }

  function getVoxel(list,SIZE,x,y,z){

    if(x>=0 && x<SIZE && y>=0 && y<SIZE && z>=0 && z<SIZE){

      return list[x][y][z]

    }

    return "out of range"

  }

export function addVoxel(webgpuInfo, voxelInfo, camera, resources, SIZE,totalVoxels) {

     const normals = [
    [0, 0, 1],
    [-1, 0, 0],
    [0, 0, -1],
    [1, 0, 0],
    [0, 1, 0],
    [0, -1, 0]]

    
    try{

      const voxels = voxelInfo.voxels;

      const vox = getVoxel(voxels, SIZE,Math.floor(camera.position[0]),Math.floor(camera.position[1]),Math.floor(camera.position[2]))

    if(vox == 0) {
    voxels[Math.floor(camera.position[0])][Math.floor(camera.position[1])][Math.floor(camera.position[2])] = 1
    for (let p = 0; p < 6; p++) {


      let normal = normals[p]
      let neighbor = [Math.floor(camera.position[0]) - normal[0], Math.floor(camera.position[1]) - normal[1], Math.floor(camera.position[2]) - normal[2]]
      if (true) {

        let o = getQuadData(voxelInfo.storageValues, neighbor[0], neighbor[1], neighbor[2], p * 6,voxelInfo.voxelCount * 8)
if (o>=0){
  
  try{
  swapRemoveAndAddStaticArray(voxelInfo.storageValues, [o, o + 1, o + 2, o + 3, o + 4, o + 5, o + 6, o+7], [], voxelInfo.voxelCount * 8)
    voxelInfo.voxelCount--
    
    //return totalVoxels--
}
  catch(e) {
    alert(e)
  }

}

let otherNeighbor = [Math.floor(camera.position[0]) + normal[0], Math.floor(camera.position[1]) + normal[1], Math.floor(camera.position[2]) + normal[2]]
const vox2 = getVoxel(voxels, SIZE,otherNeighbor[0],otherNeighbor[1],otherNeighbor[2])

if (true) {

  //ael(voxels[otherNeighbor[0]][otherNeighbor[1]][otherNeighbor[2]])

  if (vox2 !=1) {

    

  setInstance(voxelInfo.storageValues, voxelInfo.voxelCount, Math.floor(camera.position[0]), Math.floor(camera.position[1]), Math.floor(camera.position[2]), p, 1, 1, 1)
  voxelInfo.voxelCount++  

  //return totalVoxels++

  }

}

      }

      webgpuInfo.device.queue.writeBuffer(voxelInfo.storageBuffer, 0, voxelInfo.storageValues);
      webgpuInfo.device.queue.writeBuffer(resources.storageData.storageBuffer, 0, voxelInfo.storageValues);


    }

  }


}catch(e){



}

//alert("click")

  }

export function generateVoxelData(device, SIZE) {

    const instanceCount = SIZE ** 3 * 6;
    const proxyBufferSize = instanceCount * 8 * 4
    const proxyBuffer = new Float32Array(proxyBufferSize / 4)

    function getVoxel(x, y, z) {
        
      //return x%8==0 && z%8==0 && y==0
      return  y==0 && x<16 && z<16
      return y==30 && x%2+y%2==0
return y==0 || (x%4+z%4==0 && y<=1)
        //return x%2+y%2+z%2==0
        //return x%4+y%4+z%4==0

        //return z%2==0
        
        
        //y%2==0 && y<25
        
        //x%2+y%2+z%2==0;
        
        
        
    }

    let voxels = []

    let it = 0
    for (let z = 0; z < SIZE; z++) {
      voxels.push([])

      for (let y = 0; y < SIZE; y++) {
        voxels[voxels.length - 1].push([])

      for (let x = 0; x < SIZE; x++) {


        if (getVoxel(x, y, z)) {



          voxels[voxels.length - 1][voxels[voxels.length - 1].length - 1].push(1)



        } else {

          voxels[voxels.length - 1][voxels[voxels.length - 1].length - 1].push(0)



        }

      }


    }


  }


  const normals = [
    [0, 0, 1],
    [-1, 0, 0],
    [0, 0, -1],
    [1, 0, 0],
    [0, 1, 0],
    [0, -1, 0]]

  //console.log(voxels)

  const getVoxels = (x3, y3, z3) => {

    if (x3 >= 0 && x3 < SIZE && y3 >= 0 && y3 < SIZE && z3 >= 0 && z3 < SIZE) {

      return voxels[x3][y3][z3];

    };
    return false

  }

  for (let z2 = 0; z2 < SIZE; z2++) {

    for (let y2 = 0; y2 < SIZE; y2++) {

      for (let x2 = 0; x2 < SIZE; x2++) {
        if (voxels[x2][y2][z2] == 1) {


          for (let i = 0; i < 6; i++) {

            let normal = normals[i]


            let pos = [x2 + normal[0], y2 + normal[1], z2 + normal[2]]

            if (!getVoxels(pos[0], pos[1], pos[2])) {
              it++

              setInstance(proxyBuffer, it, x2, y2, z2, i, 1, 1, 1)

            }
            //


          }



        }

      }

    }

  }

  const { storageBuffer, storageValues } = createStorageBuffer(device, Math.floor(it * 1.5) * 8 * 4)



  for (let ki = 0; ki < it * 8; ki++) {

    storageValues[ki] = proxyBuffer[ki];

  }

  var voxelCount = it

  return { storageBuffer, storageValues, voxelCount, voxels}

}