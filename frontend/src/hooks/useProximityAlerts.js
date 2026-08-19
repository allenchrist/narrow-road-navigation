import { useMemo } from "react";
import { haversineDistance } from "../utils/haversine";

// Distance thresholds in metres
const CRITICAL_M = 30;
const WARNING_M  = 80;

/**
 * Returns an array of active proximity alerts sorted by distance ascending.
 * Each alert: { id, vehicleA, vehicleB, distance, level: "critical"|"warning" }
 */
export function useProximityAlerts(vehicles) {
  return useMemo(() => {
    const list = Object.values(vehicles).filter(
      (v) => v.connected && v.lat !== null && v.lon !== null
    );

    const alerts = [];

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dist = haversineDistance(a.lat, a.lon, b.lat, b.lon);

        if (dist <= WARNING_M) {
          alerts.push({
            id: `${a.vehicleId}-${b.vehicleId}`,
            vehicleA: a.vehicleId,
            vehicleB: b.vehicleId,
            distance: dist,
            level: dist <= CRITICAL_M ? "critical" : "warning",
          });
        }
      }
    }

    return alerts.sort((a, b) => a.distance - b.distance);
  }, [vehicles]);
}
