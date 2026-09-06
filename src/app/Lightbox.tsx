/** Full-window view of one document: an image, or a PDF in a frame. */

import { useEffect } from 'react';
import type { MediaObject } from '../gedcom/model';
import { t, type Lang } from '../i18n';
import { isPdf } from '../media/documents';
import { usePortraitUrl } from './fields/Portrait';

export function Lightbox({ media, lang, onClose }: { media: MediaObject; lang: Lang; onClose(): void }) {
  const url = usePortraitUrl(media.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={media.title ?? t(lang, 'documents')} onClick={onClose}>
      <div className="lightbox-head" onClick={(e) => e.stopPropagation()}>
        <strong>{media.title}</strong>
        <span className="spacer" />
        {url && (
          <a className="btn small" href={url} target="_blank" rel="noopener">
            {t(lang, 'open')}
          </a>
        )}
        <button className="icon-btn" onClick={onClose} aria-label={t(lang, 'close')}>
          ×
        </button>
      </div>
      <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <p className="muted">{t(lang, 'missingFile')}</p>
        ) : isPdf(media.format) ? (
          <iframe src={url} title={media.title ?? 'PDF'} />
        ) : (
          <img src={url} alt={media.title ?? ''} onClick={onClose} />
        )}
      </div>
    </div>
  );
}
