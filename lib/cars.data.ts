import type { CarRow } from "./cars.ts";

// THE CAR TABLE. To add your car, add ONE line below and open a pull request.
//
//   [brand, model, body, fuel, length, width, height, wheelbase, paint, extra?]
//
//   brand, model  names as printed on the car; the catalog shows "brand model" (model names are used nominatively; no logos are drawn)
//   body          hatchback | sedan | estate | suv | crossover | coupe | convertible | pickup | van | minivan | microcar | sports
//   fuel          petrol | diesel | hybrid | ev
//   length..wheelbase   metres from the maker's data sheet; width WITHOUT mirrors, height unladen
//   paint         default colour: a name from CAR_COLORS (lib/cars.ts) such as "Silver" or "Navy", or a #hex
//   extra         optional, only when the body style default looks wrong:
//                 { roof: "fastback" | "notchback" | "flat", wheels: "steel" | "alloy" | "multi", port: "l" | "r" | "f" (EV charge flap: left, right, front),
//                   rails: true, tow: true, spoiler: true, clearance, wheel (diameter), hood, ws, rr, belt (side-window sill / height), tumble (roof narrowing), trunk (boot share) }
//
// The 3D is procedural bodywork at the real size; the body style sets the defaults and lib/cars.design.ts (grille, lamps, wheels, roofline) makes a model recognisable.
// Explicit `extra` values here win over the design data.
// `// approx` marks a dimension taken from the segment average. Keep each brand together, newest-popular first; Generic rows stay last.

