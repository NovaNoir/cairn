// CommonJS entry point for Electron fork
// Wraps the ESM server module for compatibility

async function start() {
  const { startServer } = await import('./index.js');
  const port = parseInt(process.env.CAIRN_PORT || '4717');
  startServer(port);
}

start().catch(err => {
  console.error('Server error:', err);
  process.exit(1);
});
