/**
 * Entry point Vercel: seluruh request diarahkan ke file ini lewat vercel.json
 * (`"rewrites": [{ "source": "/(.*)", "destination": "/api" }]`).
 * Express app adalah request listener biasa, jadi cukup dipanggil langsung.
 */
import app from '../src/app.js';

export default function handler(req, res) {
  return app(req, res);
}
