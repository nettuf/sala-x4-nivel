/** Um dono por marco. O segundo número é o marco x5. Gol contra não entra. */
const HALL_MARKS = [
  { id: "goals:1000", stat: "goals", at: 1000, label: "1000 gols", group: "Gols" },
  { id: "goals:5000", stat: "goals", at: 5000, label: "5000 gols", group: "Gols" },
  { id: "assists:1000", stat: "assists", at: 1000, label: "1000 assistências", group: "Assist" },
  { id: "assists:5000", stat: "assists", at: 5000, label: "5000 assistências", group: "Assist" },
  { id: "cs:1000", stat: "cs", at: 1000, label: "1000 CS", group: "CS" },
  { id: "cs:5000", stat: "cs", at: 5000, label: "5000 CS", group: "CS" },
  { id: "games:1000", stat: "games", at: 1000, label: "1000 jogos", group: "Jogos" },
  { id: "games:5000", stat: "games", at: 5000, label: "5000 jogos", group: "Jogos" },
  { id: "wins:1000", stat: "wins", at: 1000, label: "1000 vitórias", group: "Vitórias" },
  { id: "wins:5000", stat: "wins", at: 5000, label: "5000 vitórias", group: "Vitórias" },
  { id: "mvps:500", stat: "mvps", at: 500, label: "500 MVP", group: "MVP" },
  { id: "mvps:2500", stat: "mvps", at: 2500, label: "2500 MVP", group: "MVP" },
  { id: "hat_tricks:200", stat: "hat_tricks", at: 200, label: "200 hat-tricks", group: "Hat-trick" },
  { id: "hat_tricks:1000", stat: "hat_tricks", at: 1000, label: "1000 hat-tricks", group: "Hat-trick" },
  { id: "woms:500", stat: "woms", at: 500, label: "500 WoM", group: "WoM" },
  { id: "woms:2500", stat: "woms", at: 2500, label: "2500 WoM", group: "WoM" },
];

const ROOM_ID = "x4";

const MATCH_SELECT = "auth,nick,goals,assists,result,mvp,clean_sheet,wom,matches!inner(id,ended_at,valid)";

function deltaFromRow(row) {
  return {
    games: 1,
    wins: row?.result === "win" ? 1 : 0,
    goals: Number(row?.goals) || 0,
    assists: Number(row?.assists) || 0,
    mvps: row?.mvp ? 1 : 0,
    cs: row?.clean_sheet ? 1 : 0,
    hat_tricks: (Number(row?.goals) || 0) >= 3 ? 1 : 0,
    woms: row?.wom ? 1 : 0,
  };
}

module.exports = { HALL_MARKS, ROOM_ID, MATCH_SELECT, deltaFromRow };
