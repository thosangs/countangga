import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const $ = (id) => document.getElementById(id);
const form = $("stair-form");
const viewer = $("viewer");
const caption = $("caption");

const PARTS = {
  floorHeight: { keys: ["height", "floor1", "floor2"], caption: "Tinggi dari lantai 1 ke lantai 2" },
  openingLength: { keys: ["opening"], caption: "Panjang lubang tangga di lantai 2" },
  stairWidth: { keys: ["width", "step"], caption: "Lebar badan tangga (samping ke samping)" },
  treadDepth: { keys: ["tread"], caption: "Kedalaman satu pijakan — maju kaki, bukan lebar tangga" },
  landingCount: { keys: ["step", "landing1", "landing2"], caption: "Pilih tangga lurus, satu bordes, atau dua bordes" },
  turnAngle: { keys: ["landing1", "run2"], caption: "Satu bordes bisa membelok 90° atau berbalik 180°" },
  turnDir: { keys: ["landing1", "run2"], caption: "Arah belok pertama dari sudut pandang orang yang naik" },
  turnStep: { keys: ["landing1", "run1"], caption: "Bordes pertama menjadi anak tangga nomor ini" },
  landingHeight: { keys: ["landing1", "run1"], caption: "Ketinggian bordes pertama dari lantai 1" },
  turnDir2: { keys: ["landing2", "run3"], caption: "Arah belok kedua dari sudut pandang orang yang naik" },
  turnStep2: { keys: ["landing2", "run2"], caption: "Bordes kedua menjadi anak tangga nomor ini" },
  landingHeight2: { keys: ["landing2", "run2"], caption: "Ketinggian bordes kedua dari lantai 1" }
};

let activePart = null;
let framed = false;
let userMoved = false;
let focusBox = null;
let viewSign = 1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd4f1ee);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
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
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0xefece3, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(30, 30, 0x111827, 0x8aa8a6);
grid.position.y = 0.002;
grid.material.transparent = true;
grid.material.opacity = 0.22;
scene.add(grid);

let model = new THREE.Group();
scene.add(model);

const format = (value, digits = 1) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(value);

function readInputs() {
  const landingCount = Number($("landingCount").value);
  const landings = [];

  if (landingCount > 0) {
    landings.push({
      step: Number($("turnStep").value),
      height: Number($("landingHeight").value),
      dir: Number($("turnDir").value),
      angle: landingCount === 1 ? Number($("turnAngle").value) : 90
    });
  }

  if (landingCount === 2) {
    landings.push({
      step: Number($("turnStep2").value),
      height: Number($("landingHeight2").value),
      dir: Number($("turnDir2").value),
      angle: 90
    });
  }

  return {
    height: Number($("floorHeight").value),
    opening: Number($("openingLength").value),
    width: Number($("stairWidth").value),
    tread: Number($("treadDepth").value),
    landingCount,
    landings
  };
}

function rotate(vector, degrees) {
  const angle = degrees * Math.PI / 180;
  return {
    x: vector.x * Math.cos(angle) - vector.z * Math.sin(angle),
    z: vector.x * Math.sin(angle) + vector.z * Math.cos(angle)
  };
}

function addVec(a, b, scale = 1) {
  return { x: a.x + b.x * scale, z: a.z + b.z * scale };
}

