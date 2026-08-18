/**
 * DEPRECATED — No longer used.
 *
 * The old architecture had Node.js connecting as a WebSocket CLIENT
 * to an Android Ktor WebSocket SERVER at ws://192.168.1.3:8080/ws.
 *
 * This required both devices to be on the same local network.
 *
 * NEW ARCHITECTURE:
 * Android phones connect as WebSocket CLIENTS to the Node.js
 * WebSocket SERVER at ws://BACKEND/vehicle.
 *
 * See: backend/socket/vehicleWebSocketServer.js
 *
 * This file is kept only for reference and will be removed in a
 * future cleanup.
 */

module.exports = {};
