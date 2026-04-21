const statusEl = document.getElementById('status');
const stackListEl = document.getElementById('stack-list');
const cuesContainer = document.getElementById('cues-container');

// Charger la liste des fichiers .stack
async function fetchStacks() {
    try {
        const res = await fetch('/api/stack/load');
        const data = await res.json();
        stackListEl.innerHTML = '';
        
        data.stacks.forEach(name => {
            const div = document.createElement('div');
            div.className = 'stack-item';
            div.innerText = name;
            div.onclick = () => loadStack(name);
            stackListEl.appendChild(div);
        });
    } catch (err) {
        statusEl.innerText = "Erreur de connexion";
    }
}

// Charger une stack spécifique
async function loadStack(name) {
    statusEl.innerText = `Chargement de ${name}...`;
    const res = await fetch(`/api/stack/load/${name}`);
    const data = await res.json();
    
    if (data.success) {
        renderShow(data);
        statusEl.innerText = "Show chargé";
    }
}

// Créer un nouveau show
document.getElementById('btn-new').onclick = async () => {
    const name = prompt("Nom du show :");
    if (!name) return;

    const res = await fetch('/api/stack/new', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (data.success) {
        renderShow({ showConfig: data.showConfig, cues: [] });
        statusEl.innerText = "Nouveau show créé";
    }
};

// Afficher les Cues à l'écran
function renderShow(data) {
    document.getElementById('show-name').innerText = data.showConfig.name;
    document.getElementById('show-details').innerText = `${data.cues?.length || 0} Cues`;
    
    cuesContainer.innerHTML = '';
    (data.cues || []).forEach(cue => {
        const card = document.createElement('div');
        card.className = 'cue-card';
        card.innerHTML = `
            <h4>${cue.name || 'Sans titre'}</h4>
            <p>${cue.type}</p>
            <button onclick="triggerCue('${cue.id}')">PLAY</button>
        `;
        cuesContainer.appendChild(card);
    });
}

async function triggerCue(id) {
    await fetch(`/api/stack/cues/${id}/trigger`, { method: 'POST' });
}

// Initialisation
fetchStacks();
