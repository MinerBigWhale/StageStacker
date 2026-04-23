

const statusEl = document.getElementById('status');
const stackListEl = document.getElementById('stack-list');
const cuesContainer = document.getElementById('cues-container');

let _isFullscreen = false;
let _screenNum = 0;

function onWebSocketMessage(message) {
    const data = JSON.parse(message.data);
    if (data.type === 'engine:fullscreen') {
        _isFullscreen = data.value;
        const btn = document.getElementById('btn-fullscreen-toggle');
        btn.innerText = _isFullscreen ? 'ON AIR' : 'OFF AIR';
        btn.className = _isFullscreen ? 'btn-on' : 'btn-off';
    }
}
async function addCue(type) {
    await fetch('/api/stack/cues/add', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ type })
    });
    refreshUI(); 
}

async function moveCue(index, direction) {
    const from = index;
    const to = index + direction;
    await fetch('/api/stack/cues/move', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ from, to })
    });
    refreshUI();
}

async function handleFullscreenToggle() {
    const screenNum = document.getElementById('screen-selector').value;
    const btn = document.getElementById('btn-fullscreen-toggle');
    
    // Inversion de l'état actuel pour l'envoi
    const targetState = !_isFullscreen;
    
    try {
        const res = await fetch(`/api/display/fullscreen/${targetState}/${screenNum}`);
        const data = await res.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        _isFullscreen = data.fullscreen; 
        _screenNum = data.screen;
        
        screenNum.value = data.screen; 
        
        // Mise à jour visuelle du bouton
        if (data.fullscreen) {
            btn.innerText = `ON AIR (SCR ${data.screen})`;
            btn.className = 'btn-on';
            statusEl.innerText = data.message;
        } else {
            btn.innerText = 'OFF AIR';
            btn.className = 'btn-off';
            statusEl.innerText = data.message;
        }



    } catch (err) {
        console.error("Erreur Display API:", err);
        statusEl.innerText = "Erreur de communication avec le serveur";
    }
}


async function fetchStacks() {
    const res = await fetch('/api/stack/load');
    const data = await res.json();
    stackListEl.innerHTML = data.stacks.map(name => 
        `<div class="stack-item" onclick="loadStack('${name}')">
            <span class="stack-name">${name}</span>
            <div class="stack-item-delete" onclick="deleteStack(event, '${name}')">✕</div>
        </div>`
    ).join('');

    refreshUI();

}

async function refreshUI  () {
    const res = await fetch('/api/stack/refresh');
    const data = await res.json();
    if (data.success) {
        renderShow(data);
        statusEl.innerText = "Show chargé";
    }
}

