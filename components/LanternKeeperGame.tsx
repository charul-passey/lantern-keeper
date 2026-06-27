"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const PLANET_RADIUS = 10;
const MAX_SPEED = 0.012;
const ACCELERATION = 0.1;
const DAMPING = 0.82;
const CAMERA_HEIGHT = 4.5;
const CAMERA_DISTANCE = 9;
const CAMERA_FOLLOW = 6;
const LANTERN_COUNT = 10;
const LIGHT_TRIGGER = 3.0;
const DIM_HOLD = 20000;
const DIM_DURATION = 9000;

interface Lantern {
  group: THREE.Group;
  light: THREE.PointLight;
  glowMesh: THREE.Mesh;
  dir: THREE.Vector3;
  brightness: number;
  lastLitAt: number;
  dimming: boolean;
}

const SEASONS = [
  { planet: 0x2d5a3d, sky: 0x08101a, label: "Spring" },
  { planet: 0x4a7c3f, sky: 0x0c1825, label: "Summer" },
  { planet: 0x7a4520, sky: 0x140800, label: "Autumn" },
  { planet: 0x5a7890, sky: 0x050d18, label: "Winter" },
];

function getTangentBasis(up: THREE.Vector3) {
  const ref = Math.abs(up.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const east = new THREE.Vector3().crossVectors(ref, up).normalize();
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  return { north, east };
}

export default function LanternKeeperGame() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SEASONS[0].sky);
    scene.fog = new THREE.FogExp2(SEASONS[0].sky, 0.011);

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 200);
    camera.position.set(0, 15, 15);

    scene.add(new THREE.AmbientLight(0x112244, 0.7));
    const moon = new THREE.DirectionalLight(0x7799cc, 0.5);
    moon.position.set(-15, 20, 5);
    scene.add(moon);

    // Planet
    const planetGeo = new THREE.IcosahedronGeometry(PLANET_RADIUS, 4);
    const posAttr = planetGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      v.multiplyScalar(1 + (Math.random() - 0.5) * 0.1);
      posAttr.setXYZ(i, v.x, v.y, v.z);
    }
    planetGeo.computeVertexNormals();
    const planetMat = new THREE.MeshPhongMaterial({ color: SEASONS[0].planet, flatShading: true });
    scene.add(new THREE.Mesh(planetGeo, planetMat));

    // Background stars
    const bgVerts: number[] = [];
    for (let i = 0; i < 800; i++) {
      const r = 80 + Math.random() * 20;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      bgVerts.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute("position", new THREE.Float32BufferAttribute(bgVerts, 3));
    scene.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22 })));

    // Player
    const playerGroup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.5, 6),
      new THREE.MeshPhongMaterial({ color: 0x3a2818, flatShading: true })
    );
    body.position.y = 0.25;
    const head = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2, 1),
      new THREE.MeshPhongMaterial({ color: 0xf0d5a0, flatShading: true })
    );
    head.position.y = 0.65;
    // Hand lantern
    const heldGroup = new THREE.Group();
    heldGroup.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.2, 5),
      new THREE.MeshPhongMaterial({ color: 0xc8a94a, flatShading: true, emissive: 0xffaa00, emissiveIntensity: 0.5 })
    ));
    heldGroup.position.set(0.3, 0.35, 0);
    const handLight = new THREE.PointLight(0xffaa44, 0.7, 4);
    heldGroup.add(handLight);
    playerGroup.add(body, head, heldGroup);
    scene.add(playerGroup);

    // Build lanterns
    function makeLantern(dir: THREE.Vector3): Lantern {
      const group = new THREE.Group();
      group.add(Object.assign(
        new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.0, 6),
          new THREE.MeshPhongMaterial({ color: 0x5a4a2a, flatShading: true })),
        { position: new THREE.Vector3(0, 0.5, 0) }
      ));
      const glowMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.32, 0.28),
        new THREE.MeshPhongMaterial({ color: 0xffdd88, flatShading: true, emissive: new THREE.Color(0xffaa00), emissiveIntensity: 0.9 })
      );
      glowMesh.position.y = 1.15;
      group.add(glowMesh);
      group.add(Object.assign(
        new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 4),
          new THREE.MeshPhongMaterial({ color: 0x6a5a3a, flatShading: true })),
        { position: new THREE.Vector3(0, 1.43, 0) }
      ));
      group.position.copy(dir.clone().multiplyScalar(PLANET_RADIUS + 0.05));
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scene.add(group);

      const light = new THREE.PointLight(0xffaa44, 2.2, 8);
      light.position.copy(dir.clone().multiplyScalar(PLANET_RADIUS + 1.2));
      scene.add(light);

      return { group, light, glowMesh, dir, brightness: 1, lastLitAt: performance.now() + Math.random() * DIM_HOLD, dimming: false };
    }

    const lanterns: Lantern[] = [];
    for (let i = 0; i < LANTERN_COUNT; i++) {
      lanterns.push(makeLantern(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()));
    }

    // UI
    mount.style.position = "relative";
    const statusEl = document.createElement("div");
    statusEl.style.cssText = `position:absolute;top:20px;left:50%;transform:translateX(-50%);color:#ffe082;font-family:sans-serif;font-size:17px;font-weight:600;text-shadow:0 0 12px #ff8800;letter-spacing:1px;pointer-events:none;text-align:center;`;
    mount.appendChild(statusEl);
    const hintEl = document.createElement("div");
    hintEl.style.cssText = `position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:rgba(255,240,180,0.45);font-family:sans-serif;font-size:13px;pointer-events:none;text-align:center;`;
    hintEl.textContent = "WASD to move · E to light nearby lantern";
    mount.appendChild(hintEl);
    const seasonEl = document.createElement("div");
    seasonEl.style.cssText = `position:absolute;top:20px;right:22px;color:rgba(255,220,150,0.7);font-family:sans-serif;font-size:14px;pointer-events:none;`;
    mount.appendChild(seasonEl);

    let seasonIdx = 0;
    function updateUI() {
      const lit = lanterns.filter(l => l.brightness > 0.5).length;
      statusEl.textContent = `${lit} / ${LANTERN_COUNT} lanterns lit`;
      seasonEl.textContent = SEASONS[seasonIdx].label;
    }

    function advanceSeason() {
      seasonIdx = (seasonIdx + 1) % SEASONS.length;
      const s = SEASONS[seasonIdx];
      (scene.background as THREE.Color).set(s.sky);
      (scene.fog as THREE.FogExp2).color.set(s.sky);
      planetMat.color.set(s.planet);
      const now = performance.now();
      for (const l of lanterns) { l.brightness = 1; l.lastLitAt = now + Math.random() * DIM_HOLD; l.dimming = false; }
    }

    // State
    let playerDir = new THREE.Vector3(0, 1, 0);
    let velocity = new THREE.Vector3();
    let facingAngle = 0;
    let cameraYaw = 0;
    const keys = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === "e") {
        const playerPos = playerDir.clone().multiplyScalar(PLANET_RADIUS);
        for (const l of lanterns) {
          if (l.brightness < 0.5) {
            const lPos = l.dir.clone().multiplyScalar(PLANET_RADIUS + 1);
            if (playerPos.distanceTo(lPos) < LIGHT_TRIGGER) {
              l.brightness = 1;
              l.lastLitAt = performance.now();
              l.dimming = false;
              const allLit = lanterns.every(ll => ll.brightness > 0.5);
              if (allLit) {
                statusEl.textContent = "All lanterns lit!";
                statusEl.style.color = "#fff";
                statusEl.style.textShadow = "0 0 20px #fff";
                setTimeout(() => { advanceSeason(); updateUI(); statusEl.style.color = "#ffe082"; statusEl.style.textShadow = "0 0 12px #ff8800"; }, 2800);
              }
              break;
            }
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

    let mouseDown = false, lastMX = 0;
    mount.addEventListener("mousedown", (e) => { mouseDown = true; lastMX = e.clientX; });
    window.addEventListener("mouseup", () => { mouseDown = false; });
    window.addEventListener("mousemove", (e) => { if (mouseDown) { cameraYaw += (e.clientX - lastMX) * 0.004; lastMX = e.clientX; } });
    mount.addEventListener("touchstart", (e) => { lastMX = e.touches[0].clientX; });
    mount.addEventListener("touchmove", (e) => { cameraYaw += (e.touches[0].clientX - lastMX) * 0.005; lastMX = e.touches[0].clientX; });

    const onResize = () => { camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth, mount.clientHeight); };
    window.addEventListener("resize", onResize);

    let lastTime = performance.now();
    let animId: number;

    function animate(now: number) {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      const tf = dt / 16.667;

      // Player movement
      const up = playerDir.clone();
      const { north, east } = getTangentBasis(up);
      const camFwd = north.clone().multiplyScalar(Math.cos(cameraYaw)).addScaledVector(east, Math.sin(cameraYaw));
      const camRight = north.clone().multiplyScalar(-Math.sin(cameraYaw)).addScaledVector(east, Math.cos(cameraYaw));

      const inputDir = new THREE.Vector3();
      if (keys.has("w") || keys.has("arrowup")) inputDir.addScaledVector(camFwd, 1);
      if (keys.has("s") || keys.has("arrowdown")) inputDir.addScaledVector(camFwd, -1);
      if (keys.has("a") || keys.has("arrowleft")) inputDir.addScaledVector(camRight, -1);
      if (keys.has("d") || keys.has("arrowright")) inputDir.addScaledVector(camRight, 1);
      const hasInput = inputDir.lengthSq() > 0.001;
      if (hasInput) inputDir.normalize();

      velocity.lerp(
        hasInput ? inputDir.clone().multiplyScalar(MAX_SPEED) : new THREE.Vector3(),
        hasInput ? ACCELERATION * tf : (1 - DAMPING) * tf * 3
      );
      const speed = velocity.length();
      playerDir.addScaledVector(velocity, tf);
      playerDir.normalize();
      const newUp = playerDir.clone();
      velocity.addScaledVector(newUp, -velocity.dot(newUp));

      if (speed > 0.0005) {
        const { north: n2, east: e2 } = getTangentBasis(playerDir);
        const vn = velocity.clone().normalize();
        const targetFacing = Math.atan2(vn.dot(e2), vn.dot(n2));
        const delta = ((targetFacing - facingAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        facingAngle += delta * Math.min(0.18 * tf, 1);
      }

      const playerPos = playerDir.clone().multiplyScalar(PLANET_RADIUS + 0.05);
      playerGroup.position.copy(playerPos);
      const baseQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), playerDir);
      const faceQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facingAngle);
      playerGroup.quaternion.copy(baseQ.multiply(faceQ));

      const bobAmt = speed > 0.0005 ? Math.sin(now * 0.014) * 0.07 : 0;
      body.position.y += (0.25 + bobAmt - body.position.y) * 0.25;
      head.position.y += (0.65 + bobAmt * 0.5 - head.position.y) * 0.25;

      // Camera
      const { north: cn, east: ce } = getTangentBasis(playerDir);
      const camBack = cn.clone().multiplyScalar(-Math.cos(cameraYaw)).addScaledVector(ce, -Math.sin(cameraYaw));
      const targetCamPos = playerPos.clone().addScaledVector(playerDir, CAMERA_HEIGHT).addScaledVector(camBack, CAMERA_DISTANCE);
      camera.position.lerp(targetCamPos, 1 - Math.exp(-CAMERA_FOLLOW * dt / 1000));
      camera.lookAt(playerPos.clone().addScaledVector(playerDir, 0.6));

      // Lanterns
      const pPos = playerDir.clone().multiplyScalar(PLANET_RADIUS);
      let nearDark = false;
      for (const l of lanterns) {
        const age = now - l.lastLitAt;
        if (!l.dimming && age > DIM_HOLD) l.dimming = true;
        if (l.dimming && l.brightness > 0) {
          l.brightness = Math.max(0, 1 - (age - DIM_HOLD) / DIM_DURATION);
        }
        l.light.intensity = l.brightness * 2.2;
        (l.glowMesh.material as THREE.MeshPhongMaterial).emissiveIntensity = l.brightness * 0.9;

        const lPos = l.dir.clone().multiplyScalar(PLANET_RADIUS + 1);
        if (l.brightness < 0.5 && pPos.distanceTo(lPos) < LIGHT_TRIGGER) nearDark = true;
      }

      hintEl.textContent = nearDark ? "Press E to light the lantern" : "WASD to move · E to light nearby lantern";
      updateUI();
      renderer.render(scene, camera);
    }

    updateUI();
    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (mount.contains(statusEl)) mount.removeChild(statusEl);
      if (mount.contains(hintEl)) mount.removeChild(hintEl);
      if (mount.contains(seasonEl)) mount.removeChild(seasonEl);
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
}
