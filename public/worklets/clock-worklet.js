// Minimal AudioWorklet clock processor
// Emits 'tick' messages at a PPQ-based interval derived from BPM.
// No allocations in process; uses simple accumulator per render quantum.

const PPQ = 96; // pulses per quarter note

class ClockProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this._bpm = 120;
    this._secondsPerTick = 60 / this._bpm / PPQ;
    this._accum = 0; // seconds
    this._tickCount = 0;
    this.port.onmessage = (e) => {
      const data = e.data || {};
      if (data.type === 'bpm' && typeof data.value === 'number') {
        this._bpm = Math.max(20, Math.min(300, data.value));
        this._secondsPerTick = 60 / this._bpm / PPQ;
      } else if (data.type === 'reset') {
        this._accum = 0;
        this._tickCount = 0;
      }
    };
  }

  process() {
    // One render quantum = 128 frames typically; convert to seconds
    const frames = 128; // buffer size fixed in WAA spec for process callback
    const dt = frames / sampleRate;
    this._accum += dt;
    while (this._accum >= this._secondsPerTick) {
      this._accum -= this._secondsPerTick;
      this._tickCount++;
      this.port.postMessage({ type: 'tick', n: this._tickCount });
    }
    return true;
  }
}

registerProcessor('clock-worklet', ClockProcessor);
