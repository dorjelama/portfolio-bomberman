// Dev: rebuild the browser bundle on every change and run the game server (tsx watch restarts it).
import * as esbuild from "esbuild";

const ctx = await esbuild.context({
  entryPoints: ["client/main.ts"],
  bundle: true,
  format: "esm",
  sourcemap: true,
  loader: { ".png": "dataurl" },
  outfile: "public/main.js",
  logLevel: "info",
});
await ctx.watch();
await import("./main.ts");
