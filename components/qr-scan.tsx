"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type BarcodeHit = { rawValue?: string };
type BarcodeReader = { detect: (source: HTMLVideoElement) => Promise<BarcodeHit[]> };

export function QrScan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeReader }).BarcodeDetector;
    if (!Detector) {
      setError("This browser cannot scan from the page. Open the camera app, point it at the QR code, and the link fills the code in.");
      return;
    }
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const detector = new Detector({ formats: ["qr_code"] });
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        timer = window.setInterval(() => {
          if (stopped) return;
          void detector.detect(video).then((codes) => {
            const raw = codes[0]?.rawValue;
            if (!raw) return;
            stopped = true;
            const code = readCode(raw);
            window.location.assign(`/groups/join?code=${encodeURIComponent(code)}`);
          }).catch(() => undefined);
        }, 400);
      } catch {
        if (!stopped) setError("The camera is not available. Type the code instead.");
      }
    })();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl bg-foreground">
        <video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" />
      </div>
      {error ? <p className="text-sm leading-relaxed text-muted-foreground">{error}</p> : <p className="text-center text-sm text-muted-foreground">Point the camera at the group QR code.</p>}
      <Link href="/groups/join" className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border text-sm font-medium">
        Cancel
      </Link>
    </div>
  );
}

function readCode(raw: string) {
  try {
    const url = new URL(raw);
    return url.searchParams.get("code") || raw;
  } catch {
    return raw;
  }
}
