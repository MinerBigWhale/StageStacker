const multer = require('multer');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { randomUUID } = require('crypto');


class StackManager {

  static getUploadMiddleware(extractDir) {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, extractDir),
      filename: (req, file, cb) => cb(null, file.originalname)
    });
    return multer({ storage });
  }

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
      mediaRoot: extractDir,
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
      zip.addLocalFile(sourcePath, null, path.basename(sourcePath));
    });

    zip.writeZip(destPath);
    return destPath;
  }

  static resolveMediaPath(extractRoot, filename) {
    return path.resolve(extractRoot, filename);
  }

  static async createNewStack(name = 'New Stage Stacker Show', extractDir) {
    const showConfig = {
      id: `show-${randomUUID().split('-').slice(0, 2).join('-')}`,
      name: name,
      version: '1.0.0',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      cues: []
    };

    return {
      showConfig,
      cues: [],
      mediaRoot: extractDir ,
      extractRoot: extractDir ,
    };
  }
  
  static async saveShowToTemp(loadedStack, extractDir){
    const showConfig = { 
      id: loadedStack.showConfig.id || `show-${randomUUID().split('-').slice(0, 2).join('-')}`,
      name: loadedStack.showConfig.name,
      version: loadedStack.showConfig.version,
      created: loadedStack.showConfig.created,
      modified: new Date().toISOString(),
      cues: loadedStack.cues.map(cue => cue.serialize()) 
    };
    
    fs.writeFileSync(path.join(extractDir, 'show.json'), JSON.stringify(showConfig, null, 2), 'utf8');

  }

  static async saveShowToStack(loadedStack, destPath) {
    // Collect all media files referenced by cues
    const mediaFiles = new Set();

    for (const cue of loadedStack.cues) {
      if (cue.file) {
        // Resolve the full path to the media file
        const mediaPath = cue.resolveMediaAsset ? cue.resolveMediaAsset(cue.file) : cue.file;
        if (fs.existsSync(mediaPath)) {
          mediaFiles.add(mediaPath);
        }
      }
    };

    const showConfig = { 
      id: loadedStack.showConfig.id || `show-${randomUUID().split('-').slice(0, 2).join('-')}`,
      name: loadedStack.showConfig.name,
      version: loadedStack.showConfig.version,
      created: loadedStack.showConfig.created,
      modified: new Date().toISOString(),
      cues: loadedStack.cues.map(cue => cue.serialize()) 
    };
    await this.packageStack(showConfig, Array.from(mediaFiles), destPath);
    return destPath;
  }
   
  static async deleteStack(stackPath) {
    if (fs.existsSync(stackPath)) {
      await fs.promises.rm(stackPath, { recursive: true, force: true });
      console.log(`Stack deleted: ${stackPath}`);
      return true;
    }
    return false;
  }

  static loadShowFromTemp(extractDir ) {
    try{
      const showJsonPath = path.join(extractDir, 'show.json');
      if (!fs.existsSync(showJsonPath)) {
        throw new Error("Can't load last: show.json missing.");
      }

      const showConfig = JSON.parse(fs.readFileSync(showJsonPath, 'utf8'));

      const cues = showConfig.cues.map(cueData => {
        const CueClass = this.getCueClass(cueData.type);
        if (!CueClass) {
          throw new Error(`Unknown cue type: ${cueData.type}`);
        }

        const cue = new CueClass(cueData);
        cue.setStackContext({ mediaRoot: extractDir, showRoot: extractDir });
        return cue;
      });

      return {
        showConfig,
        cues,
        mediaRoot: extractDir ,
        extractRoot: extractDir ,
      };
    } catch (err) {
      console.warn("error loading last show: " + err);
      return null;
    }
  }

  static async loadShowFromStack(stackPath, extractDir) {
    const { showConfig, mediaRoot, extractRoot } = await this.extractStack(stackPath, extractDir);
    showConfig.filename = path.basename(stackPath);

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

  static addCue(loadedStack, type, extractDir) {
    const CueClass = this.cueClasses[type];
    if (!CueClass) throw new Error(`Type ${type} inconnu`);
    
    const newCue = new CueClass({
      type: type,
      name: `New ${type} Cue`,
      triggerType: 'manually',
      delay: 0,
    });
    newCue.setStackContext({ mediaRoot: extractDir, showRoot: extractDir });
      
    loadedStack.cues.push(newCue);
    return newCue;
  }

  static moveCue(loadedStack, fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= loadedStack.cues.length) return;
    const [removed] = loadedStack.cues.splice(fromIndex, 1);
    loadedStack.cues.splice(toIndex, 0, removed);
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