function deleteStack(event, name) {
    event.stopPropagation(); 
    if(confirm(`Supprimer ${name} ?`)) {
        fetch(`/api/stack/delete/${name}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                fetchStacks();
                statusEl.innerText = "Stack supprimée";
            }
        });
    }
}

async function createStack() {
    const name = prompt("Nom du nouveau show ?");
    if (!name) return;
        const res = await fetch('/api/stack/new', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (data.success) {
        renderShow(data);
    }
}

async function saveStack() {
    const file = prompt("Nom du fichier de sauvegarde ?");
    if (!file) return;
    if (!confirm("Voulez-vous enregistrer le show actuel ?")) return;
    const res = await fetch(`/api/stack/save/${file}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        statusEl.innerText = "Show enregistré";
        fetchStacks();
    }
}

async function loadStack(name) {
    statusEl.innerText = `Chargement...`;
    const res = await fetch(`/api/stack/load/${name}`);
    const data = await res.json();
    if (data.success) {
        renderShow(data);
        statusEl.innerText = "Show chargé";
    }
}

function formatMs(ms) {
    if (!ms || isNaN(ms)) return "00:00.0";
    
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const tenths = Math.floor((ms % 1000) / 100); // Récupère le premier chiffre des ms

    const m = minutes.toString().padStart(2, '0');
    const s = seconds.toString().padStart(2, '0');
    
    return `${m}:${s}.${tenths}`;
}

function renderShow(data) {
    cuesContainer.innerHTML = '';
    const showInfo   = document.getElementById('show-info');
    showInfo.innerHTML = `<h2>${data.showConfig.name || ''}</h2> <span>${data.showConfig.filename || ''}</span>`;

    data.cues.forEach((cue, index) => {
        
        const row = document.createElement('div');
        row.className = 'cue-grid-row';
        row.id = `row-${cue.id}`;
        row.innerHTML = `
            
            <div data-id="${cue.id}" data-index="${index}" class="index-field">${index + 1}
                <button onclick="moveCue(${index}, -1)">↑</button>
                <button onclick="moveCue(${index}, 1)">↓</button>
            </div>
            <div data-id="${cue.id}" data-value="${cue.name}" class="name-field"><strong>${cue.name}</strong></div>
            <div data-id="${cue.id}" data-value="${cue.triggerType}" class="triggertype-field">${cue.triggerType}</div>
            <div data-id="${cue.id}" data-value="${cue.duration}" class="duration-field">00:00.0</div>
            <div data-id="${cue.id}" data-value="${Math.ceil(cue.delay/1000)}" class="delay-field">${formatMs(cue.delay)}</div>
            <div>
                <button class="btn-inline-play" onclick="triggerCue('${cue.id}')">▶</button>
                <button class="btn-inline-edit" onclick="toggleConfig('${cue.id}')">⚙</button>
            </div>
            <div class="waterfall-cell"><div data-index="${index}" data-begin=0 data-end=0 data-id="${cue.id}" class="waterfall-bar" style="left:0; width:0"></div></div>
        `;
        
        const config = document.createElement('div');
        config.id = `config-${cue.id}`;
        config.className = 'config-wrapper';
        
        cuesContainer.appendChild(row);
        cuesContainer.appendChild(config);

        setTimeout(() => loadConfig(cue.id), 1000); 
    });
}

async function toggleConfig(cueId) {
    const panel = document.getElementById(`config-${cueId}`);
    if (panel.classList.contains('active')) {
        panel.classList.remove('active');
        return;
    }
    panel.classList.add('active');
} 

async function loadConfig(cueId) {

    const panel = document.getElementById(`config-${cueId}`);
    
    panel.innerHTML = 'Chargement...';

    const res = await fetch(`/api/stack/cues/${cueId}/uiconfig`);
    const { config } = await res.json();
    
    panel.innerHTML = `
        <div class="tabs-nav">${config.tabs.map((t,i) => `<button class="tab-btn ${i===0?'active':''}" onclick="switchTab('${cueId}', ${i})">${t.label}</button>`).join('')}</div>
        <div class="tabs-content">${config.tabs.map((t,i) => `<div id="pane-${cueId}-${i}" class="tab-pane ${i===0?'active':''}"></div>`).join('')}</div>
    `;

    config.tabs.forEach((tab, i) => {
    const pane = document.getElementById(`pane-${cueId}-${i}`);
    
    tab.fields.forEach(async field => {
        const valRes = await fetch(`/api/stack/cues/${cueId}/config/${field.key}`);
        const { value } = await valRes.json();

        switch (field.key) {
            case 'name':
                const nameField = document.querySelector(`[data-id="${cueId}"].name-field`);
                if (nameField) {
                    nameField.innerHTML = `<strong>${value}</strong>`;
                    nameField.dataset.value = value;
                }
                break;
            case 'triggerType':
                const triggerField = document.querySelector(`[data-id="${cueId}"].triggertype-field`);
                if (triggerField) {
                    triggerField.innerText = value;
                    triggerField.dataset.value = value;
                }
                break;
            case 'delay':
                const delayField = document.querySelector(`[data-id="${cueId}"].delay-field`);
                if (delayField) {
                    delayField.innerText = formatMs(value);
                    delayField.dataset.value = Math.ceil(value / 1000);
                }
                break;
            case 'duration':
                const durationField = document.querySelector(`[data-id="${cueId}"].duration-field`);
                if (durationField) {
                    durationField.innerText = formatMs(Math.round(value * 1000));
                    durationField.dataset.value = Math.round(value);
                }
                break;
        }

    
        const group = document.createElement('div');
        group.className = 'field-group';
        group.innerHTML = `<label>${field.label}</label>`;
        
        // Appel de la fonction centralisée
        const inputElement = createField(cueId, field, value);
        group.appendChild(inputElement);
        pane.appendChild(group);

        getTiming();
    });
});
}

function getTiming() {

    const rows = document.querySelectorAll('.cue-grid-row');
    rows.forEach(row => {
        const index = parseFloat(row.querySelector('.index-field').dataset.index);
        const waterfallField = row.querySelector('.waterfall-bar');
        const waterfallFieldp = document.querySelector(`[data-index="${index-1}"].waterfall-bar`);
        const durationField = row.querySelector(`.duration-field`);
        const delayField = row.querySelector(`.delay-field`);
        const triggerTypeField = row.querySelector(`.triggertype-field`);

        const beginp = parseFloat(waterfallFieldp?.dataset.begin) || 0;
        const endp = parseFloat(waterfallFieldp?.dataset.end) || 0;
        const duration = parseFloat(durationField?.dataset.value) || 0;
        const delay = parseFloat(delayField?.dataset.value) || 0;
        const triggerType = triggerTypeField?.dataset.value || 'manually';
        
        let previous = 0;
        if (triggerType === 'with_previous') {
            previous = beginp;
        } else if (triggerType === 'after_previous') {
            previous = endp;     
        }
   
        waterfallField.dataset.begin = previous + delay;
        waterfallField.dataset.end = previous + delay + duration;

        waterfallField.style.left = `${(previous + delay) * 5}px`;
        waterfallField.style.width = `${Math.max(duration * 5, 5)}px`;
    });
}

function switchTab(cueId, index) {
    const panel = document.getElementById(`config-${cueId}`);
    panel.querySelectorAll('.tab-btn, .tab-pane').forEach(el => el.classList.remove('active'));
    panel.querySelectorAll('.tab-btn')[index].classList.add('active');
    panel.querySelectorAll('.tab-pane')[index].classList.add('active');
}

const uploadFile = async (event, cueId, key) => {
    const file = event.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/stack/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.success) {
        // 2. Mettre à jour la config de la cue avec le NOM du fichier
        await fetch(`/api/stack/cues/${cueId}/config/${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: data.filename })
        });

        // 3. Rafraîchir l'interface (Waterfall, Durée, etc.)
        refreshUI();
    }
};

function createField(cueId, field, currentValue) {
    let input;

    switch (field.type) {
        case 'select':
            input = document.createElement('select');
            input.innerHTML = (field.options || []).map(opt => 
                `<option value="${opt.value}" ${opt.value === currentValue ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            break;

        case 'multiline':
            input = document.createElement('textarea');
            input.value = currentValue || '';
            input.rows = field.rows || 4;
            break;

        case 'toggle':
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = Boolean(currentValue);
            break;

        case 'number':
            input = document.createElement('input');
            input.type = 'number';
            input.value = currentValue ?? 0;
            if (field.min !== undefined) input.min = field.min;
            if (field.max !== undefined) input.max = field.max;
            break;

        case 'filePicker':
        case 'file':
            const wrapper = document.createElement('div');
            wrapper.className = 'file-picker-wrapper';
            
            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.value = currentValue || '';
            textInput.placeholder = "Nom du fichier...";
            
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.onchange = (e) => uploadFile(e, cueId, field.key);

            wrapper.appendChild(textInput);
            wrapper.appendChild(fileInput);
            
            // L'événement se branche sur l'input texte
            textInput.onchange = (e) => updateValue(cueId, field.key, e.target.value);
            return wrapper;

        default: // 'text' ou autre
            input = document.createElement('input');
            input.type = 'text';
            input.value = currentValue || '';
    }

    input.name = field.key;
    input.id = `${cueId}-${field.key}`;
    input.className = 'config-input';

    if (field.readonly) { input.disabled = true; input.readonly = true; }

    // Gestion universelle du changement
    input.onchange = async (e) => {
        let value;
        if (field.type === 'toggle') value = e.target.checked;
        else if (field.type === 'number') value = parseFloat(e.target.value);
        else value = e.target.value;

        await updateValue(cueId, field.key, value);
    };

    return input;
}


async function updateValue(cueId, key, value) {
    await fetch(`/api/stack/cues/${cueId}/config/${key}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ value })
    });
    if(['delay', 'triggerType', 'file'].includes(key)) loadConfig(cueId);
}

async function triggerCue(id) { fetch(`/api/engine/${id}/trigger`, { method: 'POST' }); }
async function stopall() { fetch(`/api/engine/stop`, { method: 'POST' }); }

fetchStacks();
