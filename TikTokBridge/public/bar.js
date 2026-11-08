// Sàn Quẩy Online: bản web (three.js) của quán bar, nhận cùng luồng sự kiện với game Unity qua WebSocket của bridge.
// Tham số URL: ?chroma=1 (nền xanh), ?hud=0 (ẩn bảng), ?music=0 (tắt nhạc), ?npc=8 (số người ảo), ?demo=30 (giả lập không cần live)
import * as THREE from '/vendor/three/three.module.js';

const params = new URLSearchParams(location.search);
const settings = {
    chroma: params.get('chroma') === '1',
    hud: params.get('hud') !== '0',
    music: params.get('music') !== '0',
    npc: clamp(Number(params.get('npc') ?? 8) || 0, 0, 40),
    demo: clamp(Number(params.get('demo') ?? 0) || 0, 0, 300)
};
const cfg = {
    bpm: 128, beatsPerBar: 4, dropEveryBars: 8, dropBars: 2,
    partyGoal: 1000, maxPlayers: 400, ttlMs: 600000,
    spotlight: { minimumMs: 4000, maximumMs: 15000, maximumQueue: 8 },
    musicVolume: 0.35, evolutionTiers: [], evolutionEffects: true
};
const NPC_NAMES = ['Bắp Rang', 'Cà Khịa', 'Tí Tởn', 'Tèo Teo', 'Bảy Bóng', 'Sáu Lắc', 'Năm Rung', 'Út Quẩy',
    'Cô Ba Lắc', 'Chú Tư Nhún', 'Anh Hai Quẩy', 'Bé Hột Mít', 'Mèo Mập', 'Heo Hay Hờn', 'Gà Mơ', 'Vịt Lộn',
    'Cá Khô', 'Mực Một Nắng', 'Bánh Bao', 'Bánh Bèo', 'Bún Đậu', 'Mắm Tôm', 'Chả Lụa', 'Trà Đá',
    'Sữa Đậu', 'Khoai Lang', 'Đậu Phộng', 'Hạt Dưa', 'Xoài Lắc', 'Cóc Dầm', 'Chanh Chua', 'Ớt Hiểm',
    'Củ Cải', 'Rau Răm', 'Hành Phi', 'Tỏi Bay', 'Gừng Cay', 'Muối Tiêu', 'Nước Mắm', 'Cơm Nguội'];
const NEON = [0xff2bd6, 0x00e5ff, 0x7c4dff, 0xffd400, 0x00ff9c, 0xff5a1f];
const RANK_COLORS = ['', '#ffd54a', '#dfe8f5', '#e8a062'];
const TIER_COLORS = { aura: 0x00e5ff, neon: 0xff2bd6, fire: 0xff7a1a, royal: 0xffd54a, ice: 0x9fe8ff };
const SPOTLIGHT_ACTIONS = new Set(['camera', 'vip', 'topdj', 'fireworks', 'medal']);
const CHAR_HEIGHT = 1.75;

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function damp(k, dt) { return 1 - Math.exp(-k * dt); }
function rand(a, b) { return a + Math.random() * (b - a); }
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function normalize(text) {
    return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim().toLowerCase();
}
function formatNumber(n) { return Number(n || 0).toLocaleString('vi-VN'); }

// ───────────────────────── Renderer / scene ─────────────────────────
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const BG = new THREE.Color(0x07040d);
scene.background = BG.clone();
scene.fog = new THREE.Fog(0x07040d, 22, 70);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
const room = new THREE.Group();
scene.add(room);
const actorsGroup = new THREE.Group();
scene.add(actorsGroup);

const hemi = new THREE.HemisphereLight(0x8866ff, 0x110022, 0.6);
scene.add(hemi);
const colorLights = NEON.slice(0, 4).map((color, i) => {
    const light = new THREE.PointLight(color, 30, 22, 1.6);
    light.position.set((i - 1.5) * 4, 6, -2 + (i % 2) * 4);
    room.add(light);
    return light;
});

function softDotTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}
const DOT = softDotTexture();

// Sàn LED
const TILE = 0.62, TX = 28, TZ = 26, TZ0 = -5.6;
const tileGeo = new THREE.PlaneGeometry(TILE * 0.93, TILE * 0.93);
tileGeo.rotateX(-Math.PI / 2);
const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), TX * TZ);
const tileInfo = [];
{
    const m = new THREE.Matrix4();
    let i = 0;
    for (let ix = 0; ix < TX; ix++) {
        for (let iz = 0; iz < TZ; iz++) {
            const x = (ix - (TX - 1) / 2) * TILE, z = TZ0 + iz * TILE;
            m.makeTranslation(x, 0.004, z);
            tiles.setMatrixAt(i, m);
            tiles.setColorAt(i, new THREE.Color(0));
            tileInfo.push({ ix, iz, x, z });
            i++;
        }
    }
}
room.add(tiles);
const floorBase = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x07050c, roughness: 0.4, metalness: 0.5 }));
floorBase.rotation.x = -Math.PI / 2;
room.add(floorBase);

function box(w, h, d, color, emissive = 0x000000) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3, emissive }));
}
function glow(w, h, d, color) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
}

// Sân khấu + bàn DJ
const STAGE_Z = -6.5;
const stage = box(9, 0.5, 2.8, 0x150c22);
stage.position.set(0, 0.25, STAGE_Z);
room.add(stage);
const stageEdge = glow(9, 0.07, 0.07, 0xff2bd6);
stageEdge.position.set(0, 0.5, STAGE_Z + 1.4);
room.add(stageEdge);
const booth = box(3.4, 1.15, 1, 0x1c1030);
booth.position.set(0, 1.07, STAGE_Z + 0.4);
room.add(booth);
const boothStrip = glow(3.42, 0.12, 0.02, 0x00e5ff);
boothStrip.position.set(0, 1.35, STAGE_Z + 0.91);
room.add(boothStrip);
const boothStrip2 = glow(3.42, 0.05, 0.02, 0xff2bd6);
boothStrip2.position.set(0, 0.75, STAGE_Z + 0.91);
room.add(boothStrip2);

// Màn LED sau DJ
const SCREEN_Z = -8.3;
const screenCanvas = document.createElement('canvas');
screenCanvas.width = 640;
screenCanvas.height = 360;
const screenCtx = screenCanvas.getContext('2d');
const proceduralScreen = new THREE.CanvasTexture(screenCanvas);
proceduralScreen.colorSpace = THREE.SRGBColorSpace;
const screenMat = new THREE.MeshBasicMaterial({ map: proceduralScreen, toneMapped: false });
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMat);
room.add(screen);
const screenFrame = glow(1, 1, 0.1, 0x2a1440);
room.add(screenFrame);
let screenSource = 'procedural';

// Bục top 1-3
const PODIUMS = [null,
    { x: 0, h: 0.85, color: 0xffd54a },
    { x: -1.6, h: 0.6, color: 0xdfe8f5 },
    { x: 1.6, h: 0.45, color: 0xe8a062 }];
const PODIUM_Z = -4.35;
for (let r = 1; r <= 3; r++) {
    const p = PODIUMS[r];
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, p.h, 32), new THREE.MeshStandardMaterial({ color: 0x1a1028, roughness: 0.3, metalness: 0.6 }));
    body.position.set(p.x, p.h / 2, PODIUM_Z);
    room.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color: p.color, toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.x, p.h, PODIUM_Z);
    room.add(ring);
    p.ring = ring;
    p.pos = new THREE.Vector3(p.x, p.h, PODIUM_Z);
}

// Giàn đèn
const TRUSS_Y = 8.6;
for (const z of [-7.6, -2, 3.5]) {
    const bar = box(16, 0.22, 0.22, 0x26203a);
    bar.position.set(0, TRUSS_Y, z);
    room.add(bar);
}

// Đèn quét (moving head)
const beamGeo = new THREE.ConeGeometry(1.5, 10, 24, 1, true);
beamGeo.translate(0, -5, 0);
const beams = [];
for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: NEON[i % NEON.length], transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const beam = new THREE.Mesh(beamGeo, mat);
    const pivot = new THREE.Group();
    pivot.position.set((i - 3.5) * 2, TRUSS_Y - 0.2, i % 2 ? -2 : 3.5);
    pivot.add(beam);
    const head = box(0.35, 0.3, 0.35, 0x111111);
    pivot.add(head);
    room.add(pivot);
    beams.push({ pivot, beam, mat, seed: i * 1.7, q: new THREE.Quaternion() });
}
const spotPool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ map: null, color: 0xfff0b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
spotPool.rotation.x = -Math.PI / 2;
spotPool.position.y = 0.03;
room.add(spotPool);

// Laser
const laserGeo = new THREE.CylinderGeometry(0.018, 0.018, 34, 6, 1, true);
laserGeo.translate(0, 17, 0);
const lasers = [];
for (let i = 0; i < 12; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0x00ff9c : i % 3 === 1 ? 0xff2bd6 : 0x00e5ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(laserGeo, mat);
    const side = i < 6 ? -1 : 1;
    mesh.position.set(side * 6.5, 7.6, -7.8);
    room.add(mesh);
    lasers.push({ mesh, mat, side, k: i % 6 });
}

// Quả cầu disco
const discoCanvas = document.createElement('canvas');
discoCanvas.width = 256;
discoCanvas.height = 128;
{
    const g = discoCanvas.getContext('2d');
    for (let y = 0; y < 128; y += 8) for (let x = 0; x < 256; x += 8) {
        const v = 90 + Math.floor(Math.random() * 165);
        g.fillStyle = `rgb(${v},${v},${v + 10})`;
        g.fillRect(x, y, 7, 7);
    }
}
const discoTex = new THREE.CanvasTexture(discoCanvas);
discoTex.colorSpace = THREE.SRGBColorSpace;
const disco = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 16), new THREE.MeshBasicMaterial({ map: discoTex }));
disco.position.set(0, 7.3, -1.5);
room.add(disco);
const discoString = glow(0.02, 1.2, 0.02, 0x444444);
discoString.position.set(0, 8.0, -1.5);
room.add(discoString);

