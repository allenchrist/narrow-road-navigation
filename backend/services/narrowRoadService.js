const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "narrowRoads.json");

// --------------------------------------------------
// Ensure data directory/file exists
// --------------------------------------------------

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      "[]",
      "utf8"
    );
  }
}

// --------------------------------------------------
// Read all narrow roads
// --------------------------------------------------

function getAllNarrowRoads() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(
      DATA_FILE,
      "utf8"
    );

    const roads = JSON.parse(raw);

    return Array.isArray(roads)
      ? roads
      : [];
  } catch (error) {
    console.error(
      "[Narrow Road] Failed to read data:",
      error
    );

    return [];
  }
}

// --------------------------------------------------
// Save all narrow roads
// --------------------------------------------------

function saveAllNarrowRoads(roads) {
  ensureDataFile();

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(roads, null, 2),
    "utf8"
  );
}

// --------------------------------------------------
// Get one narrow road
// --------------------------------------------------

function getNarrowRoadById(id) {
  const roads = getAllNarrowRoads();

  return roads.find(
    (road) => road.id === id
  ) || null;
}

// --------------------------------------------------
// Create narrow road
// --------------------------------------------------

function createNarrowRoad({
  name,
  polygon
}) {
  const roads = getAllNarrowRoads();

  const road = {
    id: `NR_${Date.now()}`,
    name: String(name).trim(),
    polygon,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  roads.push(road);

  saveAllNarrowRoads(roads);

  console.log(
    `[Narrow Road] Created ${road.id}: ${road.name}`
  );

  return road;
}

// --------------------------------------------------
// Update narrow road
// --------------------------------------------------

function updateNarrowRoad(
  id,
  {
    name,
    polygon
  }
) {
  const roads = getAllNarrowRoads();

  const index = roads.findIndex(
    (road) => road.id === id
  );

  if (index === -1) {
    return null;
  }

  roads[index] = {
    ...roads[index],

    ...(name !== undefined && {
      name: String(name).trim()
    }),

    ...(polygon !== undefined && {
      polygon
    }),

    updatedAt: new Date().toISOString()
  };

  saveAllNarrowRoads(roads);

  console.log(
    `[Narrow Road] Updated ${id}`
  );

  return roads[index];
}

// --------------------------------------------------
// Delete narrow road
// --------------------------------------------------

function deleteNarrowRoad(id) {
  const roads = getAllNarrowRoads();

  const filtered = roads.filter(
    (road) => road.id !== id
  );

  if (filtered.length === roads.length) {
    return false;
  }

  saveAllNarrowRoads(filtered);

  console.log(
    `[Narrow Road] Deleted ${id}`
  );

  return true;
}

module.exports = {
  getAllNarrowRoads,
  getNarrowRoadById,
  createNarrowRoad,
  updateNarrowRoad,
  deleteNarrowRoad
};