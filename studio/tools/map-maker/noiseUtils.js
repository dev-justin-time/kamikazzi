// Classic Perlin Noise Implementation - Expanded to prevent tiling
export function createPerlin2D(seed) {
    const p = new Uint8Array(2048); // Larger table to prevent tiling on big maps
    const rand = createRandom(seed);
    for (let i = 0; i < 1024; i++) p[i] = i % 256;
    for (let i = 1023; i > 0; i--) {
        const r = Math.floor(rand() * (i + 1));
        [p[i], p[r]] = [p[r], p[i]];
    }
    for (let i = 0; i < 1024; i++) p[1024 + i] = p[i];

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(t, a, b) { return a + t * (b - a); }
    function grad(hash, x, y) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    return function(x, y) {
        const X = Math.floor(x) & 1023;
        const Y = Math.floor(y) & 1023;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = fade(x);
        const v = fade(y);
        const a = p[X] + Y, aa = p[a], ab = p[a + 1];
        const b = p[X + 1] + Y, ba = p[b], bb = p[b + 1];
        return lerp(v, lerp(u, grad(p[aa], x, y), grad(p[ba], x - 1, y)),
                       lerp(u, grad(p[ab], x, y - 1), grad(p[bb], x - 1, y - 1)));
    };
}

export function createRandom(s) {
    let seed = s;
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}