// Khói
const hazeCount = 70;
const hazeGeo = new THREE.BufferGeometry();
const hazePos = new Float32Array(hazeCount * 3);
for (let i = 0; i < hazeCount; i++) {
    hazePos[i * 3] = rand(-9, 9);
    hazePos[i * 3 + 1] = rand(0.3, 6);
    hazePos[i * 3 + 2] = rand(-8, 6);
}
hazeGeo.setAttribute('position', new THREE.BufferAttribute(hazePos, 3));
const haze = new THREE.Points(hazeGeo, new THREE.PointsMaterial({ map: DOT, size: 5, color: 0x6a3cff, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending }));
room.add(haze);

// ───────────────────────── Hạt: pháo hoa / kim tuyến / lấp lánh ─────────────────────────
const P_MAX = 4000;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(P_MAX * 3);
const pCol = new Float32Array(P_MAX * 3);
const pVel = new Float32Array(P_MAX * 3);
const pLife = new Float32Array(P_MAX);
const pMaxLife = new Float32Array(P_MAX);
const pGravity = new Float32Array(P_MAX);
const pBase = new Float32Array(P_MAX * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: DOT, size: 0.22, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
particles.frustumCulled = false;
scene.add(particles);
let pCursor = 0;
for (let i = 0; i < P_MAX; i++) pPos[i * 3 + 1] = -100;
const tmpColor = new THREE.Color();

function emit(x, y, z, vx, vy, vz, color, life, gravity = -3) {
    const i = pCursor;
    pCursor = (pCursor + 1) % P_MAX;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    tmpColor.set(color);
    pBase[i * 3] = tmpColor.r; pBase[i * 3 + 1] = tmpColor.g; pBase[i * 3 + 2] = tmpColor.b;
    pLife[i] = life; pMaxLife[i] = life; pGravity[i] = gravity;
}
function burst(x, y, z, color = pick(NEON), count = 160, speed = 4.5) {
    const second = pick(NEON);
    for (let k = 0; k < count; k++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const s = speed * (0.75 + Math.random() * 0.35);
        emit(x, y, z, r * Math.cos(th) * s, u * s, r * Math.sin(th) * s, k % 3 ? color : second, rand(1.1, 1.9), -2.4);
    }
    playSfx();
}
function rocket(x, z, delay = 0) {
    setTimeout(() => {
        const top = rand(5.5, 8);
        for (let k = 0; k < 14; k++) setTimeout(() => emit(x + rand(-0.05, 0.05), 0.5 + (top - 0.5) * k / 14, z, 0, 0.4, 0, 0xffe7a8, 0.5, 0), k * 30);
        setTimeout(() => burst(x, top, z), 440);
    }, delay);
}
function fireworks(count = 3) {
    for (let k = 0; k < count; k++) rocket(rand(-layout.halfW, layout.halfW), rand(-5, 1), k * 380);
}
function confetti(count = 260) {
    for (let k = 0; k < count; k++) emit(rand(-layout.halfW - 1, layout.halfW + 1), rand(7, 10), rand(-6, 4), rand(-0.4, 0.4), rand(-1.2, -0.4), rand(-0.4, 0.4), pick(NEON), rand(3, 5), -0.25);
}
function puff(pos) {
    for (let k = 0; k < 40; k++) emit(pos.x + rand(-0.3, 0.3), pos.y + rand(0.2, 1.4), pos.z + rand(-0.2, 0.2), rand(-1, 1), rand(0, 1.5), rand(-1, 1), 0xffffff, rand(0.4, 0.8), 0);
}
function updateParticles(dt) {
    for (let i = 0; i < P_MAX; i++) {
        if (pLife[i] <= 0) continue;
        pLife[i] -= dt;
        if (pLife[i] <= 0) { pPos[i * 3 + 1] = -100; continue; }
        pVel[i * 3 + 1] += pGravity[i] * dt;
        const drag = 1 - 0.9 * dt;
        pVel[i * 3] *= drag; pVel[i * 3 + 2] *= drag;
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        const a = Math.min(1, pLife[i] / pMaxLife[i] * 1.6);
        pCol[i * 3] = pBase[i * 3] * a; pCol[i * 3 + 1] = pBase[i * 3 + 1] * a; pCol[i * 3 + 2] = pBase[i * 3 + 2] * a;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
}

// ───────────────────────── Nhân vật ─────────────────────────
const characters = {};      // tên -> { frames: Texture[], aspect }
let characterNames = [];
const loader = new THREE.TextureLoader();

async function loadCharacters() {
    const index = await (await fetch('/assets/characters/index.json')).json();
    const jobs = [];
    for (const [name, files] of Object.entries(index)) {
        const entry = { frames: [], aspect: 1 };
        characters[name] = entry;
        files.forEach((file, i) => jobs.push(new Promise(resolve => loader.load(`/assets/characters/${name}/${file}`, tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.LinearFilter;
            entry.frames[i] = tex;
            if (i === 0) entry.aspect = tex.image.width / tex.image.height;
            resolve();
        }, undefined, resolve))));
    }
    await Promise.all(jobs);
    for (const entry of Object.values(characters)) entry.frames = entry.frames.filter(Boolean);
    // 'd' (chữ Trung tục) và 'k' ("open your eyes") dính chữ trong hình -> bỏ. Gấu trúc hanhan để riêng làm DJ.
    const excluded = new Set(['d', 'k', 'hanhan_video_dance']);
    characterNames = Object.keys(characters).filter(name => characters[name].frames.length && !excluded.has(name));
}

const avatarCache = new Map();
function loadAvatar(url) {
    if (!url) return Promise.resolve(null);
    if (!avatarCache.has(url)) {
        avatarCache.set(url, new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = `/api/avatar?u=${encodeURIComponent(url)}`;
        }));
    }
    return avatarCache.get(url);
}
const bannerImages = {};
for (const v of ['fire', 'ice', 'neon', 'royal']) {
    const img = new Image();
    img.src = `/assets/banners/title-${v}.png`;
    bannerImages[v] = img;
}

