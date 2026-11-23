"use client";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from "three";
import { seasonPalette } from "@/lib/season";
import { terrainGrid } from "@/lib/siteMesh";
import { groundTexture, type SitePhoto } from "@/lib/sitePhoto";
import { mottleTexture, tileM, tiledTexture } from "@/lib/textures";
import { useSky } from "@/lib/useSky";
import { PAINT_PX, paintAreas } from "./groundPaint";
import { useKnobs } from "@/lib/quality";
import { groundUniforms, patchSiteMaterial } from "./siteShader";
import type { SiteWorld } from "./siteWorld";

const MAX_ANISOTROPY = 8;
const LIFT = -0.002; // the garden's own ground plane sits here: the lawn near the plan lies exactly on it
const MOTTLE_TILE_M = 20;

/** Square ground mesh of 2 x radius about the site centre: ~50 cells across, never finer than 4 m. */
const cellOf = (radius: number) => Math.min(12, Math.max(4, radius / 50));

/**
 * The real ground, replacing the garden's lawn plane while the surroundings show: flat (the garden's height 0) near the plan, the real height
 * further out. Its colour is the site's areas painted in the season's colours, or the satellite photo draped on it; near the plan both give way
 * to the garden's own lawn (grass detail and mottling included), and the far edge fades into the sky colour.
 */
export default function SiteTerrain({ w, photo }: { w: SiteWorld; photo: SitePhoto | undefined }) {
  const { data, radius, center, toSite, ground } = w;
  const gl = useThree((s) => s.gl);
  const anisotropy = Math.min(MAX_ANISOTROPY, gl.capabilities.getMaxAnisotropy());
  const { season, mix } = useSky().season;
  const pal = useMemo(() => seasonPalette(season, Math.round(mix * 50) / 50), [season, mix]); // the same steps as the garden's lawn

  const geometry = useMemo(() => {
    const grid = terrainGrid(center, radius, cellOf(radius), ground, toSite);
    const count = grid.n * grid.n;
    const uv = new Float32Array(count * 2);
    const uv1 = new Float32Array(count * 2);
    const b = photo?.bounds;
    for (let k = 0; k < count; k++) {
      const sx = grid.site[k * 2];
      const sy = grid.site[k * 2 + 1];
      uv[k * 2] = (sx + radius) / (2 * radius);
      uv[k * 2 + 1] = (sy + radius) / (2 * radius);
      uv1[k * 2] = b ? (sx - b.x0) / (b.x1 - b.x0) : uv[k * 2];
      uv1[k * 2 + 1] = b ? (sy - b.y0) / (b.y1 - b.y0) : uv[k * 2 + 1];
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(grid.positions, 3));
    g.setAttribute("normal", new BufferAttribute(grid.normals, 3));
    g.setAttribute("uv", new BufferAttribute(uv, 2));
    g.setAttribute("uv1", new BufferAttribute(uv1, 2));
    g.setIndex(new BufferAttribute(grid.index, 1));
    g.computeBoundingSphere();
    return g;
  }, [center, radius, ground, toSite, photo]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // the painted ground (site axes, north up), repainted when the season or the areas change
  const paintPx = useKnobs().site < 0.5 ? PAINT_PX / 2 : PAINT_PX; // Eco and Light paint the far ground at half size (a quarter of the memory)
  const painted = useMemo(() => {
    if (photo) return null;
    const c = document.createElement("canvas");
    c.width = c.height = paintPx;
    paintAreas(c, data.areas, radius, pal);
    const t = new CanvasTexture(c);
    t.flipY = false;
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = anisotropy;
    return t;
  }, [photo, data.areas, radius, pal, anisotropy, paintPx]);
  useEffect(() => () => painted?.dispose(), [painted]);

  // the photo as the ground colour: uv1 maps the terrain onto the photo's bounds (canvas row 0 = north)
  const photoTex = useMemo(() => {
    if (!photo) return null;
    const t = new CanvasTexture(groundTexture(photo));
    t.flipY = false;
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = anisotropy;
    t.channel = 1;
    return t;
  }, [photo, anisotropy]);
  useEffect(() => () => photoTex?.dispose(), [photoTex]);

  const look = useMemo(() => {
    const grass = tiledTexture("grass", tileM("grass"), tileM("grass")); // one tile: world metres / tile size are its coordinates
    const mottle = mottleTexture(MOTTLE_TILE_M, MOTTLE_TILE_M, MOTTLE_TILE_M);
    return { grass, mottle, uniforms: groundUniforms(grass, 1 / tileM("grass"), mottle, 1 / MOTTLE_TILE_M) };
  }, []);
  useEffect(
    () => () => {
      look.grass.dispose();
      look.mottle.dispose();
    },
    [look],
  );

  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ map: photoTex ?? painted, color: "#ffffff", roughness: 1 });
    patchSiteMaterial(m, "ground", look.uniforms);
    return m;
  }, [photoTex, painted, look]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const u = look.uniforms;
    u.uLawn.value.set(pal.ground);
    u.uMottle.value.set(pal.mottle);
    u.uFar.value.set(photo ? 0 : 0.6, photo ? 0.15 : 0.6); // photo: no grass grain on the picture, little mottling
    u.uPhotoSnow.value = photo ? pal.snow * 0.8 : 0;
  }, [look, pal, photo]);

  return <mesh geometry={geometry} material={material} position-y={LIFT} receiveShadow raycast={() => null} />;
}
