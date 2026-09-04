import { mat4 } from 'wgpu-matrix';

import { extractFrustumPlanes, createFPSCamera } from './3dMath.js'

var t = 0

export function lightMapRender(webgpuInfo,
  pipelineFormat,
  resources,
  it,){

const {device, context} = webgpuInfo;

const encoder = device.createCommandEncoder({ label: 'our encoder' });

    const clearLight = encoder.beginComputePass();

      clearLight.setPipeline(resources.clearLightMapPipeline);
      clearLight.setBindGroup(0, resources.clearLightMapBindgroup);
      clearLight.dispatchWorkgroups(32*32*32*6/256);
      clearLight.end();

const genLight = encoder.beginComputePass();

      genLight.setPipeline(resources.lightMapPipeline);
      genLight.setBindGroup(0, resources.lightMapBindgroup);
      genLight.dispatchWorkgroups(it);
      genLight.end();

const commandBuffer2 = encoder.finish();
    device.queue.submit([commandBuffer2]);



  }

export function shadowMapRender(
  webgpuInfo,
  pipelineFormat,
  resources,
  it,
) {



      const {device, context} = webgpuInfo;

      //alert(pipelineFormat.depthTextureView)

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



    //const swapTexture = context.getCurrentTexture();
    //const swapView = swapTexture.createView();

    //console.log(uniformValues)
    device.queue.writeBuffer(resources.uniformBuffer, 0, resources.uniformValues);
    device.queue.writeBuffer(resources.atomicStorageData.storageBuffer, 0, new Uint32Array([0]));


    //pipelineFormat.renderPassDescriptor.colorAttachments[0].view = swapView;
    //resources.lightSourceRenderPassDescriptor.colorAttachments[0].view = resources.lightSourceRenderTexture.createView();
    const encoder = device.createCommandEncoder({ label: 'our encoder' });

    // number of voxels (same as your struct count)
    const voxelCount = it;

    const pass = encoder.beginRenderPass(resources.lightSourceRenderPassDescriptor);
    pass.setPipeline(resources.lightSourcePipeline);
    pass.setBindGroup(0, resources.lightSourceBindGroup);
    //pass.drawIndirect(resources.indirectBuffer.storageBuffer, 0);  // call our vertex shader 3 times
    pass.draw(voxelCount*6)
    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    //return;
    //console.log("complete")

}

export function render(
    webgpuInfo,
    pipelineFormat,
    resources,
    it,
    keyP) {

      const {device, context} = webgpuInfo;
      //alert(pipelineFormat.depthTextureView)

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



    const swapTexture = context.getCurrentTexture();
    const swapView = swapTexture.createView();

    //console.log(uniformValues)
    device.queue.writeBuffer(resources.uniformBuffer, 0, resources.uniformValues);
    device.queue.writeBuffer(resources.atomicStorageData.storageBuffer, 0, new Uint32Array([0]));

    //pipelineFormat.renderPassDescriptor.colorAttachments[0].view = pipelineFormat.msaaTexture.createView();
    //pipelineFormat.renderPassDescriptor.colorAttachments[0].resolveTarget = swapView;
    pipelineFormat.renderPassDescriptor.colorAttachments[0].view = swapView;
    //resources.lightSourceRenderPassDescriptor.colorAttachments[0].view = swapView;
    const encoder = device.createCommandEncoder({ label: 'our encoder' });

    // number of voxels (same as your struct count)
    const voxelCount = it;

    // workgroup size = 64 → match shader
    const workgroupCount = Math.ceil(voxelCount / 64);



    if ((t < 20 && keyP)) {

      const firstLodPass = encoder.beginComputePass()
      firstLodPass.setPipeline(resources.generateMipZeroPipeline)

 const generateMipZeroBindgroupNew = device.createBindGroup({
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
        binding: 5, resource: pipelineFormat.depthTextureView,
      }
    
    ]
  })

      firstLodPass.setBindGroup(0, generateMipZeroBindgroupNew)
      firstLodPass.dispatchWorkgroups(Math.ceil(context.canvas.width / 8), Math.ceil(context.canvas.height / 8))
      firstLodPass.end()

      for (let i = 1; i < resources.mipCount; i++) {

        const secondLodPass = encoder.beginComputePass()
        const generateNextMipBindgroup = device.createBindGroup({
          label: "generate Next Mip bindgroup",
          layout: resources.generateNextMipPipeline.getBindGroupLayout(0),
          entries: [

            {
              binding: 6, resource: resources.hizTexture.createView({
                baseMipLevel: i,
                mipLevelCount: 1
              }),
            },

            {
              binding: 7, resource: resources.hizTexture.createView({
                baseMipLevel: i - 1,
                mipLevelCount: 1
              }),

            },


          ],
        });
        secondLodPass.setPipeline(resources.generateNextMipPipeline)
        secondLodPass.setBindGroup(0, generateNextMipBindgroup)
        secondLodPass.dispatchWorkgroups(Math.ceil(context.canvas.width / (8 * (2 ** i))), Math.ceil(context.canvas.height / (8 * (2 ** i))))
        secondLodPass.end()

      }

      const computePass = encoder.beginComputePass();
      computePass.setPipeline(resources.cullingPipeline);
      computePass.setBindGroup(0, resources.cullingBindGroup);
      computePass.dispatchWorkgroups(workgroupCount);
      computePass.end();



      const computePass2 = encoder.beginComputePass();
      computePass2.setPipeline(resources.indirectBufferPipeline);
      computePass2.setBindGroup(0, resources.indirectBindGroup);
      computePass2.dispatchWorkgroups(1);
      computePass2.end();
    }

    const pass = encoder.beginRenderPass(pipelineFormat.renderPassDescriptor);
    pass.setPipeline(pipelineFormat.pipeline);
    pass.setBindGroup(0, resources.renderBindGroup);
    pass.drawIndirect(resources.indirectBuffer.storageBuffer, 0);  // call our vertex shader 3 times
    pass.end();

    if (!true) {
      const pass2 = encoder.beginRenderPass({
        colorAttachments: [
          {
            // view: <- to be filled out when we render
            clearValue: [0.3, 0.3, 0.3, 1],
            loadOp: 'clear',
            storeOp: 'store',
            view: swapView
          },
        ],
      });



      pass2.setPipeline(resources.debugQuadPipeline);
      pass2.setBindGroup(0, resources.debugQuadBindGroup);
      pass2.draw(3); // fullscreen triangle
      pass2.end();
    }
    // Encode commands to do the computation;

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    //return;

}