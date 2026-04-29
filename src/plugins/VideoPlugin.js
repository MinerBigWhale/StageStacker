const { spawn } = require('child_process');
const kill = require('tree-kill');
const BasePlugin = require('../BasePlugin');
const ffmpeg = require('fluent-ffmpeg');
const { read } = require('fs');
const net = require('net');
const { randomUUID } = require('crypto');

class VideoPlugin extends BasePlugin {
  constructor(config = {}) {
    super(config);
    this._file = config.file;
    this.muted = Boolean(config.muted);
    this.mpvProcess = null;
    this.peakValue = null;
    this.ipcPath = null;
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
              console.log(`[VideoPlugin] ${this.id}-ipc:`, response);
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
    if (this.muted) extraArgs.push('--no-audio');

    if (this.engine.isFullscreen) {
      extraArgs.push('--fullscreen');
      extraArgs.push('--fs-screen=' + this.engine.fullscreenNum);
    }

    
    const randid= randomUUID().split('-')[3];

    this.ipcPath = process.platform === 'win32' 
        ? `\\\\.\\pipe\\mpv-${this.id}-${randid}` 
        : `/tmp/mpv-${this.id}-${randid}.sock`;

    console.log(`[VideoPlugin] cue:${this.id} set ipcPath:${this.ipcPath}`)
    
    this.mpvProcess = spawn('mpv', [
      resolvedFile,
      '--quiet', '--force-window=yes', '--ontop',
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
      console.warn(`[VideoPlugin] MPV closed (Exit Code: ${code})`);
      this.mpvProcess = null;
      this.onComplete();
    });
  }

  async stop() { 
    console.log(`[VideoPlugin] Stopping all instances of cue ${this.id}`);
    kill(this.mpvProcess.pid, 'SIGTERM', (err) => {
      if (err) console.error(`Error stopping process:`, err);
    });
  }

  async pause(){
    this.sendIpcCommand(["set_property", "pause", true]);
  }

  async resume(){
    this.sendIpcCommand(["set_property", "pause", false]);
  }

 
  async muteAudio() {
    return this.sendIpcCommand(["set_property", "mute", true]);
  }

  async resumeAudio() {
    return this.sendIpcCommand(["set_property", "mute", false]);
  }


  async stopAudioOnly() { this.muteAudio(); }
  async stopVideoOnly() { this.stop(); }

  serialize() {
    let output = super.serialize();
    output.type = 'VideoPlugin';
    output.feeds = { video: true, audio: !this.muted };
    return {
      ...output,
      file: this._file,
      muted: this.muted,
      loop: this.loop,
    };
  }

  

  async getMetadata() {
    if (!this._file) {
      this.metadata = 'No video file provided.';
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
      const video = data.streams.find(s => s.codec_type === 'video') || {};
      this.duration = parseFloat(format.duration) || 0;
      const durationText = `${Math.floor(this.duration / 60)}:${Math.floor(this.duration % 60).toString().padStart(2, '0')}`;

      this.metadata =`author: ${format.tags?.artist || 'unknown'}
title: ${format.tags?.title || 'unknown'}
duration: ${durationText}
Creation Time: ${format.tags?.creation_time || 'unknown'}
Video :
\tCodec: ${video.codec_long_name || 'unknown'}
\tDimensions: ${video.width ? `${video.width}x${video.height}` : 'unknown'}
\tAspect Ratio: ${video.display_aspect_ratio || 'unknown'}
\tFrame Rate: ${video.r_frame_rate ? eval(video.r_frame_rate).toFixed(2) : 'unknown'}
Audio :
\tCodec: ${audio.codec_long_name || 'unknown'}
\tSample Rate: ${audio.sample_rate ? audio.sample_rate + ' Hz' : 'unknown'}
\tChannels: ${audio.channels ? `${audio.channel_layout} (${audio.channels})` : 'unknown'}
\tBit Rate: ${audio.bit_rate || 'unknown'}`;

    } catch (e) {
      this.metadata = `Fatal Error: ${e.message}`;
    }
  }
  
  getUiColor() {    
    return '#990000';  ;
  }
  getUiIcon() { return '🎬'; }

  getUiConfig() {
    return {
      tabs: [
        ...super.getUiConfig().tabs,
        {
          label: 'Content',
          fields: [
            { key: 'file', label: 'Video File', type: 'filePicker', accept: 'video/*' },
            { key: 'loop', label: 'Loop Video', type: 'toggle' },
            { key: 'muted', label: 'Muted', type: 'toggle' }
          ],
        },
        {
          label: 'Media Info',
          fields: [
            { key: 'metadata', label: 'Metadata', type: 'multiline', rows: 14, readonly: true }
          ],
        }
      ]
    };
  }
}

module.exports = VideoPlugin;
