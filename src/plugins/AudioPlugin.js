const { spawn } = require('child_process');
const path = require('path');
const BasePlugin = require('../BasePlugin');
const ffmpeg = require('fluent-ffmpeg');

class AudioPlugin extends BasePlugin {

  constructor(config = {}) {
    super(config);
    this._file = config.file || '';
    this.instances = new Map();
    this.wsServer = null;
    this.peakInterval = null;
    this._completeResolver = null;
    this._completionPromise = new Promise((resolve) => {
      this._completeResolver = resolve;
    });
    this.metadata = '';
  }
  
  setStackContext({ mediaRoot, showRoot }) {
    super.setStackContext({ mediaRoot, showRoot });
    if (this._file) this.getMetadata();
  }
  
  attachWebSocketServer(wsServer) {
    this.wsServer = wsServer;
  }

  get file() {
    return this._file;
  }
  
  set file(file) {
    this._file = file;
    this.getMetadata();
  }

  async getMetadata() {
    if (!this._file) {
      this.metadata = 'No audio file provided.';
      return;
    }

    try {
      this.metadata = await new Promise((resolve) => {
        ffmpeg.ffprobe(this.resolveMediaAsset(this._file), (err, data) => {
          if (err) {
            return resolve(`Error retrieving metadata: ${err.message}`);
          }
          
          const format = data.format || {};
          const audio = data.streams.find(s => s.codec_type === 'audio') || {};
          
          const duration = format.duration 
            ? `${Math.floor(format.duration / 60)}:${Math.floor(format.duration % 60).toString().padStart(2, '0')}` 
            : 'unknown';

          resolve(`Artist: ${format.tags?.artist || 'unknown'}
Title: ${format.tags?.title || 'unknown'}
Album: ${format.tags?.album || 'unknown'}
Duration: ${duration}
Format: ${format.format_long_name || 'unknown'}
Codec: ${audio.codec_long_name || 'unknown'}
Sample Rate: ${audio.sample_rate ? audio.sample_rate + ' Hz' : 'unknown'}
Channels: ${audio.channels ? audio.channel_layout + ' (' + audio.channels + ')' : 'unknown'}
Bit Rate: ${format.bit_rate ? (format.bit_rate / 1000).toFixed(0) + ' kbps' : 'unknown'}`);
        });
      });
    } catch (e) {
      this.metadata = 'Error: ' + e.message;
    }
  }
  _spawnMpv(file, extraArgs = []) {
    const args = [
      file,
      '--quiet',
      '--no-video',
      '--msg-level=cplayer=v', // Augmente la précision pour voir les stats
      '--term-status-msg=Audio-Out: ${audio-out-peak}', // Affiche les pics dans le flux
      ...extraArgs
    ];
    return spawn('mpv', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  }

  _registerProcess(instanceId, mpvProcess) {
    this.instances.set(instanceId, mpvProcess);

    const handleOutput = (chunk) => {
      const output = chunk.toString('utf8');
      
      // On ne broadcast que si la ligne contient des infos de peak
      // mpv affiche souvent les peaks sous cette forme avec l'argument term-status-msg
      if (output.includes('Audio-Out')) {
        this._broadcastPeakLevels({ 
          sourceId: instanceId, 
          sample: output.trim() 
        });
      }
    };

    mpvProcess.stdout.on('data', handleOutput);
    // Souvent mpv écrit les status sur stderr
    mpvProcess.stderr.on('data', handleOutput);

    mpvProcess.on('close', () => {
      this.instances.delete(instanceId);
      if (this.instances.size === 0) {
        if (this.peakInterval) clearInterval(this.peakInterval);
        this.peakInterval = null;
        
        this._started = false; // Important pour pouvoir relancer
        this.onComplete(); 
        if (this._completeResolver) this._completeResolver();
      }
    });
  }

  _startPeakBroadcast() {
    if (!this.wsServer || this.peakInterval) return;
    this.peakInterval = setInterval(() => {
      this._broadcastPeakLevels({ type: 'heartbeat' });
    }, 250);
  }

  _broadcastPeakLevels(payload) {
    if (!this.wsServer) return;
    const message = JSON.stringify({ cueId: this.id, timestamp: Date.now(), payload });
    this.wsServer.clients.forEach((client) => {
      if (client.readyState === 1) client.send(message);
    });
  }

  async start() {
    if (!this._file) {
      this.onComplete();
      if (this._completeResolver) this._completeResolver();
      return this._completionPromise;
    }

    const resolvedFile = this.resolveMediaAsset(this._file);
    const args = this.loop ? ['--loop=inf'] : [];
    
    const mpvProcess = this._spawnMpv(resolvedFile, args);
    this._registerProcess(this.id, mpvProcess);
    this._startPeakBroadcast();
    
    return this._completionPromise;
  }

  async stop() {
    this.instances.forEach((proc) => proc.kill('SIGTERM'));
  }

  serialize() {
    let output = super.serialize();
    output.type = 'AudioPlugin';
    output.feeds = { video: false, audio: true};
    return {
      ...output,
      file: this._file,
      loop: this.loop,
    };
  }

  
  getUicolor() {    
    return '#00348d';  ;
  }
  
  getUiIcon() {    
    return '🔊';
  }

  getUIConfig() {
    return {
      tabs: [
        ...super.getUIConfig().tabs,
        {
          label: 'Audio Content',
          fields: [
            {
              key: 'file',
              label: 'Audio File',
              type: 'filePicker',
              accept: 'audio/*',
            },
            {
              key: 'loop',
              label: 'Loop Audio',
              type: 'toggle',
            }
          ],
        },
        {
          label: 'Audio Info',
          fields: [
            {
              key: 'metadata',
              label: 'Metadata',
              type: 'info',
            }
          ],
        }
      ]
    };
  }
}

module.exports = AudioPlugin;