function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}
function fitText(g, text, maxWidth) {
    if (g.measureText(text).width <= maxWidth) return text;
    let s = text;
    while (s.length > 1 && g.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
    return s + '…';
}

let actorSeq = 0;
const activeBubbles = [];
class Actor {
    constructor(data, isNpc) {
        this.userId = data.userId;
        this.isNpc = isNpc;
        this.nickname = data.nickname || data.uniqueId || 'TikTok user';
        this.avatarUrl = data.avatar || '';
        this.avatarImg = null;
        this.giftPower = Number(data.giftPower) || 0;
        this.seed = Math.random() * 10;
        this.color = new THREE.Color().setHSL((actorSeq++ * 0.173) % 1, 0.72, 0.55);
        this.lastActive = performance.now();
        this.labelUntil = 0;
        this.action = null;
        this.actionUntil = 0;
        this.growUntil = 0;
        this.growMul = 1;
        this.topRank = 0;
        this.visibility = isNpc ? 0.85 : 1;
        this.opacity = 0;
        this.slotPos = new THREE.Vector3();
        this.slotScale = 0.6;
        this.pos = new THREE.Vector3(rand(-2, 2), 0, 6);
        this.frame = 0;
        this.frameAcc = 0;
        this.sparkleAcc = 0;

        this.group = new THREE.Group();
        this.material = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.08, opacity: 0 });
        this.sprite = new THREE.Sprite(this.material);
        this.sprite.center.set(0.5, 0);
        this.group.add(this.sprite);

        this.labelCanvas = document.createElement('canvas');
        this.labelCanvas.width = 256;
        this.labelCanvas.height = 64;
        this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
        this.labelTex.colorSpace = THREE.SRGBColorSpace;
        this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelTex, transparent: true, depthTest: false, depthWrite: false }));
        this.label.center.set(0.5, 0);
        this.label.renderOrder = 10;
        this.group.add(this.label);

        this.aura = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.46, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        this.aura.rotation.x = -Math.PI / 2;
        this.aura.position.y = 0.02;
        this.aura.visible = false;
        this.group.add(this.aura);

        this.title = null;
        this.titleUntil = 0;
        this.setCharacter(pick(characterNames));
        this.updateTier();
        this.drawLabel();
        loadAvatar(this.avatarUrl).then(img => { if (img) { this.avatarImg = img; this.drawLabel(); } });
        actorsGroup.add(this.group);
    }

    get height() { return CHAR_HEIGHT * this.currentScale * this.growMul; }
    get currentScale() { return this.topRank ? Math.max(this.slotScale, 0.62) : this.slotScale; }

    updateIdentity(data) {
        const nickname = data.nickname || data.uniqueId;
        let dirty = false;
        if (nickname && nickname !== this.nickname) { this.nickname = nickname; dirty = true; }
        if (data.avatar && data.avatar !== this.avatarUrl) {
            this.avatarUrl = data.avatar;
            loadAvatar(this.avatarUrl).then(img => { if (img) { this.avatarImg = img; this.drawLabel(); } });
        }
        if (dirty) this.drawLabel();
    }
    touch() { this.lastActive = performance.now(); this.labelUntil = clock.elapsed + 15; }

    setCharacter(name) {
        this.charName = name;
        this.frames = characters[name].frames;
        this.aspect = characters[name].aspect;
        this.frame = 0;
    }
    changeCharacter() {
        const others = characterNames.filter(n => n !== this.charName);
        this.setCharacter(pick(others.length ? others : characterNames));
        puff(this.group.position);
    }
    setAction(name, seconds) { this.action = name; this.actionUntil = clock.elapsed + seconds; }
    dance(s = 5) { this.setAction('dance', s); }
    walk(s = 5) { this.setAction('walk', s); }
    jump(s = 3) { this.setAction('jump', s); }
    celebrate(s = 3) { this.setAction('celebrate', s); }
    grow(s = 8) { this.growUntil = clock.elapsed + s; this.setAction('dance', s); }

    addGiftPower(value) { this.giftPower += Math.max(0, Number(value) || 0); this.updateTier(); }
    updateTier() {
        const tiers = [...(cfg.evolutionTiers || [])].sort((a, b) => b.minimum - a.minimum);
        const tier = cfg.evolutionEffects ? tiers.find(t => this.giftPower >= t.minimum) : null;
        this.aura.visible = Boolean(tier);
        if (tier) this.aura.material.color.set(TIER_COLORS[tier.variant] || 0xffffff);
    }
    setTopRank(rank) {
        if (rank === this.topRank) return;
        this.topRank = rank;
        this.drawLabel();
    }

    showTitle(text, variant, seconds) {
        if (!text) return;
        if (!this.title) {
            const c = document.createElement('canvas');
            c.width = 512;
            c.height = 128;
            const tex = new THREE.CanvasTexture(c);
            tex.colorSpace = THREE.SRGBColorSpace;
            this.title = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
            this.title.center.set(0.5, 0);
            this.title.renderOrder = 11;
            this.title.userData.canvas = c;
            this.group.add(this.title);
        }
        const c = this.title.userData.canvas, g = c.getContext('2d');
        const img = bannerImages[variant] || bannerImages.fire;
        g.clearRect(0, 0, 512, 128);
        const paint = () => {
            g.clearRect(0, 0, 512, 128);
            if (img.complete && img.naturalWidth) g.drawImage(img, 0, 0, 512, 128);
            else { g.fillStyle = 'rgba(120,20,60,0.85)'; roundRect(g, 10, 24, 492, 80, 40); g.fill(); }
            g.font = '900 40px "Segoe UI", Arial, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.lineWidth = 7;
            g.strokeStyle = 'rgba(0,0,0,0.85)';
            const t = fitText(g, text, 400);
            g.strokeText(t, 256, 66);
            g.fillStyle = '#fff6c8';
            g.fillText(t, 256, 66);
            this.title.material.map.needsUpdate = true;
        };
        paint();
        if (!img.complete) img.addEventListener('load', paint, { once: true });
        this.title.visible = true;
        this.titleUntil = clock.elapsed + seconds;
    }

    // bong bóng chat trên đầu (cmt của người xem)
    say(text, seconds = 5) {
        text = String(text || '').trim();
        if (!text) return;
        if (!this.bubble) {
            const c = document.createElement('canvas');
            c.width = 512;
            c.height = 200;
            const tex = new THREE.CanvasTexture(c);
            tex.colorSpace = THREE.SRGBColorSpace;
            this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
            this.bubble.center.set(0.5, 0);
            this.bubble.renderOrder = 12;
            this.bubble.userData.canvas = c;
            this.group.add(this.bubble);
        }
        const c = this.bubble.userData.canvas, g = c.getContext('2d');
        g.clearRect(0, 0, 512, 200);
        g.font = '700 34px "Segoe UI", "Segoe UI Emoji", Arial, sans-serif';
        // ngắt dòng, tối đa 3 dòng
        const lines = [];
        let line = '';
        let cut = false;
        for (const word of text.split(/\s+/)) {
            const tryLine = line ? line + ' ' + word : word;
            if (g.measureText(tryLine).width <= 440 || !line) line = tryLine;
            else {
                lines.push(line);
                line = word;
                if (lines.length === 3) { cut = true; line = ''; break; }
            }
        }
        if (line) lines.push(line);
        if (cut) lines[2] = fitText(g, lines[2] + ' …', 440);
        const shown = lines.map(l => fitText(g, l, 440));
        const lineW = Math.max(...shown.map(l => g.measureText(l).width));
        const bw = Math.max(120, lineW + 52), bh = shown.length * 42 + 26, bx = (512 - bw) / 2, by = 200 - 30 - bh;
        g.fillStyle = 'rgba(255,255,255,0.96)';
        g.strokeStyle = '#' + this.color.getHexString();
        g.lineWidth = 5;
        roundRect(g, bx, by, bw, bh, 26);
        g.fill();
        g.stroke();
        g.beginPath();
        g.moveTo(236, by + bh - 3); g.lineTo(256, 196); g.lineTo(276, by + bh - 3);
        g.closePath();
        g.fill();
        g.fillStyle = '#1a0f2e';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        shown.forEach((l, i) => g.fillText(l, 256, by + 34 + i * 42));
        this.bubble.material.map.needsUpdate = true;
        this.bubble.visible = true;
        this.bubbleUntil = clock.elapsed + seconds;
        // tối đa 4 bong bóng cùng lúc, người nói trước tắt trước
        const i = activeBubbles.indexOf(this);
        if (i >= 0) activeBubbles.splice(i, 1);
        activeBubbles.push(this);
        while (activeBubbles.length > 4) {
            const old = activeBubbles.shift();
            if (old.bubble) old.bubbleUntil = 0;
        }
    }
    hearts(count = 8) {
        const p = this.group.position, h = this.height;
        for (let i = 0; i < count; i++) {
            emit(p.x + rand(-0.35, 0.35), p.y + h * rand(0.6, 1), p.z + rand(-0.2, 0.2), rand(-0.4, 0.4), rand(1.2, 2.4), 0, pick([0xff3d7f, 0xff2bd6, 0xff8cb8]), rand(0.8, 1.3), -0.6);
        }
    }

    drawLabel() {
        const g = this.labelCanvas.getContext('2d');
        g.clearRect(0, 0, 256, 64);
        roundRect(g, 3, 8, 250, 48, 24);
        g.fillStyle = this.isNpc ? 'rgba(10,6,20,0.45)' : 'rgba(10,6,20,0.75)';
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = this.topRank ? RANK_COLORS[this.topRank] : 'rgba(255,255,255,0.25)';
        g.stroke();
        g.save();
        g.beginPath();
        g.arc(32, 32, 20, 0, Math.PI * 2);
        g.clip();
        if (this.avatarImg) g.drawImage(this.avatarImg, 12, 12, 40, 40);
        else {
            g.fillStyle = `#${this.color.getHexString()}`;
            g.fillRect(12, 12, 40, 40);
            g.fillStyle = '#fff';
            g.font = '700 22px "Segoe UI", Arial, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText((this.nickname[0] || '?').toUpperCase(), 32, 33);
        }
        g.restore();
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        let x = 60;
        if (this.topRank) {
            g.font = '800 22px "Segoe UI Emoji", "Segoe UI", sans-serif';
            g.fillStyle = RANK_COLORS[this.topRank];
            g.fillText(this.topRank === 1 ? '👑' : `#${this.topRank}`, x, 33);
            x += 32;
        }
        g.font = '600 21px "Segoe UI", Arial, sans-serif';
        g.fillStyle = this.isNpc ? 'rgba(255,255,255,0.75)' : '#ffffff';
        g.fillText(fitText(g, this.nickname, 244 - x), x, 33);
        this.labelTex.needsUpdate = true;
    }

    update(dt, t, beat) {
        if (this.action && t > this.actionUntil) this.action = null;
        const dancing = this.action === 'dance' || this.action === 'celebrate';
        const fps = dancing ? 18 : this.action ? 14 : 10;
        this.frameAcc += dt * fps;
        while (this.frameAcc >= 1) { this.frame = (this.frame + 1) % this.frames.length; this.frameAcc -= 1; }
        const map = this.frames[this.frame];
        if (this.material.map !== map) { const was = this.material.map; this.material.map = map; if (!was) this.material.needsUpdate = true; }

        const target = this.topRank ? PODIUMS[this.topRank].pos : this.slotPos;
        this.pos.lerp(target, damp(this.topRank ? 3 : 4, dt));
        this.growMul += ((t < this.growUntil ? 2.1 : 1) - this.growMul) * damp(3, dt);
        const s = this.currentScale;
        let x = this.pos.x, y = this.pos.y, z = this.pos.z, sx = 1, sy = 1, tilt = 0;
        const w = beat.bps * Math.PI;
        switch (this.action) {
            case 'dance': {
                const b = Math.abs(Math.sin(t * w + this.seed));
                y += b * 0.22 * s;
                sx = 1 + (1 - b) * 0.08; sy = 1 - (1 - b) * 0.06;
                x += Math.sin(t * w * 0.5 + this.seed) * 0.08 * s;
                tilt = Math.sin(t * w * 0.5 + this.seed) * 0.12;
                break;
            }
            case 'jump': {
                const p = (t * 1.5 + this.seed) % 1;
                y += 4 * p * (1 - p) * 0.9 * s;
                break;
            }
            case 'walk': {
                const a = t * 1.9 + this.seed;
                x += Math.cos(a) * 0.5; z += Math.sin(a) * 0.32;
                y += Math.abs(Math.sin(t * 8)) * 0.05;
                break;
            }
            case 'celebrate': {
                const p = (t * 1.6 + this.seed) % 1;
                y += 4 * p * (1 - p) * 1.1 * s;
                tilt = Math.sin(t * 9) * 0.15;
                this.sparkleAcc += dt;
                while (this.sparkleAcc > 0.06) {
                    this.sparkleAcc -= 0.06;
                    emit(x + rand(-0.5, 0.5), y + rand(0.2, this.height), z + rand(-0.3, 0.3), rand(-0.3, 0.3), rand(0.6, 1.4), 0, pick([0xffd54a, 0xffffff, 0xff2bd6]), rand(0.5, 0.9), 0);
                }
                break;
            }
            default:
                y += Math.abs(Math.sin(t * w * 0.5 + this.seed)) * 0.035 * s;
        }
        const h = CHAR_HEIGHT * s * this.growMul;
        this.sprite.scale.set(h * this.aspect * sx, h * sy, 1);
        this.material.rotation = tilt;
        this.group.position.set(x, y, z);

        const labelW = clamp(s * 1.6, 0.6, 1.1) * (this.topRank ? 1.25 : 1) * (this.growMul > 1.3 ? 1.3 : 1);
        this.label.scale.set(labelW, labelW / 4, 1);
        this.label.position.y = h * sy + 0.04;
        const crowded = players.size > 60;
        this.label.visible = !crowded || this.topRank > 0 || t < this.labelUntil || focus.userId === this.userId;

        if (this.title) {
            if (t > this.titleUntil) this.title.visible = false;
            const tw = labelW * 1.5;
            this.title.scale.set(tw, tw / 4, 1);
            this.title.position.y = this.label.position.y + labelW / 4 + 0.02;
        }
        if (this.bubble) {
            if (t > this.bubbleUntil) this.bubble.visible = false;
            const bw = labelW * 1.6;
            this.bubble.scale.set(bw, bw * 200 / 512, 1);
            const titleOn = this.title && this.title.visible;
            this.bubble.position.y = titleOn ? this.title.position.y + labelW * 1.5 / 4 : this.label.position.y + labelW / 4 + 0.02;
            this.bubble.material.opacity = Math.min(1, this.opacity * 1.1);
        }
        this.aura.scale.setScalar(s * 1.6 * this.growMul);
        this.aura.material.opacity = 0.45 + 0.4 * beat.pulse;

        this.opacity += (this.visibility - this.opacity) * damp(5, dt);
        this.material.opacity = this.opacity;
        this.label.material.opacity = Math.min(1, this.opacity * 1.1);
        if (this.title) this.title.material.opacity = this.opacity;
    }

    dispose() {
        actorsGroup.remove(this.group);
        this.material.dispose();
        this.labelTex.dispose();
        this.label.material.dispose();
        this.aura.geometry.dispose();
        this.aura.material.dispose();
        if (this.title) { this.title.material.map.dispose(); this.title.material.dispose(); }
        if (this.bubble) { this.bubble.material.map.dispose(); this.bubble.material.dispose(); }
        const bi = activeBubbles.indexOf(this);
        if (bi >= 0) activeBubbles.splice(bi, 1);
    }
}

