// Vercel: roda a mesma API do server/ como função. O vercel.json manda /api/* para cá.
// (No Back4app, a mesma API roda como servidor normal com `npm start` dentro de server/.)
import app from '../server/server.js';
export default app;
