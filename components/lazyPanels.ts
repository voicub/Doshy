// Panels the Live view does not need at start. Each one loads the first time it is rendered, so the kiosk (which stays in Live) never downloads, parses or
// compiles the editors, the catalog (and the model importer / GLTF exporter behind it), the surroundings panel and the rest.
import dynamic from "next/dynamic";

export const BuildingPanel = dynamic(() => import("./inspector/BuildingPanel"));
export const CameraCard = dynamic(() => import("./ui/CameraCard"));
export const CatalogDrawer = dynamic(() => import("./CatalogDrawer"));
export const ClimatePanel = dynamic(() => import("./ui/ClimatePanel"));
export const CommandPalette = dynamic(() => import("./ui/CommandPalette"));
export const CurtainCard = dynamic(() => import("./ui/CurtainCard"));
export const DataPanel = dynamic(() => import("./ui/DataPanel"));
export const DeviceCard = dynamic(() => import("./ui/DeviceCard"));
export const Editor2D = dynamic(() => import("./Editor2D"));
export const EntityBrowser = dynamic(() => import("./ui/EntityBrowser"));
export const Inspector = dynamic(() => import("./Inspector"));
export const NewPlanPanel = dynamic(() => import("./ui/NewPlanPanel"));
export const PlexCard = dynamic(() => import("./ui/PlexCard"));
export const SitePanel = dynamic(() => import("./ui/SitePanel"));
export const StatsPanel = dynamic(() => import("./ui/StatsPanel"));
export const WashCard = dynamic(() => import("./ui/WashCard"));
export const CalendarPanel = dynamic(() => import("./ui/CalendarPanel"));
