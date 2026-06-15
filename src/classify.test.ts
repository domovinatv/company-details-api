import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySize } from "./classify.ts";

// Pragovi (NN 85/24): mikro 450k/900k/10, mali 5M/10M/50, srednji 25M/50M/250.

test("mikro: ispod svih pragova", () => {
  assert.equal(classifySize({ totalAssets: 100_000, revenue: 300_000, employees: 5 }), "mikro");
});

test("mali: prelazi mikro u 2 kriterija, ispod malih", () => {
  // aktiva 1M (>450k), prihod 2M (>900k), 8 zap (≤10) → prelazi 2/3 mikro → nije mikro;
  // ne prelazi 2/3 malih → mali.
  assert.equal(classifySize({ totalAssets: 1_000_000, revenue: 2_000_000, employees: 8 }), "mali");
});

test("srednji: prelazi male u 2 kriterija", () => {
  assert.equal(classifySize({ totalAssets: 8_000_000, revenue: 12_000_000, employees: 60 }), "srednji");
});

test("veliki: prelazi srednje u 2 kriterija", () => {
  assert.equal(classifySize({ totalAssets: 30_000_000, revenue: 60_000_000, employees: 300 }), "veliki");
});

test("granica: samo 1 kriterij prelazi → ostaje niža kategorija", () => {
  // aktiva 600k (>450k) ali prihod 200k i 3 zap ispod → samo 1/3 prelazi → mikro.
  assert.equal(classifySize({ totalAssets: 600_000, revenue: 200_000, employees: 3 }), "mikro");
});

test("nedostaju podaci: nema nijednog pokazatelja → null", () => {
  assert.equal(classifySize({}), null);
});

test("samo zaposleni: 400 → veliki (jedini kriterij prelazi sve)", () => {
  assert.equal(classifySize({ employees: 400 }), "veliki");
});
