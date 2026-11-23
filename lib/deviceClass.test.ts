import test from "node:test";
import assert from "node:assert/strict";
import { classifyDevice, gpuName, type DeviceSignals } from "./deviceClass.ts";

const LINUX_ARM = "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const desktop: DeviceSignals = { screenWidth: 2560, screenHeight: 1440, cores: 10, memory: 8, ua: MAC };

test("a Raspberry Pi 7 inch panel (800x480, Linux ARM, V3D) starts on Eco", () => {
  const c = classifyDevice({ screenWidth: 800, screenHeight: 480, cores: 4, memory: 4, ua: LINUX_ARM, renderer: "V3D 7.1.7", kiosk: true });
  assert.equal(c.tier, "eco");
  assert.ok(c.reasons.length >= 3, c.reasons.join(" | "));
});

test("each Pi hint alone is enough: small screen, ARM browser, small graphics chip, few cores", () => {
  assert.equal(classifyDevice({ ...desktop, screenWidth: 1024, screenHeight: 600 }).tier, "eco");
  assert.equal(classifyDevice({ ...desktop, ua: LINUX_ARM }).tier, "eco");
  assert.equal(classifyDevice({ ...desktop, ua: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/126" }).tier, "eco");
  assert.equal(classifyDevice({ ...desktop, ua: "Mozilla/5.0 (X11; Linux armv7l) Chrome/110 Raspberry Pi" }).tier, "eco");
  for (const gpu of ["V3D 4.2", "VideoCore VII", "Mali-G52", "Adreno (TM) 640", "llvmpipe (LLVM 15.0.7, 128 bits)", "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)"]) {
    assert.equal(classifyDevice({ ...desktop, renderer: gpu }).tier, "eco", gpu);
  }
  assert.equal(classifyDevice({ ...desktop, cores: 2 }).tier, "eco");
  assert.equal(classifyDevice({ ...desktop, memory: 2 }).tier, "eco");
  assert.equal(classifyDevice({ ...desktop, cores: 4, memory: 4 }).tier, "eco");
});

test("1280x800 HDMI panels are caught by their hardware, not their size", () => {
  const panel: DeviceSignals = { screenWidth: 1280, screenHeight: 800, cores: 4, memory: 4, ua: LINUX_ARM };
  assert.equal(classifyDevice(panel).tier, "eco");
});

test("phones start on Light, unless their graphics are drawn in software", () => {
  assert.equal(classifyDevice({ screenWidth: 390, screenHeight: 844, cores: 6, memory: 4, ua: IPHONE }).tier, "low");
  assert.equal(classifyDevice({ screenWidth: 412, screenHeight: 915, cores: 8, memory: 8, ua: ANDROID, renderer: "Mali-G715" }).tier, "low");
  assert.equal(classifyDevice({ screenWidth: 412, screenHeight: 915, cores: 8, ua: ANDROID, renderer: "Google SwiftShader" }).tier, "eco");
});

test("desktops keep Detailed, whatever the window size", () => {
  assert.equal(classifyDevice(desktop).tier, "high");
  assert.equal(classifyDevice({ ...desktop, ua: WIN, cores: 16, memory: 8, renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)" }).tier, "high");
  assert.equal(classifyDevice({ ...desktop, renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)" }).tier, "high");
  // one modest hint alone (4 cores but plenty of memory, or unknown signals) is not a reason to dim a desktop
  assert.equal(classifyDevice({ ...desktop, cores: 4, memory: 8 }).tier, "high");
  assert.equal(classifyDevice({ screenWidth: 1920, screenHeight: 1080, ua: WIN }).tier, "high");
});

test("an always-on Linux wall display on x86 starts on Light", () => {
  const c = classifyDevice({ screenWidth: 1920, screenHeight: 1080, cores: 8, memory: 8, ua: "Mozilla/5.0 (X11; Linux x86_64) Chrome/126", kiosk: true });
  assert.equal(c.tier, "low");
  assert.equal(classifyDevice({ screenWidth: 1920, screenHeight: 1080, cores: 8, memory: 8, ua: "Mozilla/5.0 (X11; Linux x86_64) Chrome/126" }).tier, "high");
});

test("gpuName trims the ANGLE wrapper", () => {
  assert.equal(gpuName("ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)"), "Apple, ANGLE Metal Renderer: Apple M1 Max");
  assert.equal(gpuName("V3D 7.1.7"), "V3D 7.1.7");
});
