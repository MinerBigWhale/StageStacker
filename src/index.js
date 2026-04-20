const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const StackManager = require('./StackManager');
const BasePlugin = require('./BasePlugin');
const AudioPlugin = require('./plugins/AudioPlugin');
const VideoPlugin = require('./plugins/VideoPlugin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store loaded stack configuration in memory
let loadedStack = null;
let extractDir = null;

// Register cue classes with StackManager
StackManager.cueClasses = {
  AudioPlugin,
  VideoPlugin,
};

// Initialize WebSocket server for real-time updates
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Send current stack state to connected client
  if (loadedStack) {
    ws.send(JSON.stringify({
      type: 'stack:loaded',
      data: {
        showConfig: loadedStack.showConfig,
        cuesCount: loadedStack.cues.length,
      },
    }));
  }

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Helper function to broadcast to all connected clients
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

/**
 * GET /api/stack/load
 * Get the list of available stack files
 */
app.get('/api/stack/load', (req, res) => {
  try {
    const stacksDir = path.join(__dirname, '../stacks');
    const stackFiles = fs.readdirSync(stacksDir).filter((file) => file.endsWith('.stack'));

    res.json({
      success: true,
      stacks: stackFiles,
    });
  } catch (error) {
    console.error('Error fetching stack files:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stack/load/:stack
 * Load and parse the stack file
 */
app.get('/api/stack/load/:stack', async (req, res) => {
  try {
    const stackPath = path.join(__dirname, '../stacks', req.params.stack);

    if (!fs.existsSync(stackPath)) {
      return res.status(404).json({ error: 'Stack file not found' });
    }

    // Create a temporary extract directory
    extractDir = path.join(__dirname, '../.temp/stack-extract');
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    // Load the stack using StackManager
    loadedStack = await StackManager.loadShowFromStack(stackPath, extractDir);

    const response = {
      success: true,
      showConfig:  {
        id: loadedStack.showConfig.id,
        name: loadedStack.showConfig.name,
        version: loadedStack.showConfig.version,
        created: loadedStack.showConfig.created
      },
      cuesCount: loadedStack.cues.length,
      cues: loadedStack.cues.map((cue, index) => ({
        id: cue.id,
        name: cue.name,
        type: cue.constructor.name,
        order: index,
        triggerType: cue.triggerType,
        delay: cue.delay,
        loop: cue.loop,
        file: cue.file || null,
        feeds: cue.feeds,
      })),
      mediaRoot: loadedStack.mediaRoot,
    };

    broadcast({
      type: 'stack:loaded',
      data: response,
    });

    res.json(response);
  } catch (error) {
    console.error('Error loading stack:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stack/config
 * Get the current loaded stack configuration
 */
app.get('/api/stack/config', (req, res) => {
  if (!loadedStack) {
    return res.status(400).json({ error: 'No stack currently loaded. Call /api/stack/load first.' });
  }

  const response = {
    success: true,
    showConfig: loadedStack.showConfig,
    cuesCount: loadedStack.cues.length,
    cues: loadedStack.cues.map((cue, index) => ({
      id: cue.id,
      name: cue.name,
      type: cue.constructor.name,
      order: index,
      triggerType: cue.triggerType,
      delay: cue.delay,
      loop: cue.loop,
      file: cue.file || null,
      feeds: cue.feeds,
    })),
  };

  res.json(response);
});

/**
 * GET /api/stack/cues
 * Get all cues in the loaded stack
 */
app.get('/api/stack/cues', (req, res) => {
  if (!loadedStack) {
    return res.status(400).json({ error: 'No stack currently loaded' });
  }

  const cues = loadedStack.cues.map((cue, index) => ({
    id: cue.id,
    name: cue.name,
    type: cue.constructor.name,
    order: index,
    triggerType: cue.triggerType,
    delay: cue.delay,
    loop: cue.loop,
    file: cue.file || null,
    feeds: cue.feeds,
    status: 'idle',
  }));

  res.json({
    success: true,
    count: cues.length,
    cues,
  });
});

/**
 * GET /api/stack/cues/:cueId
 * Get a specific cue by ID
 */
app.get('/api/stack/cues/:cueId', (req, res) => {
  if (!loadedStack) {
    return res.status(400).json({ error: 'No stack currently loaded' });
  }

  const cue = loadedStack.cues.find((c) => c.id === req.params.cueId);

  if (!cue) {
    return res.status(404).json({ error: 'Cue not found' });
  }

  res.json({
    success: true,
    cue: {
      id: cue.id,
      name: cue.name,
      type: cue.constructor.name,
      triggerType: cue.triggerType,
      delay: cue.delay,
      loop: cue.loop,
      file: cue.file || null,
      feeds: cue.feeds,
      status: 'idle',
    },
  });
});

/**
 * POST /api/stack/cues/:cueId/trigger
 * Trigger a specific cue (for collaborative control)
 */
app.post('/api/stack/cues/:cueId/trigger', async (req, res) => {
  if (!loadedStack) {
    return res.status(400).json({ error: 'No stack currently loaded' });
  }

  const cue = loadedStack.cues.find((c) => c.id === req.params.cueId);

  if (!cue) {
    return res.status(404).json({ error: 'Cue not found' });
  }

  try {
    broadcast({
      type: 'cue:triggered',
      data: {
        cueId: cue.id,
        cueName: cue.name,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      message: `Triggered cue: ${cue.name}`,
      cueId: cue.id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/stack/cues/:cueId/stop
 * Stop a specific cue
 */
app.post('/api/stack/cues/:cueId/stop', (req, res) => {
  if (!loadedStack) {
    return res.status(400).json({ error: 'No stack currently loaded' });
  }

  const cue = loadedStack.cues.find((c) => c.id === req.params.cueId);

  if (!cue) {
    return res.status(404).json({ error: 'Cue not found' });
  }

  try {
    broadcast({
      type: 'cue:stopped',
      data: {
        cueId: cue.id,
        cueName: cue.name,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      message: `Stopped cue: ${cue.name}`,
      cueId: cue.id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    stackLoaded: !!loadedStack,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /
 * Root endpoint with API documentation
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Stage Stacker Backend',
    version: '0.1.0',
    description: 'Collaborative backend for Stage Stacker stack control',
    endpoints: {
      health: 'GET /api/health',
      loadStack: 'GET /api/stack/load',
      stackConfig: 'GET /api/stack/config',
      getCues: 'GET /api/stack/cues',
      getCue: 'GET /api/stack/cues/:cueId',
      triggerCue: 'POST /api/stack/cues/:cueId/trigger',
      stopCue: 'POST /api/stack/cues/:cueId/stop',
    },
    websocket: {
      url: 'ws://localhost:3000',
      events: ['stack:loaded', 'cue:triggered', 'cue:stopped'],
    },
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Stage Stacker Backend running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}`);
  console.log(`API Documentation at http://localhost:${PORT}`);
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
