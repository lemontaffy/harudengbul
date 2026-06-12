"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import AvatarCropper from "@/components/AvatarCropper";

// 아바타 = 변경 버튼(싱글탭). 우하단 카메라 오버레이로 탭 가능함을 알린다.
// 탭 → 파일 선택 → 기존 AvatarCropper → 업로드(uploadUrl) → onUploaded(path).
export default function AvatarPicker({
  src,
  size = 48,
  uploadUrl,
  onUploaded,
  onError,
  disabled = false,
}: {
  src: string | null;
  size?: number;
  uploadUrl: string;
  onUploaded: (path: string) => void;
  onError?: (msg: string) => void;
  disabled?: boolean;
}) {
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const cam = Math.max(13, Math.round(size * 0.3));

  async function upload(blob: Blob) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("avatar", blob, "avatar.jpg");
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError?.(d.error ?? "업로드 실패");
        return;
      }
      onUploaded(d.avatarPath);
    } catch {
      onError?.("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label
        className={`relative block shrink-0 cursor-pointer ${disabled ? "pointer-events-none opacity-50" : ""}`}
        style={{ width: size, height: size }}
        title="아바타 변경"
        aria-label="아바타 변경"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <div className="h-full w-full rounded-full bg-surface-2" />
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-black/65 p-1 ring-1 ring-border backdrop-blur">
          <Camera size={cam} className="text-white" />
        </span>
        {busy && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-[11px] text-white">
            …
          </span>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={disabled || busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setCropFile(f); // 크롭 먼저
            e.target.value = ""; // 같은 파일 재선택 허용
          }}
        />
      </label>

      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onCropped={(b) => {
            setCropFile(null);
            upload(b);
          }}
        />
      )}
    </>
  );
}
