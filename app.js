import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const $ = (id) => document.getElementById(id);
const form = $("stair-form");
const viewer = $("viewer");
const caption = $("caption");

const PARTS = {
  floorHeight: {
    keys: ["height", "floor1", "floor2"],
    caption: "Tinggi dari lantai 1 ke lantai 2"
  },
  openingLength: {
    keys: ["opening"],
    caption: "Panjang lubang tangga di lantai 2"
  },
  stairWidth: {
    keys: ["width", "step"],
    caption: "Lebar badan tangga (samping ke samping)"
  },
  treadDepth: {
    keys: ["tread"],
    caption: "Kedalaman satu pijakan — maju kaki, bukan lebar tangga"
  },
  turnAngle: {
    keys: ["landing", "run2"],
    caption: "Bentuk belok: L menyamping, U balik arah"
  },
  turnDir: {
    keys: ["landing", "run2"],
    caption: "Arah belok dari sudut pandang orang yang naik"
  },
  turnStep: {
    keys: ["landing", "run1"],
    caption: "Bordes jadi anak tangga nomor ini, lalu belok"
  }
};

let activePart = null;
let framed = false;
let userMoved = false;
let focusBox = null;
let viewSign = 1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd4f1ee);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(6.5, 5.2, 7.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewer.append(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.style.position = "absolute";
labels.domElement.style.inset = "0";
labels.domElement.style.pointerEvents = "none";
viewer.append(labels.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6268, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(5, 8, 6);
sun.castShadow = true;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 24),
  new THREE.MeshStandardMaterial({ color: 0xefece3, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(24, 24, 0x111827, 0x8aa8a6);
grid.position.y = 0.002;
grid.material.transparent = true;
grid.material.opacity = 0.22;
scene.add(grid);

let model = new THREE.Group();
scene.add(model);

const format = (value, digits = 1) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(value);

function readInputs() {
  return {
    height: Number($("floorHeight").value),
    opening: Number($("openingLength").value),
    width: Number($("stairWidth").value),
    tread: Number($("treadDepth").value),
    angle: Number($("turnAngle").value),
    dir: Number($("turnDir").value),
    turnAt: Number($("turnStep").value)
  };
}

function calculate(data) {
  let best = null;
  const idealRises = Math.round(data.height / 17.5);

  for (let rises = Math.max(2, idealRises - 4); rises <= idealRises + 4; rises++) {
    const riser = data.height / rises;
    const blondel = 2 * riser + data.tread;
    const score =
      Math.abs(riser - 17.5) * 2 +
      Math.abs(blondel - 63) +
      (riser < 15 || riser > 19 ? 30 : 0);
    if (!best || score < best.score) best = { rises, riser, blondel, score };
  }

  const treadCount = best.rises - 1;
  const turnAt = Math.max(2, Math.min(Math.round(data.turnAt), Math.max(2, treadCount - 1)));
  const beforeTurn = turnAt - 1;
  const afterTurn = Math.max(1, treadCount - turnAt);
  const firstRun = beforeTurn * data.tread;
  const secondRun = afterTurn * data.tread;
  const landingDepth = data.width;
  const requiredOpening =
    data.angle === 90
      ? Math.max(firstRun + landingDepth, secondRun + landingDepth)
      : Math.max(firstRun, secondRun) + landingDepth;
  const footprintWidth =
    data.angle === 90
      ? Math.max(data.width, secondRun)
      : data.width * 2 + 15;
  const pitch = Math.atan(best.riser / data.tread) * 180 / Math.PI;

  return {
    ...data,
    ...best,
    treadCount,
    turnAt,
    beforeTurn,
    afterTurn,
    firstRun,
    secondRun,
    landingDepth,
    requiredOpening,
    footprintWidth,
    pitch
  };
}

function assess(r) {
  const fails = [];
  const add = (ok, msg) => { if (!ok) fails.push(msg); };

  add(r.riser >= 15 && r.riser <= 19, `Tinggi anak ${format(r.riser)} cm (ideal 15–19)`);
  add(r.tread >= 25 && r.tread <= 30, `Pijakan ${format(r.tread)} cm (ideal 25–30)`);
  add(r.blondel >= 60 && r.blondel <= 65, `2T+L ${format(r.blondel)} cm (ideal 60–65)`);
  add(r.pitch >= 30 && r.pitch <= 40, `Kemiringan ${format(r.pitch, 0)}° (ideal 30–40)`);
  add(r.width >= 90, `Lebar ${format(r.width, 0)} cm, usahakan ≥ 90`);
  add(r.requiredOpening <= r.opening, `Butuh lubang ${format(r.requiredOpening, 0)} cm, lubang sekarang ${format(r.opening, 0)}`);
  return fails;
}

function updateText(r) {
  const fails = assess(r);
  $("riseCount").textContent = r.treadCount;
  $("riserHeight").textContent = `${format(r.riser)} cm`;
  $("treadResult").textContent = `${format(r.tread)} cm`;
  $("pitch").textContent = `${format(r.pitch, 0)}°`;
  $("blondel").textContent = `${format(r.blondel)} cm`;
  $("requiredOpening").textContent = `${format(r.requiredOpening, 0)} cm`;

  const verdict = $("verdict");
  verdict.className = "verdict";
  if (!fails.length) {
    verdict.textContent = "Ideal";
    $("checks").innerHTML = "";
  } else if (fails.length <= 2) {
    verdict.textContent = "Cek";
    verdict.classList.add("warn");
    $("checks").innerHTML = fails.map((item) => `<li>${item}</li>`).join("");
  } else {
    verdict.textContent = "Belum";
    verdict.classList.add("bad");
    $("checks").innerHTML = fails.map((item) => `<li>${item}</li>`).join("");
  }
}

function tag(object, keys) {
  object.userData.parts = keys;
  object.traverse((child) => { child.userData.parts = keys; });
  return object;
}

function addLabel(text, x, y, z, keys, className = "label3d") {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  const label = new CSS2DObject(el);
  label.position.set(x, y, z);
  tag(label, keys);
  model.add(label);
}

function makeBox(w, h, d, color, x, y, z, keys) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: true })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x111827, transparent: true })
  ));
  tag(mesh, keys);
  model.add(mesh);
  return mesh;
}

