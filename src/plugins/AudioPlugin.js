const { spawn } = require('child_process');
const kill = require('tree-kill');
const path = require('path');
const BasePlugin = require('../BasePlugin');
const ffmpeg = require('fluent-ffmpeg');
const net = require('net');

const { randomUUID } = require('crypto');

class AudioPlugin extends BasePlugin {

  constructor(config = {}) {
    super(config);
    this._file = config.file;
    this.mpvProcess = null;
    this.peakValue = null;
    this.ipcPath = null
    this.metadata = '';
  }


  sendIpcCommand(commandArray) {
    const client = net.connect(this.ipcPath, () => {
      const jsonRequest = JSON.stringify({
        command: commandArray
      });
      client.write(jsonRequest + '\n');
    });

    client.on('data', (data) => {
      const messages = data.toString().split('\n').filter(msg => msg.trim());

      messages.forEach(msg => {
        const response = JSON.parse(msg);
        console.log(`[AudioPlugin] ${this.id}-ipc:`, response);
      });
      client.destroy();
    });

    client.on('error', (err) => {
      console.error("IPC Connection Error:", err.message);
    });
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

  async start() {
    if (!this._file) return;
    if (this.mpvProcess) return;

    const resolvedFile = this.resolveMediaAsset(this._file);
    const extraArgs = [];
    if (this.loop) extraArgs.push('--loop=inf');

    const randid= randomUUID().split('-')[3];

    this.ipcPath = process.platform === 'win32' 
        ? `\\\\.\\pipe\\mpv-${this.id}-${randid}` 
        : `/tmp/mpv-${this.id}-${randid}.sock`;
        
    console.log(`[AudioPlugin] cue:${this.id} set ipcPath:${this.ipcPath}`)

    this.mpvProcess = spawn('mpv', [
      resolvedFile,
      '--quiet','--no-video',
      `--input-ipc-server=${this.ipcPath}`,
      ...extraArgs
    ]);

    this.mpvProcess.stderr.on('data', (data) => {
      console.error(`[MPV ${this.id}]: ${data.toString()}`);
    });

    this.mpvProcess.stdout.on('data', (data) => {
      //console.info(`[MPV ${this.id}]: ${data.toString()}`);
    });

    this.mpvProcess.on('close', (code) => {
      console.warn(`[AudioPlugin] MPV closed (Exit Code: ${code})`);
      this.mpvProcess = null;
      this.onComplete();
    });
  }

  async stop() {
    console.log(`[AudioPlugin] Stopping all instances of cue ${this.id}`);
    kill(this.mpvProcess.pid, 'SIGTERM', (err) => {
      if (err) console.error(`Error stopping process:`, err);
    });
  }

  async pause() {
    this.sendIpcCommand(["set_property", "pause", true]);
  }

  async resume() {
    this.sendIpcCommand(["set_property", "pause", false]);
  }
  
  async muteAudio() {
    return this.sendIpcCommand(["set_property", "mute", true]);
  }

  async resumeAudio() {
    return this.sendIpcCommand(["set_property", "mute", false]);
  }

  async stopAudioOnly() { this.stop(); }
  async stopVideoOnly() { return; }

  serialize() {
    let output = super.serialize();
    output.type = 'AudioPlugin';
    output.feeds = { video: false, audio: true };
    return {
      ...output,
      file: this._file,
      loop: this.loop,
    };
  }



  async getMetadata() {
    if (!this._file) {
      this.metadata = 'No audio file provided.';
      return;
    }

    try {
      const data = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(this.resolveMediaAsset(this._file), (err, metadata) => {
          if (err) return reject(err);
          resolve(metadata);
        });
      });

      const format = data.format || {};
      const audio = data.streams.find(s => s.codec_type === 'audio') || {};
      this.duration = parseFloat(format.duration) || 0;
      const durationText = `${Math.floor(this.duration / 60)}:${Math.floor(this.duration % 60).toString().padStart(2, '0')}`;

      this.metadata = `Artist: ${format.tags?.artist || 'unknown'}
Title: ${format.tags?.title || 'unknown'}
Album: ${format.tags?.album || 'unknown'}
Duration: ${durationText}
Audio:
\tCodec: ${audio.codec_long_name || 'unknown'}
\tSample Rate: ${audio.sample_rate ? audio.sample_rate + ' Hz' : 'unknown'}
\tChannels: ${audio.channels ? audio.channel_layout + ' (' + audio.channels + ')' : 'unknown'}
\tBit Rate: ${format.bit_rate ? (format.bit_rate / 1000).toFixed(0) + ' kbps' : 'unknown'}`;

    } catch (e) {
      this.metadata = 'Error: ' + e.message;
    }
  }

  getUicolor() {
    return '#0041b3';;
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
          label: 'Media Info',
          fields: [
            {
              key: 'metadata',
              label: 'Metadata',
              type: 'multiline',
              rows: 9,
              readonly: true,
            }
          ],
        }
      ]
    };
  }
}

module.exports = AudioPlugin;