function makeBounds() {
  return { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
}

function includeRect(bounds, center, heading, length, width) {
  const side = rotate(heading, 90);
  for (const along of [-length / 2, length / 2]) {
    for (const across of [-width / 2, width / 2]) {
      const point = addVec(addVec(center, heading, along), side, across);
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minZ = Math.min(bounds.minZ, point.z);
      bounds.maxZ = Math.max(bounds.maxZ, point.z);
    }
  }
}

function buildPlan(data, landings, treadCount) {
  const steps = [];
  const landingPlans = [];
  const bounds = makeBounds();
  const gap = 15;
  let position = { x: 0, z: 0 };
  let heading = { x: 1, z: 0 };
  let previousStep = 0;

  for (let index = 0; index < landings.length; index++) {
    const landing = landings[index];
    const ordinaryCount = landing.step - previousStep - 1;
    const runKey = `run${index + 1}`;

    for (let i = 0; i < ordinaryCount; i++) {
      const center = addVec(position, heading, i * data.tread + data.tread / 2);
      const number = previousStep + i + 1;
      steps.push({ number, center, heading: { ...heading }, keys: ["step", runKey] });
      includeRect(bounds, center, heading, data.tread, data.width);
    }

    const edgeIn = addVec(position, heading, ordinaryCount * data.tread);
    const turnDegrees = landing.dir * landing.angle;
    const nextHeading = rotate(heading, turnDegrees);
    let center;
    let length;
    let width;

    if (landing.angle === 180) {
      const side = rotate(heading, landing.dir * 90);
      center = addVec(addVec(edgeIn, heading, data.width / 2), side, (data.width + gap) / 2);
      length = data.width;
      width = data.width * 2 + gap;
      position = addVec(addVec(edgeIn, heading, data.width), side, data.width + gap);
    } else {
      center = addVec(edgeIn, heading, data.width / 2);
      length = data.width;
      width = data.width;
      position = addVec(center, nextHeading, data.width / 2);
    }

    landingPlans.push({
      ...landing,
      number: landing.step,
      center,
      heading: { ...heading },
      length,
      width,
      keys: ["step", "landing", `landing${index + 1}`]
    });
    includeRect(bounds, center, heading, length, width);
    heading = nextHeading;
    previousStep = landing.step;
  }

  const finalCount = treadCount - previousStep;
  for (let i = 0; i < finalCount; i++) {
    const center = addVec(position, heading, i * data.tread + data.tread / 2);
    const number = previousStep + i + 1;
    steps.push({
      number,
      center,
      heading: { ...heading },
      keys: ["step", `run${landings.length + 1}`]
    });
    includeRect(bounds, center, heading, data.tread, data.width);
  }

  return {
    steps,
    landings: landingPlans,
    bounds,
    spanX: bounds.maxX - bounds.minX,
    spanZ: bounds.maxZ - bounds.minZ
  };
}

// Cari jumlah kenaikan yang paling dekat dengan tinggi nyaman 17,5 cm
// sekaligus rumus Blondel 2T+L = 63 cm, bukan sekadar pembulatan.
function bestRiseCount(rise, tread) {
  const start = Math.max(1, Math.round(rise / 17.5));
  let bestCount = start;
  let bestScore = Infinity;

  for (let count = Math.max(1, start - 4); count <= start + 4; count++) {
    const riser = rise / count;
    const blondel = 2 * riser + tread;
    const penalty = riser < 15 || riser > 19 ? 30 : 0;
    const score = Math.abs(riser - 17.5) * 2 + Math.abs(blondel - 63) + penalty;
    if (score < bestScore - 1e-9) {
      bestScore = score;
      bestCount = count;
    }
  }

  return bestCount;
}

function calculate(data) {
  const landings = data.landings.map((landing) => ({ ...landing }));
  const inputIssues = [];

  if (landings.length) {
    landings[0].step = Math.max(2, Math.round(landings[0].step));
    landings[0].height = Math.max(1, Math.min(data.height - 1, landings[0].height));
  }

  if (landings.length === 2) {
    if (landings[1].step <= landings[0].step) {
      inputIssues.push("Nomor bordes 2 harus lebih besar dari bordes 1.");
      landings[1].step = landings[0].step + 1;
    }
    if (landings[1].height <= landings[0].height) {
      inputIssues.push("Tinggi bordes 2 harus lebih tinggi dari bordes 1.");
      landings[1].height = landings[0].height + 1;
    }
    landings[1].height = Math.min(data.height - 1, landings[1].height);
  }

  const last = landings.at(-1) || { step: 0, height: 0 };
  const finalRiseCount = bestRiseCount(data.height - last.height, data.tread);
  const rises = last.step + finalRiseCount;
  const treadCount = rises - 1;
  const points = [
    { step: 0, height: 0 },
    ...landings.map(({ step, height }) => ({ step, height })),
    { step: rises, height: data.height }
  ];

  const segments = [];
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const rise = (end.height - start.height) / (end.step - start.step);
    segments.push({
      startStep: start.step,
      endStep: end.step,
      startHeight: start.height,
      endHeight: end.height,
      rise,
      blondel: 2 * rise + data.tread,
      pitch: Math.atan(rise / data.tread) * 180 / Math.PI
    });
  }

  const heightAtStep = (step) => {
    const segment = segments.find((item) => step <= item.endStep) || segments.at(-1);
    return segment.startHeight + (step - segment.startStep) * segment.rise;
  };

  const plan = buildPlan(data, landings, treadCount);
  const requiredOpening = Math.max(plan.spanX, plan.spanZ);

  return {
    ...data,
    landings,
    rises,
    treadCount,
    segments,
    heightAtStep,
    plan,
    requiredOpening,
    inputIssues
  };
}

