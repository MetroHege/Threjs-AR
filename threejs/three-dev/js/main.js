import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadModels } from "./models.js";
import { setupEnvironment } from "./environment.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  color,
  fog,
  float,
  positionWorld,
  triNoise3D,
  positionView,
  normalWorld,
  uniform,
} from "three/tsl";

let camera, scene, renderer;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let raycaster, heightRaycaster;
const intersected = [];
const tempMatrix = new THREE.Matrix4();
let grabbableGroup, nonGrabbableGroup;
let marker, floor, baseReferenceSpace;
let INTERSECTION;
let rotatingObject = null;

const fogParams = {
  fogDensity: 20,
  fogAlpha: 0.98,
};

init();

function init() {
  // Initialize the scene
  scene = new THREE.Scene();

  // Initialize the camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  // Initialize the renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // VR Button
  document.body.appendChild(VRButton.createButton(renderer));
  renderer.xr.enabled = true;

  // Enable shadow map for renderer
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Add Axis Helper
  const axesHelper = new THREE.AxesHelper(20);
  scene.add(axesHelper);

  // Create groups for grabbable and non-grabbable objects
  grabbableGroup = new THREE.Group();
  grabbableGroup.name = "Grabbable-Group";
  grabbableGroup.userData.grabbable = true;
  scene.add(grabbableGroup);

  nonGrabbableGroup = new THREE.Group();
  nonGrabbableGroup.name = "Non-Grabbable-Group";
  nonGrabbableGroup.userData.grabbable = false;
  scene.add(nonGrabbableGroup);

  // Load models
  loadModels(grabbableGroup, nonGrabbableGroup);

  // Set up environment (sky, lighting) with renderer passed as a parameter
  setupEnvironment(scene, renderer);

  // Add controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.update();

  // Set camera position and orientation
  camera.position.set(25, 10, 15);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  // Initialize VR controllers
  initVR();

  // Set animation loop
  renderer.setAnimationLoop(function () {
    cleanIntersected();
    intersectObjects(controller1);
    intersectObjects(controller2);
    updateTeleportation();
    controls.update();
    renderer.render(scene, camera);
    if (rotatingObject) {
      rotatingObject.rotation.y += 0.01; // Adjust rotation speed as needed
    }
  });

  // Custom fog
  updateFog();
}

function updateFog() {
  const skyColor = color(0xf0f5f5);
  const groundColor = color(0xd0dee7);

  const fogNoiseDistance = positionView.z
    .negate()
    .smoothstep(0, camera.far - 300);

  const distance = fogNoiseDistance.mul(fogParams.fogDensity).max(4);
  const alpha = fogParams.fogAlpha;
  const groundFogArea = float(distance)
    .sub(positionWorld.y)
    .div(distance)
    .pow(3)
    .saturate()
    .mul(alpha);

  const timer = uniform(0).onFrameUpdate((frame) => frame.time);

  const fogNoiseA = triNoise3D(positionWorld.mul(0.005), 0.2, timer);
  const fogNoiseB = triNoise3D(positionWorld.mul(0.01), 0.2, timer.mul(1.2));

  const fogNoise = fogNoiseA.add(fogNoiseB).mul(groundColor);

  scene.fogNode = fog(
    fogNoiseDistance.oneMinus().mix(groundColor, fogNoise),
    groundFogArea
  );
  scene.backgroundNode = normalWorld.y.max(0).mix(groundColor, skyColor);
}

// Handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function initVR() {
  // Controllers
  controller1 = renderer.xr.getController(0);
  controller1.addEventListener("selectstart", onSelectStart);
  controller1.addEventListener("selectend", onSelectEnd);
  controller1.addEventListener("squeezestart", onTeleportStart);
  controller1.addEventListener("squeezeend", onTeleportEnd);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener("selectstart", onRightSelectStart);
  controller2.addEventListener("selectend", onRightSelectEnd);
  controller2.addEventListener("squeezestart", onRightSqueezeStart);
  controller2.addEventListener("squeezeend", onRightSqueezeEnd);
  scene.add(controller2);

  const controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(
    controllerModelFactory.createControllerModel(controllerGrip2)
  );
  scene.add(controllerGrip2);

  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const line = new THREE.Line(geometry);
  line.name = "line";
  line.scale.z = 5;

  controller1.add(line.clone());
  controller2.add(line.clone());

  raycaster = new THREE.Raycaster();
  heightRaycaster = new THREE.Raycaster();

  // Load and add custom model to controllerGrip1 (left controller)
  const basePath = "assets/models/"; // Adjust the base path as needed
  const loader = new GLTFLoader().setPath(basePath);
  loader.load("gundy.glb", function (gltf) {
    const gundyModel = gltf.scene;
    gundyModel.scale.set(0.0005, 0.0005, 0.0005); // Adjust the scale as needed
    gundyModel.rotation.y = THREE.MathUtils.degToRad(180);
    gundyModel.rotation.x = THREE.MathUtils.degToRad(-36.5);
    gundyModel.position.set(0, 0.01, 0);
    controllerGrip1.add(gundyModel);
  });

  // Initialize teleportation marker and floor
  marker = new THREE.Mesh(
    new THREE.CircleGeometry(0.25, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xbcbcbc })
  );
  scene.add(marker);

  floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50, 2, 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xbcbcbc,
      transparent: true,
      opacity: 0,
    })
  );
  scene.add(floor);

  renderer.xr.addEventListener(
    "sessionstart",
    () => (baseReferenceSpace = renderer.xr.getReferenceSpace())
  );
}

