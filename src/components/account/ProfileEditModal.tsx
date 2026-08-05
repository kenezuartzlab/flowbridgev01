import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { ModalPortal } from "@/modals/ModalPortal";
import { supabase } from "@/integrations/supabase/client";

/**
 * Edit display name + profile photo. The photo is downscaled client-side to a
 * small square JPEG and stored with the account profile, so no extra upload
 * plumbing (or public bucket) is required.
 */
export function ProfileEditModal({
  open,
  onClose,
  currentName,
  currentPhoto,
  providerName,
  providerPhoto,
  hasCustom,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  currentName: string;
  currentPhoto: string | null;
  providerName?: string | null;
  providerPhoto?: string | null;
  hasCustom?: boolean;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [photo, setPhoto] = useState<string | null>(currentPhoto);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Account data loads async, so re-sync the fields whenever the modal opens.
  useEffect(() => {
    if (open) {
      setName(currentName);
      setPhoto(currentPhoto);
      setError(null);
    }
  }, [open, currentName, currentPhoto]);

  if (!open) return null;

  const pick = async (file: File) => {
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      const side = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size,
      );
      setPhoto(canvas.toDataURL("image/jpeg", 0.82));
    } catch {
      setError("Could not read that image. Try a JPG or PNG.");
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({
      data: { display_name_custom: name.trim() || null, avatar_custom: photo },
    });
    setBusy(false);
    if (err) {
      setError(err.message || "Could not save your profile.");
      return;
    }
    onSaved?.();
    onClose();
  };

  /** Clear the custom overrides so the Google name/photo (or initial) returns. */
  const resetToDefault = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({
      data: {
        display_name_custom: null,
        avatar_custom: null,
        // legacy: earlier versions stored the cropped photo directly here
        ...(providerPhoto?.startsWith("data:") ? { avatar_url: null } : {}),
      },
    });
    setBusy(false);
    if (err) {
      setError(err.message || "Could not reset your profile.");
      return;
    }
    onSaved?.();
    onClose();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="fb-surface w-full max-w-md space-y-4 rounded-t-3xl p-5 sm:rounded-3xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[16px] font-black">Edit profile</p>
              <p className="mt-0.5 font-mono text-[10.5px] text-muted">
                Your name and photo appear across FlowBridge.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-hairline text-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/40 bg-primary/10 text-primary"
              aria-label="Change photo"
            >
              {photo ? (
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xl font-black">
                  {(name || "G").slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="absolute bottom-0 left-0 right-0 grid place-items-center bg-black/45 py-0.5">
                <Camera className="h-3.5 w-3.5 text-white" />
              </span>
            </button>
            <div className="min-w-0 flex-1 space-y-1.5">
              <label
                htmlFor="fb-profile-name"
                className="block font-mono text-[9.5px] font-black uppercase tracking-[0.14em] text-muted"
              >
                Display name
              </label>
              <input
                id="fb-profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Your name"
                className="w-full rounded-xl border border-hairline bg-card px-3 py-2.5 text-[14px] font-black text-foreground outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pick(f);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap items-center gap-3">
            {photo && (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-danger"
              >
                Remove photo
              </button>
            )}
            {(hasCustom || providerPhoto || providerName) && (
              <button
                type="button"
                onClick={() => void resetToDefault()}
                disabled={busy}
                className="font-mono text-[10.5px] font-black uppercase tracking-[0.1em] text-muted underline disabled:opacity-50"
              >
                Use default avatar{providerName ? " & Google name" : ""}
              </button>
            )}
          </div>

          {error && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[10.5px] text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] flex-1 rounded-xl border border-hairline text-[13px] font-black text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="grid min-h-[44px] flex-1 place-items-center rounded-xl border border-primary/40 bg-primary/20 text-[13px] font-black text-primary disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