function dimLine(from, to, keys) {
  const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0x111827, transparent: true }));
  tag(line, keys);
  model.add(line);
}

function buildModel(r) {
  scene.remove(model);
  model.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      mats.forEach((mat) => mat.dispose?.());
    }
    if (object.element?.remove) object.element.remove();
  });
  model = new THREE.Group();
  scene.add(model);

  const s = 1 / 100;
  const w = r.width * s;
  const tread = r.tread * s;
  const rise = r.riser * s;
  const H = r.height * s;
  const gap = 0.15;

  const openingL = r.opening * s;
  const openingW = r.footprintWidth * s;
  const dir = r.dir < 0 ? -1 : 1;
  if (viewSign !== -dir && !userMoved) framed = false;
  viewSign = -dir;
  const openZ = dir * (openingW / 2 - w / 2);
  const openX = openingL / 2;

  makeBox(openingL + 1.6, 0.04, openingW + 1.6, 0xd9d4c6, openX, 0.02, openZ, ["floor1"]);
  makeBox(openingL + 1.6, 0.05, 0.45, 0xc8c3b5, openX, H, openZ + openingW / 2 + 0.22, ["floor2"]);
  makeBox(openingL + 1.6, 0.05, 0.45, 0xc8c3b5, openX, H, openZ - openingW / 2 - 0.22, ["floor2"]);
  makeBox(0.45, 0.05, openingW + 0.9, 0xc8c3b5, openX - openingL / 2 - 0.22, H, openZ, ["floor2"]);
  makeBox(0.45, 0.05, openingW + 0.9, 0xc8c3b5, openX + openingL / 2 + 0.22, H, openZ, ["floor2"]);

  const opening = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(openingL, 0.04, openingW)),
    new THREE.LineBasicMaterial({ color: 0xff3f35, transparent: true })
  );
  opening.position.set(openX, H + 0.02, openZ);
  tag(opening, ["opening"]);
  model.add(opening);
  const openEdge = openZ + dir * (openingW / 2 + 0.12);
  dimLine(
    new THREE.Vector3(0, H + 0.18, openEdge),
    new THREE.Vector3(openingL, H + 0.18, openEdge),
    ["opening"]
  );
  addLabel(`lubang ${format(r.opening, 0)} cm`, openX, H + 0.32, openEdge, ["opening"]);

  const heightZ = -dir * 0.55;
  dimLine(new THREE.Vector3(-0.25, 0, heightZ), new THREE.Vector3(-0.25, H, heightZ), ["height"]);
  addLabel(`tinggi ${format(r.height, 0)} cm`, -0.25, H / 2, -dir * 0.72, ["height"]);

  for (let i = 0; i < r.beforeTurn; i++) {
    const y = (i + 1) * rise;
    const x = i * tread + tread / 2;
    const keys = i === 0 ? ["step", "run1", "tread", "width"] : ["step", "run1"];
    makeBox(tread, y, w, 0x20c7c7, x, y / 2, 0, keys);
    addLabel(String(i + 1), x, y + 0.03, -dir * (w / 2 - 0.04), keys, "step-num");
  }

  const landingX = r.beforeTurn * tread + w / 2;
  const landingY = r.turnAt * rise;
  makeBox(w, Math.max(landingY, 0.06), w, 0xffd84d, landingX, landingY / 2, 0, ["landing", "step"]);
  addLabel(String(r.turnAt), landingX, landingY + 0.03, -dir * (w / 2 - 0.04), ["landing", "step"], "step-num");
  addLabel("bordes", landingX, landingY + 0.2, 0, ["landing"]);

  if (r.angle === 90) {
    for (let j = 0; j < r.afterTurn; j++) {
      const y = (r.turnAt + j + 1) * rise;
      const z = dir * (w / 2 + j * tread + tread / 2);
      makeBox(w, y, tread, 0x20c7c7, landingX, y / 2, z, ["step", "run2"]);
      addLabel(String(r.turnAt + j + 1), landingX + w / 2 - 0.04, y + 0.03, z, ["step", "run2"], "step-num");
    }
  } else {
    const returnZ = dir * (w + gap);
    for (let j = 0; j < r.afterTurn; j++) {
      const y = (r.turnAt + j + 1) * rise;
      const x = landingX + w / 2 - j * tread - tread / 2;
      makeBox(tread, y, w, 0x20c7c7, x, y / 2, returnZ, ["step", "run2"]);
      addLabel(String(r.turnAt + j + 1), x, y + 0.03, returnZ, ["step", "run2"], "step-num");
    }
    makeBox(w, Math.max(landingY, 0.06), w + gap, 0xffd84d, landingX, landingY / 2, returnZ / 2, ["landing"]);
  }

  dimLine(
    new THREE.Vector3(tread / 2, rise + 0.08, w / 2 + 0.08),
    new THREE.Vector3(tread / 2, rise + 0.08, -w / 2 - 0.08),
    ["width"]
  );
  addLabel(`lebar ${format(r.width, 0)} cm`, tread / 2, rise + 0.22, 0, ["width"]);

  const treadZ = -dir * (w / 2 + 0.12);
  dimLine(
    new THREE.Vector3(0, rise + 0.08, treadZ),
    new THREE.Vector3(tread, rise + 0.08, treadZ),
    ["tread"]
  );
  addLabel(`pijakan ${format(r.tread)} cm`, tread / 2, rise + 0.22, -dir * (w / 2 + 0.2), ["tread"]);

  applyHighlight();
  focusBox = new THREE.Box3(
    new THREE.Vector3(-0.3, 0, Math.min(openZ - openingW / 2, -w, -0.6)),
    new THREE.Vector3(Math.max(openingL, landingX + w / 2), H, Math.max(openZ + openingW / 2, w, 0.6))
  );
  if (!framed) frameCamera(focusBox);
}

