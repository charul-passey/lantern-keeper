"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const PLANET_RADIUS = 10;
const PLAYER_SPEED = 0.018;
const CAMERA_HEIGHT = 5;
const CAMERA_DISTANCE = 8;
const LANTERN_COUNT = 10;
const LIGHT_RADIUS = 1.4;
const DIM_INTERVAL = 18000; // ms before a lantern starts dimming
const DIM_DURATION = 8000;  // ms to go from bright to dark

interface Lantern {
  group: THREE.Group;
  light: THREE.PointLight;
  dir: THREE.Vector3; // unit vector position on sphere
  lit: boolean;
  brightness: number;
  lastLitAt: number;
}

const SEASONS = [
  { planetColor: 0x2d5a3d, skyColor: 0x0a0a1a, fogColor: 0x0a0a1a, label: "Spring" },
  { planetColor: 0x4a7c3f, skyColor: 0x0d1a2e, fogColor: 0x0d1a2e, label: "Summer" },
  { planetColor: 0x8b4a1a, skyColor: 0x1a0d00, fogColor: 0x1a0d00, label: "Autumn" },
  { planetColor: 0x6a8fa8, skyColor: 0x05111f, fogColor: 0x05111f, label: "Winter" },
];

export default function LanternKeeperGame() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    // --- Scene ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SEASONS[0].skyColor);
    scene.fog = new THREE.Fog(SEASONS[0].fogColor, 35, 80);

    // --- Camera ---
    const camera = new THREE.PerspectiveCamera(
      60,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200
    );

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0x223366, 0.6);
    scene.add(ambientLight);
    const moonLight = new THREE.DirectionalLight(0x8899cc, 0.4);
    moonLight.position.set(-15, 20, 5);
    scene.add(moonLight);

    // --- Planet ---
    const planetGeo = new THREE.IcosahedronGeometry(PLANET_RADIUS, 4);
    const posAttr = planetGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      v.multiplyScalar(1 + (Math.random() - 0.5) * 0.1);
      posAttr.setXYZ(i, v.x, v.y, v.z);
    }
    planetGeo.computeVertexNormals();
    const planetMat = new THREE.MeshPhongMaterial({ color: SEASONS[0].planetColor, flatShading: true });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    scene.add(planet);

    // Background stars
    const bgStarGeo = new THREE.BufferGeometry();
    const bgVerts: number[] = [];
    for (let i = 0; i < 600; i++) {
      const r = 80 + Math.random() * 20;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      bgVerts.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    bgStarGeo.setAttribute("position", new THREE.Float32BufferAttribute(bgVerts, 3));
    scene.add(new THREE.Points(bgStarGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 })));

    // --- Player ---
    const playerGroup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.5, 6),
      new THREE.MeshPhongMaterial({ color: 0x4a3728, flatShading: true })
    );
    body.position.y = 0.25;
    const head = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2, 1),
      new THREE.MeshPhongMaterial({ color: 0xf5deb3, flatShading: true })
    );
    head.position.y = 0.65;
    // Lantern held by player
    const heldLantern = new THREE.Group();
    const heldBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.22, 6),
      new THREE.MeshPhongMaterial({ color: 0xc8a94a, flatShading: true, emissive: 0xffaa00, emissiveIntensity: 0.3 })
    );
    heldLantern.add(heldBase);
    heldLantern.position.set(0.3, 0.4, 0);
    const playerLight = new THREE.PointLight(0xffaa44, 0.8, 5);
    heldLantern.add(playerLight);
    playerGroup.add(body, head, heldLantern);
    scene.add(playerGroup);

    // --- Build lanterns ---
    function makeLanternGroup(dir: THREE.Vector3): THREE.Group {
      const group = new THREE.Group();
      // Post
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 1.0, 6),
        new THREE.MeshPhongMaterial({ color: 0x5a4a2a, flatShading: true })
      );
      post.position.y = 0.5;
      // Lantern box
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.35, 0.3),
        new THREE.MeshPhongMaterial({ color: 0xffdd88, flatShading: true, emissive: 0xffaa00, emissiveIntensity: 0.6 })
      );
      box.position.y = 1.15;
      // Cap
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.2, 4),
        new THREE.MeshPhongMaterial({ color: 0x6a5a3a, flatShading: true })
      );
      cap.position.y = 1.45;
      group.add(post, box, cap);

      // Position on sphere
      group.position.copy(dir.clone().multiplyScalar(PLANET_RADIUS + 0.05));
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      return group;
    }

    const lanterns: Lantern[] = [];
    const now0 = performance.now();
    for (let i = 0; i < LANTERN_COUNT; i++) {
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      const group = makeLanternGroup(dir);
      scene.add(group);

      const light = new THREE.PointLight(0xffaa44, 2.0, 7);
      light.position.copy(dir.clone().multiplyScalar(PLANET_RADIUS + 1.2));
      scene.add(light);

      lanterns.push({
        group,
        light,
        dir,
        lit: true,
        brightness: 1,
        lastLitAt: now0 + Math.random() * DIM_INTERVAL,
      });
    }

    // --- UI ---
    mount.style.position = "relative";

    const statusEl = document.createElement("div");
    statusEl.style.cssText = `
      position:absolute;top:20px;left:50%;transform:translateX(-50%);
      color:#ffe082;font-family:sans-serif;font-size:17px;font-weight:600;
      text-shadow:0 0 12px #ff8800;letter-spacing:1px;pointer-events:none;
      text-align:center;
    `;
    mount.appendChild(statusEl);

    const hintEl = document.createElement("div");
    hintEl.style.cssText = `
      position:absolute;bottom:20px;left:50%;transform:translateX(-50%);
      color:rgba(255,255,200,0.5);font-family:sans-serif;font-size:13px;
      pointer-events:none;text-align:center;
    `;
    hintEl.textContent = "WASD to move · Press E near a dark lantern to light it";
    mount.appendChild(hintEl);

    const seasonEl = document.createElement("div");
    seasonEl.style.cssText = `
      position:absolute;top:20px;right:20px;
      color:rgba(255,220,150,0.8);font-family:sans-serif;font-size:14px;
      pointer-events:none;
    `;
    mount.appendChild(seasonEl);

    // --- State ---
    let playerDir = new THREE.Vector3(0, 1, 0);
    let cameraYaw = 0;
    const keys = new Set<string>();
    let seasonIdx = 0;
    let allLitMoment = 0;
    let celebrationTimeout: ReturnType<typeof setTimeout> | null = null;

    function updateStatus() {
      const litCount = lanterns.filter(l => l.brightness > 0.5).length;
      statusEl.textContent = `${litCount} / ${LANTERN_COUNT} lanterns lit`;
      seasonEl.textContent = SEASONS[seasonIdx].label;
    }

    function advanceSeason() {
      seasonIdx = (seasonIdx + 1) % SEASONS.length;
      const s = SEASONS[seasonIdx];
      (scene.background as THREE.Color).set(s.skyColor);
      scene.fog = new THREE.Fog(s.fogColor, 35, 80);
      planetMat.color.set(s.planetColor);
      // Reset all lanterns
      const now = performance.now();
      for (const l of lanterns) {
        l.lit = true;
        l.brightness = 1;
        l.lastLitAt = now + Math.random() * DIM_INTERVAL;
      }
    }

    // --- Input ---
    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === "e") {
        // Light nearest dark lantern within reach
        const playerPos = playerDir.clone().multiplyScalar(PLANET_RADIUS);
        for (const lantern of lanterns) {
          if (lantern.brightness < 0.5) {
            const lanternPos = lantern.dir.clone().multiplyScalar(PLANET_RADIUS + 1);
            if (playerPos.distanceTo(lanternPos) < LIGHT_RADIUS * 2.5) {
              lantern.lit = true;
              lantern.brightness = 1;
              lantern.lastLitAt = performance.now();
              // Check if all lit
              const allLit = lanterns.every(l => l.brightness > 0.5);
              if (allLit) {
                allLitMoment = performance.now();
                statusEl.textContent = "All lanterns lit! The planet glows!";
                statusEl.style.color = "#fff";
                if (celebrationTimeout) clearTimeout(celebrationTimeout);
                celebrationTimeout = setTimeout(() => {
                  advanceSeason();
                  updateStatus();
                  statusEl.style.color = "#ffe082";
                }, 3000);
              }
              break;
            }
          }
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let mouseDown = false;
    let lastMouseX = 0;
    mount.addEventListener("mousedown", (e) => { mouseDown = true; lastMouseX = e.clientX; });
    window.addEventListener("mouseup", () => { mouseDown = false; });
    window.addEventListener("mousemove", (e) => {
      if (mouseDown) { cameraYaw += (e.clientX - lastMouseX) * 0.005; lastMouseX = e.clientX; }
    });

    // Touch
    let lastTouchX = 0;
    mount.addEventListener("touchstart", (e) => { lastTouchX = e.touches[0].clientX; });
    mount.addEventListener("touchmove", (e) => {
      cameraYaw += (e.touches[0].clientX - lastTouchX) * 0.006;
      lastTouchX = e.touches[0].clientX;
    });

    // --- Helpers ---
    function getTangentBasis(up: THREE.Vector3) {
      const ref = Math.abs(up.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const east = new THREE.Vector3().crossVectors(ref, up).normalize();
      const north = new THREE.Vector3().crossVectors(up, east).normalize();
      return { north, east };
    }

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    updateStatus();

    // --- Game loop ---
    let lastTime = performance.now();
    let animId: number;

    function animate(now: number) {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;

      // Move player
      const up = playerDir.clone();
      const { north, east } = getTangentBasis(up);
      const camFwd = north.clone().multiplyScalar(Math.cos(cameraYaw)).addScaledVector(east, Math.sin(cameraYaw));
      const camRight = north.clone().multiplyScalar(-Math.sin(cameraYaw)).addScaledVector(east, Math.cos(cameraYaw));

      let moved = false;
      if (keys.has("w") || keys.has("arrowup")) { playerDir.addScaledVector(camFwd, PLAYER_SPEED); moved = true; }
      if (keys.has("s") || keys.has("arrowdown")) { playerDir.addScaledVector(camFwd, -PLAYER_SPEED); moved = true; }
      if (keys.has("a") || keys.has("arrowleft")) { playerDir.addScaledVector(camRight, -PLAYER_SPEED); moved = true; }
      if (keys.has("d") || keys.has("arrowright")) { playerDir.addScaledVector(camRight, PLAYER_SPEED); moved = true; }
      playerDir.normalize();

      const playerPos = playerDir.clone().multiplyScalar(PLANET_RADIUS + 0.05);
      playerGroup.position.copy(playerPos);
      playerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), playerDir);
      if (moved) body.position.y = 0.25 + Math.sin(now * 0.02) * 0.04;

      // Camera
      const { north: n2, east: e2 } = getTangentBasis(playerDir);
      const camBack = n2.clone().multiplyScalar(-Math.cos(cameraYaw)).addScaledVector(e2, -Math.sin(cameraYaw));
      const camPos = playerPos.clone()
        .addScaledVector(playerDir, CAMERA_HEIGHT)
        .addScaledVector(camBack, CAMERA_DISTANCE);
      camera.position.lerp(camPos, 0.08);
      camera.lookAt(playerPos);

      // Update lanterns
      const playerWorldPos = playerDir.clone().multiplyScalar(PLANET_RADIUS);
      let nearbyDark = false;

      for (const lantern of lanterns) {
        if (lantern.lit && lantern.brightness >= 1) {
          const age = now - lantern.lastLitAt;
          if (age > DIM_INTERVAL) {
            lantern.lit = false;
          }
        }
        if (!lantern.lit) {
          lantern.brightness = Math.max(0, lantern.brightness - dt / DIM_DURATION);
        } else {
          lantern.brightness = Math.min(1, lantern.brightness + dt / 500);
        }

        // Update light intensity
        lantern.light.intensity = lantern.brightness * 2.0;
        const box = lantern.group.children[1] as THREE.Mesh;
        if (box && box.material) {
          (box.material as THREE.MeshPhongMaterial).emissiveIntensity = lantern.brightness * 0.8;
        }

        // Check if player is near a dark lantern
        const lanternPos = lantern.dir.clone().multiplyScalar(PLANET_RADIUS + 1);
        if (lantern.brightness < 0.5 && playerWorldPos.distanceTo(lanternPos) < LIGHT_RADIUS * 2.5) {
          nearbyDark = true;
        }
      }

      hintEl.textContent = nearbyDark
        ? "Press E to light the lantern"
        : "WASD to move · Press E near a dark lantern to light it";

      updateStatus();
      renderer.render(scene, camera);
    }

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      if (celebrationTimeout) clearTimeout(celebrationTimeout);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
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