function assess(result) {
  const fails = [...result.inputIssues];
  const add = (ok, message) => { if (!ok) fails.push(message); };

  result.segments.forEach((segment, index) => {
    const name = index < result.landings.length ? `Segmen ${index + 1}` : "Segmen akhir";
    add(
      segment.rise >= 15 && segment.rise <= 19,
      `${name}: tinggi anak ${format(segment.rise)} cm (ideal 15–19).`
    );
    add(
      segment.blondel >= 60 && segment.blondel <= 65,
      `${name}: 2T+L ${format(segment.blondel)} cm (ideal 60–65).`
    );
  });

  add(result.tread >= 25 && result.tread <= 30, `Pijakan ${format(result.tread)} cm (ideal 25–30).`);
  add(result.width >= 90, `Lebar ${format(result.width, 0)} cm, usahakan ≥ 90.`);
  add(
    result.requiredOpening <= result.opening,
    `Butuh sisi terpanjang ${format(result.requiredOpening, 0)} cm; tersedia ${format(result.opening, 0)} cm.`
  );
  return fails;
}

function rangeLabel(values, suffix) {
  const rounded = [...new Set(values.map((value) => format(value)))];
  return `${rounded.join(" / ")} ${suffix}`;
}

function updateText(result) {
  const fails = assess(result);
  $("riseCount").textContent = result.treadCount;
  $("riserHeight").textContent = rangeLabel(result.segments.map((item) => item.rise), "cm");
  $("treadResult").textContent = `${format(result.tread)} cm`;
  $("pitch").textContent = rangeLabel(result.segments.map((item) => item.pitch), "°");
  $("blondel").textContent = rangeLabel(result.segments.map((item) => item.blondel), "cm");
  $("requiredOpening").textContent = `${format(result.requiredOpening, 0)} cm`;

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
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  const label = new CSS2DObject(element);
  label.position.set(x, y, z);
  tag(label, keys);
  model.add(label);
}

function makeBox(length, height, width, color, center, heading, y, keys) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, height, width),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: true })
  );
  mesh.position.set(center.x, y, center.z);
  mesh.rotation.y = -Math.atan2(heading.z, heading.x);
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
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x111827, transparent: true })
  );
  tag(line, keys);
  model.add(line);
}

function clearModel() {
  scene.remove(model);
  model.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose?.());
    }
    object.element?.remove?.();
  });
  model = new THREE.Group();
  scene.add(model);
}

