// ===== Configuration =====
const WEBHOOK_URL = 'http://46.225.76.46:5678/webhook/thermoduct-admin';

// ===== State =====
let gebouwCounter = 0;

// ===== DOM references =====
const gebouwenContainer = document.getElementById('blokkenContainer');
const btnAddGebouw = document.getElementById('btnAddBlok');
const btnOpslaan = document.getElementById('btnOpslaan');
const statusMsg = document.getElementById('statusMsg');
const projectNaamInput = document.getElementById('projectNaam');

// ===== Event listeners =====
btnAddGebouw.addEventListener('click', () => addGebouw());
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

// ===== Format verdiep nummer as +00, +01, etc. =====
function formatVerdiep(num) {
    const n = parseInt(num);
    if (isNaN(n)) return '+00';
    const sign = n < 0 ? '-' : '+';
    return sign + String(Math.abs(n)).padStart(2, '0');
}

// ===== Add Gebouw (was Blok) =====
function addGebouw() {
    gebouwCounter++;
    const { card, bodyId } = createCard('blok', 'Gebouw', `Gebouw ${gebouwCounter}`);

    const body = card.querySelector(`#${bodyId}`);
    body.innerHTML = `
        <div class="field-row cols-1">
            <div>
                <label>Naam</label>
                <input type="text" class="blok-naam" placeholder="bijv. Blok A, Woning 1, Villa ...">
            </div>
        </div>
        <div class="children-container" data-children="verdiepen"></div>
        <button type="button" class="btn btn-add btn-add-child" onclick="addVerdiep(this)">+ Verdiep</button>
    `;

    const naamInput = body.querySelector('.blok-naam');
    bindTitleUpdate(naamInput, card, 'Gebouw');

    gebouwenContainer.appendChild(card);
}

