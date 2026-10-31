import { Link } from 'react-router-dom';
import { LOGO_ALT, LOGO_SRC, PRODUCT_NAME } from '../lib/brand';

/** The official Janyutech logo (transparent PNG), shown directly on the dark UI. */
export function Logo({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <span className={`logo-plate ${size}`}>
      <img src={LOGO_SRC} alt={LOGO_ALT} width={362} height={80} />
    </span>
  );
}

export function BrandLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/" className="brand" aria-label={`${PRODUCT_NAME} by Janyutech, go to overview`} onClick={onNavigate}>
      <Logo />
      <span className="brand-text">
        <span className="brand-title">PROJECT ATLAS</span>
        <span className="brand-sub">by Janyutech</span>
      </span>
    </Link>
  );
}
