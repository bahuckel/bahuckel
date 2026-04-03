import { memo, useState, useEffect } from 'react';
import { getAvatarImageUrl } from '../utils/avatarUrl';

interface AvatarProps {
  username: string;
  cacheBust?: number;
  imgClassName?: string;
  initialClassName?: string;
}

/** Reusable avatar: loads from API, falls back to initial on error. Opacity until loaded avoids black flash when URL/cache bust updates. */
export const Avatar = memo(function Avatar({
  username,
  cacheBust,
  imgClassName = '',
  initialClassName = '',
}: AvatarProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const url = username ? getAvatarImageUrl(username, cacheBust) : '';
  const initial = username ? username.charAt(0).toUpperCase() : '';

  useEffect(() => {
    setImgLoaded(false);
  }, [url]);

  if (!username) return null;

  return (
    <>
      <img
        key={cacheBust != null ? `avatar-${username}-${cacheBust}` : `avatar-${username}`}
        src={url}
        alt=""
        className={imgClassName}
        style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.08s ease-out' }}
        onLoad={(e) => {
          setImgLoaded(true);
          const fallback = e.currentTarget.nextElementSibling;
          if (fallback) (fallback as HTMLElement).style.display = 'none';
        }}
        onError={(e) => {
          setImgLoaded(true);
          e.currentTarget.style.display = 'none';
          const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
          if (fallback) {
            fallback.style.display = 'flex';
            fallback.style.alignItems = 'center';
            fallback.style.justifyContent = 'center';
            fallback.style.width = '100%';
            fallback.style.height = '100%';
          }
        }}
      />
      <span className={initialClassName} style={{ display: 'none' }} aria-hidden>
        {initial}
      </span>
    </>
  );
});
