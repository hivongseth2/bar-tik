// Máy nghe nhịp: nghe âm thanh của máy (chia sẻ âm thanh hệ thống hoặc thiết bị thu âm), bắt tiếng kick,
// gửi nhịp qua bridge cho bar.html. KHÔNG phát lại âm thanh: nguồn chỉ nối vào bộ phân tích.
import { createBeatDetector } from '/beat-detector.js';

const $ = id => document.getElementById(id);
const ui = {
    bridge: $('bridge'), bpm: $('bpm'), pulse: $('pulse'), mBass: $('m-bass'), mLoud: $('m-loud'),
    beats: $('beats'), drop: $('drop'), status: $('status'), device: $('device'),
    btnSystem: $('btn-system'), btnDevice: $('btn-device'), btnStop: $('btn-stop'), sens: $('sens'), sensVal: $('sens-val')
};
const store = {
    get(key) { try { return localStorage.getItem('beat.' + key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem('beat.' + key, value); } catch {} }
};

const detector = createBeatDetector({ sensitivity: Number(store.get('sens')) || 1 });
ui.sens.value = String(detector.sensitivity);
ui.sensVal.textContent = detector.sensitivity.toFixed(1);
ui.sens.addEventListener('input', () => {
    detector.sensitivity = Number(ui.sens.value);
    ui.sensVal.textContent = detector.sensitivity.toFixed(1);
    store.set('sens', ui.sens.value);
});

function setStatus(text, kind = '') {
    ui.status.textContent = text;
    ui.status.className = 'status' + (kind ? ' ' + kind : '');
}

// ───────── chỉ nghe được ở địa chỉ "an toàn" (127.0.0.1 / localhost) ─────────
if (!window.isSecureContext || !navigator.mediaDevices) {
    const url = `http://127.0.0.1:${location.port || 80}/beat.html`;
    $('insecure').hidden = false;
    $('secure-link').href = url;
    $('secure-link').textContent = url;
    ui.btnSystem.disabled = ui.btnDevice.disabled = true;
}

// ───────── WebSocket tới bridge ─────────
let ws = null, wsRetry = 0, overlays = 0;
function connect() {
    ws = new WebSocket(`ws://${location.host}`);
    ws.addEventListener('open', () => {
        wsRetry = 0;
        ws.send(JSON.stringify({ type: 'register', role: 'beat' }));
    });
    ws.addEventListener('message', e => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === 'beat_ready' || msg.type === 'beat_ack') {
            overlays = msg.overlays || 0;
            renderBridge(true);
        }
    });
    ws.addEventListener('close', () => {
        renderBridge(false);
        setTimeout(connect, Math.min(10000, 1000 * 2 ** wsRetry++));
    });
}
function renderBridge(ok) {
    ui.bridge.className = 'pill' + (ok ? ' ok' : '');
    ui.bridge.textContent = ok
        ? (overlays ? `✅ Đang gửi nhịp cho ${overlays} màn hình quán bar` : '✅ Đã nối bridge (chưa mở trang quán bar)')
        : '⛔ Mất nối bridge, đang thử lại…';
}
function sendBeat(onset) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        type: 'beat',
        onset,
        bpm: Math.round(detector.bpm * 10) / 10,
        strength: Math.round(detector.kick * 100) / 100,
        loud: Math.round(detector.loudFast * 1000) / 1000,
        loudAvg: Math.round(detector.loudSlow * 1000) / 1000
    }));
}
connect();

// ───────── Âm thanh ─────────
let ctx = null, stream = null, nodes = [], heartbeat = 0, startedAt = 0;

