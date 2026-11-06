// esbuild inlines imported PNGs as data: URLs (--loader:.png=dataurl).
declare module "*.png" {
  const url: string;
  export default url;
}
