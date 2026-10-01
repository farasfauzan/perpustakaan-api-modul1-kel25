/**
 * Entry point Vercel: seluruh request diarahkan ke file ini lewat vercel.json
 * (`"rewrites": [{ "source": "/(.*)", "destination": "/api" }]`).
 * Express app adalah request listener biasa, jadi cukup dipanggil langsung.
 */
import app from '../src/app.js';

const DIAG = true; // SEMENTARA: paksa diagnostik aktif untuk menelusuri 500

export default function handler(req, res) {
  if (!DIAG) return app(req, res);

  const report = (where) => (err) => {
    console.error('[diag]', where, err?.name, err?.type, err?.status, err?.message);
    if (res.headersSent) return;
    res.status(597).json({
      diag: {
        where,
        name: err?.name,
        type: err?.type,
        status: err?.status,
        statusCode: err?.statusCode,
        message: err?.message,
        readable: req.readable,
        readableEnded: req.readableEnded,
        complete: req.complete,
        aborted: req.aborted,
        haveBody: req.body !== undefined,
        bodyType: typeof req.body,
      },
    });
  };

  const onUncaught = report('uncaughtException');
  const onRejection = report('unhandledRejection');
  process.once('uncaughtException', onUncaught);
  process.once('unhandledRejection', onRejection);
  req.on('error', (err) => console.error('[diag] req.error', err?.name, err?.type, err?.message));
  req.on('aborted', () => console.error('[diag] req.aborted'));

  return app(req, res);
}
