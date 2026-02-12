// ===== Configuration =====
const WEBHOOK_URL = 'http://46.225.76.46:5678/webhook/thermoduct-admin';

// ===== State =====
let blokCounter = 0;

// ===== DOM references =====
const blokkenContainer = document.getElementById('blokkenContainer');
const btnAddBlok = document.getElementById('btnAddBlok');
const btnOpslaan = document.getElementById('btnOpslaan');
const statusMsg = document.getElementById('statusMsg');
const projectNaamInput = document.getElementById('projectNaam');

// ===== Event listeners =====
btnAddBlok.addEventListener('click', () => addBlok());
btnOpslaan.addEventListener('click', () => opslaan());

// ===== Utility: unique IDs =====
let _id = 0;
function uid() { return 'n' + (++_id); }

// ===== Accordion toggle =====
function toggleCard(headerEl) {
    const body = headerEl.nextElementSibling;
    const chevron = headerEl.querySelector('.chevron');
    body.classList.toggle('open');
    chevron.classList.toggle('open');
}

// ===== Remove item =====
function removeItem(btn) {
    const card = btn.closest('.card');
    card.remove();
}

// ===== Create card wrapper =====
function createCard(level, badgeText, titleText) {
    const card = document.createElement('div');
    card.className = `card level-${level}`;
    card.dataset.level = level;

    const id = uid();

    card.innerHTML = `
        <div class="card-header" onclick="toggleCard(this)">
            <span class="title">
                <span class="badge badge-${level}">${badgeText}</span>
                <span class="card-title-text">${titleText}</span>
            </span>
            <div class="card-actions">
                <button type="button" class="btn btn-remove" onclick="event.stopPropagation(); removeItem(this);" title="Verwijderen">&#x2715;</button>
                <span class="chevron open">&#9654;</span>
            </div>
        </div>
        <div class="card-body open" id="body-${id}">
        </div>
    `;

    return { card, bodyId: `body-${id}` };
}

// ===== Dynamic title update =====
function bindTitleUpdate(input, card, prefix) {
    input.addEventListener('input', () => {
        const titleSpan = card.querySelector('.card-title-text');
        titleSpan.textContent = input.value ? `${prefix} ${input.value}` : prefix;
    });
}

// ===== Add Blok =====
function addBlok() {
    blokCounter++;
    const { card, bodyId } = createCard('blok', 'Blok', `Blok ${blokCounter}`);

    const body = card.querySelector(`#${bodyId}`);
    body.innerHTML = `
        <div class="field-row cols-2">
            <div>
                <label>Naam</label>
                <input type="text" class="blok-naam" placeholder="bijv. Blok A">
            </div>
            <div>
                <label>Adres</label>
                <input type="text" class="blok-adres" placeholder="bijv. Kerkstraat 1">
            </div>
        </div>
        <div class="children-container" data-children="verdiepen"></div>
        <button type="button" class="btn btn-add btn-add-child" onclick="addVerdiep(this)">+ Verdiep</button>
    `;

    const naamInput = body.querySelector('.blok-naam');
    bindTitleUpdate(naamInput, card, 'Blok');

    blokkenContainer.appendChild(card);
}

// ===== Add Verdiep =====
function addVerdiep(btn) {
    const container = btn.previousElementSibling;
    const count = container.children.length + 1;

    const { card, bodyId } = createCard('verdiep', 'Verdiep', `Verdieping ${count}`);
    const body = card.querySelector(`#${bodyId}`);

    body.innerHTML = `
        <div class="field-row cols-2">
            <div>
                <label>Nummer</label>
                <input type="number" class="verdiep-nummer" placeholder="bijv. 1" min="0" value="${count}">
            </div>
            <div></div>
        </div>
        <div class="children-container" data-children="collectoren"></div>
        <button type="button" class="btn btn-add btn-add-child" onclick="addCollector(this)">+ Collector</button>
    `;

    const nummerInput = body.querySelector('.verdiep-nummer');
    nummerInput.addEventListener('input', () => {
        const titleSpan = card.querySelector('.card-title-text');
        titleSpan.textContent = nummerInput.value ? `Verdieping ${nummerInput.value}` : 'Verdieping';
    });

    container.appendChild(card);
}

// ===== Add Collector =====
function addCollector(btn) {
    const container = btn.previousElementSibling;
    const count = container.children.length + 1;

    const { card, bodyId } = createCard('collector', 'Collector', `Collector ${count}`);
    const body = card.querySelector(`#${bodyId}`);

    body.innerHTML = `
        <div class="field-row cols-3">
            <div>
                <label>Nummer</label>
                <input type="number" class="collector-nummer" placeholder="bijv. 1" min="1" value="${count}">
            </div>
            <div>
                <label>Type</label>
                <select class="collector-type">
                    <option value="vloer">Vloer</option>
                    <option value="radiator">Radiator</option>
                </select>
            </div>
            <div>
                <label>Druk</label>
                <input type="number" class="collector-druk" placeholder="Druk (optioneel)" step="any">
            </div>
        </div>
        <div class="children-container" data-children="kringen"></div>
        <button type="button" class="btn btn-add btn-add-child" onclick="addKring(this)">+ Kring</button>
    `;

    const nummerInput = body.querySelector('.collector-nummer');
    nummerInput.addEventListener('input', () => {
        const titleSpan = card.querySelector('.card-title-text');
        titleSpan.textContent = nummerInput.value ? `Collector ${nummerInput.value}` : 'Collector';
    });

    container.appendChild(card);
}

