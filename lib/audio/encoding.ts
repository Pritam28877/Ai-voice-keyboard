export function int16ToBase64(int16: Int16Array) {
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function float32ToInt16(float32: Float32Array) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = sample * 32768;
  }
  return int16;
}

export function float32ToBase64(float32: Float32Array) {
  return int16ToBase64(float32ToInt16(float32));
}

export function calculateRms(samples: Int16Array) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i] / 32768;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

