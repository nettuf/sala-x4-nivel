const fs = require("fs");
const path = require("path");
const { parseStadium } = require("../src/room/maps");

const root = path.join(__dirname, "..");
const slots = [
  { key: "training", file: "maps/maptraining.hbs" },
  { key: "x3", file: "maps/haxbook-x3.hbs" },
  { key: "x4", file: "maps/haxbook-x4.hbs" },
];

const out = {};
for (const slot of slots) {
  const raw = fs.readFileSync(path.join(root, slot.file), "utf8");
  const parsed = parseStadium(raw);
  out[slot.key] = JSON.stringify(parsed);
  console.log(`${slot.key}: ${parsed.name} (${out[slot.key].length} chars)`);
}

const lines = [
  "// Copiado de maps/*.hbs. O bot usa isto em runtime, nao os arquivos.",
  "module.exports = {",
  `  training: ${JSON.stringify(out.training)},`,
  `  x3: ${JSON.stringify(out.x3)},`,
  `  x4: ${JSON.stringify(out.x4)},`,
  "};",
  "",
];

fs.writeFileSync(path.join(root, "src/room/stadiums.js"), lines.join("\n"));
console.log("wrote src/room/stadiums.js");
