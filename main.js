import {THREE,GLTFLoader,FilesetResolver,HandLandmarker} from './vendor.js';
const canvas=document.querySelector('#scene'),app=document.querySelector('#app'),button=document.querySelector('#cameraButton'),buttonText=document.querySelector('#buttonText'),video=document.querySelector('#cameraVideo'),status=document.querySelector('#status'),statusText=document.querySelector('#statusText'),loading=document.querySelector('#loading'),toast=document.querySelector('#toast');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.1,40);camera.position.set(0,0,4.8);
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.35));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
scene.add(new THREE.HemisphereLight(0xffefeb,0x6a343c,2.06));const key=new THREE.DirectionalLight(0xffe5dc,3.3);key.position.set(-3,4,5);scene.add(key);const rim=new THREE.DirectionalLight(0xe4868b,2.08);rim.position.set(3,-2,-1);scene.add(rim);
const sculpture=new THREE.Group();scene.add(sculpture);let jewelry=null,ornaments=[],handTracker=null,stream=null,tracking=false,lastHand=null,lastHandTime=0,spread=0,spreadTarget=0,mousePoint=null,lastMouseTime=0,mouseMode=true;let filteredSpeed=0,trackFrame=0,lastDetection=0;const ornamentTarget=new THREE.Vector3();
function seeded(i){const x=Math.sin(i*127.1+19.7)*43758.5453;return x-Math.floor(x)}
function createOrnaments(){
 const orbitSpecs=[{rx:1.38,ry:.78,z:.02,tilt:[.72,-.18,.12]},{rx:1.25,ry:.92,z:-.1,tilt:[-.58,.3,-.34]},{rx:1.48,ry:.59,z:.08,tilt:[.24,.52,.4]}];
 const orbitGroup=new THREE.Group();sculpture.add(orbitGroup);
 orbitSpecs.forEach((spec,index)=>{const points=new THREE.EllipseCurve(0,0,spec.rx,spec.ry,0,Math.PI*2,false,0).getPoints(240).map(p=>new THREE.Vector3(p.x,p.y,0));const curve=new THREE.CatmullRomCurve3(points,true);const geometry=new THREE.TubeGeometry(curve,240,.0048,5,true);const line=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:index===1?0xfff6ee:0xf1e9e5,transparent:true,opacity:index===1?.72:.57,depthWrite:false}));line.position.z=spec.z;line.rotation.set(...spec.tilt);orbitGroup.add(line)});
 const dropletMaterials=[0xf3d3cf,0xeabfbd,0xffe7df].map(color=>new THREE.MeshPhysicalMaterial({color,metalness:0,roughness:.045,transmission:.76,thickness:.12,ior:1.33,clearcoat:.94,clearcoatRoughness:.025,emissive:0x10080a,emissiveIntensity:.12,transparent:true,opacity:.48,depthWrite:false,envMapIntensity:.95}));
 function makeDroplet(seed){const radial=18,height=24,positions=[],indices=[];const bend=(seeded(seed+77)-.5)*.06;for(let y=0;y<=height;y++){const v=y/height,theta=v*Math.PI,profile=Math.sin(theta)*(.78+.22*v),vertical=Math.cos(theta);for(let x=0;x<=radial;x++){const u=x/radial*Math.PI*2;positions.push(Math.cos(u)*profile+bend*(1-v)*v*3,vertical,Math.sin(u)*profile)}}for(let y=0;y<height;y++)for(let x=0;x<radial;x++){const a=y*(radial+1)+x,b=a+radial+1;indices.push(a,a+1,b,a+1,b+1,b)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g}
 const counts=[12,12,12];let seed=0;const frames=[];
 orbitSpecs.forEach((spec,orbit)=>{const frame=new THREE.Group();frame.position.z=spec.z;frame.rotation.set(...spec.tilt);sculpture.add(frame);frames.push(frame);for(let i=0;i<counts[orbit];i++){seed++;const angle=(i/counts[orbit])*Math.PI*2+(seeded(seed)*.45-.225),radialJitter=(seeded(seed+20)-.5)*.18,rx=spec.rx+radialJitter,ry=spec.ry+radialJitter*.72;const home=new THREE.Vector3(Math.cos(angle)*rx,Math.sin(angle)*ry,(seeded(seed+30)-.5)*.22);const mesh=new THREE.Mesh(makeDroplet(seed),dropletMaterials[seed%dropletMaterials.length]);mesh.position.copy(home);const scale=.018+seeded(seed+40)*.021;mesh.scale.set(scale*(.9+seeded(seed+50)*.3),scale*(.86+seeded(seed+60)*.35),scale*(.85+seeded(seed+70)*.3));mesh.rotation.set((seeded(seed+80)-.5)*.28,seeded(seed+90)*6,(seeded(seed+100)-.5)*.28);mesh.userData={kind:'droplet',home:home.clone(),phase:seeded(seed+110)*6.28,seed,scatter:new THREE.Vector3(seeded(seed+120)-.5,seeded(seed+130)-.5,seeded(seed+140)-.25).normalize(),angle,rx,ry,drift:seeded(seed+150)*.8+.6};frame.add(mesh);ornaments.push(mesh)}});
 const cycleReadings=['01','03','05','08','12','14','18','21','24','27','06','09','16','23','28','02','11','19','25'].map((value,index)=>({value,cycleDay:index+1,phase:['flow','rest','rise'][index%3]}));
 function makeDataTexture(value,color){const c=document.createElement('canvas');c.width=128;c.height=96;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.font='400 48px "Cutive Mono","Courier Prime","Courier New",serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='rgba(255,224,218,.28)';ctx.shadowBlur=5;ctx.fillStyle=color;ctx.fillText(value,64,48);ctx.shadowBlur=0;const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;return tex}
 cycleReadings.forEach((record,index)=>{const orbit=index%frames.length,frame=frames[orbit],spec=orbitSpecs[orbit],angle=(index/cycleReadings.length)*Math.PI*2+(seeded(index+800)*.36-.18),radialOffset=(seeded(index+820)-.5)*.2,rx=spec.rx+radialOffset,ry=spec.ry+radialOffset*.72,home=new THREE.Vector3(Math.cos(angle)*rx,Math.sin(angle)*ry,(seeded(index+840)-.5)*.3);const material=new THREE.SpriteMaterial({map:makeDataTexture(record.value,index%3===0?'#9d4b54':index%3===1?'#ad626a':'#a05b63'),transparent:true,opacity:.84+seeded(index+860)*.14,depthWrite:false});const sprite=new THREE.Sprite(material);sprite.position.copy(home);sprite.scale.set(.14,.1,1);sprite.userData={kind:'data',record,home:home.clone(),phase:seeded(index+880)*6.28,seed:index+900,scatter:new THREE.Vector3(seeded(index+920)-.5,seeded(index+930)-.5,seeded(index+940)-.25).normalize(),angle,rx,ry,drift:.5+seeded(index+950)*.5};frame.add(sprite);ornaments.push(sprite)});
}
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.z=w<700?5.4:4.8;camera.updateProjectionMatrix()};addEventListener('resize',resize);resize();document.fonts.load('400 42px "Cutive Mono"').catch(()=>[]).finally(createOrnaments);
async function loadModel(){try{const gltf=await new GLTFLoader().loadAsync('Untitled.glb');jewelry=gltf.scene;const bounds=new THREE.Box3().setFromObject(jewelry),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),max=Math.max(size.x,size.y,size.z)||1;jewelry.position.sub(center);jewelry.scale.setScalar(2.12/max);jewelry.traverse(o=>{if(o.isMesh){o.frustumCulled=true;const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>{if(m.isMeshStandardMaterial){m.emissive.add(new THREE.Color(0x10080a));m.emissiveIntensity=Math.max(m.emissiveIntensity,.12)}m.needsUpdate=true})}});sculpture.add(jewelry);loading.classList.add('hidden')}catch(e){loading.textContent='MODEL COULD NOT BE LOADED';console.error(e)}}
loadModel();
function smoothStep(dt,rate){return 1-Math.exp(-dt*rate)}
function updateOrnaments(t,dt){
 spread+=(spreadTarget-spread)*smoothStep(dt,3.5);
 for(const item of ornaments){
  const d=item.userData,h=d.home;
  // Scatter radially in each ornament's own tilted orbit frame.
  ornamentTarget.copy(h).multiplyScalar(1+spread*(.65+seeded(d.seed+3)*.45));
  ornamentTarget.z=h.z+spread*d.scatter.z*.28;
  item.position.lerp(ornamentTarget,smoothStep(dt,3.8));
  if(d.kind==='data')item.material.rotation=Math.sin(t*.00045+d.phase)*.08;
  else{item.rotation.x+=dt*(.035+seeded(d.seed+6)*.08);item.rotation.y+=dt*(.04+seeded(d.seed+9)*.1);item.rotation.z+=Math.sin(t*.00045+d.phase)*dt*.08}
 }
}
function useMotion(x,y,now,source){
 if(source==='mouse'&&stream)return;
 if(!lastHand||source!==lastHand.source||now-lastHandTime>250){lastHand={x,y,source};lastHandTime=now;filteredSpeed=0;spreadTarget=0;return}
 const dt=Math.max(.016,(now-lastHandTime)/1000),speed=Math.hypot(x-lastHand.x,y-lastHand.y)/dt;
 filteredSpeed+=(Math.min(speed,3)-filteredSpeed)*smoothStep(dt,12);
 spreadTarget=THREE.MathUtils.clamp((filteredSpeed-.12)*1.25,0,1.35);
 lastHand={x,y,source};lastHandTime=now;
 statusText.textContent=source==='hand'?(spreadTarget>.03?'HAND MOVEMENT DETECTED':'HAND STILL · GATHERING'):'MOUSE INTERACTION';
}
function onPointer(e){if(!stream)useMotion(e.clientX/innerWidth,e.clientY/innerHeight,performance.now(),'mouse')}
addEventListener('pointermove',onPointer);
let previousFrame=0;function animate(now){requestAnimationFrame(animate);const dt=previousFrame?Math.min(.05,(now-previousFrame)/1000):1/60;previousFrame=now;if(now-lastHandTime>320)spreadTarget=0;updateOrnaments(now,dt);if(jewelry){jewelry.rotation.y=(jewelry.rotation.y+dt*.075)%(Math.PI*2);jewelry.rotation.x=Math.sin(now*.00018)*.018}renderer.render(scene,camera);if(now-lastHandTime>1100&&!stream)statusText.textContent='SCULPTURE READY · MOUSE INTERACTION';if(now-lastHandTime>1100&&stream)statusText.textContent='CAMERA ON · MOVE YOUR HAND'}requestAnimationFrame(animate);
function showToast(message){toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3600)}
function cameraErrorMessage(e){if(e.name==='NotAllowedError'||e.name==='SecurityError')return'Camera permission is blocked. Allow camera access for this page, then try again.';if(e.name==='NotFoundError')return'No camera was found. Connect a camera or use mouse interaction.';if(e.name==='NotReadableError')return'The camera is busy in another app. Close other camera apps and retry.';if(e.name==='OverconstrainedError')return'This camera does not support the requested mode. Try another camera.';if(e.name==='NotSupportedError'||e.name==='TypeError')return'Camera access is unavailable here. Open the page on localhost or HTTPS in a browser with camera support.';return`Camera setup failed (${e.name||'unknown'}). Mouse interaction is available.`}
async function startCamera(){button.disabled=true;statusText.textContent='REQUESTING CAMERA PERMISSION';try{if(!navigator.mediaDevices?.getUserMedia){const e=new Error('Camera API unavailable');e.name='NotSupportedError';throw e}stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});video.srcObject=stream;await video.play();status.classList.add('on');statusText.textContent='LOADING HAND TRACKER';const vision=await FilesetResolver.forVisionTasks('./mediapipe-wasm');const options={baseOptions:{modelAssetPath:'hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.55,minTrackingConfidence:.5};try{handTracker=await HandLandmarker.createFromOptions(vision,options)}catch(gpuError){console.warn('GPU hand tracking unavailable; switching to CPU',gpuError);options.baseOptions.delegate='CPU';handTracker=await HandLandmarker.createFromOptions(vision,options)}lastHand=null;filteredSpeed=0;spreadTarget=0;trackHand.lastTime=-1;lastDetection=0;stream.getVideoTracks()[0].addEventListener('ended',()=>{stopCamera();showToast('Camera disconnected. Mouse interaction is available.')},{once:true});tracking=true;button.classList.add('active');buttonText.textContent='CAMERA ACTIVE · CLICK TO STOP';statusText.textContent='CAMERA ACTIVE · MOVE YOUR HAND';showToast('Move your hand to scatter the orbit; pause to let it gather.');trackHand()}catch(e){console.error(e);handTracker?.close();handTracker=null;lastHand=null;filteredSpeed=0;spreadTarget=0;tracking=false;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null}button.classList.remove('active');buttonText.textContent='ACTIVATE CAMERA';status.classList.remove('on');statusText.textContent='CAMERA UNAVAILABLE · MOUSE INTERACTION';showToast(cameraErrorMessage(e))}finally{button.disabled=false}}
function trackHand(now=performance.now()){
 if(!tracking||!stream)return;
 trackFrame=requestAnimationFrame(trackHand);
 // MediaPipe inference is synchronous: limit it to 20 Hz and skip hidden tabs.
 if(document.hidden||now-lastDetection<50||video.readyState<2||video.currentTime===trackHand.lastTime)return;
 lastDetection=now;trackHand.lastTime=video.currentTime;
 try{
  const hand=handTracker.detectForVideo(video,now).landmarks?.[0];
  if(hand){const ids=[0,5,9,13,17];let x=0,y=0;for(const i of ids){x+=hand[i].x;y+=hand[i].y}useMotion(1-x/ids.length,y/ids.length,now,'hand');status.classList.add('on')}
  else{spreadTarget=0;lastHand=null;filteredSpeed=0;statusText.textContent='NO HAND · GATHERING'}
 }catch(e){console.error(e);stopCamera();showToast('Hand tracking stopped. Retry the camera or use mouse interaction.')}
}
trackHand.lastTime=-1;
function stopCamera(){tracking=false;cancelAnimationFrame(trackFrame);filteredSpeed=0;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;handTracker?.close();handTracker=null;button.classList.remove('active');buttonText.textContent='ACTIVATE CAMERA';status.classList.remove('on');statusText.textContent='SCULPTURE READY · MOUSE INTERACTION';lastHand=null;spreadTarget=0}button.addEventListener('click',()=>stream?stopCamera():startCamera());addEventListener('beforeunload',stopCamera);

addEventListener('pagehide',stopCamera);
document.addEventListener('visibilitychange',()=>{lastHand=null;filteredSpeed=0;spreadTarget=0});
