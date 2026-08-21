export function createUniformBuffer(device, uniformBufferSize) {
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformValues = new Float32Array(uniformBufferSize / 4);
  return { uniformValues, uniformBuffer };
}

export function createStorageBuffer(device, storageBufferSize) {
  const storageBuffer = device.createBuffer({
    size: storageBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const storageValues = new Float32Array(storageBufferSize / 4);
  return { storageValues, storageBuffer };

}
/**
 * 3D flood fill with:
 * - multiple emitters
 * - linear falloff
 * - solid wall support
 *
 * volume[z][y][x]
 *
 * Any cell with:
 *   volume[z][y][x] === WALL
 * blocks propagation.
 */

const WALL = -1;

/**
 * @typedef {Object} Emitter
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} strength
 */

/**
 * Flood fill propagation through a voxel volume.
 *
 * @param {number[][][]} volume
 * @param {Emitter[]} emitters
 * @returns {number[][][]}
 */
function floodFill3D(volume, emitters) {
  const depth = volume.length;
  const height = volume[0].length;
  const width = volume[0][0].length;

  // 6-connected voxel neighbors
  const directions = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  // Queue entries:
  // [x, y, z, value]
  const queue = [];

  // Seed emitters
  for (const emitter of emitters) {
    const { x, y, z, strength } = emitter;

    // Bounds
    if (
      x < 0 || x >= width ||
      y < 0 || y >= height ||
      z < 0 || z >= depth
    ) {
      continue;
    }

    // Cannot place emitter inside wall
    if (volume[z][y][x] === WALL) {
      continue;
    }

    // Keep strongest value
    if (strength > volume[z][y][x]) {
      volume[z][y][x] = strength;
    }

    queue.push([x, y, z, strength]);
  }

  // BFS propagation
  while (queue.length > 0) {
    const [x, y, z, value] = queue.shift();

    // Nothing left to spread
    if (value <= 1) continue;

    const nextValue = value - 1;

    for (const [dx, dy, dz] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;

      // Bounds check
      if (
        nx < 0 || nx >= width ||
        ny < 0 || ny >= height ||
        nz < 0 || nz >= depth
      ) {
        continue;
      }

      // Walls block propagation
      if (volume[nz][ny][nx] === WALL) {
        continue;
      }

      // Only overwrite if stronger
      if (nextValue > volume[nz][ny][nx]) {
        volume[nz][ny][nx] = nextValue;
        queue.push([nx, ny, nz, nextValue]);
      }
    }
  }

  return volume;
}

const size = 7;

// Create empty volume
const volume = Array.from({ length: size }, () =>
  Array.from({ length: size }, () =>
    Array(size).fill(0)
  )
);

// Add a wall plane in middle
for (let y = 0; y < size; y++) {
  for (let z = 0; z < size; z++) {
    volume[z][y][3] = WALL;
  }
}

// Opening in wall
volume[3][3][3] = 0;

const emitters = [
  { x: 1, y: 3, z: 3, strength: 6 }
];

floodFill3D(volume, emitters);

//alert(volume);

export function createIndirectBuffer(device, storageBufferSize) {
  const storageBuffer = device.createBuffer({
    size: storageBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
  });
  const storageValues = new Float32Array(storageBufferSize / 4);
  return { storageValues, storageBuffer };

}

export function createWebgpuResources(renderModule, webgpuInfo, it, pipelineFormat, storageBuffer,voxels) {
    
const {device, presentationFormat, context} = webgpuInfo;

    const lightMapPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: renderModule.module,
      entryPoint: 'generateLightMap',
    },
    });

    const cullingPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: renderModule.module,
      entryPoint: 'computeMain',
    },
    });

    const indirectBufferPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: renderModule.module,
      entryPoint: 'computeMain2',
    },
    });

    const generateMipZeroPipeline = device.createComputePipeline({
    label: "zeroMipPipeline",
    layout: 'auto',
    compute: {
      module: renderModule.module,
      entryPoint: 'generateMipZero',
    },
    });

    const generateNextMipPipeline = device.createComputePipeline({
    label: "NextMipPipeline",
    layout: 'auto',
    compute: {
      module: renderModule.module,
      entryPoint: 'generateNextMip',
    },
    });

    const debugQuadPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: renderModule.module,
      entryPoint: "vs_main_fullscreen",
    },
    fragment: {
      module: renderModule.module,
      entryPoint: "fs_main_fullscreen",
      targets: [{ format: presentationFormat }],
    },
    primitive: {
      topology: "triangle-list",
    },
    });

    const lightSourcePipeline = device.createRenderPipeline({
      layout: "auto",
    vertex: {
      module: renderModule.module,
      entryPoint: "vs_light",
    },

    depthStencil: {
      format: 'depth32float', // Must match the texture format
      depthWriteEnabled: true, // Enable writing to the depth buffer
      depthCompare: 'less', // Fragments with smaller depth values (closer to camera) pass the test
    },
    primitive: {
      topology: 'triangle-list',
      // Sets counter-clockwise winding order as the front face
      frontFace: 'ccw',
      // Enables culling of back-facing triangles
      cullMode: 'back',
    },
    multisample: {
      count: 1, // Set to 1 to disable MSAA
    }
    })

    const lightSourceDepthTexture = device.createTexture({
      size: [1024,1024],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    const lightSourceRenderTexture = device.createTexture({
      size: [1024,1024],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    const lightSourceDepthTextureView = lightSourceDepthTexture.createView();
    //const lightSourceRenderTextureView = lightSourceRenderTexture.createView();

    const lightSourceRenderPassDescriptor = {
    label: 'our basic canvas renderPass',
        colorAttachments: [
          
        ],

    depthStencilAttachment: {
      view: lightSourceDepthTextureView,
      depthClearValue: 1.0, // Clear to the maximum depth value (farthest)
      depthLoadOp: 'clear',
      depthStoreOp: 'store', // Store the depth values for the next frame/pass
      // Stencil properties can be omitted if not used, or set similarly
    },
  };

  const dataBuffer = new Uint8Array(32*32*1088*4)
  const cellBuffer = new Uint8Array(32*32*32);
  const lightDataBuffer = []
  const emitters = [{x:1, y:10, z:1, strength: 255/4}]

  for(let x = 0; x<32; x++){
    lightDataBuffer.push([])

    for(let y = 0; y<32; y++){

      lightDataBuffer[x].push([])

    for(let z = 0; z<32; z++){

    lightDataBuffer[x][y].push(0)
    lightDataBuffer[x][y][z] = voxels[x][y][z] == 1 ? -1 : 0
    cellBuffer[z * 32 * 32 + y * 32 + x] = voxels[x][y][z] == 1 ? 255 : 0;

  }

  }

  }

//floodFill3D(lightDataBuffer, emitters);
//alert(lightDataBuffer)

  for(let ik = 0; ik < 1088; ik++){

    

    for(let ix = 0; ix < 32; ix++){

      for(let iy = 0; iy < 32; iy++){




        dataBuffer[4*(ik * 32 * 32 + iy * 32 + ix)] = ix*4
        dataBuffer[4*(ik * 32 * 32 + iy * 32 + ix) + 1] =  iy*4
        dataBuffer[4*(ik * 32 * 32 + iy * 32 + ix) + 2] =  0
        dataBuffer[4*(ik * 32 * 32 + iy * 32 + ix) + 3] = 255
      

    }

    }

  }

  

  

  const textureSize = {
  width: 32,
  height: 32,
  depthOrArrayLayers: 1088, // For a 3D texture, this is the Z-dimension
};

const volumeTexture = device.createTexture({
  size: textureSize,
  dimension: '3d', // Explicitly set to 3D
  format: 'rgba8unorm',
  usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});

device.queue.writeTexture(
  { texture: volumeTexture },
  dataBuffer, // Your typed array containing the 3D data
  {
    bytesPerRow: textureSize.width * 4,
    rowsPerImage: textureSize.height,
  },
  textureSize
);

const cellTexture = device.createTexture({
  size: {width:32, height:32, depthOrArrayLayers: 32},
  dimension: '3d', // Explicitly set to 3D
  format: 'r8unorm',
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});

device.queue.writeTexture(
  { texture: cellTexture },
  cellBuffer, // Your typed array containing the 3D data
  {
    bytesPerRow: 32,
    rowsPerImage: 32,
  },
  {width:32, height:32, depthOrArrayLayers: 32}
);



    const uniformBufferSize = 128 + 4 * (6 * 4) + 4 * 4 + (4 * 4) * 16 + (4 * 4) * 16 + (4 * 4) * 16
    const { uniformBuffer, uniformValues } = createUniformBuffer(device, uniformBufferSize)


    const mipCount = 11


    const hizTexture = device.createTexture({
    size: [context.canvas.width, context.canvas.height],
    mipLevelCount: mipCount,
    format: "r32float",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT
  });


       const debugQuadBindGroup = device.createBindGroup({
    layout: debugQuadPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 10, resource: lightSourceDepthTextureView

      },
      {
        binding: 0, resource: uniformBuffer

      }


       


    ]
  });

  const voxelTexture = device.createTexture({
    size: [32, 32],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });


   const img = new Image();
    img.crossOrigin = "Anonymous"; // Required for cross-origin images
    img.onload = function () {
      try {
  
  
        const canvas2 = document.createElement('canvas');
        const ctx = canvas2.getContext('2d');
  
        canvas2.width = img.width;
        canvas2.height = img.height;
  
        ctx.drawImage(img, 0, 0);
  
        const imageData = ctx.getImageData(0, 0, 32, 32);
        const pixels = imageData.data;
  
        device.queue.writeTexture(
          { texture: voxelTexture }, // Destination texture
          pixels,                 // Source Uint8Array
          {
            bytesPerRow: 32* 4, // Bytes per row (4 for RGBA8)
            rowsPerImage: 32   // Total rows in the image
          },
          { width: 32, height: 32} // Size of the copy region
        );
  
        ///console.log(pixels);
      } catch (e) {
        console.error("Error:", e);
      }
    };
  
    img.onerror = function (e) {
      console.error("Image failed to load", e);
    };
    img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACtklEQVR4AcTW0U0kQQxFUZgAgAjIgNCJhgzIABJgdUrclin1gOZrV7pr+/m5yt07zHJ5fX39+p9c7k7+PD4+3kXt6hn13t/f7z4+PhbqWzkW6CAX7Ic8Pz8fC8n3vtrcNWbfPHjpxwIJPU2RLmcOB5QXeSKtyO8c5BHVawEFMyHUQcsj9rbqizzBAzrkkCOffC0gySDOC9QTPdDMQQ465JBHNX+aeCygwYS5oZqxvqgvTmi/kdd5cl7xdAEXBhMMpolqetBuxRlrAdv4oJyhF3vf5bt2a70WcBC6aEa6J7Mt1OARQ72j99fssYDhr68vM6fMyxmqzXnqh4eH47tCf8I7aSmzF8OZn56e1iFqTTH4aBNaB9/f3y+rmmcV33/x7by8vKxvz/UGDBhss5l/n3EEvSCaFWki5JCH2vmhNnt5e3u7I06jBgPSpyetWT7kEdX51OWi82m4KIgKQ0HbqVc0C3XemacV9eCutIuCSBBBqxZDb8IHmhj8NDHOatr6EO4fELUnEx0g3sIts+tDaHPbwIU7DtzJ89dsvmtxLVBzv6R6789FefTFnfnd4A3Ovhn8WMDBO0wN1nMYPfTLZ/z8/Fw/62l8UBePBRLEHQMuF3Etr6cPdWepgx7HAv4tiZmKdFRPjxyzn0/UE/XlE7r6WEARmpFWdJhetTifcq/zijAPOX4sQIBDQn2N6ZmHylFfHvtZawEfquhprsV8ogvEa3TGtT59LeCgzDPSYfs2V58x58rz/Ta//i8wkFkOF05NTocc8lCHWVQX8854yZiohtfToFouQo7yZkV6UT7hD28F6w0waRDkUIsTB5/Bw4/6tAldLcIDYr0Bg2CYsTxdbcmJ3wnoefSmRgdd5J2sBTQmzExTs3WkV/PDDOpfizyxfgoqzmKH6LkEcsghP8PsJM/U/gEAAP//hXepjQAAAAZJREFUAwCEVy2gS1aLMAAAAABJRU5ErkJggg==";
  


  const storageData = createStorageBuffer(device, Math.floor(it * 1.5) * 8 * 4)
    const atomicStorageData = createStorageBuffer(device, 4)
    const indirectBuffer = createIndirectBuffer(device, 4 * 4)




        const renderBindGroup = device.createBindGroup({
    layout: pipelineFormat.pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: uniformBuffer },
      { binding: 1, resource: storageBuffer },
      { binding: 8, resource: voxelTexture.createView() },
      { binding: 10, resource: lightSourceDepthTextureView },
      { binding: 12, resource: volumeTexture.createView() },
      { binding: 13, resource: cellTexture.createView() }
    ]
  });

      const lightSourceBindGroup = device.createBindGroup({
      layout: lightSourcePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: uniformBuffer },
        { binding: 1, resource: storageData.storageBuffer },
        //{ binding: 8, resource: voxelTexture.createView() }
      ]
    });

    const lightMapBindgroup = device.createBindGroup({
      layout: lightMapPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 1, resource: storageData.storageBuffer },
        { binding: 14, resource: volumeTexture.createView() },
      { binding: 13, resource: cellTexture.createView() }
        
      ]
    });

const cullingBindGroup = device.createBindGroup({
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

  const indirectBindGroup = device.createBindGroup({
    layout: indirectBufferPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 3, resource: atomicStorageData.storageBuffer },
      { binding: 4, resource: indirectBuffer.storageBuffer },

    ],
  });

  const generateMipZeroBindgroup = device.createBindGroup({
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
        binding: 5, resource: pipelineFormat.depthTextureView,
      }


    ],
  });



  const resources = {
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
    lightSourceBindGroup,
    lightSourcePipeline,
    lightSourceRenderPassDescriptor,
    lightSourceDepthTextureView,
    cellTexture,
    cellBuffer,
    lightMapPipeline,
    lightMapBindgroup,

  }

  return resources

}