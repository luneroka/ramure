/**
 * DOM side of portraits: an oval <img> fed from IndexedDB, and the editor
 * block to choose, change or remove the picture.
 */

import { useEffect, useRef, useState } from 'react';
import { mediaStore } from '../../store';
import type { MediaObject } from '../../gedcom/model';
import { t, type Lang } from '../../i18n';
import { prepareImage } from '../../media/portraits';
import { RAMURE_MEDIA_SCHEME } from '../../tree/edit';

export function usePortraitUrl(mediaId: string | undefined): string | undefined {
  const [loaded, setLoaded] = useState<{ id: string; url: string }>();
  useEffect(() => {
    if (!mediaId) return;
    let alive = true;
    let objectUrl: string | undefined;
    mediaStore.get(mediaId).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ id: mediaId, url: objectUrl });
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);
  return loaded && loaded.id === mediaId ? loaded.url : undefined;
}

export function Medallion({ mediaId, size = 64, className = '' }: { mediaId?: string; size?: number; className?: string }) {
  const url = usePortraitUrl(mediaId);
  const w = Math.round(size * 0.78);
  return (
    <span className={`medallion ${className}`} style={{ width: w, height: size }} aria-hidden="true">
      {url ? (
        <img src={url} alt="" />
      ) : (
        <svg viewBox="0 0 40 52" width={w} height={size}>
          <circle cx="20" cy="19" r="8" fill="currentColor" />
          <path d="M4 50c1-11 8-16 16-16s15 5 16 16z" fill="currentColor" />
        </svg>
      )}
    </span>
  );
}

interface PickerProps {
  lang: Lang;
  /** Current portrait media id (from the person). */
  current?: string;
  /** Called with the new media record after a successful pick, or null to remove. */
  onChange(next: MediaObject | null): void;
  /** Id allocator for a new media record. */
  allocateId(): string;
  /** Smaller medallion, no hint text: for the edit dialog. */
  compact?: boolean;
}

export function PortraitPicker({ lang, current, onChange, allocateId, compact }: PickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const shown = pending ?? current;

  const pick = async (file: File) => {
    setBusy(true);
    try {
      const blob = await prepareImage(file);
      const id = allocateId();
      await mediaStore.put(id, blob);
      if (pending) void mediaStore.delete(pending);
      setPending(id);
      onChange({ id, file: RAMURE_MEDIA_SCHEME + id, format: 'jpg', title: file.name.replace(/\.[^.]+$/, ''), notes: [], extra: [] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`portrait-picker ${compact ? 'compact' : ''}`}>
      <Medallion mediaId={shown} size={compact ? 72 : 96} />
      <div className="portrait-actions">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = '';
          }}
        />
        <button type="button" className={`btn ${compact ? 'small' : ''}`} disabled={busy} onClick={() => input.current?.click()}>
          {shown ? t(lang, 'changePhoto') : t(lang, 'choosePhoto')}
        </button>
        {shown && (
          <button
            type="button"
            className={`btn subtle ${compact ? 'small' : ''}`}
            onClick={() => {
              if (pending) void mediaStore.delete(pending);
              setPending(undefined);
              onChange(null);
            }}
          >
            {t(lang, 'removePhoto')}
          </button>
        )}
        {!compact && <p className="muted small">{t(lang, 'photoHint')}</p>}
      </div>
    </div>
  );
}
