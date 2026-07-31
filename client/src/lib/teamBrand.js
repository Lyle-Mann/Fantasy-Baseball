// MLB team colors (public brand colors) keyed by statsapi.mlb.com team id.
// Logos are hotlinked from MLB's own static asset CDN (the same URL pattern
// MLB.com itself uses), not copied/rehosted.
export const TEAM_BRAND = {
  108: { name: 'Angels', primary: '#BA0021', secondary: '#003263' },
  109: { name: 'Diamondbacks', primary: '#A71930', secondary: '#000000' },
  110: { name: 'Orioles', primary: '#DF4601', secondary: '#000000' },
  111: { name: 'Red Sox', primary: '#BD3039', secondary: '#0C2340' },
  112: { name: 'Cubs', primary: '#0E3386', secondary: '#CC3433' },
  113: { name: 'Reds', primary: '#C6011F', secondary: '#000000' },
  114: { name: 'Guardians', primary: '#0C2340', secondary: '#E31937' },
  115: { name: 'Rockies', primary: '#333366', secondary: '#C4CED4' },
  116: { name: 'Tigers', primary: '#0C2340', secondary: '#FA4616' },
  117: { name: 'Astros', primary: '#002D62', secondary: '#EB6E1F' },
  118: { name: 'Royals', primary: '#004687', secondary: '#BD9B60' },
  119: { name: 'Dodgers', primary: '#005A9C', secondary: '#A5ACAF' },
  120: { name: 'Nationals', primary: '#AB0003', secondary: '#14225A' },
  121: { name: 'Mets', primary: '#002D72', secondary: '#FF5910' },
  133: { name: 'Athletics', primary: '#003831', secondary: '#EFB21E' },
  134: { name: 'Pirates', primary: '#FDB827', secondary: '#27251F' },
  135: { name: 'Padres', primary: '#2F241D', secondary: '#FFC425' },
  136: { name: 'Mariners', primary: '#0C2C56', secondary: '#005C5C' },
  137: { name: 'Giants', primary: '#FD5A1E', secondary: '#27251F' },
  138: { name: 'Cardinals', primary: '#C41E3A', secondary: '#0C2340' },
  139: { name: 'Rays', primary: '#092C5C', secondary: '#8FBCE6' },
  140: { name: 'Rangers', primary: '#003278', secondary: '#C0111F' },
  141: { name: 'Blue Jays', primary: '#134A8E', secondary: '#E8291C' },
  142: { name: 'Twins', primary: '#002B5C', secondary: '#D31145' },
  143: { name: 'Phillies', primary: '#E81828', secondary: '#002D72' },
  144: { name: 'Braves', primary: '#CE1141', secondary: '#13274F' },
  145: { name: 'White Sox', primary: '#27251F', secondary: '#C4CED4' },
  146: { name: 'Marlins', primary: '#00A3E0', secondary: '#EF3340' },
  147: { name: 'Yankees', primary: '#132448', secondary: '#C4CED3' },
  158: { name: 'Brewers', primary: '#12284B', secondary: '#FFC52F' },
};

const FALLBACK = { name: '', primary: '#4f8cff', secondary: '#1b2740' };

export function getTeamBrand(teamId) {
  return TEAM_BRAND[teamId] || FALLBACK;
}

export function getTeamLogoUrl(teamId) {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`;
}
