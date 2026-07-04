import * as THREE from 'three';

export class AudioSystem {
    constructor(studio) {
        this.studio = studio;
        this.context = null;
        this.analyser = null;
        this.dataArray = null;
        this.source = null;
        this.isPlaying = false;
        this.targetObject = null;
        this.gainNode = null;
    }

    async init() {
        // Idempotent guard
        if (this._inited) return;
        this._inited = true;

        // Ensure environment is ready (some browsers require user gesture or context availability)
        if (typeof window === 'undefined') {
            this._inited = false;
            setTimeout(() => { try { this.init(); } catch(e){ console.warn('AudioSystem retry failed', e); } }, 500);
            return;
        }

        if (this.context) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = 256;
            this.gainNode = this.context.createGain();
            this.gainNode.connect(this.context.destination);

            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            console.log('AudioSystem initialized');
        } catch (e) {
            console.error('AudioSystem init failed:', e);
            this._inited = false;
            // retry politely later in case of transient user-gesture blocking
            setTimeout(() => { try { this.init(); } catch(err){ console.warn('AudioSystem retry failed', err); } }, 1500);
        }
    }

    async loadSample(url) {
        if (!this.context) await this.init();
        if (this.context.state === 'suspended') await this.context.resume();

        try {
            // Using a simple oscillator if no URL provided for demo
            if (!url) {
                this.playTestTone();
            } else {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
                this.playBuffer(audioBuffer);
            }
        } catch (e) {
            console.error('Audio load error', e);
        }
    }

    playTestTone() {
        if (this.source) this.source.stop();

        const osc = this.context.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, this.context.currentTime); // Low A
        osc.frequency.exponentialRampToValueAtTime(880, this.context.currentTime + 2);

        // Connect: Osc -> Analyser -> Gain -> Dest
        osc.connect(this.analyser);
        this.analyser.connect(this.gainNode);

        osc.start();
        osc.stop(this.context.currentTime + 5);
        this.source = osc;
        this.isPlaying = true;
        this.studio.ui.log('Playing test tone...', 'info');
    }

    playBuffer(buffer) {
        if (this.source) this.source.stop();

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        source.connect(this.analyser);
        this.analyser.connect(this.gainNode);

        source.start(0);
        this.source = source;
        this.isPlaying = true;
    }

    stop() {
        if (this.source) {
            this.source.stop();
            this.source = null;
        }
        this.isPlaying = false;
    }

    setTarget(object) {
        this.targetObject = object;
    }

    update() {
        if (!this.isPlaying || !this.targetObject || !this.analyser) return;

        this.analyser.getByteFrequencyData(this.dataArray);

        // Calculate average volume/bass
        let sum = 0;
        const lowerBounds = Math.floor(this.dataArray.length * 0.3); // Focus on bass
        for (let i = 0; i < lowerBounds; i++) {
            sum += this.dataArray[i];
        }

        const average = sum / lowerBounds;
        const factor = 1 + (average / 256) * 0.5; // Scale factor 1.0 - 1.5

        // Apply to scale
        this.targetObject.scale.setScalar(factor);
    }
}