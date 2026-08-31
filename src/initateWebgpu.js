export async function createPipeline(webgpuInfo,module) {
  try{

    const {
      device,
      context,
      presentationFormat
    } = webgpuInfo;

    const msaaTexture = device.createTexture({
  size: [context.canvas.width, context.canvas.height],
  sampleCount: 4,
  format: presentationFormat, // Match your canvas format
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
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

  const pipeline = device.createRenderPipeline({
    label: 'our hardcoded red triangle pipeline',
    layout: 'auto',
    vertex: {
      entryPoint: 'vs',
      module,
    },
    fragment: {
      entryPoint: 'fs',
      module,
      targets: [{ format: presentationFormat }],
    },
    depthStencil: {
      format: 'depth24plus', // Must match the texture format
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
  });





  const renderPassDescriptor = {
    label: 'our basic canvas renderPass',
    colorAttachments: [
      {
        // view: <- to be filled out when we render
        clearValue: [1.0, 160/255, 78/255, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],

    depthStencilAttachment: {
      view: depthTextureView,
      depthClearValue: 1.0, // Clear to the maximum depth value (farthest)
      depthLoadOp: 'clear',
      depthStoreOp: 'store', // Store the depth values for the next frame/pass
      // Stencil properties can be omitted if not used, or set similarly
    },
  };


  return { pipeline, renderPassDescriptor, depthTextureView,msaaTexture }

}catch(e) {
  alert("Error creating pipeline: " + e.message);
}
}

export async function initWebgpu() {
  if (!navigator.gpu)
    console.error("navigator.gpu not found")
if (!navigator.gpu.wgslLanguageFeatures.has("packed_4x8_integer_dot_product")) {
    throw new Error("Packed 4x8 integer functions are not supported by this GPU.");
}
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter)
    console.error("adapter not found")
  const device = await adapter.requestDevice();
  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('webgpu');
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
  });
  device.addEventListener('uncapturederror', (event) => {
    console.error('Uncaptured WebGPU error:', event.error.message);
  });
  return {device, context, presentationFormat }
}

export async function createModule(device) {
  const module = device.createShaderModule({
    label: 'our hardcoded red triangle shaders',
    code: /* wgsl */ `requires packed_4x8_integer_dot_product;
    struct Plane {
    normal: vec3<f32>,
    d: f32,
};
    struct OurStruct {
  view: mat4x4<f32>,
  projection: mat4x4<f32>,
  frustumPlanes: array<Plane, 6>,
  viewPrev: mat4x4<f32>,
  lightView: mat4x4<f32>,
  lightProjection: mat4x4<f32>
};

struct OtherStruct {
  pos: vec4<f32>,
  scale: vec4<f32>,
};

struct DrawIndirectArgs {
    vertexCount: u32,
    instanceCount: u32,
    firstVertex: u32,
    firstInstance: u32,
};



fn aabbOutsidePlane(min: vec3<f32>, max: vec3<f32>, plane: Plane) -> bool {
    // Select the most positive vertex relative to plane normal
    let p = vec3<f32>(
        select(min.x, max.x, plane.normal.x >= 0.0),
        select(min.y, max.y, plane.normal.y >= 0.0),
        select(min.z, max.z, plane.normal.z >= 0.0)
    );

    return dot(plane.normal, p) + plane.d < 0.0;
}

fn depthToViewZ(depth: f32, near: f32, far: f32) -> f32 {
    return (near * far) / (far - depth * (far - near));
}

fn isVisible(min: vec3<f32>, max: vec3<f32>) -> bool {
    for (var i = 0; i < 6; i++) {
        if (aabbOutsidePlane(min, max, ourStruct.frustumPlanes[i])) {
            return false;
        }
    }
    return true;
}

const pos = array(
      vec3f(1,0,1),vec3f(1,1,1),vec3f(0,1,1),
      vec3f(0,1,1),vec3f(0,0,1),vec3f(1,0,1),

      vec3f(0,0,1),vec3f(0,1,1),vec3f(0,1,0),
      vec3f(0,1,0),vec3f(0,0,0),vec3f(0,0,1),

      vec3f(0,1,0),vec3f(1,1,0),vec3f(1,0,0),
      vec3f(1,0,0),vec3f(0,0,0),vec3f(0,1,0),

      vec3f(1,1,0),vec3f(1,1,1),vec3f(1,0,1),
      vec3f(1,0,1),vec3f(1,0,0),vec3f(1,1,0),

      vec3f(0,1,1),vec3f(1,1,1),vec3f(1,1,0),
      vec3f(1,1,0),vec3f(0,1,0),vec3f(0,1,1),

      vec3f(1,0,0),vec3f(1,0,1),vec3f(0,0,1),
      vec3f(0,0,1),vec3f(0,0,0),vec3f(1,0,0)
    );

const UVS = array(
  vec2f(-1,1),vec2f(1,1),vec2f(1,-1),
  vec2f(1,-1),vec2f(-1,-1),vec2f(-1,1)


);

  const normals = array( vec3f(0,0,1), vec3f(-1,0,0), vec3f(0,0,-1), vec3f(1,0,0), vec3f(0,1,0), vec3f(0,-1,0) );


// Camera uniform, same for all shaders
@group(0) @binding(0) var<uniform> ourStruct: OurStruct;
@group(0) @binding(1) var<storage, read_write> otherStructsCompute: array<OtherStruct>;
@group(0) @binding(2) var<storage, read> quadDataRead: array<OtherStruct>;
@group(0) @binding(3) var<storage, read_write> quadDataLength: atomic<u32>;
@group(0) @binding(4) var<storage, read_write> drawArgs: DrawIndirectArgs;
@group(0) @binding(5) var depthTex : texture_depth_2d;
@group(0) @binding(6) var dstTexRead : texture_2d<f32>;
@group(0) @binding(6) var dstTex : texture_storage_2d<r32float, write>;
@group(0) @binding(7) var srcTex : texture_2d<f32>;
@group(0) @binding(8) var voxelTextures : texture_2d<f32>;
@group(0) @binding(9) var voxelTextureSampler : sampler;
@group(0) @binding(10) var shadowTex : texture_depth_2d;
@group(0) @binding(11) var renderTex : texture_2d<f32>;
@group(0) @binding(12) var lightingTex : texture_3d<f32>;
@group(0) @binding(13) var cellTex : texture_3d<f32>;
@group(0) @binding(14) var lightingTexWrite : texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(15) var blueNoiseTexture : texture_2d<f32>;
@group(0) @binding(16) var <storage, read_write> lightingBufferStore: array<u32>;
@group(0) @binding(17) var <storage, read> lightingBufferRead: array<u32>;

// =================== Compute shader ===================

@compute @workgroup_size(64)
fn computeMain(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    // Update positions in compute shader

    if (i >= arrayLength(&otherStructsCompute)) {
  return;
}


var seen = false;
if(true){
  //return;

let coord = vec2<i32>(0,0);
let depth = textureLoad(dstTexRead, coord, 0);

let instanceData = quadDataRead[i];
let view = ourStruct.viewPrev;
let pos = transpose(mat3x3<f32>(
    view[0].xyz,
    view[1].xyz,
    view[2].xyz
)) * -view[3].xyz;

let toCamera = normalize(pos - instanceData.pos.xyz);


seen = dot(normals[u32(round(instanceData.pos.w/6.0))], toCamera) > 0;

let center = instanceData.scale.xyz/2.0 + instanceData.pos.xyz;
let min = instanceData.pos.xyz;
let max = instanceData.pos.xyz + instanceData.scale.xyz;

//let min = center;
//let max = center;


if(seen){
seen = seen && isVisible(min,max);
  }

if(isVisible(min,max)){
//let id2 = atomicAdd(&quadDataLength,1);

  //otherStructsCompute[id2] = instanceData;
    }
    

    }

    
    if(seen){

      let vp = ourStruct.projection * ourStruct.viewPrev;
      
      var instanceData = quadDataRead[i];

      //instanceData.scale.w = 1.0;

  //let center = instanceData.scale.xyz/2.0 + instanceData.pos.xyz;
      let minp = instanceData.pos.xyz;
      let maxp = instanceData.pos.xyz + instanceData.scale.xyz;

      let corners = array<vec3<f32>, 8>(
    vec3(minp.x, minp.y, minp.z),
    vec3(maxp.x, minp.y, minp.z),
    vec3(minp.x, maxp.y, minp.z),
    vec3(maxp.x, maxp.y, minp.z),
    vec3(minp.x, minp.y, maxp.z),
    vec3(maxp.x, minp.y, maxp.z),
    vec3(minp.x, maxp.y, maxp.z),
    vec3(maxp.x, maxp.y, maxp.z)
);

      var min_ndc = vec2<f32>( 1e9,  1e9);
      var max_ndc = vec2<f32>(-1e9, -1e9);
      var min_depth = 1e9;

      for (var i = 0u; i < 8u; i++) {
        let clip = vp * vec4(corners[i], 1.0);

    // Skip or clamp if behind camera
    if (clip.w <= 0.0) {
        continue;
    }

    let ndc = clip.xyz / clip.w; // [-1, 1]
    
    min_depth = min(ndc.z,min_depth);
    min_ndc = min(min_ndc, ndc.xy);
    max_ndc = max(max_ndc, ndc.xy);
}



//min_depth -=0.00001;
let near = 0.1;
let far  = 500.0;
var linear_min_depth = depthToViewZ(min_depth, near, far);
linear_min_depth-=0.01;
min_depth = (far - (near * far)/linear_min_depth)/(far-near);
   
      var visible = false;
//visible = true;
      let dims = textureDimensions(dstTexRead, 0);
      let min_ndcT = ((min_ndc * vec2(1.0,-1.0) + vec2(1.0)) / 2.0) * vec2<f32>(dims);
      let max_ndcT = ((max_ndc * vec2(1.0,-1.0)+ vec2(1.0)) / 2.0) * vec2<f32>(dims);
      let center_ndc = (min_ndc + max_ndc)/2.0;

  let range = abs(floor(min_ndcT) - ceil(max_ndcT));

  let max_size = 8.0;

  let longest_side = max(range.x, range.y);
  let lod = clamp(floor(log2(longest_side / max_size)), 0.0, 10.0);
  let new_min_ndc = ((min_ndc * vec2(1.0,-1.0) + vec2(1.0)) / 2.0) * (vec2<f32>(dims)/pow(2.0, lod));
  let new_max_ndc = ((max_ndc * vec2(1.0,-1.0)+ vec2(1.0)) / 2.0) * (vec2<f32>(dims)/pow(2.0, lod));

  let area = abs(range.x*range.y)/
  (pow(2.0, lod)*pow(2.0, lod));
       
     if(abs(area)<1000.0){

      let lowerBound = floor(vec2(new_min_ndc.x,new_max_ndc.y));
       let upperBound = ceil(vec2(new_max_ndc.x,new_min_ndc.y)) + 1.0;

       if(upperBound.x>=f32(dims.x) - 0.5 || upperBound.y>=f32(dims.y) -0.5 || lowerBound.x<0.5 || lowerBound.y<0.5){
       
       visible = true;
       
       }

     

      for (var ix = lowerBound.x; ix < upperBound.x; ix+=1.0){
        for (var iy = lowerBound.y; iy < upperBound.y; iy+=1.0){
          
        let coord = vec2<u32>(u32(ix),u32(iy));

        

        var depth = textureLoad(dstTexRead, coord, u32(lod));

        if(coord.x>=dims.x || coord.y>=dims.y || coord.x<0 || coord.y<0){

          depth.x = 1.0;

        }
          
          if(min_depth<depth.x){
            //instanceData.scale.w = lod/6.0;
            //instanceData.scale.w = 0.0;
            visible = true;
            //return;
            //break;

          }
        
      }

      


      }

      }else{
        
        //instanceData.scale.w = f32(area>1000.0);
        visible = true;


      }
      
  
      if(visible){

        let id2 = atomicAdd(&quadDataLength,1);

        instanceData.scale.w = f32(i);

        otherStructsCompute[id2] = instanceData;


      }

      // do occlusion here

    }
    
}

// =================== Compute shader2 ===================

@compute @workgroup_size(1)
fn computeMain2() {
   
    let count = atomicLoad(&quadDataLength);

// Example: 6 vertices per quad
drawArgs.vertexCount = (count) * 6u;
drawArgs.instanceCount = 1u;
drawArgs.firstVertex = 0u;
drawArgs.firstInstance = 0u;
}

// =================== Vertex shader ===================
@group(0) @binding(1) var<storage, read> otherStructsVertex: array<OtherStruct>;

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) color: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) camDis: vec3<f32>,
    @location(4) lightSpacePos: vec4<f32>,
    @location(5) worldPos: vec3<f32>,
    @location(6) objectID: f32
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VSOut {

    


    let instanceData = otherStructsVertex[vertexIndex / 6u];

    var out: VSOut;

    out.position =
        ourStruct.projection *
        ourStruct.view *
        vec4f(
            pos[vertexIndex % 6 + u32(instanceData.pos.w)] *
            instanceData.scale.xyz +
            instanceData.pos.xyz,
            1.0
        );

        out.normal = normals[u32(instanceData.pos.w)/6];
        out.color = vec3(instanceData.scale.w);
        out.uv = UVS[vertexIndex % 6];

        //let testMat = mat4x4<f32>(0,1,0,0,0,0,1,0,1,0,0,0,-16,-16,-10,1);
        
        out.lightSpacePos =

       
        vec4f(
            pos[vertexIndex % 6 + u32(instanceData.pos.w)] *
            instanceData.scale.xyz +
            instanceData.pos.xyz,
            1.0
        );

        out.worldPos = vec4f(
            pos[vertexIndex % 6 + u32(instanceData.pos.w)] *
            instanceData.scale.xyz +
            instanceData.pos.xyz,
            1.0
        ).xyz; 

        
        let view = ourStruct.lightView;

        let pos = transpose(mat3x3<f32>(
    view[0].xyz,
    view[1].xyz,
    view[2].xyz
)) * -view[3].xyz;

        out.objectID = f32(instanceData.scale.w);


        out.color = instanceData.pos.xyz;
     
       
    return out;
}

fn linearizeDepth(depth: f32, near: f32, far: f32) -> f32 {
    return (near * far) / (far - depth * (far - near));
}

fn hash(p: vec3<f32>) -> f32 {
    let h = dot(p, vec3<f32>(127.1, 311.7, 74.7));
    return fract(sin(h) * 43758.5453);
}

fn hash3_fast(p: vec3<f32>) -> f32 {
    let p3 = fract(p * 0.1031);
    let p3a = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3a.x + p3a.y) * p3a.z);
}

fn rayIntersectsAABB(
    boxMin: vec3<f32>,
    boxMax: vec3<f32>,
    rayOrigin: vec3<f32>,
    rayDir: vec3<f32>
) -> bool {
    // Compute inverse direction (avoid division repeatedly)
    let invDir = 1.0 / rayDir;

    // Compute intersection distances for each axis
    let t1 = (boxMin - rayOrigin) * invDir;
    let t2 = (boxMax - rayOrigin) * invDir;

    // Find min and max distances per axis
    let tMin = min(t1, t2);
    let tMax = max(t1, t2);

    // Largest entry point
    let tEnter = max(max(tMin.x, tMin.y), tMin.z);

    // Smallest exit point
    let tExit = min(min(tMax.x, tMax.y), tMax.z);

    // Intersection occurs if:
    // 1. Exit is after entry
    // 2. Exit is in front of ray (optional depending on use case)
    return tExit >= tEnter;
}

fn intersectAABB(
    boxMin: vec3<f32>,
    boxMax: vec3<f32>,
    origin: vec3<f32>,
    direction: vec3<f32>
) -> vec4<f32> {
    let invDir = 1.0 / direction;

    let t0 = (boxMin - origin) * invDir;
    let t1 = (boxMax - origin) * invDir;

    let tmin = max(
        max(min(t0.x, t1.x), min(t0.y, t1.y)),
        min(t0.z, t1.z)
    );

    let tmax = min(
        min(max(t0.x, t1.x), max(t0.y, t1.y)),
        max(t0.z, t1.z)
    );

    // No intersection if tmax < 0 (box behind ray) or tmin > tmax (miss)
    if (tmax < 0.0 || tmin > tmax) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    // If inside the box, use exit point
    let tHit = select(tmax, tmin, tmin >= 0.0);

    let hitPoint = origin + tHit * direction;

    return vec4<f32>(hitPoint, 1.0);
}


@vertex
fn vs_main_fullscreen(@builtin(vertex_index) vertexIndex : u32)
    -> @builtin(position) vec4<f32> {

    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
        vec2<f32>(-1.0,  3.0)
    );

    return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
}

struct Ray {
    origin : vec3<f32>,
    direction : vec3<f32>,
};

struct DDA {
    // Current voxel cell
    voxel : vec3<i32>,

    // Step direction (-1 or +1)
    step : vec3<i32>,

    // Distance to next voxel boundary
    tMax : vec3<f32>,

    // Distance between voxel crossings
    tDelta : vec3<f32>,

    // Current traversal distance
    t : f32,

    // Optional: last stepped axis
    axis : u32,
};

fn ddaInit(ray : Ray) -> DDA {
    var dda : DDA;

    let dir = ray.direction;

    // Current voxel
    //dda.voxel = vec3<i32>(floor(ray.origin));

    let epsilon = 0.0001;

dda.voxel = vec3<i32>(floor(ray.origin));
    // Sign of ray direction
    dda.step = vec3<i32>(
        select(-1, 1, dir.x >= 0.0),
        select(-1, 1, dir.y >= 0.0),
        select(-1, 1, dir.z >= 0.0)
    );

    // Reciprocal direction
    // Very important for speed
    let invDir = 1.0 / dir;

    // Distance between crossings
    dda.tDelta = abs(invDir);

    // Next voxel boundary
    let nextBoundary = vec3<f32>(
        f32(dda.voxel.x + select(0, 1, dir.x >= 0.0)),
        f32(dda.voxel.y + select(0, 1, dir.y >= 0.0)),
        f32(dda.voxel.z + select(0, 1, dir.z >= 0.0))
    );

    // Distance to first boundary
    dda.tMax = (nextBoundary - ray.origin) * invDir;

    dda.t = 0.0;
    dda.axis = 0u;

    return dda;
}

fn ddaStep(dda : ptr<function, DDA>) {
    let mask = vec3<bool>(
        (*dda).tMax.x <= (*dda).tMax.y && (*dda).tMax.x <= (*dda).tMax.z,
        (*dda).tMax.y <  (*dda).tMax.x && (*dda).tMax.y <= (*dda).tMax.z,
        (*dda).tMax.z <  (*dda).tMax.x && (*dda).tMax.z <  (*dda).tMax.y
    );

    let stepMask = vec3<i32>(
        select(0, 1, mask.x),
        select(0, 1, mask.y),
        select(0, 1, mask.z)
    );

    let deltaMask = vec3<f32>(stepMask);

    // Advance voxel
    (*dda).voxel += stepMask * (*dda).step;

    // Advance ray distance
    (*dda).t =
        deltaMask.x * (*dda).tMax.x +
        deltaMask.y * (*dda).tMax.y +
        deltaMask.z * (*dda).tMax.z;

    // Advance boundary crossings
    (*dda).tMax += deltaMask * (*dda).tDelta;

    // Optional axis storage
    (*dda).axis = select(
        select(2u, 1u, mask.y),
        0u,
        mask.x
    );
}

fn ddaHitPosition(ray : Ray, dda : DDA) -> vec3<f32> {
    return ray.origin + ray.direction * dda.t;
}

fn ddaNormal(dda : DDA) -> vec3<f32> {
    switch(dda.axis) {
        case 0u: {
            return vec3<f32>(-f32(dda.step.x), 0.0, 0.0);
        }
        case 1u: {
            return vec3<f32>(0.0, -f32(dda.step.y), 0.0);
        }
        default: {
            return vec3<f32>(0.0, 0.0, -f32(dda.step.z));
        }
    }
}

fn isSolid(voxel: vec3<i32>) -> bool{

return textureLoad(cellTex,vec3<u32>(voxel),0).x > 0.01;
//return voxel.y==0 || (voxel.x%4+voxel.z%4==0 && voxel.y<=1);
//return voxel.x%8==0 && voxel.z%8==0 && voxel.y==0;
}

fn inverseMat4(m: mat4x4<f32>) -> mat4x4<f32> {
    let a00 = m[0][0]; let a01 = m[0][1];
    let a02 = m[0][2]; let a03 = m[0][3];

    let a10 = m[1][0]; let a11 = m[1][1];
    let a12 = m[1][2]; let a13 = m[1][3];

    let a20 = m[2][0]; let a21 = m[2][1];
    let a22 = m[2][2]; let a23 = m[2][3];

    let a30 = m[3][0]; let a31 = m[3][1];
    let a32 = m[3][2]; let a33 = m[3][3];

    let b00 = a00 * a11 - a01 * a10;
    let b01 = a00 * a12 - a02 * a10;
    let b02 = a00 * a13 - a03 * a10;
    let b03 = a01 * a12 - a02 * a11;
    let b04 = a01 * a13 - a03 * a11;
    let b05 = a02 * a13 - a03 * a12;
    let b06 = a20 * a31 - a21 * a30;
    let b07 = a20 * a32 - a22 * a30;
    let b08 = a20 * a33 - a23 * a30;
    let b09 = a21 * a32 - a22 * a31;
    let b10 = a21 * a33 - a23 * a31;
    let b11 = a22 * a33 - a23 * a32;

    let det =
        b00 * b11 - b01 * b10 + b02 * b09 +
        b03 * b08 - b04 * b07 + b05 * b06;

    // Optional safety check
    if (abs(det) < 1e-6) {
        return mat4x4<f32>();
    }

    let invDet = 1.0 / det;

    return mat4x4<f32>(
        vec4<f32>(
             a11 * b11 - a12 * b10 + a13 * b09,
            -a01 * b11 + a02 * b10 - a03 * b09,
             a31 * b05 - a32 * b04 + a33 * b03,
            -a21 * b05 + a22 * b04 - a23 * b03
        ) * invDet,

        vec4<f32>(
            -a10 * b11 + a12 * b08 - a13 * b07,
             a00 * b11 - a02 * b08 + a03 * b07,
            -a30 * b05 + a32 * b02 - a33 * b01,
             a20 * b05 - a22 * b02 + a23 * b01
        ) * invDet,

        vec4<f32>(
             a10 * b10 - a11 * b08 + a13 * b06,
            -a00 * b10 + a01 * b08 - a03 * b06,
             a30 * b04 - a31 * b02 + a33 * b00,
            -a20 * b04 + a21 * b02 - a23 * b00
        ) * invDet,

        vec4<f32>(
            -a10 * b09 + a11 * b07 - a12 * b06,
             a00 * b09 - a01 * b07 + a02 * b06,
            -a30 * b03 + a31 * b01 - a32 * b00,
             a20 * b03 - a21 * b01 + a22 * b00
        ) * invDet
    );
}

fn computeRay(uv: vec2<f32>,view: mat4x4<f32>,projection: mat4x4<f32>) -> Ray {


    let invView = inverseMat4(view);
    let invProj = inverseMat4(projection);
    // UV [0,1] -> NDC [-1,1]
    // Flip Y because texture UVs usually have Y-down
    let ndc = vec2<f32>(
        uv.x * 2.0 - 1.0,
        1.0 - uv.y * 2.0
    );

    // Near plane point in clip space
    let clipNear = vec4<f32>(ndc, 0.0, 1.0);

    // Far plane point in clip space
    let clipFar = vec4<f32>(ndc, 1.0, 1.0);

    // Back to view space
    var viewNear = invProj * clipNear;
    var viewFar  = invProj * clipFar;

    // Perspective divide
    viewNear /= viewNear.w;
    viewFar  /= viewFar.w;

    // To world space
    let worldNear = invView * viewNear;
    let worldFar  = invView * viewFar;

    let origin = worldNear.xyz;
    let direction = normalize(worldFar.xyz - worldNear.xyz);

    return Ray(origin, direction);
}

fn march(ray: Ray, dda: ptr<function, DDA>, steps: i32) -> vec4<f32>{

for(var i = 0; i < steps; i++) {

    let voxel = (*dda).voxel;

    if(isSolid(abs(voxel))) {
        let hitPos = ddaHitPosition(ray, *dda);
        return vec4(hitPos,1.0);
        break;
    }
    

      ddaStep(dda);

      
    }
      return vec4(0.0);

}

@fragment
fn fs_main_fullscreen(@builtin(position) fragCoord : vec4<f32>)
    -> @location(0) vec4<f32> {

    let coord = vec2<i32>(fragCoord.xy);

    var depth = (textureLoad(shadowTex, coord, 0));
     depth = pow(depth,20.0);

    let ray = computeRay(fragCoord.xy/1024.0, ourStruct.view,ourStruct.projection);
    var dda = ddaInit(ray);

    const MAX_STEPS = 30;

return vec4(1.0,0.0,0.0,1.0);
}


@compute @workgroup_size(8,8)
fn generateMipZero(@builtin(global_invocation_id) id : vec3<u32>) {
    let coord = vec2<i32>(id.xy);
    let size = textureDimensions(depthTex);
    let safeCoords = clamp(coord, vec2<i32>(0), vec2<i32>(size) - vec2<i32>(1));

    let depth = textureLoad(depthTex, coord,0);

    textureStore(dstTex, coord, vec4<f32>(depth, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn generateNextMip(@builtin(global_invocation_id) id : vec3<u32>) {
    let dstCoord = vec2<i32>(id.xy);
    let srcCoord = dstCoord * 2;
    

    let d0 = textureLoad(srcTex, srcCoord, 0).x;
    let d1 = textureLoad(srcTex, srcCoord + vec2<i32>(1, 0), 0).x;
    let d2 = textureLoad(srcTex, srcCoord + vec2<i32>(0, 1), 0).x;
    let d3 = textureLoad(srcTex, srcCoord + vec2<i32>(1, 1), 0).x;

    let maxDepth = max(max(d0, d1), max(d2, d3));

    textureStore(dstTex, dstCoord, vec4<f32>(maxDepth, 0.0, 0.0, 0.0));
}
    
@vertex
fn vs_light(@builtin(vertex_index) vertexIndex: u32) -> VSOut {

    let testMat = mat4x4<f32>(0,1,0,0,0,0,1,0,1,0,0,0,-16,-16,-10,1);


    let instanceData = otherStructsVertex[vertexIndex / 6u];

    var out: VSOut;

    out.position =
    ourStruct.lightProjection *
        ourStruct.lightView*
        
        (vec4f(
            pos[vertexIndex % 6 + u32(instanceData.pos.w)] *
            instanceData.scale.xyz +
            instanceData.pos.xyz,
            1.0
) + vec4(-0.0,-0.0,0.0,0.0));

        out.normal = normals[u32(instanceData.pos.w)/6];
        out.color = vec3(0.0,0.0,instanceData.scale.w);
        out.uv = UVS[vertexIndex % 6];

        let view = ourStruct.lightView;



        out.objectID = f32(instanceData.pos.w);
        out.worldPos = instanceData.pos.xyz;
     
       
    return out;
}

@fragment
fn fs_light(in: VSOut) -> @location(0) vec4f {
    //let dt = textureLoad(voxelTextures, vec2<u32>((in.uv+1.0)*0.5 * vec2f(textureDimensions(voxelTextures, 0))), 0);
  let pos = transpose(mat3x3<f32>(
    ourStruct.lightView[0].xyz,
    ourStruct.lightView[1].xyz,
    ourStruct.lightView[2].xyz
)) * -ourStruct.lightView[3].xyz;

  let forward = -normalize(vec3<f32>(
    ourStruct.lightView[0][2],
    ourStruct.lightView[1][2],
    ourStruct.lightView[2][2]
));

let lengthAlong = dot(forward, in.worldPos - pos);

    return vec4f(in.worldPos,lengthAlong);
}

fn rand(state: ptr<function, u32>) -> f32 {
    (*state) = (*state) * 747796405u + 2891336453u;

    let result = ((*state >> ((*state >> 28u) + 4u)) ^ (*state)) * 277803737u;

    return f32((result >> 22u) ^ result) / 4294967295.0;
}

fn cosineSampleHemisphere(
    u1: f32,
    u2: f32
) -> vec3<f32> {

    let r = sqrt(u1);
    let theta = 2.0 * 3.14159265 * u2;

    let x = r * cos(theta);
    let y = r * sin(theta);

    let z = sqrt(max(0.0, 1.0 - u1));

    return vec3<f32>(x, y, z);
}

fn orthonormalBasis(n: vec3<f32>) -> mat3x3<f32> {

    let up = select(
        vec3<f32>(0.0, 0.0, 1.0),
        vec3<f32>(1.0, 0.0, 0.0),
        abs(n.z) > 0.999
    );

    let tangent = normalize(cross(up, n));
    let bitangent = cross(n, tangent);

    return mat3x3<f32>(
        tangent,
        bitangent,
        n
    );
}

fn sampleDiffuseDirection(
    normal: vec3<f32>,
    rngState: ptr<function, u32>
) -> vec3<f32> {

    let u1 = rand(rngState);
    let u2 = rand(rngState);

    let localDir = cosineSampleHemisphere(u1, u2);

    let basis = orthonormalBasis(normal);

    return normalize(basis * localDir);
}

struct Material {
    albedo: vec3<f32>,
    emissive: vec3<f32>,
    roughness: f32,
    metallic: f32,
};

fn bounceDiffuse(
    ray: ptr<function, Ray>,
    hitPos: vec3<f32>,
    normal: vec3<f32>,
    material: Material,
    throughput: ptr<function, vec3<f32>>,
    rngState: ptr<function, u32>
) {

    let newDir = sampleDiffuseDirection(normal, rngState);

    (*ray).origin = hitPos + normal * 0.001;
    (*ray).direction = newDir;

    (*throughput) *= material.albedo;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {



    let coord = (in.uv+1.0)*0.5 * vec2f(textureDimensions(lightingTex, 0).xy);
    let c1 = vec2(floor(coord.x), floor(coord.y));
    let c2 = vec2(floor(coord.x) + 1.0, floor(coord.y));
    let c3 = vec2(floor(coord.x) + 1.0, floor(coord.y) + 1.0);
    let c4 = vec2(floor(coord.x), floor(coord.y) + 1.0);

    let rad1 = textureLoad(lightingTex,vec3<u32>(vec2<u32>(c1),u32(in.objectID)),0);
    let rad2 = textureLoad(lightingTex,vec3<u32>(vec2<u32>(c2),u32(in.objectID)),0);
    
    var x1 = in.uv.x;
    
    let intX1 = mix(rad1,rad2,in.uv.x);

    let rad3 = textureLoad(lightingTex,vec3<u32>(vec2<u32>(c4),u32(in.objectID)),0);
    let rad4 = textureLoad(lightingTex,vec3<u32>(vec2<u32>(c3),u32(in.objectID)),0);
    let intX2 = mix(rad3,rad4,in.uv.x);

    let intXY = mix(intX1,intX2,in.uv.y);

    //return vec4(te.xyz,1.0);
    

    //let b = coord[0];
    //return vec4f(textureLoad(lightingTex,vec3<u32>(vec2<u32>(coord),u32(in.objectID)),0));

    var light = vec4(0.0);
    var i = 0.0;
    for(var x = 0u; x<8u; x++){
      for(var y = 0u; y<8u; y++){


      
        let offset = vec2f(f32(x-2),f32(y-2));
        let coord2 = vec2<u32>(vec2<u32>(x,y));
        let texel = textureLoad(lightingTex,vec3<u32>(vec2<u32>(coord2),u32(in.objectID)),0);
        if(coord2.x>=0 && coord2.y>=0 && coord2.x<8 && coord2.y<8){
        i+=1.0;
        light += texel;
}
      }
}
    light /=64;
    
    
    //light = vec4(1.0);
    

    if(u32(in.objectID) > textureDimensions(lightingTex,0).z){
    
      //light = vec4(0.0);
    }
    
    var te = textureLoad(voxelTextures, vec2<u32>((in.uv+1.0)*0.5 * vec2f(textureDimensions(voxelTextures, 0))), 0);
    var lightTestx = lightingBufferRead[u32(in.objectID *3)];
    var lightTesty = lightingBufferRead[u32(in.objectID *3 + 1)];
    var lightTestz = lightingBufferRead[u32(in.objectID *3 + 2)];
    var lightTest = unpack4xU8(lightingBufferRead[u32(in.objectID)]);
    return vec4(vec3f(lightTest.xyz)/255.0,1.0);
    return vec4(f32(lightTestx)/256.0/64.0,f32(lightTesty)/256.0/64.0,f32(lightTestz)/256.0/64.0,1.0);
    //return vec4(te.xyz,1.0);
    return vec4(light.xyz,1.0);
    //return vec4(te.xyz,1.0);
    //let lightSpacePos = ourStruct.lightProjection * ourStruct.lightView * (floor(vec4(in.lightSpacePos)*32.0)/32.0);
    let lightSpacePos = ourStruct.lightProjection * ourStruct.lightView * (in.lightSpacePos*32.0)/32.0;


    
    //return vec4f(light.xyz,1.0);
    let projCoords = lightSpacePos.xyz / lightSpacePos.w;
    var uv = projCoords.xy * 0.5 + vec2(0.5);
    //let quantizedPos =(floor(vec3(in.lightSpacePos.xyz)*32.0)/32.0);
    let quantizedPos =(in.lightSpacePos.xyz*32.0)/32.0;
const lowest = 0.0;
uv.y = 1.0-uv.y;

let direction = normalize(vec3(16.0) - quantizedPos);
var ray = Ray(quantizedPos + in.normal * 0.01, direction );
var throughput = vec3(1.0);
var p = u32(hash(quantizedPos)*40961039.0);

var radiance = vec3(0.0);
    
//bounceDiffuse(
  //      &ray,
    //    covered.xyz,
      //  ddaNormal(dda),
      //  Material(vec3(0.5,0.5,0.5),vec3(0.0),0.2,0.1),
       // &brightness,
       // &rngState
    //);





var dda = ddaInit(ray);
var normal = in.normal;

for (var bounce = 0; bounce < 5; bounce++) {
    
    var rayOriginal = Ray(ray.origin, normalize(vec3(16.0) - ray.origin));
    var ddaOriginal = ddaInit(rayOriginal);
    let hitDirect = march(rayOriginal,&ddaOriginal,30);
if(hitDirect.w==0.0){

//return vec4(vec3(0.5,0.5,0.5)*throughput,1.0);
radiance += vec3(0.5,0.5,0.5)*throughput*dot(ray.direction,normal);
}


    if(bounce>0){
        normal = ddaNormal(dda);
    }
    

    bounceDiffuse(
        &ray,
        ray.origin,
       normal,
       Material(vec3(0.5,0.5,0.5),vec3(0.0),0.9,0.9),
       &throughput,
       &p
    );

dda = ddaInit(ray);

let hitBounce = march(ray, &dda, 30);

if(hitBounce.w==0.0){

    //return vec4(0.0,0.0,0.0,1.0);
    break;
}

ray.origin = hitBounce.xyz + ddaNormal(dda) * 0.01;



}


   
return vec4(vec3(radiance),1.0);


if(uv.x>1.0 || uv.x<0.0 || uv.y>1.0 || uv.y<0.0){

  return vec4( te.xyz * lowest,1.0);
}

let view = ourStruct.lightView;

        let pos = transpose(mat3x3<f32>(
    view[0].xyz,
    view[1].xyz,
    view[2].xyz
)) * -view[3].xyz;

let lightPos = vec3f(pos);
let currentDepth = projCoords.z;
let N = normalize(in.normal);
var L = normalize(lightPos - quantizedPos);
L = normalize(vec3<f32>(ourStruct.lightView[3].xyz));
var d = dot(N, -normalize(vec3(16,1,16) - vec3(20+16,20,16)));

//d = clamp(d,0.75,1.0);
//d = 1.0;

let texSize = vec2f(textureDimensions(shadowTex, 0));
let texelSize = 1.0 / texSize;

var innerKernel = 0.0;

let coord2 = floor(uv * texSize+0.5);
let dis = textureLoad(shadowTex, vec2u(coord2), 0);

  let forward = -normalize(vec3<f32>(
    ourStruct.lightView[0][2],
    ourStruct.lightView[1][2],
    ourStruct.lightView[2][2]
));

let selfDis = projCoords.z;



for(var x = -4; x<=4; x+=2){
for(var y =-4; y<=4; y+=2){



let coord = floor(uv * texSize+0.5) + vec2(f32(x),f32(y));

let distance = textureLoad(shadowTex, vec2u(coord), 0);
if(abs(selfDis) <0.001 + abs(distance)){

innerKernel+=1.0/25.0;
}




  }

}
innerKernel = f32(innerKernel > 0.0);

if (innerKernel==1.0){

return vec4(te.xyz,1.0);

}



if(d<0.0){

return vec4(te.xyz * mix(0.0,0.5,clamp((1.0-abs(d))*10.0,0.0,1.0)),1.0);

}


return vec4(te.xyz * mix(0.0,0.5,clamp(d,0.0,1.0)),1.0);




     }

     var<workgroup> sum_r : atomic<u32>;
var<workgroup> sum_g : atomic<u32>;
var<workgroup> sum_b : atomic<u32>;

@compute @workgroup_size(64) fn generateLightMap(@builtin(global_invocation_id) id: vec3<u32>){

let i = id.x;
    // Update positions in compute shader

    if (i >= 1000) {
  //return;
}

    //lightingBufferStore[i] = vec3(f32(i)/256.0,0.0,0.0);
    const origin = array(vec3f(0,0,1), vec3f(0,0,0), vec3f(0,0,0), vec3f(1,0,0),vec3f(0,1,0), vec3f(0,0,0));
    const right = array(vec3f(0,1,0),vec3f(0,1,0),vec3f(1,0,0),vec3f(0,0,1),vec3f(1,0,0),vec3f(0,0,1));
    const left = array(vec3f(1,0,0), vec3f(0,0,1), vec3f(0,1,0), vec3f(0,1,0), vec3f(0,0,1), vec3f(1,0,0));
//return;


let instanceData = otherStructsVertex[u32(i/64)];
var uv = vec2f(f32(u32(i % 64) % 8), f32(u32(u32(i % 64)/8)));
var quantizedPos = (origin[u32(instanceData.pos.w)/6] + right[u32(instanceData.pos.w)/6] * uv.x /8.0+ left[u32(instanceData.pos.w)/6] * uv.y/8.0)* instanceData.scale.xyz + instanceData.pos.xyz;
//quantizedPos = instanceData.pos.xyz + origin[u32(instanceData.pos.w)/6];

let point = instanceData.pos.xyz;
var normal = normals[u32(instanceData.pos.w)/6];


var throughput = vec3(1.0);
var p = u32(hash(quantizedPos)*40961039.0);


var radiance = vec3(0.0);
throughput = vec3(1.0);



for(var k = 0; k < 5; k++){



let direction = normalize(vec3(16.0) - quantizedPos);
var ray = Ray(quantizedPos + normal * 0.01, direction );
var dda = ddaInit(ray);


for (var bounce = 0; bounce < 5; bounce++) {
    
    var rayOriginal = Ray(ray.origin, normalize(vec3(16.0) - ray.origin));
    var ddaOriginal = ddaInit(rayOriginal);
    let hitDirect = march(rayOriginal,&ddaOriginal,30);
if(hitDirect.w==0.0){

//return vec4(vec3(0.5,0.5,0.5)*throughput,1.0);
radiance += vec3(0.5,0.5,0.5)*throughput*dot(ray.direction,normal);
}


    if(bounce>0){
        normal = ddaNormal(dda);
    }
    

    bounceDiffuse(
        &ray,
        ray.origin,
       normal,
       Material(vec3(0.5,0.5,0.5),vec3(0.0),0.1,0.2),
       &throughput,
       &p
    );

dda = ddaInit(ray);

let hitBounce = march(ray, &dda, 30);

if(hitBounce.w==0.0){

    radiance += vec3(1.0,160.0/255.0,78.0/255.0) * 0.1;
    //return vec4(0.0,0.0,0.0,1.0);
    break;
}

ray.origin = hitBounce.xyz + ddaNormal(dda) * 0.01;



}

  }



if(i32(i)%64==0){

    atomicStore(&sum_r, 0u);
    atomicStore(&sum_g, 0u);
    atomicStore(&sum_b, 0u);

}
workgroupBarrier();

atomicAdd(&sum_r, u32(radiance.x * 256.0));
atomicAdd(&sum_g, u32(radiance.y * 256.0));
atomicAdd(&sum_b, u32(radiance.z * 256.0));

workgroupBarrier();

if(i32(i)%64==0){

lightingBufferStore[i32(i/64)] = pack4xU8Clamp(vec4u(atomicLoad(&sum_r)/64, atomicLoad(&sum_g)/64, atomicLoad(&sum_b)/64, 0u));

}

textureStore(lightingTexWrite,vec3<i32>(i32(uv.x),i32(uv.y),i32(i/64)),vec4(vec3(radiance),1.0));

  


}


`,
  });
  return { module }
}