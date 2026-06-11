"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

const OUT = 512; // 출력 정사각 크기(px) — 다운스케일로 큰 이미지도 가볍게

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// 선택 영역을 OUT×OUT JPEG Blob 으로 추출(다운스케일). 서버가 다시 webp 재인코딩.
async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 미지원");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, OUT, OUT);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))),
      "image/jpeg",
      0.9,
    ),
  );
}

export default function AvatarCropper({
  file,
  onCancel,
  onCropped,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const [src, setSrc] = useState<string>("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onComplete = useCallback((_a: Area, px: Area) => setArea(px), []);

  async function apply() {
    if (!area || !src) return;
    setBusy(true);
    setErr("");
    try {
      const blob = await cropToBlob(src, area);
      onCropped(blob);
    } catch {
      setErr("이미지를 처리할 수 없어요. 다른 파일을 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 p-4">
      <p className="mb-2 text-center text-xs text-white/70">
        드래그로 위치, 슬라이더로 확대해 사각형을 맞춰 주세요.
      </p>
      <div className="relative flex-1 overflow-hidden rounded-xl">
        {src && (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
          />
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-white/50">축소</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-accent"
        />
        <span className="text-xs text-white/50">확대</span>
      </div>
      {err && <p className="mt-2 text-center text-xs text-red-400">{err}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-4 py-2 text-sm text-white/70 ring-1 ring-white/20 disabled:opacity-50"
        >
          취소
        </button>
        <button
          onClick={apply}
          disabled={busy || !area}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {busy ? "처리 중…" : "적용"}
        </button>
      </div>
    </div>
  );
}
