/**
 * 浏览器端 WAV 录音器
 * 输出 16kHz 16bit mono PCM WAV，可直接被 Vosk 识别，无需 ffmpeg
 */

export class WavRecorder {
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private stream: MediaStream | null = null;
  private buffers: Float32Array[] = [];
  private _recording = false;

  get recording() {
    return this._recording;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: { ideal: 16000 },
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.buffers = [];

    this.processor.onaudioprocess = (e) => {
      if (!this._recording) return;
      const data = e.inputBuffer.getChannelData(0);
      this.buffers.push(new Float32Array(data));
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
    this._recording = true;
  }

  stop(): Blob {
    this._recording = false;

    // 断开音频节点
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    // 合并所有 buffer
    const totalLength = this.buffers.reduce((sum, buf) => sum + buf.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of this.buffers) {
      samples.set(buf, offset);
      offset += buf.length;
    }
    this.buffers = [];

    // 编码为 WAV
    const wavBlob = encodeWav(samples, 16000);

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    return wavBlob;
  }

  cancel(): void {
    this._recording = false;
    if (this.processor) { this.processor.disconnect(); this.processor = null; }
    if (this.source) { this.source.disconnect(); this.source = null; }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    this.buffers = [];
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataLength = samples.length * bytesPerSample;
  const bufferLength = 44 + dataLength;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, bufferLength - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // PCM data (float32 -> int16)
  let pos = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(pos, s, true);
    pos += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
