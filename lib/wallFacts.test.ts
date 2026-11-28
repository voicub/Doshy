import test from "node:test";
import assert from "node:assert/strict";
import { homeText, openText, powerText, weatherText } from "./wallFacts.ts";

test("who is home reads as a sentence for any number of people", () => {
  assert.equal(homeText([]), null, "nobody tracked: say nothing rather than 'nobody is home'");
  assert.equal(homeText([{ name: "Anna", home: false }]), "Nobody is home");
  assert.equal(homeText([{ name: "Anna", home: true }]), "Anna is home");
  assert.equal(homeText([{ name: "Anna", home: true }, { name: "Ben", home: true }, { name: "Cy", home: true }]), "Anna, Ben and Cy are home");
  assert.equal(homeText([{ name: "Anna", home: true }, { name: "Ben", home: false }]), "Anna is home, Ben is away");
  assert.equal(homeText([{ name: "Anna", home: true }, { name: "Ben", home: false }, { name: "Cy", home: false }]), "Anna is home, Ben and Cy are away");
});

test("open doors and windows are counted and named", () => {
  assert.equal(openText([]), "All doors and windows are closed");
  assert.equal(openText(["Kitchen window"]), "1 open: Kitchen window");
  assert.equal(openText(["A", "B", "C"]), "3 open: A, B and C");
});

test("power switches to kilowatts at 1000 W and never shows a negative", () => {
  assert.equal(powerText(430.4), "430 W");
  assert.equal(powerText(999.4), "999 W");
  assert.equal(powerText(1000), "1.0 kW");
  assert.equal(powerText(2450), "2.5 kW");
  assert.equal(powerText(-20), "0 W");
});

test("a clear sky reads differently at night, other weather does not", () => {
  assert.equal(weatherText("clear", true), "Clear night");
  assert.equal(weatherText("clear", false), "Clear");
  assert.equal(weatherText("storm", true), "Thunderstorm");
});
