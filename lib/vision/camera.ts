/** Browser-only camera lifecycle. Explicit user action starts capture; audio is never requested. */
export class CameraController {
  private stream: MediaStream | null = null;
  private generation = 0;
  constructor(private video: HTMLVideoElement) {}
  async start(deviceId?: string): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Open this page on localhost or HTTPS to use a camera.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      width: { ideal: 1280 }, height: { ideal: 720 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
    } });
    if (generation !== this.generation) { stream.getTracks().forEach(track=>track.stop()); return; }
    this.stream=stream;
    this.video.srcObject=stream;
    try { await this.video.play(); } catch(error) {
      // An older play() rejection must not stop a replacement capture.
      if (generation === this.generation) this.stop();
      throw error;
    }
  }
  stop(): void {
    this.generation++;
    this.stream?.getTracks().forEach(track=>track.stop());
    this.stream=null;
    this.video.pause(); this.video.srcObject=null;
  }
  async devices(): Promise<MediaDeviceInfo[]> {
    return (await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='videoinput');
  }
}