function buildModel(result) {
  clearModel();
  const scale = 1 / 100;
  const width = result.width * scale;
  const tread = result.tread * scale;
  const totalHeight = result.height * scale;
  const bounds = result.plan.bounds;
  const planCenter = {
    x: (bounds.minX + bounds.maxX) / 2 * scale,
    z: (bounds.minZ + bounds.maxZ) / 2 * scale
  };

  viewSign = result.landings[0]?.dir < 0 ? 1 : -1;
  const spanX = result.plan.spanX * scale;
  const spanZ = result.plan.spanZ * scale;
  const openingLength = result.opening * scale;
  const openingX = spanX >= spanZ ? openingLength : Math.max(spanX, width);
  const openingZ = spanX >= spanZ ? Math.max(spanZ, width) : openingLength;
  const floorX = Math.max(openingX, spanX) + 1.6;
  const floorZ = Math.max(openingZ, spanZ) + 1.6;

  makeBox(floorX, 0.04, floorZ, 0xd9d4c6, planCenter, { x: 1, z: 0 }, 0.02, ["floor1"]);

  const rail = 0.4;
  makeBox(openingX + rail * 2, 0.05, rail, 0xc8c3b5,
    { x: planCenter.x, z: planCenter.z + openingZ / 2 + rail / 2 },
    { x: 1, z: 0 }, totalHeight, ["floor2"]);
  makeBox(openingX + rail * 2, 0.05, rail, 0xc8c3b5,
    { x: planCenter.x, z: planCenter.z - openingZ / 2 - rail / 2 },
    { x: 1, z: 0 }, totalHeight, ["floor2"]);
  makeBox(rail, 0.05, openingZ, 0xc8c3b5,
    { x: planCenter.x - openingX / 2 - rail / 2, z: planCenter.z },
    { x: 1, z: 0 }, totalHeight, ["floor2"]);
  makeBox(rail, 0.05, openingZ, 0xc8c3b5,
    { x: planCenter.x + openingX / 2 + rail / 2, z: planCenter.z },
    { x: 1, z: 0 }, totalHeight, ["floor2"]);

  const opening = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(openingX, 0.04, openingZ)),
    new THREE.LineBasicMaterial({ color: 0xff3f35, transparent: true })
  );
  opening.position.set(planCenter.x, totalHeight + 0.02, planCenter.z);
  tag(opening, ["opening"]);
  model.add(opening);

  const heightX = bounds.minX * scale - 0.25;
  const heightZ = bounds.minZ * scale - 0.25;
  dimLine(
    new THREE.Vector3(heightX, 0, heightZ),
    new THREE.Vector3(heightX, totalHeight, heightZ),
    ["height"]
  );
  addLabel(`tinggi ${format(result.height, 0)} cm`, heightX, totalHeight / 2, heightZ, ["height"]);

  result.plan.steps.forEach((step) => {
    const top = result.heightAtStep(step.number) * scale;
    const center = { x: step.center.x * scale, z: step.center.z * scale };
    const heading = step.heading;
    const keys = [...step.keys];
    if (step.number === 1) keys.push("tread", "width");
    makeBox(tread, top, width, 0x20c7c7, center, heading, top / 2, keys);
    const side = rotate(heading, -90 * viewSign);
    const labelPoint = addVec(center, side, width / 2 - 0.04);
    addLabel(String(step.number), labelPoint.x, top + 0.03, labelPoint.z, keys, "step-num");
  });

  result.plan.landings.forEach((landing, index) => {
    const top = landing.height * scale;
    const center = { x: landing.center.x * scale, z: landing.center.z * scale };
    const heading = landing.heading;
    const length = landing.length * scale;
    const landingWidth = landing.width * scale;
    makeBox(length, top, landingWidth, 0xffd84d, center, heading, top / 2, landing.keys);
    const side = rotate(heading, -90 * viewSign);
    const numberPoint = addVec(center, side, Math.min(landingWidth / 2 - 0.04, width / 2 - 0.04));
    addLabel(String(landing.number), numberPoint.x, top + 0.03, numberPoint.z, landing.keys, "step-num");
    addLabel(
      `bordes ${index + 1} · ${format(landing.height, 0)} cm`,
      center.x,
      top + 0.2,
      center.z,
      [`landing${index + 1}`]
    );
  });

  const firstStep = result.plan.steps.find((step) => step.number === 1);
  if (firstStep) {
    const center = { x: firstStep.center.x * scale, z: firstStep.center.z * scale };
    const side = rotate(firstStep.heading, 90);
    const edgeA = addVec(center, side, width / 2 + 0.08);
    const edgeB = addVec(center, side, -width / 2 - 0.08);
    const top = result.heightAtStep(1) * scale;
    dimLine(
      new THREE.Vector3(edgeA.x, top + 0.08, edgeA.z),
      new THREE.Vector3(edgeB.x, top + 0.08, edgeB.z),
      ["width"]
    );
    addLabel(`lebar ${format(result.width, 0)} cm`, center.x, top + 0.22, center.z, ["width"]);
  }

  applyHighlight();
  focusBox = new THREE.Box3(
    new THREE.Vector3(
      Math.min(bounds.minX * scale, planCenter.x - openingX / 2) - 0.3,
      0,
      Math.min(bounds.minZ * scale, planCenter.z - openingZ / 2) - 0.3
    ),
    new THREE.Vector3(
      Math.max(bounds.maxX * scale, planCenter.x + openingX / 2) + 0.3,
      totalHeight,
      Math.max(bounds.maxZ * scale, planCenter.z + openingZ / 2) + 0.3
    )
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
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if ("opacity" in material) {
          material.transparent = true;
          material.opacity = opacity;
        }
        if (material.emissive) material.emissive.setHex(part && on && parts ? 0x123333 : 0x000000);
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
  const fov = camera.fov * Math.PI / 180;
  const distance = (radius / Math.tan(fov / 2)) / Math.min(1, camera.aspect || 1);

  controls.target.copy(center);
  controls.minDistance = distance * 0.35;
  controls.maxDistance = distance * 3;
  camera.position.set(
    center.x + distance * 0.62,
    center.y + distance * 0.72,
    center.z + distance * 0.72 * viewSign
  );
  camera.near = Math.max(distance / 100, 0.05);
  camera.far = distance * 30;
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

function syncLandingFields() {
  const count = Number($("landingCount").value);
  const hasLanding = count > 0;
  const two = count === 2;
  document.querySelectorAll(".landing-only").forEach((field) => {
    field.hidden = !hasLanding;
  });
  $("secondLanding").hidden = !two;
  $("turnStep").required = hasLanding;
  $("landingHeight").required = hasLanding;
  $("turnStep2").required = two;
  $("landingHeight2").required = two;
  document.querySelector(".single-landing-only").hidden = !hasLanding || two;
}

function update() {
  syncLandingFields();
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
  syncLandingFields();
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

syncLandingFields();
setActive(null);
resize();
update();
animate();
