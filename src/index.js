const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const StackManager = require('./StackManager');
const PlaybackEngine = require('./PlaybackEngine');
const AudioPlugin = require('./plugins/AudioPlugin');
const VideoPlugin = require('./plugins/VideoPlugin');
const si = require('systeminformation');

let ipaddresses = [];
let ipinterval = setInterval(getNetworkInformation, 60000);
getNetworkInformation();



async function getNetworkInformation() {
  const interfaces = await si.networkInterfaces();
  ipaddresses = [];
  interfaces.forEach((net,i) => {
    if (net.internal) return;
    if (net.operstate == 'down') return;
    if (net.ip4 == '') return;
    let name
    if (net.virtual) name = "v"+i;
    else if (net.type == 'wireless') name = "w"+i;
    else if (net.type == 'wired') name = "e"+i;
    
      ipaddresses.push({name: name, ip: net.ip4});
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store loaded stack in memory
let loadedStack = null;
let extractDir = null;

// Register cue classes
StackManager.registerCueClasses({
  AudioPlugin,
  VideoPlugin,
});

// Server & WebSocket
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const engine = new PlaybackEngine(wss);

wss.on('connection', (ws, req) => {
  console.log(`[WebSocket] OnConnection from=${req.client.remoteAddress}`);
  ws.send(JSON.stringify({type: 'websocket:connected'}));
});

// Helper for broadcasting
WebSocket.Server.prototype.broadcast = function(message) {
  console.log(`[WebSocket] broadcast msg=${message.type}`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

/** 
 * STACK MANAGEMENT ROUTES
 */
app.post('/api/stack/new', async (req, res) => {
  try { 
    extractDir = path.join(__dirname, '../.temp/stack-extract');
    if (fs.existsSync(extractDir)) {
      await fs.promises.rm(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });
    loadedStack = await StackManager.createNewStack(req.body.name, extractDir);
    engine.setContext(loadedStack); 
    loadedStack.cues.forEach(cue => engine.registerCue(cue));

    const response = {
      success: true,
      showConfig: loadedStack.showConfig,
      cuesCount: loadedStack.cues.length,
      cues: loadedStack.cues.map((cue, index) => ({ ...cue.serialize(), order: index, color: cue.getUiColor(), icon: cue.getUiIcon() })),
    };

    wss.broadcast({ type: 'stack:loaded', data: response });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stack/load', (req, res) => {
  try {
    const stacksDir = path.join(__dirname, '../stacks');
    const stackFiles = fs.readdirSync(stacksDir).filter((file) => file.endsWith('.stack'));
    res.json({ success: true, stacks: stackFiles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stack/load/:stack', async (req, res) => {
  try { 
    const stackPath = path.join(__dirname, '../stacks', req.params.stack);
    if (!fs.existsSync(stackPath)) return res.status(404).json({ error: 'Not found' });

    extractDir = path.join(__dirname, '../.temp/stack-extract');
    if (fs.existsSync(extractDir)) {
      await fs.promises.rm(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    loadedStack = await StackManager.loadShowFromStack(stackPath, extractDir);
    engine.setContext(loadedStack); 
    loadedStack.cues.forEach(cue => engine.registerCue(cue));

    const response = {
      success: true,
      showConfig: loadedStack.showConfig,
      cuesCount: loadedStack.cues.length,
      cues: loadedStack.cues.map((cue, index) => ({ ...cue.serialize(), order: index, color: cue.getUiColor(), icon: cue.getUiIcon() })),
    };

    wss.broadcast({ type: 'stack:loaded', data: response });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stack/refresh', (req, res) => {
  if (!loadedStack) return res.status(400).send('No stack loaded');
  res.json({ 
    success: true, 
    showConfig: loadedStack.showConfig, 
    cuesCount: loadedStack.cues.length, 
      cues: loadedStack.cues.map((cue, index) => ({ ...cue.serialize(), order: index, color: cue.getUiColor(), icon: cue.getUiIcon() })),
  });
});

app.post('/api/stack/save/:stack', async (req, res) => {
  if (!loadedStack) return res.status(400).send('No stack loaded');
  try {
    const stackPath = path.join(__dirname, '../stacks', req.params.stack);
    await StackManager.saveShowToStack(loadedStack, stackPath);
    res.json({ success: true, message: 'Saved' });
    wss.broadcast({ type: 'stack:saved'});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/stack/delete/:stack', async (req, res) => {
  try {
    const stackPath = path.join(__dirname, '../stacks', req.params.stack);
    await StackManager.deleteStack(stackPath);
    res.json({ success: true, message: 'Deleted' });
    wss.broadcast({ type: 'stack:deleted'});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stack/save/', async (req, res) => {
  if (!loadedStack) return res.status(400).send('No stack loaded');
  try {
    const stackPath = path.join(__dirname, '../stacks', req.params.stack);
    await StackManager.saveShowToStack(loadedStack, stackPath);
    res.json({ success: true, message: 'Saved' });
    wss.broadcast({ type: 'stack:saved'});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 
 * CONFIGURATION ROUTES
 */
app.get('/api/stack/cues/:cueId/uiconfig', (req, res) => {
  const cue = loadedStack?.cues.find(c => c.id === req.params.cueId);
  if (!cue) return res.status(404).send('Cue not found');
  res.json({ success: true, config: cue.getUiConfig() });
});

app.post('/api/stack/upload', (req, res, next) => {
  if (!extractDir) return res.status(400).json({ error: 'No stack loaded' });
  
  const upload = StackManager.getUploadMiddleware(extractDir).single('file');
  
  upload(req, res, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, filename: req.file.originalname });
  });
});

app.get('/api/stack/cues/:cueId/config/:key', (req, res) => {
  const cue = loadedStack?.cues.find(c => c.id === req.params.cueId);
  if (!cue) return res.status(404).send('Cue not found');
  const value = cue.getConfigFields(req.params.key);
  res.json({ success: true, key: req.params.key, value });
});

app.post('/api/stack/cues/:cueId/config/:key', async (req, res) => {
  const cue = loadedStack?.cues.find(c => c.id === req.params.cueId);
  if (!cue) return res.status(404).send('Cue not found');

  try {
    cue.setConfigFields(req.params.key, req.body.value);

    res.json({ success: true, key: req.params.key, value: req.body.value });
    wss.broadcast({ type: 'cue:changed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stack/cues/add', (req, res) => {
  extractDir = path.join(__dirname, '../.temp/stack-extract');
  const { type } = req.body;
  const newCue = StackManager.addCue(loadedStack, type, extractDir);
  engine.registerCue(newCue); // Lier à l'engine
  res.json({ success: true, cue: newCue.serialize() });
  wss.broadcast({ type: 'cue:add', cue: newCue.serialize()});
});

app.post('/api/stack/cues/move', (req, res) => {
  const { from, to } = req.body;
  StackManager.moveCue(loadedStack, from, to);
  wss.broadcast({ type: 'cue:moved'});
  res.json({ success: true });
});

app.delete('/api/stack/cues/delete/:cue', (req, res) => {
  try {
    StackManager.deletecue(req.params.cue);
    res.json({ success: true, message: 'Deleted' });
    wss.broadcast({ type: 'cue:delete', id: req.params.cue});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 
 * ENGINE CONTROL ROUTES
 */
app.post('/api/engine/:cueId/trigger', async (req, res) => {
  const cue = loadedStack?.cues.find(c => c.id === req.params.cueId);
  if (!cue) return res.status(404).send('Cue not found');

  cue.forceStart().catch(err => console.error(err));
  
  res.json({ success: true, message: `Forçage de ${cue.name}` });
});

app.post('/api/engine/:cueId/stop', async (req, res) => {
  const cue = loadedStack?.cues.find(c => c.id === req.params.cueId);
  if (cue && cue.stop) {
    await cue.stop();
    res.json({ success: true });
  } else {
    res.status(404).send('Cannot stop cue');
  }
});

app.post('/api/engine/:cueId/resume', async (req, res) => {
  const cue = loadedStack?.cues.find(c => c.id === req.params.cueId);
  if (cue && cue.resume) {
    await cue.resume();
    res.json({ success: true });
  } else {
    res.status(404).send('Cannot resume cue');
  }
});

app.post('/api/engine/:cueId/pause', async (req, res) => {
  const cue = loadedStack?.cues.find(c => c.id === req.params.cueId);
  if (cue && cue.pause) {
    await cue.pause();
    res.json({ success: true });
  } else {
    res.status(404).send('Cannot pause cue');
  }
});

app.get('/api/engine/activecues', (req, res) => {
  res.json({ 
    success: true, 
    cues: Array.from(engine.activeCues.values()).map(c => c.serialize()) 
  });
});

app.post('/api/engine/stop', async (req, res) => {
  await engine.stopAll();
  res.json({ success: true, message: 'All cues stopped' });
});

app.post('/api/engine/next', async (req, res) => {
  await engine.forceNext();
  res.json({ success: true, message: 'Next cue triggered' });
});

app.post('/api/engine/pause', async (req, res) => {
  await engine.pauseAll();
  res.json({ success: true, message: 'All cues paused' });
});


app.post('/api/engine/resume', async (req, res) => {
  await engine.resumeAll();
  res.json({ success: true, message: 'All cues resumed' });
});

/**
 * GET /api/display/fullscreen/:active/:num
 */
app.get('/api/display/fullscreen/:active/:num', (req, res) => {
  if (req.params.active === 'false') {
    engine.toggleFullscreen(false);
    return res.json({ success: true, fullscreen: false, screen: engine.fullscreenNum, message: '[Engine] Fullscreen display deactivated' });
  } 
  const num = parseInt(req.params.num);
  if (isNaN(num) || num < 1 || num > 4) {
    return res.status(400).json({ error: 'Invalid display number', fullscreen: engine.isFullscreen, screen: engine.fullscreenNum });
  }
  engine.toggleFullscreen(true, num);
    return res.json({ success: true, fullscreen: true, screen: num, message: `[Engine] Fullscreen display ${num} activated` });
});

/**
 * GET /api
 * Liste dynamique de tous les points d'entrée de l'API
 */
app.get('/api', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) { 
      const path = middleware.route.path;
      const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
      routes.push(`${path} -- ${methods}`);
    } else if (middleware.name === 'router') { 
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const path = handler.route.path;
          const methods = Object.keys(handler.route.methods).join(', ').toUpperCase();
          routes.push(`${path} -- ${methods}`);
        }
      });
    }
  });


  res.json({
    name: 'Stage Stacker Backend',
    version: '0.1.0',
    description: 'Player and backend for Stage Stacker control center',
    // On trie les routes par ordre alphabétique pour la lisibilité
    api: routes.sort(),
    websocket: {
      url: `ws://${req.hostname}:${PORT}`,
      events: ['stack:loaded', 'cue:started', 'cue:complete', 'cue:error'],
    },
    ipAddresses : ipaddresses,
    status: {
      stackLoaded: !!loadedStack,
      activeCues: engine.activeCues.size
    }
  });
});

// Servir les fichiers statiques (si vous avez un dossier public)
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Stage Stacker running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}`);
  console.log(`API Documentation at http://localhost:${PORT}/api`);
  setTimeout(() => { console.log(JSON.stringify(ipaddresses)); },5000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server shut down');
    process.exit(0);
  });
});

module.exports = app;
