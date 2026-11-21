const express = require("express");

const { requireAdmin } = require("../middleware/authMiddleware");
const {
  deleteBend,
  getHillRoads,
  moveWaitingPoint,
} = require("../services/hillRoadService");

const router = express.Router();

// Without the measurements kept for locating vehicles
const forAdmin = ({ id, name, line, bends }) => ({ id, name, line, bends });

const isPoint = (point) =>
  Array.isArray(point) &&
  point.length === 2 &&
  point.every((value) => Number.isFinite(value)) &&
  Math.abs(point[0]) <= 90 &&
  Math.abs(point[1]) <= 180;

// Ghat roads and their bends, for the admin map
router.get("/", requireAdmin, (_req, res) => {
  res.json({ success: true, roads: getHillRoads().map(forAdmin) });
});

// Moves a bend's waiting point, on its "below" or "above" side
router.put("/:id/bends/:number/wait", requireAdmin, async (req, res) => {
  const { side, point } = req.body ?? {};

  if (!["below", "above"].includes(side) || !isPoint(point)) {
    return res
      .status(400)
      .json({ success: false, message: "A side and a point are needed." });
  }

  try {
    const { road, error } = await moveWaitingPoint(
      req.params.id,
      Number(req.params.number),
      side,
      point,
    );

    if (error) return res.status(400).json({ success: false, message: error });

    res.json({ success: true, road: forAdmin(road) });
  } catch (error) {
    console.error("[Mountain] Moving a waiting point failed:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to move the waiting point." });
  }
});

// Deletes a bend the map got wrong
router.delete("/:id/bends/:number", requireAdmin, async (req, res) => {
  try {
    const { road, error } = await deleteBend(
      req.params.id,
      Number(req.params.number),
    );

    if (error) return res.status(404).json({ success: false, message: error });

    res.json({ success: true, road: forAdmin(road) });
  } catch (error) {
    console.error("[Mountain] Deleting a bend failed:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete the bend." });
  }
});

module.exports = router;
