import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

export function loadModels(grabbableGroup, nonGrabbableGroup, callback) {
  const photogrammetryLoader = new GLTFLoader();
  photogrammetryLoader.load("assets/models/hippo-textured2.glb", (gltf) => {
    const photogrammetryModel = gltf.scene;
    photogrammetryModel.scale.set(1, 1, 1);
    photogrammetryModel.position.set(22, 0.5, 13);
    photogrammetryModel.rotation.set(0, Math.PI / 2.7, 0);
    grabbableGroup.add(photogrammetryModel);
  });

  const barrelLoader = new GLTFLoader();
  barrelLoader.load("assets/models/barrel.glb", (gltf) => {
    const barrel = gltf.scene;
    barrel.scale.set(0.5, 0.5, 0.5);
    barrel.position.set(12, 0.35, -13);
    grabbableGroup.add(barrel);
  });

  const externalModelLoader = new GLTFLoader();
  externalModelLoader.load("assets/models/world.glb", (gltf) => {
    const externalModel = gltf.scene;
    externalModel.scale.set(1, 1, 1);
    externalModel.position.set(0, 0, 0);
    externalModel.userData.grabbable = false; // Ensure this line is present
    nonGrabbableGroup.add(externalModel);
  });

  externalModelLoader.load("assets/models/mud_hut.glb", (gltf) => {
    const mudHutModel = gltf.scene;
    mudHutModel.scale.set(0.25, 0.1, 0.25);
    mudHutModel.position.set(10, 0, -15);
    mudHutModel.rotation.set(0, Math.PI / 8, 0);
    grabbableGroup.add(mudHutModel);
  });

  const earthGeometry = new THREE.SphereGeometry(2, 64, 64);
  const earthMaterial = new THREE.MeshStandardMaterial({
    map: new THREE.TextureLoader().load("assets/textures/world.png"),
  });
  const earth = new THREE.Mesh(earthGeometry, earthMaterial);
  earth.position.set(-10, 15, 10);
  earth.scale.set(2, 2, 2);
  grabbableGroup.add(earth);
}
