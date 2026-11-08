'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
// public/ là ESM cho trình duyệt, package là commonjs -> nạp qua data: URL
const loadDetector = () => import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(__dirname, '..', 'public', 'beat-detector.js'), 'utf8')));
const test = require('node:test');

// Phổ giả: bass có tiếng kick đúng nhịp (cố ý hụt 1/7 nhịp + nhiễu), dải khác là nhiễu nền.
function simulate(createBeatDetector, bpm, seconds = 20) {
    const detector = createBeatDetector();
    const data = new Uint8Array(512);
    const dt = 1024 / 48000;
    const interval = 60 / bpm;
    let onsets = 0;
    for (let t = 0; t < seconds; t += dt) {
        const phase = (t % interval) / interval;
        const beatNo = Math.floor(t / interval);
        const kick = beatNo % 7 === 3 ? 0 : Math.exp(-phase * 9);
        const base = 150 + Math.random() * 25;
        for (let i = 0; i < data.length; i++) data[i] = i < 6 ? Math.min(255, base + kick * 100) : 120 + Math.random() * 30;
        detector.decay(dt);
        if (detector.process(data, 48000, dt, t)) onsets++;
    }
    return { detector, onsets };
}

test('beat detector measures tempo of a kick pattern', async () => {
    const { createBeatDetector } = await loadDetector();
    for (const bpm of [100, 128, 150]) {
        const { detector, onsets } = simulate(createBeatDetector, bpm);
        assert.ok(Math.abs(detector.bpm - bpm) < 4, `đo ${detector.bpm.toFixed(1)} BPM cho nhạc ${bpm} BPM`);
        const realKicks = Math.floor(20 * bpm / 60) * 6 / 7;
        assert.ok(onsets > realKicks * 0.8, `chỉ bắt được ${onsets}/${Math.round(realKicks)} kick ở ${bpm} BPM`);
    }
});

test('beat detector stays quiet on silence and steady noise', async () => {
    const { createBeatDetector } = await loadDetector();
    const detector = createBeatDetector();
    const data = new Uint8Array(512);
    const dt = 1024 / 48000;
    let onsets = 0;
    for (let t = 0; t < 10; t += dt) {
        for (let i = 0; i < data.length; i++) data[i] = t < 5 ? 0 : 160 + Math.random() * 6;
        detector.decay(dt);
        if (detector.process(data, 48000, dt, t)) onsets++;
    }
    assert.ok(onsets <= 1, `bắt nhầm ${onsets} nhịp trên nền im / ồn đều`);
});
