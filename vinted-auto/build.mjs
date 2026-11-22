// Compile src/ en un seul fichier extension/background.js (SDK Claude inclus).
import { build } from "esbuild";

await build({
  entryPoints: ["src/background.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  outfile: "extension/background.js",
  legalComments: "none",
  minify: true,
  logLevel: "info",
});