function onSelectStart(event) {
  console.log("Select start on left controller");
  const controller = event.target;
  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    const intersection = intersections[0];
    const object = intersection.object;
    object.material.emissive.b = 1;
    object.material.transparent = true;
    object.material.opacity = 0.5; // Set opacity to 50%
    controller.attach(object);
    controller.userData.selected = object;
    console.log("Object selected:", object);
  } else {
    console.log("No intersections found");
  }

  controller.userData.targetRayMode = event.data.targetRayMode;
}

function onSelectEnd(event) {
  console.log("Select end on left controller");
  const controller = event.target;

  if (controller.userData.selected !== undefined) {
    const object = controller.userData.selected;
    object.material.emissive.b = 0;
    object.material.opacity = 1; // Reset opacity to 100%
    grabbableGroup.attach(object);
    controller.userData.selected = undefined;
    console.log("Object released:", object);
  }
}

function onTeleportStart(event) {
  console.log("Squeeze start on left controller (teleport)");
  this.userData.isSelecting = true;
}

function onTeleportEnd(event) {
  console.log("Squeeze end on left controller (teleport)");
  this.userData.isSelecting = false;

  if (INTERSECTION) {
    // Use heightRaycaster to find the highest point at the teleportation location
    heightRaycaster.set(
      new THREE.Vector3(INTERSECTION.x, 100, INTERSECTION.z),
      new THREE.Vector3(0, -1, 0)
    );
    const heightIntersections = heightRaycaster.intersectObjects(
      scene.children,
      true
    );

    if (heightIntersections.length > 0) {
      const highestPoint = heightIntersections[0].point;
      const offsetPosition = {
        x: -highestPoint.x,
        y: -highestPoint.y,
        z: -highestPoint.z,
        w: 1,
      };
      const offsetRotation = new THREE.Quaternion();
      const transform = new XRRigidTransform(offsetPosition, offsetRotation);
      const teleportSpaceOffset =
        baseReferenceSpace.getOffsetReferenceSpace(transform);

      renderer.xr.setReferenceSpace(teleportSpaceOffset);
    }
  }
}

const forceScale = 2; // Adjust this value to scale the push/pull force

function onRightSelectStart(event) {
  console.log("Select start on right controller (push)");
  const controller = event.target;
  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    const intersection = intersections[0];
    const object = intersection.object;
    object.material.emissive.b = 1;
    controller.userData.selected = object;
    rotatingObject = object; // Start rotating the object
    console.log("Object selected for push:", object);
  } else {
    console.log("No intersections found");
  }

  controller.userData.targetRayMode = event.data.targetRayMode;
}

function onRightSelectEnd(event) {
  console.log("Select end on right controller (push)");
  const controller = event.target;

  if (controller.userData.selected !== undefined) {
    const object = controller.userData.selected;
    object.material.emissive.b = 0;
    const pushVector = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(controller.quaternion)
      .multiplyScalar(forceScale);
    object.position.add(pushVector); // Push away
    controller.userData.selected = undefined;
    rotatingObject = null; // Stop rotating the object
    console.log("Object pushed:", object);
  }
}

function onRightSqueezeStart(event) {
  console.log("Squeeze start on right controller (pull)");
  const controller = event.target;
  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    const intersection = intersections[0];
    const object = intersection.object;
    object.material.emissive.b = 1;
    controller.userData.selected = object;
    console.log("Object selected for pull:", object);
  } else {
    console.log("No intersections found");
  }

  controller.userData.targetRayMode = event.data.targetRayMode;
}

function onRightSqueezeEnd(event) {
  console.log("Squeeze end on right controller (pull)");
  const controller = event.target;

  if (controller.userData.selected !== undefined) {
    const object = controller.userData.selected;
    object.material.emissive.b = 0;
    const pullVector = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(controller.quaternion)
      .multiplyScalar(forceScale);
    object.position.add(pullVector); // Pull towards
    controller.userData.selected = undefined;
    console.log("Object pulled:", object);
  }
}

function getIntersections(controller) {
  // Update the raycaster to use the controller's position and direction
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller.matrixWorld);

  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const intersections = raycaster.intersectObjects(
    grabbableGroup.children,
    true
  );

  return intersections;
}

function intersectObjects(controller) {
  if (controller.userData.targetRayMode === "screen") return;
  if (controller.userData.selected !== undefined) return;

  const line = controller.getObjectByName("line");
  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    const intersection = intersections[0];
    const object = intersection.object;
    object.material.emissive.r = 1;
    intersected.push(object);
    line.scale.z = intersection.distance;
  } else {
    line.scale.z = 5;
  }
}

function cleanIntersected() {
  while (intersected.length) {
    const object = intersected.pop();
    object.material.emissive.r = 0;
  }
}

function updateTeleportation() {
  INTERSECTION = undefined;

  if (controller1.userData.isSelecting === true) {
    tempMatrix.identity().extractRotation(controller1.matrixWorld);

    raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const intersects = raycaster.intersectObjects([floor]);

    if (intersects.length > 0) {
      INTERSECTION = intersects[0].point;
    }
  }

  if (INTERSECTION) marker.position.copy(INTERSECTION);

  marker.visible = INTERSECTION !== undefined;
}