export const CAR_TABLE: CarRow[] = [
  // ---- Mitsubishi (the ASX 2016 stays first) ----
  ["Mitsubishi", "ASX 2016", "crossover", "petrol", 4.295, 1.77, 1.625, 2.67, "Silver"],
  ["Mitsubishi", "ASX 2017 Dynamic Shield", "crossover", "petrol", 4.365, 1.77, 1.64, 2.67, "Blue"],
  ["Mitsubishi", "Outlander", "suv", "hybrid", 4.695, 1.81, 1.71, 2.67, "Pearl White"],
  ["Mitsubishi", "Eclipse Cross", "crossover", "petrol", 4.405, 1.805, 1.685, 2.67, "Red", { roof: "fastback" }],
  ["Mitsubishi", "Space Star", "hatchback", "petrol", 3.845, 1.665, 1.505, 2.45, "Light Blue"],
  ["Mitsubishi", "L200", "pickup", "diesel", 5.285, 1.815, 1.775, 3.0, "Titanium"],
  // ---- Dacia ----
  ["Dacia", "Duster", "suv", "diesel", 4.341, 1.804, 1.693, 2.676, "Olive"],
  ["Dacia", "Sandero", "hatchback", "petrol", 4.088, 1.848, 1.499, 2.604, "Light Blue"],
  ["Dacia", "Logan", "sedan", "petrol", 4.396, 1.848, 1.489, 2.634, "Silver"],
  ["Dacia", "Spring", "hatchback", "ev", 3.734, 1.622, 1.516, 2.423, "Orange"],
  // ---- Volkswagen ----
  ["Volkswagen", "Golf", "hatchback", "petrol", 4.284, 1.789, 1.456, 2.636, "Navy"],
  ["Volkswagen", "Golf Variant", "estate", "petrol", 4.633, 1.789, 1.481, 2.686, "Graphite"],
  ["Volkswagen", "Polo", "hatchback", "petrol", 4.053, 1.751, 1.461, 2.548, "Red"],
  ["Volkswagen", "Up!", "hatchback", "petrol", 3.6, 1.641, 1.504, 2.42, "Yellow"],
  ["Volkswagen", "Passat", "sedan", "diesel", 4.767, 1.832, 1.456, 2.791, "Graphite"],
  ["Volkswagen", "Passat Variant", "estate", "diesel", 4.773, 1.832, 1.516, 2.791, "Titanium"],
  ["Volkswagen", "T-Roc", "crossover", "petrol", 4.234, 1.819, 1.573, 2.59, "Teal"],
  ["Volkswagen", "Tiguan", "suv", "diesel", 4.486, 1.839, 1.632, 2.681, "Pearl White"],
  ["Volkswagen", "ID.3", "hatchback", "ev", 4.261, 1.809, 1.568, 2.77, "Light Blue"],
  ["Volkswagen", "ID.4", "crossover", "ev", 4.584, 1.852, 1.612, 2.765, "Silver"],
  ["Volkswagen", "ID. Buzz", "minivan", "ev", 4.712, 1.985, 1.937, 2.988, "Champagne"],
  ["Volkswagen", "Caddy", "minivan", "diesel", 4.5, 1.855, 1.836, 2.755, "Silver"],
  ["Volkswagen", "Transporter", "van", "diesel", 4.904, 1.904, 1.97, 3.0, "Pearl White"],
  // ---- Skoda ----
  ["Skoda", "Fabia", "hatchback", "petrol", 4.108, 1.78, 1.46, 2.564, "Red"],
  ["Skoda", "Octavia", "sedan", "diesel", 4.689, 1.829, 1.47, 2.686, "Graphite", { roof: "fastback" }],
  ["Skoda", "Octavia Combi", "estate", "diesel", 4.689, 1.829, 1.468, 2.686, "Navy"],
  ["Skoda", "Superb", "sedan", "diesel", 4.861, 1.864, 1.468, 2.841, "Jet Black", { roof: "fastback" }],
  ["Skoda", "Karoq", "crossover", "petrol", 4.382, 1.841, 1.605, 2.638, "Titanium"],
  ["Skoda", "Kodiaq", "suv", "diesel", 4.697, 1.882, 1.655, 2.791, "Green"],
  ["Skoda", "Enyaq iV", "crossover", "ev", 4.649, 1.879, 1.616, 2.765, "Pearl White"],
  // ---- Seat ----
  ["Seat", "Ibiza", "hatchback", "petrol", 4.059, 1.78, 1.444, 2.564, "Orange"],
  ["Seat", "Leon", "hatchback", "petrol", 4.368, 1.8, 1.456, 2.686, "Titanium"],
  // ---- Renault ----
  ["Renault", "Twingo", "hatchback", "petrol", 3.595, 1.646, 1.554, 2.492, "Yellow"],
  ["Renault", "Clio", "hatchback", "petrol", 4.049, 1.798, 1.44, 2.583, "Orange"],
  ["Renault", "Megane", "hatchback", "diesel", 4.359, 1.814, 1.447, 2.669, "Silver"],
  ["Renault", "Megane E-Tech", "crossover", "ev", 4.2, 1.768, 1.505, 2.685, "Teal"],
  ["Renault", "Captur", "crossover", "petrol", 4.227, 1.797, 1.576, 2.639, "Orange"],
  ["Renault", "Zoe", "hatchback", "ev", 4.084, 1.73, 1.562, 2.588, "Blue", { port: "f" }],
  ["Renault", "Trafic", "van", "diesel", 5.08, 1.956, 1.971, 3.098, "Pearl White"], // approx
  // ---- Peugeot ----
  ["Peugeot", "208", "hatchback", "petrol", 4.055, 1.745, 1.43, 2.54, "Yellow"],
  ["Peugeot", "e-208", "hatchback", "ev", 4.055, 1.745, 1.43, 2.54, "Light Blue"],
  ["Peugeot", "308", "hatchback", "petrol", 4.367, 1.852, 1.441, 2.675, "Silver"],
  ["Peugeot", "2008", "crossover", "petrol", 4.3, 1.77, 1.55, 2.605, "Jet Black"],
  ["Peugeot", "3008", "suv", "diesel", 4.447, 1.841, 1.624, 2.675, "Graphite"],
  ["Peugeot", "5008", "minivan", "diesel", 4.641, 1.844, 1.646, 2.84, "Pearl White"],
  // ---- Citroen ----
  ["Citroen", "Ami", "microcar", "ev", 2.41, 1.39, 1.52, 1.73, "Light Blue", { port: "f" }],
  ["Citroen", "C3", "hatchback", "petrol", 3.996, 1.749, 1.474, 2.54, "Orange"],
  ["Citroen", "C4", "hatchback", "petrol", 4.36, 1.8, 1.525, 2.67, "Red", { roof: "fastback" }],
  ["Citroen", "C5 Aircross", "suv", "diesel", 4.5, 1.84, 1.67, 2.73, "Champagne"],
  ["Citroen", "Berlingo", "minivan", "diesel", 4.403, 1.848, 1.796, 2.785, "Beige"],
  // ---- Opel / Vauxhall ----
  ["Opel", "Corsa", "hatchback", "petrol", 4.06, 1.765, 1.435, 2.538, "Yellow"],
  ["Opel", "Astra", "hatchback", "petrol", 4.37, 1.809, 1.485, 2.662, "Silver"],
  ["Opel", "Mokka", "crossover", "petrol", 4.151, 1.791, 1.534, 2.557, "Lime"],
  // ---- Ford ----
  ["Ford", "Fiesta", "hatchback", "petrol", 4.04, 1.735, 1.476, 2.493, "Blue"],
  ["Ford", "Focus", "hatchback", "petrol", 4.378, 1.825, 1.454, 2.7, "Red"],
  ["Ford", "Puma", "crossover", "hybrid", 4.207, 1.805, 1.537, 2.588, "Light Blue"],
  ["Ford", "Kuga", "suv", "hybrid", 4.614, 1.883, 1.666, 2.71, "Graphite"], // approx height
  ["Ford", "Transit Custom", "van", "diesel", 4.973, 1.986, 1.99, 2.933, "Pearl White"], // approx
  ["Ford", "Ranger", "pickup", "diesel", 5.355, 1.86, 1.815, 3.22, "Orange"],
  ["Ford", "F-150", "pickup", "petrol", 5.9, 2.03, 1.97, 3.69, "Jet Black"], // approx
  ["Ford", "Mustang", "coupe", "petrol", 4.784, 1.916, 1.381, 2.72, "Yellow"],
  ["Ford", "Mustang Mach-E", "crossover", "ev", 4.713, 1.881, 1.597, 2.984, "Red", { port: "l", roof: "fastback" }],
  // ---- Toyota ----
  ["Toyota", "Aygo", "hatchback", "petrol", 3.7, 1.74, 1.52, 2.43, "Orange"],
  ["Toyota", "Yaris", "hatchback", "hybrid", 3.94, 1.745, 1.5, 2.56, "Red"],
  ["Toyota", "Corolla", "hatchback", "hybrid", 4.37, 1.79, 1.435, 2.64, "Pearl White"],
  ["Toyota", "Prius", "hatchback", "hybrid", 4.54, 1.76, 1.47, 2.7, "Silver", { roof: "fastback" }],
  ["Toyota", "Camry", "sedan", "hybrid", 4.885, 1.84, 1.445, 2.825, "Graphite"],
  ["Toyota", "C-HR", "crossover", "hybrid", 4.36, 1.795, 1.565, 2.64, "Teal", { roof: "fastback" }],
  ["Toyota", "RAV4", "suv", "hybrid", 4.6, 1.855, 1.685, 2.69, "Olive"],
  ["Toyota", "Hilux", "pickup", "diesel", 5.33, 1.855, 1.815, 3.085, "Pearl White"],
  ["Toyota", "Land Cruiser", "suv", "diesel", 4.985, 1.98, 1.945, 2.85, "Jet Black"],
  ["Toyota", "Alphard", "minivan", "hybrid", 4.945, 1.85, 1.935, 3.0, "Pearl White"],
  ["Toyota", "GR86", "coupe", "petrol", 4.265, 1.775, 1.31, 2.575, "Blue"],
  ["Toyota", "Supra", "sports", "petrol", 4.379, 1.854, 1.292, 2.47, "Yellow"],
  // ---- Honda ----
  ["Honda", "N-Box", "microcar", "petrol", 3.395, 1.475, 1.79, 2.52, "Pearl White"],
  ["Honda", "e", "hatchback", "ev", 3.894, 1.752, 1.512, 2.538, "Light Blue", { port: "f" }],
  ["Honda", "Jazz", "hatchback", "hybrid", 4.044, 1.694, 1.526, 2.517, "Teal"],
  ["Honda", "Civic", "hatchback", "petrol", 4.518, 1.799, 1.434, 2.697, "Matte Grey"],
  ["Honda", "HR-V", "crossover", "petrol", 4.294, 1.772, 1.605, 2.61, "Silver"],
  ["Honda", "CR-V", "suv", "hybrid", 4.6, 1.855, 1.679, 2.66, "Titanium"],
  // ---- Hyundai ----
  ["Hyundai", "i10", "hatchback", "petrol", 3.67, 1.68, 1.48, 2.425, "Light Blue"],
  ["Hyundai", "i20", "hatchback", "petrol", 4.04, 1.775, 1.44, 2.58, "Red"],
  ["Hyundai", "i30", "hatchback", "petrol", 4.34, 1.795, 1.455, 2.65, "Silver"],
  ["Hyundai", "Kona", "crossover", "petrol", 4.205, 1.8, 1.565, 2.6, "Lime"],
  ["Hyundai", "Creta", "crossover", "petrol", 4.3, 1.79, 1.635, 2.61, "Pearl White"],
  ["Hyundai", "Tucson", "suv", "hybrid", 4.5, 1.865, 1.65, 2.68, "Graphite"],
  ["Hyundai", "Ioniq 5", "crossover", "ev", 4.635, 1.89, 1.605, 3.0, "Matte Grey", { port: "r", wheels: "multi" }],
  // ---- Kia ----
  ["Kia", "Picanto", "hatchback", "petrol", 3.595, 1.595, 1.485, 2.4, "Yellow"],
  ["Kia", "Ceed", "hatchback", "petrol", 4.31, 1.8, 1.447, 2.65, "Red"],
  ["Kia", "Stonic", "crossover", "petrol", 4.14, 1.76, 1.5, 2.58, "Orange"],
  ["Kia", "Niro", "crossover", "hybrid", 4.355, 1.805, 1.545, 2.7, "Champagne"],
  ["Kia", "Sportage", "suv", "diesel", 4.48, 1.855, 1.645, 2.67, "Pearl White"],
  ["Kia", "EV6", "crossover", "ev", 4.68, 1.88, 1.55, 2.9, "Titanium", { roof: "fastback", wheels: "multi" }],
  // ---- Mazda ----
  ["Mazda", "2", "hatchback", "petrol", 4.06, 1.695, 1.495, 2.57, "Red"],
  ["Mazda", "3", "hatchback", "petrol", 4.46, 1.795, 1.435, 2.725, "Matte Grey"],
  ["Mazda", "CX-30", "crossover", "petrol", 4.395, 1.795, 1.54, 2.655, "Navy"],
  ["Mazda", "CX-5", "suv", "diesel", 4.55, 1.84, 1.68, 2.7, "Burgundy"],
  ["Mazda", "MX-5", "convertible", "petrol", 3.915, 1.735, 1.235, 2.31, "Red"],
  // ---- Nissan ----
  ["Nissan", "Micra", "hatchback", "petrol", 3.999, 1.743, 1.455, 2.525, "Purple"],
  ["Nissan", "Juke", "crossover", "petrol", 4.21, 1.8, 1.595, 2.636, "Orange"],
  ["Nissan", "Qashqai", "crossover", "petrol", 4.425, 1.838, 1.625, 2.665, "Silver"],
  ["Nissan", "X-Trail", "suv", "diesel", 4.64, 1.82, 1.71, 2.705, "Pearl White"],
  ["Nissan", "Leaf", "hatchback", "ev", 4.49, 1.788, 1.54, 2.7, "Pearl White", { port: "f" }],
  ["Nissan", "Navara", "pickup", "diesel", 5.33, 1.85, 1.825, 3.15, "Titanium"], // approx
  ["Nissan", "GT-R", "sports", "petrol", 4.71, 1.895, 1.37, 2.78, "Pearl White"],
  // ---- Suzuki ----
  ["Suzuki", "Ignis", "hatchback", "hybrid", 3.7, 1.69, 1.595, 2.435, "Yellow"],
  ["Suzuki", "Swift", "hatchback", "hybrid", 3.84, 1.735, 1.495, 2.45, "Blue"],
  ["Suzuki", "Vitara", "crossover", "hybrid", 4.175, 1.775, 1.61, 2.5, "Olive"],
  ["Suzuki", "S-Cross", "crossover", "hybrid", 4.3, 1.785, 1.585, 2.6, "Graphite"],
  ["Suzuki", "Jimny", "suv", "petrol", 3.645, 1.645, 1.725, 2.25, "Lime"],
  // ---- Fiat ----
  ["Fiat", "500", "hatchback", "petrol", 3.571, 1.627, 1.488, 2.3, "Pearl White"],
  ["Fiat", "500e", "hatchback", "ev", 3.632, 1.683, 1.527, 2.322, "Light Blue"],
  ["Fiat", "Panda", "hatchback", "hybrid", 3.653, 1.643, 1.551, 2.3, "Yellow"],
  ["Fiat", "Tipo", "hatchback", "petrol", 4.368, 1.792, 1.495, 2.638, "Silver"],
  ["Fiat", "Ducato", "van", "diesel", 5.413, 2.05, 2.254, 3.45, "Pearl White"],
  // ---- BMW / Mini ----
  ["BMW", "1 Series", "hatchback", "petrol", 4.319, 1.799, 1.434, 2.67, "Matte Grey"],
  ["BMW", "3 Series", "sedan", "petrol", 4.709, 1.827, 1.442, 2.851, "Navy"],
  ["BMW", "4 Series Coupe", "coupe", "petrol", 4.768, 1.852, 1.383, 2.851, "Orange"],
  ["BMW", "5 Series", "sedan", "diesel", 4.936, 1.868, 1.466, 2.975, "Jet Black"],
  ["BMW", "i3", "hatchback", "ev", 4.011, 1.775, 1.598, 2.57, "Titanium"],
  ["BMW", "i4", "sedan", "ev", 4.783, 1.852, 1.448, 2.856, "Pearl White", { roof: "fastback", wheels: "multi" }],
  ["BMW", "iX", "suv", "ev", 4.953, 1.967, 1.695, 3.0, "Graphite", { wheels: "multi" }],
  ["BMW", "X1", "crossover", "petrol", 4.439, 1.821, 1.598, 2.67, "Pearl White"],
  ["BMW", "X3", "suv", "diesel", 4.708, 1.891, 1.676, 2.864, "Titanium"],
  ["BMW", "X5", "suv", "diesel", 4.922, 2.004, 1.745, 2.975, "Jet Black"],
  ["BMW", "Z4", "convertible", "petrol", 4.324, 1.864, 1.304, 2.47, "Yellow"],
  ["Mini", "Cooper", "hatchback", "petrol", 3.821, 1.727, 1.414, 2.495, "British Racing Green"],
  // ---- Mercedes-Benz ----
  ["Mercedes-Benz", "A-Class", "hatchback", "petrol", 4.419, 1.796, 1.44, 2.729, "Silver"],
  ["Mercedes-Benz", "C-Class", "sedan", "diesel", 4.751, 1.82, 1.438, 2.865, "Graphite"],
  ["Mercedes-Benz", "E-Class", "sedan", "diesel", 4.923, 1.852, 1.468, 2.939, "Titanium"],
  ["Mercedes-Benz", "GLA", "crossover", "petrol", 4.41, 1.834, 1.611, 2.729, "Pearl White"],
  ["Mercedes-Benz", "EQA", "crossover", "ev", 4.463, 1.834, 1.62, 2.729, "Silver"],
  ["Mercedes-Benz", "GLC", "suv", "diesel", 4.656, 1.89, 1.639, 2.873, "Jet Black"],
  ["Mercedes-Benz", "G-Class", "suv", "petrol", 4.817, 1.931, 1.969, 2.89, "Olive"],
  ["Mercedes-Benz", "AMG GT", "sports", "petrol", 4.546, 1.939, 1.288, 2.63, "Matte Grey"],
  ["Mercedes-Benz", "Vito", "van", "diesel", 5.14, 1.928, 1.91, 3.2, "Silver"],
  ["Mercedes-Benz", "Sprinter", "van", "diesel", 5.932, 1.993, 2.355, 3.665, "Pearl White"], // approx width (auto-data: 2.020)
  // ---- Audi ----
  ["Audi", "A3", "hatchback", "petrol", 4.343, 1.816, 1.428, 2.636, "Red"],
  ["Audi", "A4", "sedan", "diesel", 4.762, 1.847, 1.427, 2.82, "Graphite"],
  ["Audi", "A6", "sedan", "diesel", 4.939, 1.886, 1.457, 2.924, "Navy"],
  ["Audi", "TT", "coupe", "petrol", 4.191, 1.832, 1.353, 2.505, "Silver"],
  ["Audi", "Q3", "crossover", "petrol", 4.484, 1.849, 1.616, 2.68, "Titanium"],
  ["Audi", "Q5", "suv", "diesel", 4.682, 1.893, 1.662, 2.819, "Pearl White"],
  ["Audi", "Q7", "suv", "diesel", 5.063, 1.97, 1.741, 2.994, "Jet Black"],
  ["Audi", "e-tron", "suv", "ev", 4.901, 1.935, 1.616, 2.928, "Graphite", { wheels: "multi" }],
  // ---- Volvo / Polestar ----
  ["Volvo", "EX30", "crossover", "ev", 4.233, 1.837, 1.549, 2.65, "Light Blue"],
  ["Volvo", "XC40", "crossover", "petrol", 4.425, 1.863, 1.652, 2.702, "Orange"],
  ["Volvo", "V60", "estate", "diesel", 4.761, 1.85, 1.427, 2.872, "Navy"],
  ["Volvo", "XC60", "suv", "hybrid", 4.688, 1.902, 1.658, 2.865, "Champagne"],
  ["Volvo", "XC90", "suv", "hybrid", 4.953, 1.923, 1.776, 2.984, "Graphite"],
  ["Polestar", "2", "sedan", "ev", 4.606, 1.859, 1.479, 2.735, "Titanium", { roof: "fastback" }],
  // ---- Tesla ----
  ["Tesla", "Model 3", "sedan", "ev", 4.694, 1.849, 1.443, 2.875, "Pearl White", { roof: "fastback", port: "l", wheels: "multi" }],
  ["Tesla", "Model Y", "crossover", "ev", 4.751, 1.921, 1.624, 2.89, "Red", { roof: "fastback", port: "l", wheels: "multi" }],
  ["Tesla", "Model S", "sedan", "ev", 4.979, 1.964, 1.445, 2.96, "Jet Black", { roof: "fastback", port: "l", wheels: "multi" }],
  ["Tesla", "Model X", "suv", "ev", 5.036, 1.999, 1.684, 2.965, "Silver", { roof: "fastback", port: "l", wheels: "multi" }],
  ["Tesla", "Cybertruck", "pickup", "ev", 5.683, 2.027, 1.796, 3.635, "Titanium", { port: "l" }],
  // ---- Porsche ----
  ["Porsche", "911", "sports", "petrol", 4.519, 1.852, 1.298, 2.45, "Yellow", { wheels: "multi" }],
  ["Porsche", "718 Boxster", "convertible", "petrol", 4.379, 1.801, 1.278, 2.475, "Red"],
  ["Porsche", "Taycan", "sedan", "ev", 4.963, 1.966, 1.378, 2.9, "Navy", { roof: "fastback", wheels: "multi", port: "l" }],
  ["Porsche", "Macan", "crossover", "petrol", 4.696, 1.923, 1.624, 2.807, "Graphite"],
  ["Porsche", "Cayenne", "suv", "hybrid", 4.918, 1.983, 1.696, 2.895, "Jet Black"],
  // ---- Alfa Romeo ----
  ["Alfa Romeo", "Giulia", "sedan", "petrol", 4.643, 1.86, 1.436, 2.82, "Red"],
  ["Alfa Romeo", "Stelvio", "suv", "diesel", 4.687, 1.903, 1.648, 2.818, "Burgundy"],
  // ---- Jeep / Land Rover / US ----
  ["Jeep", "Renegade", "crossover", "petrol", 4.236, 1.805, 1.667, 2.57, "Lime"], // approx
  ["Jeep", "Wrangler", "suv", "petrol", 4.882, 1.894, 1.838, 3.008, "Olive", { rails: false }],
  ["Land Rover", "Defender 90", "suv", "diesel", 4.323, 1.996, 1.974, 2.587, "Olive"],
  ["Land Rover", "Defender 110", "suv", "diesel", 5.018, 1.996, 1.967, 3.022, "Champagne"],
  ["Chevrolet", "Bolt EV", "hatchback", "ev", 4.166, 1.765, 1.594, 2.6, "Blue"],
  ["Chevrolet", "Corvette", "sports", "petrol", 4.63, 1.934, 1.234, 2.722, "Yellow", { wheels: "multi" }],
  ["Dodge", "Challenger", "coupe", "petrol", 5.022, 1.923, 1.45, 2.946, "Orange"],
  ["Subaru", "Forester", "suv", "petrol", 4.625, 1.815, 1.73, 2.67, "Green"],
  ["Subaru", "Outback", "estate", "petrol", 4.86, 1.855, 1.675, 2.745, "Bronze"],
  // ---- Smart ----
  ["Smart", "fortwo", "microcar", "petrol", 2.695, 1.663, 1.555, 1.873, "Silver"],
  // ---- Elsewhere ----
  ["BYD", "Atto 3", "crossover", "ev", 4.455, 1.875, 1.615, 2.72, "Blue"],
  ["MG", "MG4", "hatchback", "ev", 4.287, 1.836, 1.504, 2.705, "Lime"],
  ["Mahindra", "Thar", "suv", "diesel", 3.985, 1.82, 1.855, 2.45, "Red"],
  ["Tata", "Nexon", "crossover", "petrol", 3.994, 1.811, 1.607, 2.498, "Teal"],
  ["Lada", "Niva Legend", "suv", "petrol", 3.74, 1.68, 1.64, 2.2, "Beige"],
  // ---- Generic fallbacks: pick one, set the exact size in the inspector ----
  ["Generic", "hatchback", "hatchback", "petrol", 4.0, 1.75, 1.5, 2.55, "Silver"],
  ["Generic", "sedan", "sedan", "petrol", 4.7, 1.82, 1.45, 2.78, "Graphite"],
  ["Generic", "estate", "estate", "petrol", 4.7, 1.83, 1.5, 2.78, "Navy"],
  ["Generic", "SUV", "suv", "diesel", 4.6, 1.88, 1.68, 2.7, "Pearl White"],
  ["Generic", "crossover", "crossover", "petrol", 4.3, 1.8, 1.6, 2.6, "Titanium"],
  ["Generic", "coupe", "coupe", "petrol", 4.5, 1.85, 1.35, 2.7, "Red"],
  ["Generic", "convertible", "convertible", "petrol", 4.3, 1.8, 1.3, 2.55, "Blue"],
  ["Generic", "pickup", "pickup", "diesel", 5.3, 1.85, 1.8, 3.1, "Silver"],
  ["Generic", "van", "van", "diesel", 5.0, 1.95, 1.95, 3.0, "Pearl White"],
  ["Generic", "minivan", "minivan", "diesel", 4.6, 1.85, 1.7, 2.8, "Champagne"],
  ["Generic", "microcar", "microcar", "petrol", 2.5, 1.4, 1.5, 1.8, "Light Blue"],
  ["Generic", "sports car", "sports", "petrol", 4.4, 1.9, 1.3, 2.6, "Yellow"],
  ["Generic", "electric hatchback", "hatchback", "ev", 4.2, 1.8, 1.55, 2.7, "Pearl White"],
  ["Generic", "electric SUV", "suv", "ev", 4.7, 1.9, 1.65, 2.9, "Graphite"],
];
