import React, { useState } from 'react';
import { getTeamLogoUrl } from '../lib/teamBrand';

export default function TeamLogo({ teamId, size = 28, style }) {
  const [failed, setFailed] = useState(false);
  if (!teamId || failed) return null;
  return (
    <img
      src={getTeamLogoUrl(teamId)}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0, ...style }}
      onError={() => setFailed(true)}
    />
  );
}
