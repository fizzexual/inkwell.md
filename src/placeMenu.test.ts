import { describe, expect, it } from "vitest";
import { placeMenu } from "./placeMenu";

describe("placeMenu", () => {
  it("opens at the pointer when it fits", () => {
    expect(placeMenu(100, 100, 220, 480, 1400, 900)).toEqual({ left: 100, top: 100 });
  });
  it("moves up so a tall menu opened near the bottom stays fully on screen", () => {
    // the real case: a note low in the sidebar, menu 481px tall, window 900px
    const { top } = placeMenu(120, 817, 220, 481, 1400, 900);
    expect(top + 481).toBeLessThanOrEqual(900 - 8);
  });
  it("moves left near the right edge", () => {
    const { left } = placeMenu(1390, 100, 220, 300, 1400, 900);
    expect(left + 220).toBeLessThanOrEqual(1400 - 8);
  });
  it("never goes above or left of the window when it is taller/wider than it", () => {
    expect(placeMenu(50, 50, 220, 2000, 1400, 900)).toEqual({ left: 50, top: 8 });
    expect(placeMenu(50, 50, 3000, 100, 1400, 900).left).toBe(8);
  });
});
