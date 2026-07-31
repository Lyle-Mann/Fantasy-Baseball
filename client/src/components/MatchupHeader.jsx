import React from 'react';
import TeamLogo from './TeamLogo.jsx';
import { getTeamBrand } from '../lib/teamBrand';

export default function MatchupHeader({ awayTeamId, awayName, homeTeamId, homeName, right }) {
  const away = getTeamBrand(awayTeamId);
  const home = getTeamBrand(homeTeamId);

  return (
    <div
      className="matchup-header"
      style={{
        background: `linear-gradient(90deg, ${away.primary} 0%, ${away.primary} 42%, #131c2e 50%, ${home.primary} 58%, ${home.primary} 100%)`,
      }}
    >
      <div className="matchup-side">
        <TeamLogo teamId={awayTeamId} size={36} />
        <span className="matchup-name">{awayName}</span>
      </div>
      <span className="matchup-at">@</span>
      <div className="matchup-side">
        <TeamLogo teamId={homeTeamId} size={36} />
        <span className="matchup-name">{homeName}</span>
      </div>
      {right && <div className="matchup-right">{right}</div>}
    </div>
  );
}
