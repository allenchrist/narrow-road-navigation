const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const FILE_PATH = path.join(
  DATA_DIR,
  "narrowRoadSuggestions.json"
);

// --------------------------------------------------
// Ensure data directory/file exists
// --------------------------------------------------

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true,
    });
  }

  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(
      FILE_PATH,
      "[]",
      "utf8"
    );
  }
}

// --------------------------------------------------
// Read suggestions
// --------------------------------------------------

function getAllSuggestions() {
  ensureFile();

  try {
    const data =
      fs.readFileSync(
        FILE_PATH,
        "utf8"
      );

    const suggestions =
      JSON.parse(data);

    return Array.isArray(suggestions)
      ? suggestions
      : [];
  } catch (error) {
    console.error(
      "[Suggestion Service] Failed to read suggestions:",
      error
    );

    return [];
  }
}

// --------------------------------------------------
// Save suggestions
// --------------------------------------------------

function saveSuggestions(
  suggestions
) {
  ensureFile();

  fs.writeFileSync(
    FILE_PATH,
    JSON.stringify(
      suggestions,
      null,
      2
    ),
    "utf8"
  );
}

// --------------------------------------------------
// Create suggestion
// --------------------------------------------------

function createSuggestion({
  name,
  polygon,
  reason,
}) {
  const suggestions =
    getAllSuggestions();

  const suggestion = {
    id: `SUG_${Date.now()}`,

    name: name.trim(),

    polygon,

    reason:
      typeof reason === "string"
        ? reason.trim()
        : "",

    status: "PENDING",

    submittedAt:
      new Date().toISOString(),

    reviewedAt: null,
  };

  suggestions.push(
    suggestion
  );

  saveSuggestions(
    suggestions
  );

  console.log(
    `[Suggestion Service] New suggestion created: ${suggestion.id}`
  );

  return suggestion;
}

// --------------------------------------------------
// Get suggestion
// --------------------------------------------------

function getSuggestionById(id) {
  return getAllSuggestions()
    .find(
      (suggestion) =>
        suggestion.id === id
    ) || null;
}

// --------------------------------------------------
// Update suggestion status
// --------------------------------------------------

function updateSuggestionStatus(
  id,
  status
) {
  const suggestions =
    getAllSuggestions();

  const index =
    suggestions.findIndex(
      (suggestion) =>
        suggestion.id === id
    );

  if (index === -1) {
    return null;
  }

  suggestions[index] = {
    ...suggestions[index],

    status,

    reviewedAt:
      new Date().toISOString(),
  };

  saveSuggestions(
    suggestions
  );

  return suggestions[index];
}

module.exports = {
  getAllSuggestions,
  getSuggestionById,
  createSuggestion,
  updateSuggestionStatus,
};