// Bộ bắt nhịp dùng chung cho bar.js (nhạc phát trong trang) và beat.js (trang nghe nhịp).
// Đầu vào: phổ tần số (Uint8Array của AnalyserNode.getByteFrequencyData) mỗi khung.
// Bắt tiếng kick ở dải bass 40-200Hz, tự đo BPM (trung vị khoảng cách giữa các kick, gấp đôi / chia đôi
// cho về 80-180 BPM), theo dõi độ to nhanh / chậm để nhận đoạn drop.

export function createBeatDetector(options = {}) {
    return {
        avg: 0,
        prevE: 0,
        last: -99,
        gaps: [],
        interval: 60 / 128,
        count: 0,
        kick: 0,
        bass: 0,
        loudFast: 0,
        loudSlow: 0,
        // 0.5 (khó bắt) .. 2 (dễ bắt)
        sensitivity: options.sensitivity ?? 1,

        get bpm() { return 60 / this.interval; },

        decay(dt) { this.kick = Math.max(0, this.kick - dt * 6); },

        // trả về true nếu khung này có tiếng kick
        process(data, sampleRate, dt, t) {
            const binHz = (sampleRate / 2) / data.length;
            const lo = Math.max(1, Math.round(40 / binHz));
            const hi = Math.max(lo + 1, Math.round(200 / binHz));
            let sum = 0;
            for (let i = lo; i <= hi; i++) sum += data[i];
            const e = sum / (hi - lo + 1) / 255;
            this.bass = e;
            const top = Math.min(data.length, Math.round(8000 / binHz));
            let all = 0;
            for (let i = 1; i < top; i++) all += data[i];
            const loud = all / Math.max(1, top - 1) / 255;
            const k = (rate) => 1 - Math.exp(-rate * dt);
            this.loudFast += (loud - this.loudFast) * k(1.5);
            this.loudSlow += (loud - this.loudSlow) * k(0.1);
            const prev = this.avg;
            this.avg += (e - this.avg) * k(4);
            // tiếng trống = bass dội lên ngay khung này (không chỉ "to hơn trung bình" lúc nhạc vừa bật)
            const rise = e - this.prevE;
            this.prevE = e;
            const sens = Math.min(2, Math.max(0.5, this.sensitivity));
            const since = t - this.last;
            if (e > prev * (1 + 0.15 / sens) + 0.025 / sens && e > 0.28 / sens && rise > 0.03 / sens && since > 0.27) {
                if (since < 1.5) {
                    let g = since;
                    while (g < 0.333) g *= 2;
                    while (g > 0.75) g /= 2;
                    this.gaps.push(g);
                    if (this.gaps.length > 12) this.gaps.shift();
                    const sorted = [...this.gaps].sort((a, b) => a - b);
                    this.interval = sorted[Math.floor(sorted.length / 2)];
                }
                this.last = t;
                this.count++;
                this.kick = Math.min(1, Math.max(0.65, 0.65 + (e - prev) * 3));
                return true;
            }
            return false;
        }
    };
}
