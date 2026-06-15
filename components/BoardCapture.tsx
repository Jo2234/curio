"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import NextImage from "next/image";

type CaptureStatus = "opening" | "ready" | "extracting" | "queued" | "error";

interface BoardCaptureProps {
  sessionId?: string;
  onClose?: () => void;
}

const MAX_IMAGE_WIDTH = 1_024;
const JPEG_QUALITY = 0.86;

function frameToJpeg(source: CanvasImageSource, width: number, height: number): string {
  if (width <= 0 || height <= 0) throw new Error("The image is not ready yet.");
  const scale = Math.min(1, MAX_IMAGE_WIDTH / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the board image.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function fileToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Curio could not read that image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Choose a JPEG, PNG, or WebP image."));
      image.onload = () => {
        try {
          resolve(frameToJpeg(image, image.naturalWidth, image.naturalHeight));
        } catch (error) {
          reject(error);
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function BoardCapture({ sessionId, onClose }: BoardCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openedAtRef = useRef(Date.now());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [sourceName, setSourceName] = useState("Camera");
  const [status, setStatus] = useState<CaptureStatus>("opening");
  const [statusText, setStatusText] = useState("Requesting camera access…");
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [lastCapture, setLastCapture] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const attachStream = useCallback((stream: MediaStream, name: string) => {
    stopStream();
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => undefined);
    }
    setSourceName(name);
    setCameraUnavailable(false);
    setStatus("ready");
    setStatusText(`${name} ready. Frame the diagram, then capture once.`);
  }, [stopStream]);

  const refreshDevices = useCallback(async () => {
    const available = await navigator.mediaDevices.enumerateDevices();
    const cameras = available.filter((device) => device.kind === "videoinput");
    setDevices(cameras);
    setSelectedDeviceId((current) => current || cameras[0]?.deviceId || "");
  }, []);

  const openCamera = useCallback(async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraUnavailable(true);
      setStatus("error");
      setStatusText("Camera access is unavailable here. Upload a board image instead.");
      return;
    }
    setStatus("opening");
    setStatusText("Requesting camera access…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
      });
      const track = stream.getVideoTracks()[0];
      attachStream(stream, track?.label || "Camera");
      await refreshDevices();
      if (track?.getSettings().deviceId) setSelectedDeviceId(track.getSettings().deviceId || "");
    } catch {
      stopStream();
      setCameraUnavailable(true);
      setStatus("error");
      setStatusText("Camera permission was not granted. Upload a board image instead.");
    }
  }, [attachStream, refreshDevices, stopStream]);

  useEffect(() => {
    void openCamera();
    return stopStream;
  }, [openCamera, stopStream]);

  const shareScreen = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatus("error");
      setStatusText("Screen sharing is unavailable in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      attachStream(stream, track?.label || "Shared screen");
      track?.addEventListener("ended", () => {
        setStatus("error");
        setStatusText("Screen sharing ended. Choose a camera or upload an image.");
      }, { once: true });
    } catch {
      setStatus("error");
      setStatusText("Screen sharing was cancelled. Your current source is unchanged.");
    }
  };

  const submitCapture = useCallback(async (imageDataUrl: string) => {
    if (!sessionId) {
      setStatus("error");
      setStatusText("This capture is not attached to a Curio session.");
      return;
    }
    setLastCapture(imageDataUrl);
    setStatus("extracting");
    setStatusText("Curio is reading labels and relations…");
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/board`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, tMs: Math.max(0, Date.now() - openedAtRef.current) }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Curio could not accept the board image.");
      setStatus("queued");
      setStatusText("Capture accepted. Visual findings will appear in the live docket.");
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "Curio could not accept the board image.");
    }
  }, [sessionId]);

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setStatus("error");
      setStatusText("The preview is not ready. Wait a moment, then capture again.");
      return;
    }
    try {
      void submitCapture(frameToJpeg(video, video.videoWidth, video.videoHeight));
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "The frame could not be captured.");
    }
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setStatusText("Choose an image file of the board.");
      return;
    }
    setStatus("extracting");
    setStatusText("Preparing the uploaded board image…");
    try {
      await submitCapture(await fileToJpeg(file));
    } catch (error) {
      setStatus("error");
      setStatusText(error instanceof Error ? error.message : "Curio could not prepare that image.");
    }
  };

  return (
    <section className="grid gap-3" aria-label="Board capture">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-[190px] flex-1 gap-1 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Camera source
          <select
            className="h-10 rounded-[4px] border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 font-sans text-[14px] font-medium normal-case tracking-normal text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            value={selectedDeviceId}
            onChange={(event) => {
              const deviceId = event.target.value;
              setSelectedDeviceId(deviceId);
              void openCamera(deviceId);
            }}
            disabled={devices.length === 0 || status === "opening"}
          >
            {devices.length === 0 ? <option value="">No camera listed</option> : null}
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>
            ))}
          </select>
        </label>
        <button type="button" className="curio-button" onClick={() => void shareScreen()} disabled={status === "extracting"}>
          Share screen
        </button>
        {onClose ? <button type="button" className="curio-button" onClick={onClose}>Close</button> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_112px]">
        <div className="relative aspect-video min-h-[150px] overflow-hidden rounded-[4px] border border-[var(--border-strong)] bg-[var(--bg-sunken)]">
          <video ref={videoRef} className="h-full w-full object-contain" autoPlay muted playsInline aria-label={`${sourceName} preview`} />
          <span className="absolute left-2 top-2 border border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
            {sourceName}
          </span>
        </div>
        <div className="min-w-0">
          <p className="m-0 mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Last capture</p>
          <div className="grid aspect-square place-items-center overflow-hidden rounded-[2px] border border-dashed border-[var(--border-strong)] bg-[var(--bg-sunken)] text-center text-[12px] leading-4 text-[var(--text-muted)]">
            {lastCapture ? <NextImage src={lastCapture} alt="Last captured board" width={112} height={112} unoptimized className="h-full w-full object-cover" /> : <span className="px-2">No frame yet</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="curio-button curio-button-primary" onClick={captureFrame} disabled={status === "opening" || status === "extracting" || !streamRef.current}>
          {status === "extracting" ? "Extracting…" : "Capture"}
        </button>
        <label className="curio-button cursor-pointer">
          {cameraUnavailable ? "Upload board image" : "Upload image"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void uploadImage(event)} />
        </label>
        <p
          className={`m-0 min-w-[220px] flex-1 border-l-2 px-3 py-1 font-mono text-[12px] leading-[18px] ${status === "error" ? "border-[var(--claim-contradicted)] text-[var(--claim-contradicted)]" : status === "queued" ? "border-[var(--claim-verified)] text-[var(--text-secondary)]" : "border-[var(--accent)] text-[var(--text-muted)]"}`}
          role={status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {statusText}
        </p>
      </div>
    </section>
  );
}
