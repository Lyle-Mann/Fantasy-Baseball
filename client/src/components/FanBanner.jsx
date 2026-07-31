import React from 'react';
import { getTeamBrand, getTeamLogoUrl } from '../lib/teamBrand';

// The "everything is saturated in this team's branding" banner shown when
// a session is locked to a single team's fans.
export default function FanBanner({ teamId, size = 'normal' }) {
  const brand = getTeamBrand(teamId);
  return (
    <div
      className={`fan-banner ${size === 'compact' ? 'compact' : ''}`}
      style={{
        background: `linear-gradient(160deg, ${brand.primary} 0%, ${brand.secondary} 100%)`,
        borderColor: brand.secondary,
      }}
    >
      <img
        className="fan-banner-watermark"
        src={getTeamLogoUrl(teamId, 'team-cap-on-dark')}
        alt=""
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <img
        className="fan-banner-logo"
        src={getTeamLogoUrl(teamId, 'team-primary-on-dark')}
        alt={brand.name}
        onError={(e) => { e.target.src = getTeamLogoUrl(teamId, 'main'); }}
      />
      <div className="fan-banner-name">{brand.name} Fan Mode</div>
    </div>
  );
}
