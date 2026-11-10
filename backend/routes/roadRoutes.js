const express = require("express");

const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware");
const {
  getAllNarrowRoads,
  getNarrowRoadById,
  createNarrowRoad,
  updateNarrowRoad,
  deleteNarrowRoad,
} = require("../services/narrowRoadService");
const { isValidPolygon, POLYGON_ERROR } = require("../utils/validatePolygon");
const {
  ROAD_NAME_ERROR,
  isValidRoadName,
} = require("../utils/validateRoadText");

const router = express.Router();

router.get("/", authenticateToken, (_req, res) => {
  try {
    res.json({ success: true, roads: getAllNarrowRoads() });
  } catch (error) {
    console.error("[Narrow Road API] Failed to get roads:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load narrow roads" });
  }
});

router.get("/:id", authenticateToken, (req, res) => {
  try {
    const road = getNarrowRoadById(req.params.id);
    if (!road)
      return res
        .status(404)
        .json({ success: false, message: "Narrow road not found" });
    res.json({ success: true, road });
  } catch (error) {
    console.error("[Narrow Road API] Failed to get road:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load narrow road" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, polygon } = req.body;
    if (!isValidRoadName(name))
      return res.status(400).json({ success: false, message: ROAD_NAME_ERROR });
    if (!isValidPolygon(polygon))
      return res.status(400).json({ success: false, message: POLYGON_ERROR });
    const road = await createNarrowRoad({ name, polygon });
    res.status(201).json({ success: true, road });
  } catch (error) {
    console.error("[Narrow Road API] Failed to create road:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create narrow road" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { name, polygon } = req.body;
    if (name === undefined && polygon === undefined)
      return res
        .status(400)
        .json({ success: false, message: "Nothing to update" });
    if (name !== undefined && !isValidRoadName(name))
      return res.status(400).json({ success: false, message: ROAD_NAME_ERROR });
    if (polygon !== undefined && !isValidPolygon(polygon))
      return res.status(400).json({ success: false, message: POLYGON_ERROR });
    const road = await updateNarrowRoad(req.params.id, { name, polygon });
    if (!road)
      return res
        .status(404)
        .json({ success: false, message: "Narrow road not found" });
    res.json({ success: true, road });
  } catch (error) {
    console.error("[Narrow Road API] Failed to update road:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update narrow road" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteNarrowRoad(req.params.id);
    if (!deleted)
      return res
        .status(404)
        .json({ success: false, message: "Narrow road not found" });
    res.json({ success: true, message: "Narrow road deleted" });
  } catch (error) {
    console.error("[Narrow Road API] Failed to delete road:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete narrow road" });
  }
});

module.exports = router;