// ───────────────────────── Quản lý người chơi (theo PlayerManager của bản Unity) ─────────────────────────
const players = new Map();
const playerOrder = [];
const crowdSlots = new Map();
const donors = new Map();
const focus = { userId: null, until: 0 };
let nextNpcRefillAt = 0;
const layout = { halfW: 6, cols: 24, rows: 17, front: 3.75, back: -3.6 };

function crowdCapacity() { return layout.cols * layout.rows; }
function allocateSlot() {
    const occupied = new Set(crowdSlots.values());
    const cap = crowdCapacity();
    const available = [];
    for (let s = 0; s < cap; s++) if (!occupied.has(s)) available.push(s);
    if (!available.length) return Math.floor(Math.random() * cap);
    const minD = occupied.size < 30 ? 9 : occupied.size < 80 ? 4 : occupied.size < 140 ? 2 : 1;
    const occ = [...occupied];
    const separated = available.filter(c => occ.every(o => {
        const dr = Math.floor(c / layout.cols) - Math.floor(o / layout.cols);
        const dc = (c % layout.cols) - (o % layout.cols);
        return dr * dr + dc * dc >= minD;
    }));
    return pick(separated.length ? separated : available);
}
function reflow() {
    const count = playerOrder.length;
    const scale = count <= 30 ? 0.65 : count <= 80 ? 0.56 : count <= 140 ? 0.46 : count <= 200 ? 0.38 : count <= 280 ? 0.32 : 0.27;
    const xSpacing = (layout.halfW * 2) / Math.max(1, layout.cols - 1);
    const zSpacing = (layout.front - layout.back) / (layout.rows - 1);
    for (const id of playerOrder) {
        const actor = players.get(id);
        if (!actor) continue;
        let slot = crowdSlots.get(id);
        if (slot === undefined || slot >= crowdCapacity()) { slot = allocateSlot(); crowdSlots.set(id, slot); }
        const row = Math.floor(slot / layout.cols), col = slot % layout.cols;
        const stagger = row % 2 ? xSpacing * 0.5 : 0;
        const x = clamp((col - (layout.cols - 1) / 2) * xSpacing + stagger, -layout.halfW, layout.halfW);
        const z = layout.front - row * zSpacing;
        actor.slotPos.set(x, 0, z);
        actor.slotScale = scale * (1.06 + (0.86 - 1.06) * (row / (layout.rows - 1)));
    }
}
function createActor(data) {
    if (!data || !data.userId || !characterNames.length) return null;
    const isNpc = String(data.userId).startsWith('npc-');
    if (!isNpc) removeOneNpc();
    const actor = new Actor(data, isNpc);
    if (data.titleLabel && (!data.titleExpiresAt || data.titleExpiresAt > Date.now())) {
        actor.showTitle(data.titleLabel, data.titleVariant || 'fire', data.titleExpiresAt ? (data.titleExpiresAt - Date.now()) / 1000 : 10);
    }
    players.set(data.userId, actor);
    playerOrder.push(data.userId);
    crowdSlots.set(data.userId, allocateSlot());
    reflow();
    applyVisibility();
    return actor;
}
function getOrCreate(data) {
    if (!data.userId) return null;
    const existing = players.get(data.userId);
    if (existing) { existing.updateIdentity(data); existing.touch(); return existing; }
    if (players.size >= cfg.maxPlayers) removeOldest();
    const actor = createActor(data);
    actor?.touch();
    return actor;
}
function removeActor(id) {
    const actor = players.get(id);
    if (!actor) return;
    players.delete(id);
    playerOrder.splice(playerOrder.indexOf(id), 1);
    crowdSlots.delete(id);
    actor.dispose();
    reflow();
    if (!actor.isNpc) nextNpcRefillAt = clock.elapsed + 30;
}
function removeOldest() {
    let oldest = null;
    for (const a of players.values()) if (!oldest || a.lastActive < oldest.lastActive) oldest = a;
    if (oldest) removeActor(oldest.userId);
}
function removeOneNpc() {
    for (let i = playerOrder.length - 1; i >= 0; i--) {
        const a = players.get(playerOrder[i]);
        if (a && a.isNpc) { removeActor(a.userId); return; }
    }
}
function ensureNpcCrowd() {
    const real = [...players.values()].filter(a => !a.isNpc).length;
    const desired = Math.max(0, Math.min(settings.npc - real, cfg.maxPlayers - real));
    let current = [...players.values()].filter(a => a.isNpc).length;
    for (let i = 0; current < desired && i < NPC_NAMES.length; i++) {
        const id = `npc-${String(i).padStart(3, '0')}`;
        if (players.has(id)) continue;
        createActor({ userId: id, uniqueId: id, nickname: NPC_NAMES[i] });
        current++;
    }
    nextNpcRefillAt = Infinity;
}
function clearPlayers() {
    for (const a of players.values()) a.dispose();
    players.clear();
    playerOrder.length = 0;
    crowdSlots.clear();
    focus.userId = null;
    nextNpcRefillAt = 0;
}
function applyVisibility() {
    for (const [id, a] of players) {
        if (!focus.userId) a.visibility = a.isNpc ? 0.85 : 1;
        else if (id === focus.userId) a.visibility = 1;
        else a.visibility = a.topRank ? 0.4 : a.isNpc ? 0.14 : 0.22;
    }
}
function focusPlayer(userId, seconds) {
    focus.userId = userId;
    focus.until = clock.elapsed + seconds;
    applyVisibility();
}
function updateTopRanks() {
    const ranked = [...donors.values()]
        .filter(d => players.has(d.userId) && !players.get(d.userId).isNpc && d.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    const ranks = new Map(ranked.map((d, i) => [d.userId, i + 1]));
    for (const [id, a] of players) a.setTopRank(ranks.get(id) || 0);
    applyVisibility();
    renderTop3();
}
function danceAll(seconds) { for (const a of players.values()) a.dance(seconds); }

// ───────────────────────── Camera ─────────────────────────
const cam = { pos: new THREE.Vector3(0, 6, 18), look: new THREE.Vector3(0, 1.3, -1), basePos: new THREE.Vector3(), baseLook: new THREE.Vector3(), shot: null };
const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3();

// quà / pháo hoa (3) > vào sàn, follow, share (2) > cmt, thả tim (1)
const SHOT_PRIORITY = { fireworks: 3, gift: 3, welcome: 2, react: 1 };
function cameraFocus(actor, seconds, opts = {}) {
    if (!actor) return;
    const now = clock.elapsed;
    const cur = cam.shot && now < cam.shot.until && players.has(cam.shot.actor.userId) ? cam.shot : null;
    if (cur) {
        const pNew = SHOT_PRIORITY[opts.kind] ?? 3, pCur = SHOT_PRIORITY[cur.kind] ?? 3;
        if (pNew < pCur) return;
        if (cur.actor === actor && pNew === pCur) { cur.until = Math.max(cur.until, now + seconds); return; }
        // cùng loại nhẹ: giữ khung hình ít nhất 1.8s cho khỏi giật camera khi chat dồn dập
        if (pNew === pCur && pNew < 3 && now - cur.start < 1.8) return;
    }
    cam.shot = { actor, until: now + seconds, start: now, ...opts };
}
// Lúc không có sự kiện: tự đổi góc quay (toàn cảnh, lia vòng, cẩu, DJ, lia sát hàng đầu, bục top, zoom ngẫu nhiên vài người)
const director = { mode: 'wide', start: 0, until: 0, actor: null, dir: 1, last: '' };
const IDLE_SHOTS = { wide: 6, orbit: 8, crane: 6.5, dj: 5, dolly: 7, podium: 5, peek: 4 };
const IDLE_PLAYLIST = ['peek', 'orbit', 'peek', 'wide', 'crane', 'peek', 'dj', 'peek', 'dolly', 'podium', 'peek', 'wide'];
function pickPeekActor() {
    const all = [...players.values()].filter(a => a !== director.actor);
    const real = all.filter(a => !a.isNpc);
    let pool = real.length && Math.random() < 0.85 ? real : all;
    // ưu tiên người ở nửa trước sàn cho khỏi bị người khác che
    const front = pool.filter(a => a.group.position.z > (layout.front + layout.back) / 2);
    if (front.length && Math.random() < 0.75) pool = front;
    return pool.length ? pick(pool) : null;
}
// đứng càng sâu trong đám đông thì camera càng nâng cao, nhìn chéo xuống
function crowdLift(p) { return clamp((layout.front - p.z) * 0.3, 0, 2.4); }
function nextIdleShot(t, forceMode) {
    let mode = forceMode;
    if (!mode) {
        const options = IDLE_PLAYLIST.filter(m => m !== director.last && (m !== 'podium' || [...players.values()].some(a => a.topRank)));
        mode = pick(options);
    }
    let actor = null;
    if (mode === 'peek') {
        actor = pickPeekActor();
        if (!actor) mode = 'orbit';
        else {
            actor.dance(IDLE_SHOTS.peek + 0.5);
            actor.labelUntil = t + IDLE_SHOTS.peek + 2;
        }
    }
    Object.assign(director, { mode, actor, start: t, until: t + IDLE_SHOTS[mode] * rand(0.85, 1.15), dir: Math.random() < 0.5 ? -1 : 1, last: mode });
}
function focusActor() {
    if (cam.shot && players.has(cam.shot.actor.userId) && cam.shot.kind !== 'fireworks') return cam.shot.actor;
    if (!cam.shot && director.mode === 'peek' && director.actor && players.has(director.actor.userId)) return director.actor;
    return null;
}
function idleCamera(t, far) {
    if (cam.wasShot) { cam.wasShot = false; nextIdleShot(t, 'wide'); director.until = t + 2.5; }
    if (t > director.until || (director.mode === 'peek' && !players.has(director.actor?.userId))) nextIdleShot(t);
    const u = clamp((t - director.start) / Math.max(0.1, director.until - director.start), 0, 1);
    const ease = u * u * (3 - 2 * u);
    const bp = cam.basePos, bl = cam.baseLook;
    const R = Math.hypot(bp.z - bl.z, bp.y - bl.y);
    switch (director.mode) {
        case 'orbit': {
            const ang = (ease - 0.5) * 1.1 * director.dir;
            tmpV.set(bl.x + Math.sin(ang) * R * 0.8, bl.y + (bp.y - bl.y) * 0.62, bl.z + Math.cos(ang) * R * 0.8);
            tmpL.copy(bl);
            break;
        }
        case 'crane':
            tmpV.set(director.dir * 1.8 * (1 - ease), 1.1 + (bp.y + 1.5 - 1.1) * ease, bl.z + R * (0.5 + 0.42 * ease));
            tmpL.set(bl.x, bl.y + 1.2 * (1 - ease), bl.z);
            break;
        case 'dj':
            tmpV.set(Math.sin(t * 0.35) * 1.8, 3.3, STAGE_Z + 9 * far - ease * 1.5);
            tmpL.set(0, 2.5, STAGE_Z - 0.8);
            break;
        case 'dolly': {
            const x = (ease * 2 - 1) * layout.halfW * 0.8 * director.dir;
            tmpV.set(x, 1.7, layout.front + 3.4 * far);
            tmpL.set(x * 0.7, 1.05, layout.front - 2.5);
            break;
        }
        case 'podium':
            tmpV.set(Math.sin(t * 0.3) * 1.2, 2.6, PODIUM_Z + 5.6 * far - ease);
            tmpL.set(0, 1.9, PODIUM_Z);
            break;
        case 'peek': {
            const a = director.actor, p = a.group.position, h = a.height;
            const dist = 3.2 + h * 1.1;
            const side = director.dir * (0.9 - ease * 1.6);
            const lift = crowdLift(p);
            tmpV.set(p.x + side, p.y + h * 0.7 + 0.45 + lift, p.z + dist * far - lift * 0.3);
            tmpL.set(p.x, p.y + h * 0.62, p.z);
            break;
        }
        default:
            tmpV.copy(bp);
            tmpV.x += Math.sin(t * 0.13) * 0.9;
            tmpV.y += Math.sin(t * 0.21) * 0.3;
            tmpL.copy(bl);
    }
}

function updateCamera(dt, t, beat) {
    if (cam.shot && (clock.elapsed > cam.shot.until || !players.has(cam.shot.actor.userId))) cam.shot = null;
    if (cam.shot) cam.wasShot = true;
    const portrait = camera.aspect < 1;
    const far = portrait ? 1.35 : 1;
    if (cam.shot) {
        const a = cam.shot.actor, p = a.group.position, h = a.height;
        if (cam.shot.kind === 'fireworks') {
            tmpV.set(p.x * 0.5, 3.6, p.z + 10 * far);
            tmpL.set(p.x * 0.5, 3.2, p.z - 2);
        } else if (cam.shot.wide) {
            tmpV.set(p.x, 2.6 + h * 0.3, p.z + (6.5 + h) * far);
            tmpL.set(p.x, h * 0.55, p.z);
        } else {
            const react = cam.shot.kind === 'react' || cam.shot.kind === 'welcome';
            const dist = (cam.shot.close ? 2.6 : react ? 3.4 : 3.8) + h * 1.1;
            const lift = crowdLift(p);
            tmpV.set(p.x + Math.sin(t * 0.4) * 0.3, p.y + h * 0.75 + 0.5 + lift, p.z + dist * far - lift * 0.3);
            // cmt / chào: nhìn cao hơn chút để thấy bong bóng chat
            tmpL.set(p.x, p.y + h * (react ? 0.85 : 0.6), p.z);
        }
    } else {
        idleCamera(t, far);
    }
    const k = damp(cam.shot ? 2.4 : director.mode === 'peek' ? 2 : 1.3, dt);
    cam.pos.lerp(tmpV, k);
    cam.look.lerp(tmpL, k);
    camera.position.copy(cam.pos);
    if (beat.inDrop || party.until > t) {
        const kick = beat.pulse * 0.035;
        camera.position.x += (Math.random() - 0.5) * kick;
        camera.position.y += (Math.random() - 0.5) * kick;
    }
    camera.lookAt(cam.look);
    // nhịp mạnh: camera "giật" zoom nhẹ theo beat
    const fov = cam.baseFov - ((beat.inDrop || party.until > t) ? beat.pulse * 1.6 : beat.pulse * 0.4);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

function applyLayout() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    camera.fov = aspect < 1 ? 50 : 42;
    cam.baseFov = camera.fov;
    camera.updateProjectionMatrix();
    const portrait = aspect < 1;
    layout.halfW = aspect < 0.8 ? 3.6 : aspect < 1.3 ? 5 : 6;
    layout.cols = Math.round(layout.halfW * 2 / 0.5) + 1;
    layout.rows = portrait ? 20 : 17;
    layout.front = portrait ? 4.6 : 3.75;
    layout.back = -3.6;
    const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = clamp((layout.halfW + (portrait ? 2.2 : 4.5)) / (vt * aspect), 13, 42);
    const elev = THREE.MathUtils.degToRad(portrait ? 24 : 26);
    cam.baseLook.set(0, portrait ? 2.2 : 1.6, portrait ? 0.2 : -0.6);
    cam.basePos.set(0, cam.baseLook.y + Math.sin(elev) * dist, cam.baseLook.z + Math.cos(elev) * dist);
    if (!cam.shot) { cam.pos.copy(cam.basePos); cam.look.copy(cam.baseLook); }
    // Màn LED vừa khung hình
    const wallDist = cam.basePos.z - SCREEN_Z;
    const visibleW = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * wallDist * aspect;
    const sw = Math.min(15, visibleW * 0.96), sh = sw * 9 / 16;
    screen.scale.set(sw, sh, 1);
    screen.position.set(0, 1.3 + sh / 2, SCREEN_Z);
    screenFrame.scale.set(sw + 0.3, sh + 0.3, 1);
    screenFrame.position.set(0, screen.position.y, SCREEN_Z - 0.08);
    for (const id of playerOrder) {
        const s = crowdSlots.get(id);
        if (s !== undefined && s >= crowdCapacity()) crowdSlots.delete(id);
    }
    reflow();
}
window.addEventListener('resize', applyLayout);

// ───────────────────────── DJ ─────────────────────────
let dj = null;
function createDj() {
    const name = characters.hanhan_video_dance ? 'hanhan_video_dance' : characterNames[0];
    const mat = new THREE.SpriteMaterial({ map: characters[name].frames[0], transparent: true, alphaTest: 0.08 });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0);
    const h = 3;
    sprite.scale.set(h * characters[name].aspect, h, 1);
    sprite.position.set(0, 0.55, STAGE_Z - 0.2);
    room.add(sprite);
    dj = { sprite, mat, frames: characters[name].frames, frame: 0, acc: 0 };
}
function updateDj(dt, beat) {
    if (!dj) return;
    dj.acc += dt * 16;
    while (dj.acc >= 1) { dj.frame = (dj.frame + 1) % dj.frames.length; dj.acc -= 1; }
    dj.mat.map = dj.frames[dj.frame];
    dj.sprite.position.y = 0.55 + beat.pulse * 0.06;
}

