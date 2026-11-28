// The icon picker's ready-made groups (shown before anything is typed): plain names for the rooms and kinds of device a home has. Material Design Icons names without `mdi:`.
// Pure; the node test runner loads this file directly.
export type MdiCategory = { id: string; label: string; names: readonly string[] };

export const MDI_CATEGORIES: readonly MdiCategory[] = [
  { id: "lights", label: "Lights", names: ["lightbulb", "lightbulb-outline", "lightbulb-group", "ceiling-light", "floor-lamp", "desk-lamp", "lamp", "led-strip-variant", "wall-sconce", "string-lights", "spotlight", "lightbulb-on", "lightning-bolt", "outdoor-lamp", "track-light", "chandelier"] },
  { id: "climate", label: "Climate", names: ["thermostat", "thermometer", "radiator", "fan", "air-conditioner", "fire", "snowflake", "air-humidifier", "water-percent", "heat-pump", "hvac", "weather-windy", "air-filter", "water-boiler", "sun-thermometer", "coolant-temperature"] },
  { id: "security", label: "Security", names: ["lock", "lock-open-variant", "shield-home", "cctv", "doorbell-video", "door-closed", "door-open", "garage", "gate", "alarm-light", "bell-ring", "smoke-detector", "motion-sensor", "key", "window-closed", "water-alert"] },
  { id: "kitchen", label: "Kitchen", names: ["fridge", "stove", "coffee-maker", "kettle", "dishwasher", "microwave", "toaster", "blender", "silverware-fork-knife", "pot-steam", "faucet", "ice-cream", "food-variant", "wine"] },
  { id: "bathroom", label: "Bathroom", names: ["shower", "bathtub", "toilet", "faucet", "water-boiler", "hair-dryer", "washing-machine", "tumble-dryer", "water", "mirror", "toothbrush"] },
  { id: "living", label: "Living room", names: ["sofa", "television", "speaker", "remote", "lamp", "floor-lamp", "bookshelf", "table-furniture", "fireplace", "cast", "gamepad-variant", "movie-open"] },
  { id: "bedroom", label: "Bedroom", names: ["bed", "bed-king", "bed-double", "wardrobe", "alarm", "sleep", "weather-night", "baby-carriage", "hanger", "dresser", "window-shutter", "curtains"] },
  { id: "office", label: "Office", names: ["desk", "monitor", "laptop", "printer", "router-wireless", "wifi", "server", "keyboard", "mouse", "webcam", "headphones", "phone"] },
  { id: "windows", label: "Windows and curtains", names: ["window-closed", "window-open", "window-shutter", "window-shutter-open", "blinds", "blinds-open", "curtains", "curtains-closed", "roller-shade", "roller-shade-closed", "awning", "balcony"] },
  { id: "media", label: "Media", names: ["television", "speaker", "speaker-wireless", "radio", "music", "cast", "play-box", "chromecast", "apple-airplay", "audio-video", "amplifier", "headphones"] },
  { id: "energy", label: "Energy", names: ["solar-panel", "solar-power", "battery", "battery-charging", "ev-station", "transmission-tower", "flash", "power-plug", "power-socket-eu", "meter-electric", "gauge", "wind-turbine"] },
  { id: "cleaning", label: "Cleaning and laundry", names: ["robot-vacuum", "vacuum", "broom", "washing-machine", "tumble-dryer", "iron", "spray-bottle", "delete", "recycle", "robot-mower", "dishwasher", "hanger"] },
  { id: "garden", label: "Garden and outside", names: ["flower", "tree", "sprinkler", "water-pump", "grass", "pool", "barbecue", "mailbox", "car", "car-electric", "bicycle", "garage-variant"] },
  { id: "weather", label: "Weather", names: ["weather-sunny", "weather-cloudy", "weather-rainy", "weather-snowy", "weather-windy", "weather-night", "weather-partly-cloudy", "weather-lightning", "thermometer", "umbrella", "water-percent", "sun-wireless"] },
  { id: "people", label: "People and pets", names: ["account", "account-group", "baby-face", "dog", "cat", "paw", "bird", "fish", "home-account", "run", "sleep", "cellphone"] },
];
