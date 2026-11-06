// Touch controls for phones and tablets: a stick that appears under your left thumb, and Orb and Remote / Glove
// buttons under your right. Like the keyboard and gamepads, they only make input bits; main.ts sends them.
import { DOWN, LEFT, RIGHT, UP } from "../shared/sim.ts";

export const touch = {
  bits: 0, // held now
  tapped: 0, // pressed since the last tick, so a tap shorter than one tick still counts
};

// Eight ways, so rolling your thumb from right towards down pre-turns into the next gap, as holding two keys does.
// Straight lines get 60° each and diagonals only 30°, so a thumb a little off straight still walks straight.
const SECTORS: [centre: number, bits: number, half: number][] = [
  [0, RIGHT, 30], [45, RIGHT | DOWN, 15], [90, DOWN, 30], [135, DOWN | LEFT, 15],
  [180, LEFT, 30], [225, LEFT | UP, 15], [270, UP, 30], [315, UP | RIGHT, 15],
];
const STICKY = 8; // degrees past a sector's edge before the stick leaves it, so the edge doesn't flicker
const DEAD = 10; // px of thumb travel before the stick counts
const away = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const DIRS = UP | DOWN | LEFT | RIGHT;

function aim(dx: number, dy: number, was: number) {
  if (Math.hypot(dx, dy) < DEAD) return 0;
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (SECTORS.some(([c, bits, half]) => bits === was && away(a, c) <= half + STICKY)) return was;
  return SECTORS.find(([c, , half]) => away(a, c) <= half)![1];
}

const resets: (() => void)[] = [];
// Let go of everything: the page went to the background, the cheat box opened, or the match ended.
export function releaseTouch() {
  for (const reset of resets) reset();
  touch.bits = touch.tapped = 0;
}

// Whatever has focus (the cheat box) loses it when you go back to the controls: typing and walking don't mix.
const unfocus = () => (document.activeElement as HTMLElement | null)?.blur?.();

// The stick's base jumps to wherever your thumb lands in the zone and follows it if it slides past the rim,
// so turning back is never a long drag.
export function stick(zone: HTMLElement) {
  const base = zone.querySelector<HTMLElement>(".base")!;
  const knob = zone.querySelector<HTMLElement>(".knob")!;
  let id = -1;
  let [ox, oy, dir] = [0, 0, 0];
  const place = () => {
    const r = zone.getBoundingClientRect();
    base.style.left = `${ox - r.left}px`;
    base.style.top = `${oy - r.top}px`;
  };
  const reset = () => {
    id = -1;
    dir = 0;
    touch.bits &= ~DIRS;
    zone.classList.remove("on");
    base.style.left = base.style.top = knob.style.transform = ""; // back to its resting spot
  };
  resets.push(reset);
  zone.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (id >= 0) return;
    unfocus();
    id = e.pointerId;
    zone.setPointerCapture(id);
    [ox, oy] = [e.clientX, e.clientY];
    place();
    zone.classList.add("on");
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    let [dx, dy] = [e.clientX - ox, e.clientY - oy];
    const reach = base.offsetWidth * 0.32; // how far the knob travels from the middle
    const d = Math.hypot(dx, dy);
    if (d > reach) {
      [ox, oy] = [ox + dx * (1 - reach / d), oy + dy * (1 - reach / d)];
      [dx, dy] = [(dx * reach) / d, (dy * reach) / d];
      place();
    }
    dir = aim(dx, dy, dir);
    touch.bits = (touch.bits & ~DIRS) | dir;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const up = (e: PointerEvent) => e.pointerId === id && reset();
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) zone.addEventListener(type, up);
}

// A button that holds its bit down for as long as your finger stays on it, even if it slides off.
export function button(el: HTMLElement, bit: number) {
  let id = -1;
  const reset = () => {
    id = -1;
    touch.bits &= ~bit;
    el.classList.remove("down");
  };
  resets.push(reset);
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (id >= 0) return;
    unfocus();
    id = e.pointerId;
    el.setPointerCapture(id);
    touch.bits |= bit;
    touch.tapped |= bit;
    el.classList.add("down");
  });
  const up = (e: PointerEvent) => e.pointerId === id && reset();
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) el.addEventListener(type, up);
}
