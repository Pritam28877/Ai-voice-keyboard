class AudioRecorderWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Int16Array(this.bufferSize);
    this.writeIndex = 0;
    this.gainMultiplier = 1.5; // Additional gain boost in worklet
    this.port.onmessage = (event) => {
      if (event.data?.type === "flush") {
        this.flush();
      }
    };
  }

  process(inputs) {
    if (!inputs.length || !inputs[0].length) {
      return true;
    }

    const channel = inputs[0][0];
    if (!channel) {
      return true;
    }

    let sum = 0;

    for (let i = 0; i < channel.length; i++) {
      // Apply additional gain multiplier for increased sensitivity
      const boosted = channel[i] * this.gainMultiplier;
      const sample = Math.max(-1, Math.min(1, boosted));
      const int16 = sample * 32768;
      this.buffer[this.writeIndex++] = int16;
      sum += sample * sample;

      if (this.writeIndex >= this.bufferSize) {
        this.flush();
      }
    }

    const rms = Math.sqrt(sum / channel.length);
    this.port.postMessage({
      type: "level",
      payload: rms,
    });

    return true;
  }

  flush() {
    if (this.writeIndex === 0) {
      return;
    }

    const chunk = this.buffer.slice(0, this.writeIndex);
    this.port.postMessage({
      type: "chunk",
      payload: chunk.buffer,
    });

    this.writeIndex = 0;
  }
}

registerProcessor("audio-recorder-worklet", AudioRecorderWorklet);

