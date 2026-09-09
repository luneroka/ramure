/** Full-window view of one document: an image, or a PDF in a frame. */

import type { MediaObject } from '../gedcom/model';
import { t, type Lang } from '../i18n';
import { isPdf } from '../media/documents';
import { usePortraitUrl } from './fields/Portrait';
import { useDialog } from './ui/useDialog';

export function Lightbox({ media, lang, onClose }: { media: MediaObject; lang: Lang; onClose(): void }) {
  const url = usePortraitUrl(media.id);
  const ref = useDialog<HTMLDivElement>(true, onClose);
  return (
    <div ref={ref} className="lightbox" role="dialog" aria-modal="true" aria-label={media.title ?? t(lang, 'documents')} onClick={onClose}>
      <div className="lightbox-head" onClick={(e) => e.stopPropagation()}>
        <strong>{media.title}</strong>
        <span className="spacer" />
        {url && (
          <a className="btn small" href={url} target="_blank" rel="noopener noreferrer">
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
          <iframe src={url} title={media.title ?? 'PDF'} sandbox="" />
        ) : (
          <img src={url} alt={media.title ?? ''} onClick={onClose} />
        )}
      </div>
    </div>
  );
}
