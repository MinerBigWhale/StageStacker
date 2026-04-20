const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

class StackManager {
  static async extractStack(stackPath, extractDir) {
    const zip = new AdmZip(stackPath);
    zip.extractAllTo(extractDir, true);

    const showJsonPath = path.join(extractDir, 'show.json');
    if (!fs.existsSync(showJsonPath)) {
      throw new Error('Invalid .stack archive: show.json missing.');
    }

    const showConfig = JSON.parse(fs.readFileSync(showJsonPath, 'utf8'));
    return {
      showConfig,
      mediaRoot: path.join(extractDir, 'media'),
      extractRoot: extractDir,
    };
  }

  static async packageStack(showConfig, mediaFiles, destPath) {
    const zip = new AdmZip();
    zip.addFile('show.json', Buffer.from(JSON.stringify(showConfig, null, 2), 'utf8'));

    mediaFiles.forEach((sourcePath) => {
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Media file not found: ${sourcePath}`);
      }
      zip.addLocalFile(sourcePath, 'media', path.basename(sourcePath));
    });

    zip.writeZip(destPath);
    return destPath;
  }

  static resolveMediaPath(extractRoot, filename) {
    return path.resolve(extractRoot, 'media', filename);
  }

  // New methods for show state management
  static createShowConfig(cues) {
    return {
      version: '1.0',
      name: 'Stage Stacker Show',
      created: new Date().toISOString(),
      cues: cues.map(cue => cue.serialize()),
    };
  }

  static async saveShowToStack(cues, destPath) {
    // Collect all media files referenced by cues
    const mediaFiles = new Set();

    cues.forEach(cue => {
      if (cue.file) {
        // Resolve the full path to the media file
        const mediaPath = cue.resolveMediaAsset ? cue.resolveMediaAsset(cue.file) : cue.file;
        if (fs.existsSync(mediaPath)) {
          mediaFiles.add(mediaPath);
        }
      }
    });

    const showConfig = this.createShowConfig(cues);
    await this.packageStack(showConfig, Array.from(mediaFiles), destPath);
    return destPath;
  }

  static async loadShowFromStack(stackPath, extractDir) {
    const { showConfig, mediaRoot, extractRoot } = await this.extractStack(stackPath, extractDir);

    // Reconstruct cues from show config
    const cues = showConfig.cues.map(cueData => {
      const CueClass = this.getCueClass(cueData.type);
      if (!CueClass) {
        throw new Error(`Unknown cue type: ${cueData.type}`);
      }

      const cue = new CueClass(cueData);
      cue.setStackContext({ mediaRoot, showRoot: extractRoot });
      return cue;
    });

    return {
      showConfig,
      cues,
      mediaRoot,
      extractRoot,
    };
  }

  static getCueClass(type) {
    // This will be set by the main application
    if (!this.cueClasses) {
      throw new Error('Cue classes not registered. Call registerCueClasses() first.');
    }
    return this.cueClasses[type];
  }

  static registerCueClasses(classes) {
    this.cueClasses = classes;
  }
}

module.exports = StackManager;