// ===== Add Verdiep =====
function addVerdiep(btn) {
    const container = btn.previousElementSibling;
    const count = container.children.length;

    const verdiepLabel = formatVerdiep(count);
    const { card, bodyId } = createCard('verdiep', 'Verdiep', `Verdieping ${verdiepLabel}`);
    const body = card.querySelector(`#${bodyId}`);

    body.innerHTML = `
        <div class="field-row cols-2">
            <div>
                <label>Verdieping</label>
                <input type="number" class="verdiep-nummer" placeholder="bijv. 0" min="-5" value="${count}">
            </div>
            <div></div>
        </div>
        <div class="children-container" data-children="collectoren"></div>
        <button type="button" class="btn btn-add btn-add-child" onclick="addCollector(this)">+ Collector</button>
    `;

    const nummerInput = body.querySelector('.verdiep-nummer');
    nummerInput.addEventListener('input', () => {
        const titleSpan = card.querySelector('.card-title-text');
        titleSpan.textContent = `Verdieping ${formatVerdiep(nummerInput.value)}`;
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
                <label>Druk (bar)</label>
                <select class="collector-druk">
                    <option value="4" selected>4 bar</option>
                    <option value="6">6 bar</option>
                </select>
            </div>
            <div>
                <label>Aantal kringen</label>
                <input type="number" class="collector-aantal-kringen" placeholder="bijv. 5" min="0" value="0">
            </div>
        </div>
        <div class="children-container" data-children="kringen"></div>
    `;

    const nummerInput = body.querySelector('.collector-nummer');
    nummerInput.addEventListener('input', () => {
        const titleSpan = card.querySelector('.card-title-text');
        titleSpan.textContent = nummerInput.value ? `Collector ${nummerInput.value}` : 'Collector';
    });

    const aantalInput = body.querySelector('.collector-aantal-kringen');
    aantalInput.addEventListener('change', () => {
        syncKringen(body);
    });

    container.appendChild(card);
}

// ===== Sync kringen based on aantal =====
function syncKringen(collectorBody) {
    const aantalInput = collectorBody.querySelector('.collector-aantal-kringen');
    const kringenContainer = collectorBody.querySelector('.children-container[data-children="kringen"]');
    const desired = parseInt(aantalInput.value) || 0;
    const current = kringenContainer.children.length;

    if (desired > current) {
        for (let i = current + 1; i <= desired; i++) {
            addKringToContainer(kringenContainer, i);
        }
    } else if (desired < current) {
        while (kringenContainer.children.length > desired) {
            kringenContainer.lastChild.remove();
        }
    }
}

// ===== Add Kring to container =====
function addKringToContainer(container, num) {
    const { card, bodyId } = createCard('kring', 'Kring', `Kring ${num}`);
    const body = card.querySelector(`#${bodyId}`);

    body.innerHTML = `
        <div class="field-row cols-4">
            <div>
                <label>Nummer</label>
                <input type="number" class="kring-nummer" placeholder="bijv. 1" min="1" value="${num}">
            </div>
            <div>
                <label>Legpatroon</label>
                <select class="kring-legpatroon">
                    <option value="">-- Kies --</option>
                    <option value="7.5">7.5</option>
                    <option value="10">10</option>
                    <option value="15">15</option>
                    <option value="20">20</option>
                    <option value="25">25</option>
                    <option value="30">30</option>
                    <option value="andere">Andere</option>
                </select>
            </div>
            <div>
                <label>Lengte (m)</label>
                <input type="number" class="kring-lengte" placeholder="bijv. 80" step="any" min="0">
            </div>
            <div>
                <label>m&sup2;</label>
                <input type="number" class="kring-m2" placeholder="bijv. 25" step="any" min="0">
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

    const gebouwen = [];
    const gebouwCards = gebouwenContainer.querySelectorAll(':scope > .card.level-blok');

    gebouwCards.forEach(gebouwCard => {
        const body = gebouwCard.querySelector('.card-body');
        const gebouw = {
            naam: body.querySelector('.blok-naam').value.trim(),
            verdiepen: []
        };

        const verdiepCards = body.querySelectorAll(':scope > .children-container > .card.level-verdiep');
        verdiepCards.forEach(vCard => {
            const vBody = vCard.querySelector('.card-body');
            const verdiep = {
                nummer: formatVerdiep(vBody.querySelector('.verdiep-nummer').value),
                collectoren: []
            };

            const collectorCards = vBody.querySelectorAll(':scope > .children-container > .card.level-collector');
            collectorCards.forEach(cCard => {
                const cBody = cCard.querySelector('.card-body');
                const collector = {
                    nummer: parseInt(cBody.querySelector('.collector-nummer').value) || 0,
                    druk: parseFloat(cBody.querySelector('.collector-druk').value),
                    aantalKringen: parseInt(cBody.querySelector('.collector-aantal-kringen').value) || 0,
                    kringen: []
                };

                const kringCards = cBody.querySelectorAll(':scope > .children-container > .card.level-kring');
                kringCards.forEach(kCard => {
                    const kBody = kCard.querySelector('.card-body');
                    collector.kringen.push({
                        nummer: parseInt(kBody.querySelector('.kring-nummer').value) || 0,
                        legpatroon: kBody.querySelector('.kring-legpatroon').value,
                        lengte: parseFloat(kBody.querySelector('.kring-lengte').value) || 0,
                        m2: parseFloat(kBody.querySelector('.kring-m2').value) || 0
                    });
                });

                verdiep.collectoren.push(collector);
            });

            gebouw.verdiepen.push(verdiep);
        });

        gebouwen.push(gebouw);
    });

    return { project, gebouwen };
}

// ===== Validation =====
function validate(data) {
    if (!data.project) return 'Vul een projectnaam in.';
    if (data.gebouwen.length === 0) return 'Voeg minstens één gebouw toe.';
    for (const gebouw of data.gebouwen) {
        if (!gebouw.naam) return 'Elk gebouw moet een naam hebben.';
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
