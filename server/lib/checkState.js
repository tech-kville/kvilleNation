/**
 * Whether a tent check is currently running.
 *
 * Lives in its own module so the roster routes can read it without importing
 * server.js. Roster edits are paused while a check is live — otherwise a
 * captain could add or remove someone from the very list a Line Monitor is
 * looking at on their phone.
 *
 * In-memory by design: this mirrors how the existing check flow already works
 * (a single always-on server instance holding the active check), so it is
 * exactly as reliable as the tent check itself.
 */

let inProgress = false;

const isCheckInProgress = () => inProgress;
const setCheckInProgress = (value) => { inProgress = Boolean(value); };

module.exports = { isCheckInProgress, setCheckInProgress };