// ───────────────────────── Nhịp / hiệu ứng đèn ─────────────────────────
const clock = { elapsed: 0, last: performance.now() };
const party = { energy: 0, until: 0 };
let bass = 0;
let analyser = null, analyserData = null;

function beatInfo(t) {
    const bps = cfg.bpm / 60;
    const beats = t * bps;
    const phase = beats % 1;
    const bar = Math.floor(beats / cfg.beatsPerBar);
    const inDrop = (bar % cfg.dropEveryBars) >= cfg.dropEveryBars - cfg.dropBars;
    const pulse = Math.max(Math.pow(1 - phase, 3), bass);
    return { bps, beats, phase, bar, inDrop, pulse };
}

const DOWN = new THREE.Vector3(0, -1, 0), aimV = new THREE.Vector3(), aimT = new THREE.Vector3();
function updateLights(dt, t, beat) {
    if (analyser) {
        analyser.getByteFrequencyData(analyserData);
        let sum = 0;
        for (let i = 1; i < 8; i++) sum += analyserData[i];
        const level = clamp((sum / 7 / 255 - 0.45) / 0.45, 0, 1);
        bass = Math.max(level, bass - dt * 3);
    }
    const partying = party.until > t;
    const hot = beat.inDrop || partying;
    const mode = Math.floor(beat.bar / 4) % 4;
    const fb = Math.floor(beat.beats);
    for (let i = 0; i < tileInfo.length; i++) {
        const { ix, iz, x, z } = tileInfo[i];
        let v;
        if (mode === 0) v = 0.5 + 0.5 * Math.sin(Math.hypot(x, z + 1) * 1.5 - beat.beats * Math.PI);
        else if (mode === 1) v = (ix + iz + fb) % 4 === 0 ? 1 : 0.1;
        else if (mode === 2) v = ((ix >> 1) + (iz >> 1) + fb) % 2 ? 1 : 0.08;
        else v = 0.5 + 0.5 * Math.sin(x * 0.9 + beat.beats * Math.PI * 0.5);
        const hue = (t * 0.04 + x * 0.025 + z * 0.02 + (hot ? beat.bar * 0.17 : 0)) % 1;
        const intensity = 0.04 + v * (0.16 + 0.42 * beat.pulse) * (hot ? 1.35 : 1);
        tmpColor.setHSL(hue, 1, 0.5).multiplyScalar(intensity);
        tiles.setColorAt(i, tmpColor);
    }
    tiles.instanceColor.needsUpdate = true;

    // đèn quét: đổi kiểu mỗi 8 ô nhịp (quét / bắt chéo / dồn một điểm / chạy đuổi), 2 đèn giữa bám người đang được zoom
    const lightMode = Math.floor(beat.bar / 8) % 4;
    const sweep = hot ? 1.7 : 0.75;
    const fa = focusActor();
    const colorShift = hot ? Math.floor(beat.beats / 2) : beat.bar;
    beams.forEach((b, i) => {
        const px = b.pivot.position.x, pz = b.pivot.position.z;
        const spot = fa && (i === 3 || i === 4);
        let gain = 1;
        if (spot) aimT.set(fa.group.position.x, fa.group.position.y + fa.height * 0.4, fa.group.position.z);
        else if (lightMode === 0) aimT.set(px + Math.sin(t * sweep + b.seed) * 4.5, 0, pz - 2 + Math.cos(t * sweep * 0.8 + b.seed) * 3.5);
        else if (lightMode === 1) aimT.set(-px * Math.sin(t * sweep * 1.1 + (i % 2) * Math.PI), 0, 0.5 + Math.cos(t * 0.7 + i) * 2.5);
        else if (lightMode === 2) aimT.set(Math.sin(t * 0.9) * 3.5 + (i - 3.5) * 0.15, 0, Math.cos(t * 0.6) * 2.5 + 0.5);
        else {
            aimT.set(px * 0.6 + Math.sin(t * 2 + i) * 1.5, 0, pz - 3 + Math.cos(t * 1.7 + i));
            gain = Math.floor(beat.beats * 2) % beams.length === i ? 2 : 0.35;
        }
        aimV.subVectors(aimT, b.pivot.position);
        const len = aimV.length();
        aimV.divideScalar(len);
        b.q.setFromUnitVectors(DOWN, aimV);
        b.pivot.quaternion.slerp(b.q, damp(spot ? 7 : 4, dt));
        const thin = spot ? 0.32 : 1;
        b.beam.scale.set(thin, clamp(len / 10, 0.6, 1.6), thin);
        if (spot) {
            b.mat.color.setHex(0xfff2c0);
            b.mat.opacity = 0.1 + beat.pulse * 0.04;
        } else {
            b.mat.color.setHex(NEON[(i + colorShift) % NEON.length]);
            b.mat.opacity = ((hot ? 0.13 : 0.08) + beat.pulse * 0.06) * gain;
        }
    });
    if (fa) {
        spotPool.position.x = fa.group.position.x;
        spotPool.position.z = fa.group.position.z;
        spotPool.scale.setScalar(0.45 + fa.height * 0.35);
    }
    spotPool.material.opacity += ((fa ? 0.35 + beat.pulse * 0.15 : 0) - spotPool.material.opacity) * damp(6, dt);
    // strobe khi drop / quẩy
    hemi.intensity = hot && beat.phase < 0.07 && Math.floor(beat.beats) % 2 === 0 ? 1.8 : 0.6;
    for (const l of lasers) {
        const fan = (l.k - 2.5) * 0.16;
        l.mesh.rotation.z = -l.side * (0.9 + fan + Math.sin(t * 1.3 + l.k) * 0.25);
        l.mesh.rotation.x = 0.9 + Math.sin(t * 0.9 + l.k * 0.5) * 0.25;
        l.mat.opacity += ((hot ? 0.75 : lightMode === 1 ? 0.3 : 0) - l.mat.opacity) * damp(6, dt);
        l.mesh.visible = l.mat.opacity > 0.02;
    }
    colorLights.forEach((light, i) => {
        light.intensity = 18 + beat.pulse * 40;
        light.position.x = (i - 1.5) * 4 + Math.sin(t * 0.5 + i * 1.7) * 2.2;
        light.position.z = -2 + (i % 2) * 4 + Math.cos(t * 0.4 + i) * 1.5;
        light.color.setHSL((t * 0.05 + i * 0.25) % 1, 1, 0.55);
    });
    tmpColor.setHSL((t * 0.1) % 1, 1, 0.55);
    stageEdge.material.color.copy(tmpColor).multiplyScalar(0.6 + beat.pulse);
    boothStrip.material.color.setHSL((t * 0.1 + 0.5) % 1, 1, 0.5 + beat.pulse * 0.2);
    for (let r = 1; r <= 3; r++) PODIUMS[r].ring.material.color.set(PODIUMS[r].color).multiplyScalar(0.7 + beat.pulse * 0.8);
    disco.rotation.y += dt * 0.6;
    const hp = haze.geometry.attributes.position.array;
    for (let i = 0; i < hazeCount; i++) {
        hp[i * 3] += Math.sin(t * 0.1 + i) * dt * 0.15;
        hp[i * 3 + 1] += Math.cos(t * 0.07 + i) * dt * 0.05;
    }
    haze.geometry.attributes.position.needsUpdate = true;
    haze.material.opacity = 0.04 + beat.pulse * 0.025;
}