// ===== Add Kring =====
function addKring(btn) {
    const container = btn.previousElementSibling;
    const count = container.children.length + 1;

    const { card, bodyId } = createCard('kring', 'Kring', `Kring ${count}`);
    const body = card.querySelector(`#${bodyId}`);

    body.innerHTML = `
        <div class="field-row cols-4">
            <div>
                <label>Nummer</label>
                <input type="number" class="kring-nummer" placeholder="bijv. 1" min="1" value="${count}">
            </div>
            <div>
                <label>m²</label>
                <input type="number" class="kring-m2" placeholder="bijv. 25" step="any" min="0">
            </div>
            <div>
                <label>Legpatroon</label>
                <select class="kring-legpatroon">
                    <option value="slak">Slak</option>
                    <option value="meandr">Meandr</option>
                </select>
            </div>
            <div>
                <label>Lengte (m)</label>
                <input type="number" class="kring-lengte" placeholder="bijv. 80" step="any" min="0">
            </div>
        </div>
    `;

    const nummerInput = body.querySelector('.kring-nummer');
    nummerInput.addEventListener('input', () => {
        const titleSpan = card.querySelector('.card-title-text');
        titleSpan.textContent = nummerInput.value ? `Kring ${nummerInput.value}` : 'Kring';
    });

    container.appendChild(card);
}

// ===== Collect data =====
function collectData() {
    const project = projectNaamInput.value.trim();

    const blokken = [];
    const blokCards = blokkenContainer.querySelectorAll(':scope > .card.level-blok');

    blokCards.forEach(blokCard => {
        const body = blokCard.querySelector('.card-body');
        const blok = {
            naam: body.querySelector('.blok-naam').value.trim(),
            adres: body.querySelector('.blok-adres').value.trim(),
            verdiepen: []
        };

        const verdiepCards = body.querySelectorAll(':scope > .children-container > .card.level-verdiep');
        verdiepCards.forEach(vCard => {
            const vBody = vCard.querySelector('.card-body');
            const verdiep = {
                nummer: parseInt(vBody.querySelector('.verdiep-nummer').value) || 0,
                collectoren: []
            };

            const collectorCards = vBody.querySelectorAll(':scope > .children-container > .card.level-collector');
            collectorCards.forEach(cCard => {
                const cBody = cCard.querySelector('.card-body');
                const drukVal = cBody.querySelector('.collector-druk').value;
                const collector = {
                    nummer: parseInt(cBody.querySelector('.collector-nummer').value) || 0,
                    type: cBody.querySelector('.collector-type').value,
                    druk: drukVal ? parseFloat(drukVal) : null,
                    kringen: []
                };

                const kringCards = cBody.querySelectorAll(':scope > .children-container > .card.level-kring');
                kringCards.forEach(kCard => {
                    const kBody = kCard.querySelector('.card-body');
                    collector.kringen.push({
                        nummer: parseInt(kBody.querySelector('.kring-nummer').value) || 0,
                        m2: parseFloat(kBody.querySelector('.kring-m2').value) || 0,
                        legpatroon: kBody.querySelector('.kring-legpatroon').value,
                        lengte: parseFloat(kBody.querySelector('.kring-lengte').value) || 0
                    });
                });

                verdiep.collectoren.push(collector);
            });

            blok.verdiepen.push(verdiep);
        });

        blokken.push(blok);
    });

    return { project, blokken };
}

// ===== Validation =====
function validate(data) {
    if (!data.project) return 'Vul een projectnaam in.';
    if (data.blokken.length === 0) return 'Voeg minstens één blok toe.';
    for (const blok of data.blokken) {
        if (!blok.naam) return 'Elk blok moet een naam hebben.';
    }
    return null;
}

// ===== Show status =====
function showStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = `status-msg ${type}`;
    setTimeout(() => {
        statusMsg.className = 'status-msg hidden';
    }, 5000);
}

// ===== Submit =====
async function opslaan() {
    const data = collectData();
    const error = validate(data);

    if (error) {
        showStatus(error, 'error');
        return;
    }

    btnOpslaan.disabled = true;
    btnOpslaan.textContent = 'Verzenden...';

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Server antwoordde met status ${response.status}`);
        }

        showStatus('Data succesvol verzonden!', 'success');
    } catch (err) {
        showStatus(`Fout bij verzenden: ${err.message}`, 'error');
        console.error('Webhook error:', err);
    } finally {
        btnOpslaan.disabled = false;
        btnOpslaan.textContent = 'Opslaan & Versturen';
    }
}
