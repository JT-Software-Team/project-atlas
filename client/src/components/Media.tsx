import { useState } from 'react';
import { initials } from '../lib/format';
import { placeholderCover } from '../lib/catalog';

/** Cover image with an industrial illustration fallback when missing or failing to load. */
export function CoverImage({ src, categorySlug, alt = '' }: { src: string | null | undefined; categorySlug?: string | null; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const fallback = placeholderCover(categorySlug);
  return <img src={!src || failed ? fallback : src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export function ClientLogo({ name, src, size }: { name?: string | null; src?: string | null; size?: 'sm' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <span className={`client-logo ${size ?? ''}`}><img src={src} alt={`${name ?? 'Client'} logo`} onError={() => setFailed(true)} /></span>;
  }
  return <span className={`client-logo placeholder ${size ?? ''}`} title="Logo not yet provided" aria-label={`${name ?? 'Client'} (logo placeholder)`}>{initials(name)}</span>;
}