function drawProceduralScreen(t, beat) {
    const g = screenCtx, W = 640, H = 360;
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, `hsl(${(t * 20) % 360},90%,18%)`);
    grad.addColorStop(1, `hsl(${(t * 20 + 120) % 360},90%,10%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const bars = 32;
    for (let i = 0; i < bars; i++) {
        let v;
        if (analyserData) v = analyserData[2 + i * 3] / 255;
        else v = 0.25 + 0.6 * Math.abs(Math.sin(i * 0.7 + t * 3)) * (0.4 + beat.pulse * 0.6);
        const bh = v * H * 0.55;
        g.fillStyle = `hsl(${(i * 11 + t * 40) % 360},100%,60%)`;
        g.fillRect(i * (W / bars) + 3, H - bh, W / bars - 6, bh);
    }
    g.save();
    g.translate(W / 2, H * 0.38);
    const s = 1 + beat.pulse * 0.06;
    g.scale(s, s);
    g.font = '900 64px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff2bd6';
    g.shadowBlur = 30;
    g.fillStyle = '#fff';
    g.fillText('SÀN QUẨY', 0, -20);
    g.shadowColor = '#00e5ff';
    g.fillStyle = '#00e5ff';
    g.font = '800 40px "Segoe UI", Arial, sans-serif';
    g.fillText('ONLINE', 0, 40);
    g.restore();
    proceduralScreen.needsUpdate = true;
}

// ───────────────────────── Nhạc / video ─────────────────────────
const audio = new Audio();
audio.preload = 'auto';
let playlist = [], trackIndex = 0, audioUnlocked = false;
const sfx = new Audio('/assets/audio/fireworks.mp3');
sfx.volume = 0.45;
let lastSfx = 0;
function playSfx() {
    if (!audioUnlocked || performance.now() - lastSfx < 250) return;
    lastSfx = performance.now();
    const s = sfx.cloneNode();
    s.volume = 0.4;
    s.play().catch(() => {});
}
function playTrack() {
    if (!playlist.length) return;
    audio.src = playlist[trackIndex % playlist.length];
    audio.volume = cfg.musicVolume;
    audio.play().then(onAudioUnlocked).catch(() => { document.getElementById('sound-hint').hidden = false; });
}
audio.addEventListener('ended', () => { trackIndex++; playTrack(); });
function onAudioUnlocked() {
    audioUnlocked = true;
    document.getElementById('sound-hint').hidden = true;
    if (analyser) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.resume().then(() => {
            if (ctx.state !== 'running' || analyser) return;
            const src = ctx.createMediaElementSource(audio);
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyserData = new Uint8Array(analyser.frequencyBinCount);
            src.connect(analyser);
            analyser.connect(ctx.destination);
        });
    } catch {}
}
function unlock() {
    if (audioUnlocked) return;
    if (playlist.length) playTrack();
    else { audioUnlocked = true; document.getElementById('sound-hint').hidden = true; }
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

async function loadMedia() {
    let media = { music: [], video: [] };
    try { media = await (await fetch('/api/media')).json(); } catch {}
    const videos = media.video.filter(u => /\.(mp4|webm|m4v|mov)$/i.test(u));
    const images = media.video.filter(u => /\.(png|jpe?g|gif)$/i.test(u));
    if (videos.length) setScreenVideo(videos);
    else if (images.length) setScreenImage(images[0]);
    else setScreenVideo(['/assets/source/hanhan_dance_clip.mp4']);
    if (settings.music && media.music.length) {
        playlist = media.music;
        playTrack();
    }
}
function setScreenVideo(list) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    let i = 0;
    const next = () => { video.src = list[i % list.length]; i++; video.play().catch(() => {}); };
    video.loop = list.length === 1;
    video.addEventListener('ended', next);
    video.addEventListener('error', () => { screenSource = 'procedural'; screenMat.map = proceduralScreen; });
    video.addEventListener('playing', () => {
        if (screenSource === 'video') return;
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        screenMat.map = tex;
        screenMat.needsUpdate = true;
        screenSource = 'video';
    });
    next();
}
function setScreenImage(url) {
    loader.load(url, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        screenMat.map = tex;
        screenMat.needsUpdate = true;
        screenSource = 'image';
    });
}

// ───────────────────────── HUD ─────────────────────────
const ui = {
    players: document.getElementById('stat-players'),
    diamonds: document.getElementById('stat-diamonds'),
    likes: document.getElementById('stat-likes'),
    energyFill: document.getElementById('energy-fill'),
    energyText: document.getElementById('energy-text'),
    top3: document.getElementById('top3'),
    feed: document.getElementById('feed'),
    guide: document.getElementById('guide'),
    dot: document.getElementById('conn-dot'),
    warning: document.getElementById('conn-warning'),
    banner: document.getElementById('banner')
};
const stats = { diamonds: 0, likes: 0 };
function renderStats() {
    ui.players.textContent = formatNumber([...players.values()].filter(a => !a.isNpc).length);
    ui.diamonds.textContent = formatNumber(stats.diamonds);
    ui.likes.textContent = formatNumber(stats.likes);
}
function renderTop3() {
    const ranked = [...donors.values()].filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    ui.top3.replaceChildren(...ranked.map((d, i) => {
        const li = document.createElement('li');
        const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = ['🥇', '🥈', '🥉'][i];
        const name = document.createElement('span'); name.className = 'name'; name.textContent = d.nickname;
        const score = document.createElement('span'); score.className = 'score'; score.textContent = `💎 ${formatNumber(d.score)}`;
        li.append(rank, name, score);
        return li;
    }));
}
function addEnergy(amount) {
    party.energy += Math.max(0, amount);
    if (party.energy >= cfg.partyGoal) {
        party.energy %= cfg.partyGoal;
        partyBurst();
    }
    const pct = Math.floor(party.energy / cfg.partyGoal * 100);
    ui.energyFill.style.width = `${pct}%`;
    ui.energyText.textContent = `NĂNG LƯỢNG QUẨY ${pct}%`;
}
function partyBurst() {
    danceAll(7);
    party.until = clock.elapsed + 7;
    confetti(320);
    fireworks(4);
    ui.energyText.textContent = 'BÙNG NỔ! CẢ SÀN CÙNG QUẨY';
}
const FEED_COLORS = { gift: '#ff8cd6', chat: '#ffffff', member: '#59f2ff', social: '#ffd94d' };
function addFeed(text, kind) {
    const li = document.createElement('li');
    li.textContent = text;
    li.style.borderLeftColor = FEED_COLORS[kind] || '#00e5ff';
    if (kind === 'gift') li.style.color = FEED_COLORS.gift;
    ui.feed.append(li);
    while (ui.feed.children.length > 7) ui.feed.firstElementChild.remove();
    setTimeout(() => li.classList.add('old'), 14000);
    setTimeout(() => li.remove(), 15500);
}
let joinCommandText = 'hey';
const door = { el: document.getElementById('door'), queue: [], timer: 0 };
function showDoorToast(ev) {
    door.queue.push(ev);
    if (door.queue.length > 30) door.queue.splice(0, door.queue.length - 30);
    if (!door.timer) nextDoorToast();
}
function nextDoorToast() {
    const ev = door.queue.shift();
    if (!ev) { door.el.classList.remove('show'); door.timer = 0; return; }
    // đông người vào thì gộp: "A và 5 người khác"
    const extra = door.queue.length >= 3 ? door.queue.splice(0).length : 0;
    door.el.querySelector('img').src = ev.avatar ? '/api/avatar?u=' + encodeURIComponent(ev.avatar) : '/favicon.svg';
    door.el.querySelector('.who').textContent = extra ? ev.nickname + ' và ' + extra + ' người khác' : ev.nickname;
    door.el.querySelector('.cmd').textContent = joinCommandText;
    door.el.classList.remove('show');
    void door.el.offsetWidth;
    door.el.style.animationDuration = (extra ? 3.2 : 2.2) + 's';
    door.el.classList.add('show');
    door.timer = setTimeout(nextDoorToast, extra ? 3200 : 2200);
}

function renderGuide(msg) {
    if (msg.joinCommand) joinCommandText = msg.joinCommand;
    const parts = [];
    if (msg.joinCommand) {
        const s = document.createElement('span');
        s.className = 'item join';
        s.textContent = `💬 Chat "${msg.joinCommand}" để vào sàn`;
        parts.push(s);
    }
    if (msg.zoomGiftName) {
        const s = document.createElement('span');
        s.className = 'item';
        s.innerHTML = '';
        s.append(`🌹 ${msg.zoomGiftName}: `);
        const b = document.createElement('b'); b.textContent = 'ZOOM CAMERA'; s.append(b);
        parts.push(s);
    }
    for (const item of msg.guideItems || []) {
        const s = document.createElement('span');
        s.className = 'item';
        if (item.giftPictureUrl) { const img = document.createElement('img'); img.src = item.giftPictureUrl; img.alt = ''; s.append(img); }
        s.append(`${item.giftName}${item.diamondCount ? ` (${item.diamondCount}💎)` : ''}: `);
        const b = document.createElement('b'); b.textContent = item.label; s.append(b);
        parts.push(s);
    }
    ui.guide.replaceChildren(...parts);
}

// Băng rôn quà (hàng đợi theo cấu hình spotlight)
const bannerQueue = [];
let bannerBusyUntil = 0, bannerTimer = null;
function queueBanner(ev) {
    const spotlight = SPOTLIGHT_ACTIONS.has(ev.action);
    const ms = spotlight ? clamp(Number(ev.spotlightMs || ev.durationMs) || 5000, cfg.spotlight.minimumMs, cfg.spotlight.maximumMs) : 2600;
    bannerQueue.push({ ev, ms });
    while (bannerQueue.length > cfg.spotlight.maximumQueue) {
        const idx = bannerQueue.findIndex(b => !SPOTLIGHT_ACTIONS.has(b.ev.action));
        bannerQueue.splice(idx >= 0 ? idx : 0, 1);
    }
    if (performance.now() >= bannerBusyUntil) showNextBanner();
}
function showNextBanner() {
    clearTimeout(bannerTimer);
    const next = bannerQueue.shift();
    if (!next) {
        ui.banner.classList.remove('show');
        ui.banner.classList.add('hide');
        bannerTimer = setTimeout(() => { ui.banner.hidden = true; }, 350);
        return;
    }
    const { ev, ms } = next;
    document.getElementById('banner-avatar').src = ev.avatar ? `/api/avatar?u=${encodeURIComponent(ev.avatar)}` : '/favicon.svg';
    document.getElementById('banner-label').textContent = ev.label || 'CẢM ƠN QUÀ';
    document.getElementById('banner-name').textContent = ev.nickname || 'TikTok user';
    document.getElementById('banner-gift-img').src = ev.giftPictureUrl || '';
    const repeat = ev.repeatCount > 1 ? ` x${ev.repeatCount}` : '';
    document.getElementById('banner-gift-text').textContent = `tặng ${ev.giftName || 'quà'}${repeat} · ${formatNumber(ev.diamondCount)}💎`;
    ui.banner.hidden = false;
    ui.banner.classList.remove('hide', 'show');
    void ui.banner.offsetWidth;
    ui.banner.classList.add('show');
    bannerBusyUntil = performance.now() + ms;
    bannerTimer = setTimeout(showNextBanner, ms);
}

// ───────────────────────── Xử lý sự kiện (theo TikTokGameController + PlayerManager) ─────────────────────────
function applyAction(actor, ev, seconds) {
    const a = ev.action;
    if (a === 'join') { /* về chỗ của mình */ }
    else if (a === 'change') actor.changeCharacter();
    else if (a === 'walk') actor.walk(seconds);
    else if (a === 'jump') actor.jump(seconds);
    else if (a === 'grow') actor.grow(seconds);
    else if (SPOTLIGHT_ACTIONS.has(a)) actor.celebrate(clamp(seconds, 2.5, 15));
    else actor.dance(clamp(seconds, 2, 10));
    if (ev.label && (a === 'medal' || a === 'vip' || a === 'topdj')) {
        actor.showTitle(ev.label, ev.variant || (a === 'medal' ? 'fire' : 'royal'), Math.max(3, seconds));
    }
}

function handleEvent(ev) {
    switch (ev.type) {
        case 'config': applyConfig(ev); return;
        case 'status': setConnStatus(ev); return;
        case 'metrics': stats.likes = ev.likes || 0; stats.diamonds = ev.diamonds || 0; renderStats(); return;
        case 'viewer_guide': renderGuide(ev); return;
        case 'snapshot':
            clearPlayers();
            donors.clear();
            for (const p of ev.players || []) createActor(p);
            for (const d of ev.vipScores || []) donors.set(d.userId, { userId: d.userId, nickname: d.nickname, score: d.score || 0 });
            ensureNpcCrowd();
            updateTopRanks();
            renderStats();
            return;
        case 'reset':
            clearPlayers();
            donors.clear();
            party.energy = 0;
            addEnergy(0);
            ui.feed.replaceChildren();
            bannerQueue.length = 0;
            ensureNpcCrowd();
            updateTopRanks();
            renderStats();
            return;
    }
    if (!['member', 'chat', 'gift', 'like', 'follow', 'share'].includes(ev.type)) return;

    if (ev.type === 'gift') {
        const d = donors.get(ev.userId) || { userId: ev.userId, nickname: ev.nickname, score: 0 };
        d.nickname = ev.nickname || d.nickname;
        d.score += ev.diamondCount || 0;
        donors.set(ev.userId, d);
        addEnergy((ev.diamondCount || 0) * 2);
        addFeed(`${ev.nickname} tặng ${ev.giftName}${ev.repeatCount > 1 ? ` x${ev.repeatCount}` : ''} (+${ev.diamondCount})`, 'gift');
    } else if (ev.type === 'chat') {
        addEnergy(2);
        addFeed(`${ev.nickname}: ${ev.comment}`, 'chat');
    } else if (ev.type === 'like') {
        addEnergy((ev.likeCount || 0) * 0.08);
    } else if (ev.type === 'member') {
        addEnergy(1);
        if (!ev.spectatorOnly) addFeed(`${ev.nickname} vào sàn`, 'member');
    } else {
        addFeed(`${ev.nickname} đã ${ev.type === 'follow' ? 'follow' : 'chia sẻ live'}`, 'social');
    }

    if (ev.spectatorOnly && !players.has(ev.userId)) {
        if (ev.type === 'member') showDoorToast(ev);
        renderStats();
        return;
    }
    const isNew = !players.has(ev.userId);
    const actor = getOrCreate(ev);
    if (!actor) return;

    if (ev.type === 'chat') {
        actor.say(isNew && ev.action === 'join' ? '👋 ' + ev.comment : ev.comment, 5);
        if (ev.action) applyAction(actor, ev, ev.durationMs > 0 ? ev.durationMs / 1000 : 5);
        else {
            const c = normalize(ev.comment);
            if (c.includes('doi nv')) actor.changeCharacter();
            else if (c.includes('di vong') || c.includes('walk')) actor.walk(5);
            else if (c === 'jump' || c === 'nhay') actor.jump(3);
            else if (c.includes('dance')) actor.dance(5);
        }
    } else if (ev.type === 'gift') {
        actor.addGiftPower(ev.diamondCount);
        const seconds = ev.durationMs > 0 ? ev.durationMs / 1000 : clamp(ev.diamondCount, 3, 7);
        applyAction(actor, ev, seconds);
        queueBanner(ev);
        if (ev.action === 'fireworks' || ev.action === 'topdj' || ev.diamondCount >= 500) fireworks(Math.max(2, ev.fireworkBursts || 3));
        updateTopRanks();
    } else if (ev.type === 'follow' || ev.type === 'share') {
        actor.celebrate(3);
        actor.say(ev.type === 'follow' ? '💖 Đã follow!' : '📣 Đã chia sẻ live!', 3);
    } else if (ev.type === 'like') {
        actor.hearts(clamp(Math.round((ev.likeCount || 1) / 2), 4, 16));
        if (!actor.action) actor.jump(1.2);
    } else if (ev.type === 'member' && isNew) {
        actor.say('👋 Hello mọi người!', 3);
    }

    const joinFocus = ev.action === 'join' && ev.joinedNow;
    const socialFocus = ev.type === 'follow' || ev.type === 'share';
    const wantsFocus = joinFocus || socialFocus || ['camera', 'walk', 'vip', 'topdj', 'fireworks', 'medal'].includes(ev.action);
    if (wantsFocus && ['gift', 'chat', 'follow', 'share'].includes(ev.type)) {
        const seconds = ev.durationMs > 0 ? ev.durationMs / 1000 : socialFocus ? 2 : joinFocus ? 2.5 : 3;
        if (joinFocus || socialFocus) cameraFocus(actor, seconds, { kind: 'welcome' });
        else if (ev.action === 'fireworks') cameraFocus(actor, Math.max(6, seconds), { kind: 'fireworks' });
        else cameraFocus(actor, clamp(seconds, 2.5, 15), { kind: 'gift', close: ev.action === 'vip' || ev.action === 'topdj' || ev.diamondCount >= 100, wide: ev.action === 'walk' });
        if (!joinFocus && !socialFocus) focusPlayer(ev.userId, clamp(seconds, 2.5, 15));
    } else if (isNew) {
        // người mới lên sàn (vào phòng khi bật "mọi tương tác", tặng quà...) -> chào
        cameraFocus(actor, 2.5, { kind: 'welcome' });
    } else if (ev.type === 'chat') {
        cameraFocus(actor, 2.6, { kind: 'react' });
    } else if (ev.type === 'like' && clock.elapsed - (actor.likeShotAt ?? -99) > 12) {
        // tim bắn liên tục -> mỗi người tối đa 1 lần / 12s
        actor.likeShotAt = clock.elapsed;
        cameraFocus(actor, 2, { kind: 'react' });
    }
    renderStats();
}

function applyConfig(msg) {
    const game = msg.game || {}, gifts = msg.gifts || {};
    Object.assign(cfg, {
        bpm: game.beat?.bpm || cfg.bpm,
        beatsPerBar: game.beat?.beatsPerBar || cfg.beatsPerBar,
        dropEveryBars: game.beat?.dropEveryBars || cfg.dropEveryBars,
        dropBars: game.beat?.dropBars ?? cfg.dropBars,
        partyGoal: game.partyEnergyGoal || cfg.partyGoal,
        maxPlayers: game.maxPlayers || cfg.maxPlayers,
        ttlMs: game.playerTtlMs || cfg.ttlMs,
        spotlight: { ...cfg.spotlight, ...(game.spotlight || {}) },
        musicVolume: game.music?.volume ?? cfg.musicVolume,
        evolutionTiers: gifts.evolutionTiers || [],
        evolutionEffects: gifts.evolutionEffectsEnabled !== false
    });
    audio.volume = cfg.musicVolume;
    for (const a of players.values()) a.updateTier();
}

function setConnStatus(msg) {
    ui.dot.className = 'dot ' + (msg.state === 'connected' ? 'live' : 'ok');
    ui.dot.title = msg.message || '';
}

// ───────────────────────── WebSocket tới bridge ─────────────────────────
let ws = null, wsRetry = 0;
function connect() {
    ws = new WebSocket(`ws://${location.host}`);
    ws.addEventListener('open', () => {
        wsRetry = 0;
        ui.warning.hidden = true;
        ws.send(JSON.stringify({ type: 'register', role: 'overlay' }));
    });
    ws.addEventListener('message', e => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg && typeof msg.type === 'string') handleEvent(msg);
    });
    ws.addEventListener('close', () => {
        ui.dot.className = 'dot';
        ui.warning.hidden = false;
        const delay = Math.min(10000, 1000 * 2 ** Math.min(wsRetry++, 4));
        setTimeout(connect, delay);
    });
}

