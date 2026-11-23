"use client";
import { ConfettiIcon, EggIcon, FlagIcon, FlowerTulipIcon, GhostIcon, GiftIcon, HeartIcon, LeafIcon, SnowflakeIcon, SparkleIcon, SunIcon, TreeEvergreenIcon, type Icon } from "@phosphor-icons/react";
import { HOLIDAY_IDS, HOLIDAY_LABEL, SEASONS, type EasterRite, type HolidayId, type Season } from "@/lib/season";
import { useSkySettings } from "@/lib/sky";
import { useSky } from "@/lib/useSky";
import usePopupMenu from "./usePopupMenu";

const SEASON_ICON: Record<Season, Icon> = { spring: FlowerTulipIcon, summer: SunIcon, autumn: LeafIcon, winter: SnowflakeIcon };
const HOLIDAY_ICON: Record<HolidayId, Icon> = { NEW_YEAR: SparkleIcon, VALENTINE: HeartIcon, MARTISOR: GiftIcon, EASTER: EggIcon, HALLOWEEN: GhostIcon, NATIONAL_DAY: FlagIcon, CHRISTMAS: TreeEvergreenIcon };
const RITES: readonly EasterRite[] = ["orthodox", "western"];
const label = (h: HolidayId) => HOLIDAY_LABEL[h];

/**
 * Season and holiday chips for the telemetry bar. The season chip shows the garden's season, the holiday chip appears while a
 * holiday is active or forced. Either opens one menu: follow the calendar (AUTO) or force a season, a holiday or the Easter rite.
 */
export default function SeasonControls() {
  const sky = useSky();
  const { seasonMode, holidayMode, easterRite, setSeasonMode, setHolidayMode, setEasterRite } = useSkySettings();
  const { open, setOpen, root, btn: first, onMenuKey } = usePopupMenu('[role="menuitemradio"][aria-checked="true"]');

  const season = sky.season.season;
  const SeasonGlyph = SEASON_ICON[season];
  const holiday = sky.holiday?.id ?? null;
  const HolidayGlyph = holiday ? HOLIDAY_ICON[holiday] : null;
  const showHoliday = holiday !== null || holidayMode !== "auto";
  const next = sky.season.mix > 0.5 ? ` toward ${sky.season.next}` : "";
  const seasonTip = `Season: ${season}${next}${seasonMode === "auto" ? " (follows the calendar)" : " (forced)"}`;
  const holidayTip = holiday ? `Holiday: ${label(holiday)}${holidayMode === "auto" ? " (follows the calendar)" : " (forced)"}` : "Holiday decoration off";

  return (
    <div className="t-weather t-season" ref={root}>
      <button ref={first} className="t-btn t-wx" aria-haspopup="menu" aria-expanded={open} aria-label={seasonTip} title={seasonTip} onClick={() => setOpen((o) => !o)}>
        <SeasonGlyph size={15} weight="regular" />
        <span className="t-cond t-name">{season}</span>
        {seasonMode !== "auto" && <i className="t-forced" aria-hidden />}
      </button>
      {showHoliday && (
        <button className="t-btn t-wx t-holiday" aria-haspopup="menu" aria-expanded={open} aria-label={holidayTip} title={holidayTip} onClick={() => setOpen((o) => !o)}>
          {HolidayGlyph ? <HolidayGlyph size={15} weight="regular" /> : <ConfettiIcon size={15} weight="regular" />}
          <span className="t-cond t-name">{holiday ? label(holiday) : "No holiday"}</span>
          {holidayMode !== "auto" && <i className="t-forced" aria-hidden />}
        </button>
      )}
      {open && (
        <div className="t-menu t-season-menu hud" role="menu" aria-label="Season and holiday" onKeyDown={onMenuKey}>
          <div className="t-sect" role="presentation">Season</div>
          {(["auto", ...SEASONS] as const).map((s) => (
            <button key={s} role="menuitemradio" aria-checked={s === seasonMode} className="t-item" onClick={() => setSeasonMode(s)}>
              <span>{s}</span>
              {s === "auto" && <small>{`follows calendar`}</small>}
            </button>
          ))}
          <div className="t-sect" role="presentation">Holiday</div>
          {(["auto", "none", ...HOLIDAY_IDS] as const).map((h) => (
            <button key={h} role="menuitemradio" aria-checked={h === holidayMode} className="t-item" onClick={() => setHolidayMode(h)}>
              <span>{h === "auto" || h === "none" ? h : label(h)}</span>
              {h === "auto" && <small>{holidayMode === "auto" && holiday ? label(holiday).toLowerCase() : "follows calendar"}</small>}
            </button>
          ))}
          <div className="t-sect" role="presentation">Easter rite</div>
          {RITES.map((r) => (
            <button key={r} role="menuitemradio" aria-checked={r === easterRite} className="t-item" onClick={() => setEasterRite(r)}>
              <span>{r}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