async function listen(getStream, label) {
    stop(true);
    try {
        stream = await getStream();
    } catch (error) {
        setStatus(error?.name === 'NotAllowedError' ? 'Bạn đã bấm hủy hoặc chưa cho phép.' : 'Không mở được nguồn âm thanh: ' + (error?.message || error), 'err');
        return;
    }
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
        stop(true);
        setStatus('Không có âm thanh: lúc chia sẻ phải tick "Chia sẻ cả âm thanh hệ thống" (hoặc "Chia sẻ âm thanh của thẻ").', 'err');
        return;
    }
    // chia sẻ màn hình bắt buộc kèm hình: tắt hình đi, chỉ giữ tiếng
    for (const track of stream.getVideoTracks()) track.enabled = false;
    audioTracks[0].addEventListener('ended', () => { stop(true); setStatus('Nguồn âm thanh đã dừng (bị tắt chia sẻ).', 'err'); });

    ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume().catch(() => {});
    // đồng hồ âm thanh mới bắt đầu từ 0: xóa mốc của lần nghe trước
    Object.assign(detector, { last: -99, avg: 0, prevE: 0, gaps: [], count: 0, kick: 0, loudFast: 0, loudSlow: 0 });
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    const data = new Uint8Array(analyser.frequencyBinCount);
    // Bộ đếm nhịp chạy trên luồng âm thanh (không bị Chrome làm chậm khi tab ở nền).
    // ScriptProcessor phải nối ra loa mới chạy: chèn gain = 0 nên KHÔNG có tiếng nào phát ra.
    const tick = ctx.createScriptProcessor(1024, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(analyser);
    source.connect(tick);
    tick.connect(mute);
    mute.connect(ctx.destination);
    nodes = [source, analyser, tick, mute];
    const dt = 1024 / ctx.sampleRate;
    tick.onaudioprocess = () => {
        const t = ctx.currentTime;
        detector.decay(dt);
        analyser.getByteFrequencyData(data);
        if (detector.process(data, ctx.sampleRate, dt, t)) sendBeat(true);
    };
    heartbeat = setInterval(() => sendBeat(false), 1000);
    startedAt = performance.now();
    ui.btnStop.disabled = false;
    setStatus(`Đang nghe: ${label}. Phát nhạc lên là vòng tròn nháy theo nhịp.`, 'ok');
}

function stop(silent = false) {
    clearInterval(heartbeat);
    heartbeat = 0;
    for (const node of nodes) { try { node.disconnect(); } catch {} }
    if (nodes[2]) nodes[2].onaudioprocess = null;
    nodes = [];
    if (stream) for (const track of stream.getTracks()) track.stop();
    stream = null;
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    ui.btnStop.disabled = true;
    if (!silent) setStatus('Đã dừng nghe.');
}

const quiet = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

ui.btnSystem.addEventListener('click', () => listen(() => navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: quiet,
    systemAudio: 'include',
    selfBrowserSurface: 'exclude'
}), 'âm thanh máy tính'));

ui.btnDevice.addEventListener('click', () => {
    const deviceId = ui.device.value;
    store.set('device', deviceId);
    const label = ui.device.selectedOptions[0]?.textContent || 'thiết bị thu âm';
    listen(async () => {
        const s = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { ...quiet, deviceId: { exact: deviceId } } : quiet });
        refreshDevices();   // đã cho phép -> hiện được tên thiết bị
        return s;
    }, label);
});
ui.btnStop.addEventListener('click', () => stop());

async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const saved = ui.device.value || store.get('device') || '';
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    ui.device.replaceChildren(new Option('Mặc định', ''), ...inputs
        .filter(d => d.deviceId && d.deviceId !== 'default')
        .map((d, i) => new Option(d.label || `Thiết bị ${i + 1}`, d.deviceId)));
    if ([...ui.device.options].some(o => o.value === saved)) ui.device.value = saved;
}
refreshDevices();
navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);

// ───────── Hiển thị ─────────
function draw() {
    const live = ctx && performance.now() - startedAt > 0 && ctx.currentTime - detector.last < 2.5;
    document.documentElement.style.setProperty('--kick', detector.kick.toFixed(2));
    ui.bpm.textContent = live ? Math.round(detector.bpm) : '--';
    ui.mBass.style.width = Math.round(detector.bass * 100) + '%';
    ui.mLoud.style.width = Math.round(detector.loudFast * 100) + '%';
    ui.beats.textContent = `${detector.count} nhịp`;
    ui.drop.hidden = !(live && detector.loudFast > detector.loudSlow * 1.1 && detector.loudFast > 0.25);
    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