// Giả lập tại chỗ (?demo=N) để xem thử không cần live
function startLocalDemo(n) {
    const gifts = [
        { giftName: 'Rose', diamondCount: 1, action: 'camera', label: 'ZOOM CAMERA', durationMs: 4000 },
        { giftName: 'TikTok', diamondCount: 1, action: 'change', label: 'ĐỔI NHÂN VẬT', durationMs: 2500 },
        { giftName: 'Finger Heart', diamondCount: 5, action: 'walk', label: 'ĐI VÒNG', durationMs: 5000 },
        { giftName: 'Rosa', diamondCount: 10, action: 'medal', label: 'CÁNH VIP', variant: 'neon', durationMs: 60000, spotlightMs: 6000 },
        { giftName: 'Portal', diamondCount: 99, action: 'grow', label: 'NHÂN VẬT KHỔNG LỒ', durationMs: 8000 },
        { giftName: 'Galaxy', diamondCount: 1000, action: 'topdj', label: 'TOP DJ', durationMs: 12000, fireworkBursts: 6 }
    ];
    const users = Array.from({ length: n }, (_, i) => ({ userId: `demo-${i}`, uniqueId: `demo_${i}`, nickname: `Khách ${i + 1}` }));
    users.forEach((u, i) => setTimeout(() => handleEvent({ type: 'chat', ...u, comment: 'hey', action: 'join', joinedNow: i < 3, durationMs: 2000 }), i * 60));
    let k = 0;
    let v = 0;
    setInterval(() => {
        const u = pick(users);
        const r = Math.random();
        if (r < 0.3) return; // có lúc vắng -> camera tự chạy góc quay
        if (r < 0.5) handleEvent({ type: 'chat', ...u, comment: pick(['dance', 'đi vòng', 'jump', 'quẩy lên anh em ơi!', 'đổi nv', 'nhạc cháy quá 🔥', 'hello cả nhà']) });
        else if (r < 0.65) handleEvent({ type: 'like', ...u, likeCount: 15 });
        else if (r < 0.75) { v++; handleEvent({ type: 'member', userId: `viewer-${v}`, nickname: `Người xem ${v}`, spectatorOnly: true }); }
        else if (r < 0.8) handleEvent({ type: pick(['follow', 'share']), ...u });
        else handleEvent({ type: 'gift', ...u, ...pick(gifts), repeatCount: 1, eventId: `d${k++}` });
    }, 2600);
}

