require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { startPoller } = require('./poller');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const gameRoutes = require('./routes/game')({ io });
const draftRoutes = require('./routes/draft')({ io });
const scoreRoutes = require('./routes/score')({ io });
const adminRoutes = require('./routes/admin');

app.use('/api/admin', adminRoutes);
app.use('/api', gameRoutes);
app.use('/api/draft', draftRoutes);
app.use('/api/score', scoreRoutes);

const clientDist = path.join(__dirname, 'public');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(200).send('Fantasy Baseball server is running. Build the client with `npm run build`.');
  });
});

io.on('connection', (socket) => {
  socket.emit('connected', { ok: true });
});

// BACKEND_PORT takes priority so local dev tooling that assigns PORT to the
// client dev server (5173) doesn't collide with this server. Render (and
// most hosts) only set PORT, which is used as the fallback in production.
const PORT = process.env.BACKEND_PORT || process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Fantasy Baseball server listening on :${PORT}`);
  startPoller(io);
});