function applyHighlight() {
  const part = PARTS[activePart];
  const keys = part?.keys || [];
  caption.textContent = part?.caption || "Semua bagian tampil — hover field untuk fokus";
  model.traverse((object) => {
    const parts = object.userData.parts;
    const measure = object.element?.classList.contains("label3d");
    const on = !part || !parts || parts.some((key) => keys.includes(key));
    const opacity = on ? 1 : 0.16;
    if (object.material) {
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      mats.forEach((mat) => {
        if ("opacity" in mat) {
          mat.transparent = true;
          mat.opacity = opacity;
        }
        if (mat.emissive) mat.emissive.setHex(part && on && parts ? 0x123333 : 0x000000);
      });
    }
    if (object.element) {
      object.element.style.opacity = on ? "1" : "0.18";
      if (measure) object.visible = Boolean(part) && on;
    }
  });
}

function frameCamera(box) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.62;
  const fov = (camera.fov * Math.PI) / 180;
  const dist = (radius / Math.tan(fov / 2)) / Math.min(1, camera.aspect || 1);

  controls.target.copy(center);
  controls.minDistance = dist * 0.35;
  controls.maxDistance = dist * 3;
  camera.position.set(center.x + dist * 0.62, center.y + dist * 0.72, center.z + dist * 0.72 * viewSign);
  camera.near = Math.max(dist / 100, 0.05);
  camera.far = dist * 30;
  camera.updateProjectionMatrix();
  controls.update();
  framed = true;
}

function setActive(part) {
  activePart = PARTS[part] ? part : null;
  document.querySelectorAll(".field").forEach((field) => {
    field.classList.toggle("is-active", field.dataset.part === activePart);
  });
  applyHighlight();
}

function update() {
  if (!form.reportValidity()) return;
  const result = calculate(readInputs());
  updateText(result);
  buildModel(result);
}

controls.addEventListener("start", () => { userMoved = true; });

form.addEventListener("submit", (event) => {
  event.preventDefault();
  framed = false;
  userMoved = false;
  setActive(null);
  update();
});

form.addEventListener("input", () => {
  clearTimeout(form.updateTimer);
  form.updateTimer = setTimeout(update, 120);
});

form.querySelectorAll(".field").forEach((field) => {
  const activate = () => setActive(field.dataset.part);
  field.addEventListener("pointerenter", activate);
  field.addEventListener("focusin", activate);
});

form.addEventListener("pointerleave", () => {
  if (!form.contains(document.activeElement)) setActive(null);
});

form.addEventListener("focusout", (event) => {
  if (!form.contains(event.relatedTarget)) setActive(null);
});

function resize() {
  const width = viewer.clientWidth;
  const height = viewer.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  labels.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (focusBox && !userMoved) frameCamera(focusBox);
}
new ResizeObserver(resize).observe(viewer);

function animate() {
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(animate);
}

setActive(null);
resize();
update();
animate();
