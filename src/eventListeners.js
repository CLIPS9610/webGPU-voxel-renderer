import { mat4 } from 'wgpu-matrix';


export function resize(resources, webgpuInfo, pipelineFormat, camera, storageBuffer,mipCount) {


  const {context, device} = webgpuInfo;

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

    resources.hizTexture = device.createTexture({
    size: [width, height],
    mipLevelCount: mipCount,
    format: "r32float",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT
  });

  resources.cullingBindGroup = device.createBindGroup({
    layout: resources.cullingPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 1, resource: storageBuffer },
      { binding: 2, resource: resources.storageData.storageBuffer },
      { binding: 0, resource: resources.uniformBuffer },
      { binding: 3, resource: resources.atomicStorageData.storageBuffer },
      {
        binding: 6, resource: resources.hizTexture.createView({
          baseMipLevel: 0,
          mipLevelCount: mipCount
        }),
      }

    ],
  });

   resources.generateMipZeroBindgroup = device.createBindGroup({
    label: "generate Mip zero bindgroup",
    layout: resources.generateMipZeroPipeline.getBindGroupLayout(0),
    entries: [

      {
        binding: 6, resource: resources.hizTexture.createView({
          baseMipLevel: 0,
          mipLevelCount: 1
        }),

      },

      {
        binding: 5, resource: pipelineFormat.depthTextureView
      }


    ],
  });

   resources.debugQuadBindGroup = device.createBindGroup({
    layout: resources.debugQuadPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 6, resource: resources.hizTexture.createView({
          baseMipLevel: 0,
          mipLevelCount: mipCount
        }),

      }]
    
    })

camera.projection = mat4.perspective(Math.PI / 4, width / height, 0.1, 1000)


}