// ───────────────────────── Vòng lặp ─────────────────────────
function frame(now) {
    const dt = Math.min(0.05, (now - clock.last) / 1000);
    clock.last = now;
    clock.elapsed += dt;
    const t = clock.elapsed;
    const beat = beatInfo(t);
    if (focus.userId && t > focus.until) { focus.userId = null; applyVisibility(); }
    if (t >= nextNpcRefillAt) ensureNpcCrowd();
    const cutoff = performance.now() - cfg.ttlMs;
    for (const a of [...players.values()]) if (!a.isNpc && a.lastActive < cutoff) removeActor(a.userId);
    for (const a of players.values()) a.update(dt, t, beat);
    updateDj(dt, beat);
    updateLights(dt, t, beat);
    updateParticles(dt);
    if (screenSource === 'procedural' && Math.floor(t * 30) % 2 === 0) drawProceduralScreen(t, beat);
    updateCamera(dt, t, beat);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
}

function setChroma(on) {
    settings.chroma = on;
    document.body.classList.toggle('chroma', on);
    scene.background = on ? new THREE.Color(0x00ff00) : BG.clone();
    scene.fog = on ? null : new THREE.Fog(0x07040d, 22, 70);
    for (const obj of [screen, screenFrame, haze, floorBase, ...beams.map(b => b.pivot), ...lasers.map(l => l.mesh)]) obj.visible = !on;
}
window.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); setChroma(!settings.chroma); }
    if (e.key === 'F1') { e.preventDefault(); document.body.classList.toggle('no-hud'); }
});

async function main() {
    if (!settings.hud) document.body.classList.add('no-hud');
    await loadCharacters();
    createDj();
    applyLayout();
    setChroma(settings.chroma);
    ensureNpcCrowd();
    renderStats();
    loadMedia();
    if (settings.demo) startLocalDemo(settings.demo);
    else connect();
    requestAnimationFrame(now => { clock.last = now; frame(now); });
}
main();
window.__bar = { players, handleEvent, fireworks, partyBurst };
