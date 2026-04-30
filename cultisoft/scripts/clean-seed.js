// Run seed in CLEAN mode (production / no synthetic transactions).
process.env.CULTISOFT_SEED_MODE = "clean";
require("./seed.js");
