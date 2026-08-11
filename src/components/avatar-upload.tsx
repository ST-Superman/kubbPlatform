"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

const MAX_DIM = 512;
const MAX_INPUT_BYTES = 10 * 1024 * 1024; // reject > 10MB before processing

/** Center-crop to a square, downscale to <=512px, re-encode to WebP (~200KB). */
async function processToSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const dim = Math.min(side, MAX_DIM);

  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, dim, dim);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  if (!blob) throw new Error("encode-failed");
  return blob;
}

export function AvatarUpload({
  userId,
  initialUrl,
  displayName,
}: {
  userId: string;
  initialUrl: string | null;
  displayName: string;
}) {
  const [url, setUrl] = useState<string>(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) {
      toast.error("That image is too large — pick one under 10MB.");
      return;
    }

    setBusy(true);
    try {
      const blob = await processToSquareWebp(file);
      const supabase = createClient();
      const path = `${userId}/avatar.webp`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/webp" });
      if (error) {
        toast.error("Upload failed — please try again.");
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so the new image shows immediately past the CDN.
      setUrl(`${data.publicUrl}?v=${Date.now()}`);
      toast.success("Photo updated — Save changes to keep it.");
    } catch {
      toast.error("Couldn't read that image — try a JPG or PNG.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {/* Persisted with the profile form on Save. */}
      <input type="hidden" name="avatar_url" value={url} />
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#D5C8B5] font-mono text-xl font-bold text-[#13254A]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          displayName.charAt(0).toUpperCase()
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {busy ? "Uploading…" : url ? "Change photo" : "Upload photo"}
          </button>
          {url ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setUrl("")}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          JPG or PNG — we&apos;ll crop it to a square. Then hit Save changes.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
