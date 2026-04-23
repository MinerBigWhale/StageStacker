# Stage Stacker

**Stage Stacker** est un système de contrôle de show multimédia (Cues audio et vidéo) conçu pour le spectacle vivant et la régie technique. Il permet d'organiser des médias dans une timeline dynamique, de gérer les enchaînements automatiques et de diffuser en plein écran via le moteur **MPV**.

---

## Fonctionnalités Clés

### Gestion de Stack & Médias
- **Format .stack** : Archive complète (ZIP) contenant le fichier `show.json` et les médias associés.
- **Auto-Pruning** : Lors de l'enregistrement, le système n'inclut que les médias réellement utilisés dans les Cues pour optimiser la taille des fichiers.
- **Sélecteur de fichiers** : Upload direct de fichiers via l'interface vers le dossier média de la stack.

### Moteur de Playback (Engine)
- **Chaînage intelligent** :
  - `Manually` : Attend une action de l'utilisateur.
  - `With Previous` : Se déclenche en même temps que la cue précédente (avec délai).
  - `After Previous` : Attend la fin réelle du média précédent pour se lancer.
- **Metadata Auto-Sync** : Extraction automatique de la durée, du codec et des résolutions via FFmpeg (ffprobe).

### Diffusion & Blackout
- **Mode Plein Écran** : Activation globale du mode "ON AIR" avec gestion du numéro d'écran (1 à 4).
- **Blackout Persistant** : Un fond noir MPV couvre l'écran de sortie pour éviter de voir le bureau de l'ordinateur entre deux vidéos.
- **Propagateur de signal** : L'Engine transmet l'état plein écran dynamiquement à chaque plugin.

### Interface Utilisateur (UI)
- **Timeline Waterfall** : Visualisation en cascade de la séquence temporelle basée sur les durées réelles.
- **Édition Dynamique** : Panneaux de configuration en onglets générés dynamiquement par les plugins.
- **Grid-Layout** : Interface fluide et moderne utilisant CSS Grid.

---

## Prérequis

*   **Node.js** (v16+)
*   **MPV Player** (Installé et ajouté au PATH système)
*   **FFmpeg / FFprobe** (Installé pour l'analyse des médias)

---

## Installation & Lancement

```bash
# 1. Cloner le projet
git clone https://github.com/MinerBigWhale/StageStacker.git

# 2. Installer les dépendances
npm install
npm start
```
Accédez à l'interface sur : `http://localhost:3000`

---

# Structure du Projet

```text
├── plugins/           # Logique des Plugins (Audio, Video, Base)
├── public/            # Interface Web (HTML, CSS, JS)
├── stacks/            # Stockage des fichiers .stack
├── .temp/             # Dossier d'extraction temporaire
├── BasePlugin.js      # Classe parente des cues
├── PlaybackEngine.js  # Chef d'orchestre du show
├── StackManager.js    # Gestionnaire de fichiers et d'archives
└── index.js           # API Express et serveur WebSocket
```



