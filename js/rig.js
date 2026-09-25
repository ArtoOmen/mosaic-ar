// Pictures the app can recognise. assets/targets.json lists them in the same order as
// they were compiled into assets/targets.mind; each lives in assets/t/<id>/:
//   mural.jpg  – the picture (also the AR tracking target)
//   mask.png   – R: may be warped, G: overlay alpha, B: mosaic (for sparkles)
//   rig.json   – { w, h, eyes, bones, nests } in pixels of mural.jpg, origin top-left
//   photo.jpg  – a photo to show on the desktop test stand
//
// rig.json
//   eyes:  { c: [x, y] pupil centre, R: iris radius, lid: [r, g, b] eyelid colour, g: blink group }
//   bones: parts of the picture that move (puppet warp). Everything inside the soft
//          ellipse (c, r) turns around pivot p. t is one of
//          head – quick turns and holds | owl – slow tilts | flap – wing bursts
//          sway – smooth swing (f = Hz)  | bob – vertical bounce in px | breath – subtle scale
//   nests: { c: [x, y], scheme } where the 3D birds fly out; scheme = colour set 0..3

// Mosaic palette sampled from the mural (sunlit values)
export const PAL = {
  red: 0xb8282a, verm: 0xd4552f, orange: 0xe3892f, ochre: 0xefb43c,
  cream: 0xefe5cf, black: 0x1c1b1e, blue: 0x2b6397, sky: 0x7cb0d8,
  teal: 0x2f6f6c, sage: 0x5c8f86,
};

// picture pixels -> anchor space (picture is 1 unit wide, centred, y up)
export const px2local = (rig, x, y) => [x / rig.w - 0.5, (rig.h / 2 - y) / rig.w];

export async function loadManifest(base = 'assets/') {
  const m = await (await fetch(base + 'targets.json')).json();
  return Promise.all(m.targets.map(async (t, index) => {
    const dir = `${base}t/${t.id}/`;
    const rig = await (await fetch(dir + 'rig.json')).json();
    return { ...t, index, dir, rig };
  }));
}
