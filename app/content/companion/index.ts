// The default companion's art, one image per pose.
//
// The SVG files here are placeholders. To use real art, put a PNG or WebP
// with the same name beside them (idle.png, happy.png, proud.png, sleepy.png,
// concerned.png), all on the same canvas size with a transparent background.
// A PNG or WebP is used in preference to the SVG, with no code to change.

const files = import.meta.glob<string>("./*.{png,webp,svg}", { eager: true, query: "?url", import: "default" });

const PREFERENCE = ["png", "webp", "svg"];

/** The image address for a pose, falling back to the idle pose if that one has no art. */
export function poseImage(pose: string): string {
  for (const name of [pose, "idle"]) {
    for (const type of PREFERENCE) {
      const url = files[`./${name}.${type}`];
      if (url) return url;
    }
  }
  return "";
}
