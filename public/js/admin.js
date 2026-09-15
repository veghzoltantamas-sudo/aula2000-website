/* ============================================
   ASZTALOSPRO ADMIN — public/js/admin.js
   ============================================
   Az admin-scripts.ejs inline JavaScriptje,
   kiemelve egy külső, cache-elt fájlba.
   A szerver-oldali (EJS) értékeket a
   window.AdminConfig globális objektum hordozza
   (lásd: views/partials/admin-scripts.ejs).
   ============================================ */
'use strict';

(function () {
    const form = document.getElementById('pageBuilderForm');
    const list = document.getElementById('pageBlockList');
    const pageContentInput = document.getElementById('page_content');
    const pageIdInput = document.getElementById('page_id');
    const titleInput = document.getElementById('page_title');
    const slugInput = document.getElementById('page_slug');
    const statusInput = document.getElementById('page_status');
    const addBtn = document.getElementById('addPageBlockBtn');
    const blockTypeSelect = document.getElementById('pageBlockType');
    const resetBtn = document.getElementById('resetPageBuilder');
    if (!form || !list) return;

    function escapeHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function normalizeStatsItems(value) {
        if (Array.isArray(value)) return value;
        return String(value || '').split(/\n/).map((item) => item.trim()).filter(Boolean).map((item) => {
            const [valuePart, labelPart] = item.split('|');
            return { value: (valuePart || '').trim(), label: (labelPart || 'Érték').trim() };
        });
    }

    function createBlockHtml(type, data = {}) {
        const labelMap = {
            heading: 'Cím',
            paragraph: 'Bekezdés',
            list: 'Lista',
            quote: 'Idézet',
            image: 'Kép',
            button: 'Gomb',
            feature: 'Iroda jellemző',
            stats: 'Statisztika',
            cta: 'Premium CTA'
        };

        const inner = {
            heading: `<div class="mb-3"><label class="form-label">Szöveg</label><input type="text" data-field="text" value="${escapeHtml(data.text || '')}" placeholder="pl. Egyedi bútorok, személyre szabva"></div>`,
            paragraph: `<div class="mb-3"><label class="form-label">Szöveg</label><textarea rows="4" data-field="text" placeholder="Írd le a szöveget...">${escapeHtml(data.text || '')}</textarea></div>`,
            list: `<div class="mb-3"><label class="form-label">Lista elemek soronként</label><textarea rows="4" data-field="items" placeholder="Első elem\nMásodik elem\nHarmadik elem">${escapeHtml(Array.isArray(data.items) ? data.items.join('\n') : (data.items || ''))}</textarea></div>`,
            quote: `<div class="mb-3"><label class="form-label">Idézet</label><textarea rows="3" data-field="text" placeholder="Az idézet...">${escapeHtml(data.text || '')}</textarea></div><div class="mb-0"><label class="form-label">Szerző / forrás</label><input type="text" data-field="caption" value="${escapeHtml(data.caption || '')}" placeholder="pl. Kliensek / Műhely"></div>`,
            image: `<div class="mb-3"><label class="form-label">Kép URL</label><input type="text" data-field="url" value="${escapeHtml(data.url || '')}" placeholder="https://..."></div><div class="mb-3"><label class="form-label">Alt szöveg</label><input type="text" data-field="alt" value="${escapeHtml(data.alt || '')}" placeholder="Kép leírása"></div><div class="mb-0"><label class="form-label">Felirat</label><input type="text" data-field="caption" value="${escapeHtml(data.caption || '')}" placeholder="pl. Modern konyhai megoldás"></div>`,
            button: `<div class="mb-3"><label class="form-label">Gomb felirata</label><input type="text" data-field="text" value="${escapeHtml(data.text || '')}" placeholder="Kapcsolat"></div><div class="mb-0"><label class="form-label">Link</label><input type="text" data-field="url" value="${escapeHtml(data.url || '')}" placeholder="https://... vagy /kapcsolat"></div>`,
            feature: `<div class="mb-3"><label class="form-label">Cím</label><input type="text" data-field="title" value="${escapeHtml(data.title || '')}" placeholder="Irodánk"></div><div class="mb-0"><label class="form-label">Leírás</label><textarea rows="3" data-field="text" placeholder="Részletes leírás...">${escapeHtml(data.text || '')}</textarea></div>`,
            stats: `<div class="mb-3"><label class="form-label">Statisztika sorok (érték | címke)</label><textarea rows="4" data-field="items" placeholder="15+ év | Tapasztalat\n350+ | Elkészült projekt\n3D terv | Tervezés">${escapeHtml(Array.isArray(data.items) ? data.items.map((stat) => typeof stat === 'string' ? stat : `${stat.value || ''}|${stat.label || ''}`).join('\n') : (data.items || ''))}</textarea></div>`,
            cta: `<div class="mb-3"><label class="form-label">Cím</label><input type="text" data-field="title" value="${escapeHtml(data.title || '')}" placeholder="Premium építész iroda ajánlat"></div><div class="mb-3"><label class="form-label">Leírás</label><textarea rows="3" data-field="text" placeholder="Írja le az ajánlatot...">${escapeHtml(data.text || '')}</textarea></div><div class="mb-0"><label class="form-label">Gomb felirata</label><input type="text" data-field="buttonText" value="${escapeHtml(data.buttonText || '')}" placeholder="Ajánlatkérés"></div><div class="mt-3"><label class="form-label">Link</label><input type="text" data-field="url" value="${escapeHtml(data.url || '')}" placeholder="/#kapcsolat vagy https://..."></div>`
        };

        return `
            <div class="page-block-card" data-block-type="${type}" draggable="true">
                <div class="page-block-top">
                    <strong>${labelMap[type] || 'Blokk'}</strong>
                    <div class="page-block-actions">
                        <button type="button" class="btn btn-sm btn-outline-light move-up-btn" title="Mozgatás fel">↑</button>
                        <button type="button" class="btn btn-sm btn-outline-light move-down-btn" title="Mozgatás le">↓</button>
                        <button type="button" class="btn btn-sm btn-outline-danger remove-block-btn">Törlés</button>
                    </div>
                </div>
                ${inner[type] || ''}
            </div>
        `;
    }

    function ensureEmptyState() {
        if (list.querySelector('.page-block-empty')) return;
        const hasCards = list.querySelectorAll('.page-block-card').length > 0;
        if (!hasCards) {
            list.insertAdjacentHTML('beforeend', '<div class="page-block-empty"><i class="fa-solid fa-layer-group me-2"></i> Még nincs blokk a tartalomban. Adj hozzá egy címet, szöveget vagy CTÁ-t.</div>');
        }
    }

    function addBlock(type, preset = {}) {
        const emptyState = list.querySelector('.page-block-empty');
        if (emptyState) emptyState.remove();
        list.insertAdjacentHTML('beforeend', createBlockHtml(type, preset));
        syncContent();
    }

    function getBlocks() {
        return Array.from(list.querySelectorAll('.page-block-card')).map((card) => {
            const type = card.dataset.blockType;
            const data = {};
            card.querySelectorAll('[data-field]').forEach((field) => {
                const key = field.dataset.field;
                data[key] = field.type === 'checkbox' ? field.checked : field.value;
            });

            if (type === 'list') {
                data.items = String(data.items || '').split(/\n/).map(item => item.trim()).filter(Boolean);
            }

            if (type === 'stats') {
                data.items = normalizeStatsItems(data.items);
            }

            return { type, data };
        }).filter((block) => {
            if (!block || !block.type) return false;
            if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') {
                return String(block.data.text || '').trim().length > 0;
            }
            if (block.type === 'list') {
                return Array.isArray(block.data.items) && block.data.items.length > 0;
            }
            if (block.type === 'feature' || block.type === 'cta') {
                return String(block.data.title || block.data.text || '').trim().length > 0;
            }
            if (block.type === 'stats') {
                return Array.isArray(block.data.items) && block.data.items.length > 0;
            }
            if (block.type === 'image') {
                return String(block.data.url || '').trim().length > 0;
            }
            if (block.type === 'button') {
                return String(block.data.text || '').trim().length > 0;
            }
            return true;
        });
    }

    function syncContent() {
        pageContentInput.value = JSON.stringify({ blocks: getBlocks() });
    }

    function moveBlock(card, direction) {
        const cards = Array.from(list.querySelectorAll('.page-block-card'));
        const index = cards.indexOf(card);
        if (index === -1) return;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= cards.length) return;
        const targetCard = cards[targetIndex];
        if (direction === 'up') {
            list.insertBefore(card, targetCard);
        } else {
            list.insertBefore(targetCard, card);
        }
        syncContent();
    }

    function resetBuilder() {
        form.action = '/admin/page-create';
        pageIdInput.value = '';
        titleInput.value = '';
        slugInput.value = '';
        statusInput.value = 'draft';
        list.innerHTML = '';
        addBlock('heading', { text: 'Kiemelt cím' });
        addBlock('paragraph', { text: 'Ide írhatod az oldal fő szövegét, termékismertetőt vagy vállalási narratívát.' });
        addBlock('cta', { title: 'Prémium építész iroda ajánlat', text: 'Kérjen személyre szabott megbeszélést és ingyenes árajánlatot.', buttonText: 'Ajánlatkérés', url: '/#kapcsolat' });
        syncContent();
    }

    list.addEventListener('click', function (event) {
        const removeBtn = event.target.closest('.remove-block-btn');
        if (removeBtn) {
            removeBtn.closest('.page-block-card').remove();
            syncContent();
            return;
        }
        const moveUpBtn = event.target.closest('.move-up-btn');
        if (moveUpBtn) {
            moveBlock(moveUpBtn.closest('.page-block-card'), 'up');
            return;
        }
        const moveDownBtn = event.target.closest('.move-down-btn');
        if (moveDownBtn) {
            moveBlock(moveDownBtn.closest('.page-block-card'), 'down');
        }
    });

    list.addEventListener('dragstart', function (event) {
        const card = event.target.closest('.page-block-card');
        if (!card) return;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', card.dataset.blockType);
    });

    list.addEventListener('dragover', function (event) {
        const target = event.target.closest('.page-block-card');
        if (!target) return;
        event.preventDefault();
        list.querySelectorAll('.page-block-card').forEach((card) => card.classList.remove('drop-target'));
        target.classList.add('drop-target');
    });

    list.addEventListener('dragleave', function (event) {
        const target = event.target.closest('.page-block-card');
        if (target) target.classList.remove('drop-target');
    });

    list.addEventListener('drop', function (event) {
        const target = event.target.closest('.page-block-card');
        if (!target) return;
        event.preventDefault();
        const draggingCard = list.querySelector('.page-block-card.dragging');
        if (!draggingCard || draggingCard === target) return;
        const before = target.nextSibling && target.nextSibling === draggingCard ? target : target;
        list.insertBefore(draggingCard, before);
        list.querySelectorAll('.page-block-card').forEach((card) => card.classList.remove('drop-target'));
        draggingCard.classList.remove('dragging');
        syncContent();
    });

    list.addEventListener('dragend', function (event) {
        const card = event.target.closest('.page-block-card');
        if (card) card.classList.remove('dragging');
        list.querySelectorAll('.page-block-card').forEach((card) => card.classList.remove('drop-target'));
    });

    addBtn.addEventListener('click', function () {
        const blockType = blockTypeSelect ? blockTypeSelect.value : 'paragraph';
        addBlock(blockType, {
            text: blockType === 'paragraph' ? 'Írd le a szöveget...' : '',
            title: blockType === 'feature' ? 'Irodánk' : '',
            buttonText: blockType === 'cta' ? 'Ajánlatkérés' : '',
            url: blockType === 'button' || blockType === 'cta' ? '/#kapcsolat' : '',
            items: blockType === 'stats' ? ['15+ év|Tapasztalat', '350+|Elkészült projekt', '3D terv|Tervezés'] : ['Első elem', 'Második elem']
        });
    });

    if (addBtn && blockTypeSelect) {
        blockTypeSelect.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                addBtn.click();
            }
        });
    }

    resetBtn.addEventListener('click', resetBuilder);

    form.addEventListener('submit', function () {
        syncContent();
    });

    document.querySelectorAll('.edit-page-btn').forEach(function (button) {
        button.addEventListener('click', function () {
            form.action = '/admin/page-update/' + button.dataset.pageId;
            pageIdInput.value = button.dataset.pageId;
            titleInput.value = button.dataset.pageTitle || '';
            slugInput.value = button.dataset.pageSlug || '';
            statusInput.value = button.dataset.pageStatus || 'draft';
            list.innerHTML = '';

            const payload = button.dataset.pageContent || '[]';
            let blocks = [];
            try {
                const parsed = JSON.parse(payload);
                blocks = Array.isArray(parsed) ? parsed : (parsed.blocks || []);
            } catch (err) {
                blocks = [];
            }

            if (!blocks.length) {
                addBlock('heading', { text: 'Kiemelt cím' });
                addBlock('paragraph', { text: 'Ide írhatod a szöveget...' });
            } else {
                blocks.forEach((block) => {
                    if (block && block.type) {
                        addBlock(block.type, block.data || {});
                    }
                });
            }

            syncContent();
        });
    });

    if (list && list.querySelectorAll('.page-block-card').length === 0) {
        ensureEmptyState();
    }

    resetBuilder();
})();

(function () {
    document.querySelectorAll('[data-filter-group]').forEach(function (group) {
        const buttons = group.querySelectorAll('.filter-pill');
        const groupName = group.dataset.filterGroup;

        buttons.forEach(function (button) {
            button.addEventListener('click', function () {
                const target = button.dataset.filterTarget;
                buttons.forEach((btn) => btn.classList.toggle('active', btn === button));

                if (groupName === 'projects') {
                    document.querySelectorAll('.project-item').forEach(function (item) {
                        const isVisible = target === 'all' || item.dataset.featured === target;
                        item.style.display = isVisible ? '' : 'none';
                    });
                }

                if (groupName === 'testimonials') {
                    document.querySelectorAll('.testimonial-item').forEach(function (item) {
                        const isVisible = target === 'all' || item.dataset.status === target;
                        item.style.display = isVisible ? '' : 'none';
                    });
                }
            });
        });
    });
})();

function decodeEntities(str) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str || '';
    return textarea.value;
}

window.openServiceEditModal = function (button) {
    const modalEl = document.getElementById('editServiceModal');
    if (!modalEl || !button) return;

    const form = document.getElementById('editServiceForm');
    const idInput = document.getElementById('edit_service_id');
    const titleInput = document.getElementById('edit_service_title');
    const slugInput = document.getElementById('edit_service_slug');
    const shortDescInput = document.getElementById('edit_service_short_desc');
    const iconInput = document.getElementById('edit_service_icon');
    const descriptionInput = document.getElementById('edit_service_description');
    const sortInput = document.getElementById('edit_service_sort_order');
    const activeInput = document.getElementById('edit_service_is_active');

    if (!form || !idInput || !titleInput || !slugInput || !shortDescInput || !iconInput || !descriptionInput || !sortInput || !activeInput) return;

    const id = button.getAttribute('data-id');
    form.action = '/admin/services/update/' + id;
    idInput.value = id || '';
    titleInput.value = decodeEntities(button.getAttribute('data-title') || '');
    slugInput.value = decodeEntities(button.getAttribute('data-slug') || '');
    shortDescInput.value = decodeEntities(button.getAttribute('data-short_desc') || '');
    iconInput.value = decodeEntities(button.getAttribute('data-icon') || '');
    descriptionInput.value = decodeEntities(button.getAttribute('data-description') || '');
    sortInput.value = button.getAttribute('data-sort_order') || '0';
    activeInput.checked = String(button.getAttribute('data-is_active') || '0') === '1' || String(button.getAttribute('data-is_active') || '0') === 'true';

    if (window.bootstrap && bootstrap.Modal) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
};

document.addEventListener('click', function (event) {
    const trigger = event.target.closest('[data-service-edit]');
    if (trigger) {
        event.preventDefault();
        window.openServiceEditModal(trigger);
    }
});

window.openWorkflowEditModal = function (button) {
    const modalEl = document.getElementById('editWorkflowModal');
    const form = document.getElementById('editWorkflowForm');
    if (!modalEl || !form || !button) return;

    form.action = '/admin/workflows/update/' + button.dataset.id;
    document.getElementById('edit_workflow_title').value = decodeEntities(button.dataset.title || '');
    document.getElementById('edit_workflow_slug').value = decodeEntities(button.dataset.slug || '');
    document.getElementById('edit_workflow_short_desc').value = decodeEntities(button.dataset.short_desc || '');
    document.getElementById('edit_workflow_description').value = decodeEntities(button.dataset.description || '');
    document.getElementById('edit_workflow_icon').value = decodeEntities(button.dataset.icon || '');
    document.getElementById('edit_workflow_sort_order').value = button.dataset.sort_order || '0';
    document.getElementById('edit_workflow_is_active').checked = ['1', 'true'].includes(String(button.dataset.is_active || '0'));

    const galleryPreview = document.getElementById('editWorkflowGalleryPreview');
    if (galleryPreview) {
        galleryPreview.innerHTML = '';
        let gallery = [];
        try { gallery = JSON.parse(decodeEntities(button.dataset.gallery || '[]')); } catch { gallery = []; }
        gallery.forEach(function (image) {
            const thumb = document.createElement('img');
            thumb.src = image.startsWith('http') ? image : '/uploads/' + image;
            thumb.alt = 'Munkafolyamat galériakép';
            thumb.width = 72;
            thumb.height = 48;
            thumb.className = 'rounded border border-secondary object-fit-cover';
            galleryPreview.appendChild(thumb);
        });
    }

    if (window.bootstrap && bootstrap.Modal) bootstrap.Modal.getOrCreateInstance(modalEl).show();
};

document.addEventListener('click', function (event) {
    const trigger = event.target.closest('[data-workflow-edit]');
    if (trigger) {
        event.preventDefault();
        window.openWorkflowEditModal(trigger);
    }
});

(function () {
    const searchInput = document.getElementById('serviceAdminSearch');
    const grid = document.getElementById('serviceAdminGrid');
    const count = document.getElementById('serviceVisibleCount');
    const noResults = document.getElementById('serviceAdminNoResults');
    if (!searchInput || !grid || !count) return;

    let status = 'all';

    function refreshServices() {
        const query = searchInput.value.trim().toLowerCase();
        let visible = 0;
        grid.querySelectorAll('.service-admin-item').forEach(function (item) {
            const matchesStatus = status === 'all' || item.dataset.serviceStatus === status;
            const matchesQuery = !query || (item.dataset.serviceSearch || '').includes(query);
            const isVisible = matchesStatus && matchesQuery;
            item.hidden = !isVisible;
            if (isVisible) visible += 1;
        });
        count.textContent = visible;
        if (noResults) noResults.classList.toggle('d-none', visible > 0 || !grid.querySelector('.service-admin-item'));
    }

    searchInput.addEventListener('input', refreshServices);
    document.querySelectorAll('[data-service-status]').forEach(function (button) {
        button.addEventListener('click', function () {
            status = button.dataset.serviceStatus;
            document.querySelectorAll('[data-service-status]').forEach(function (filter) {
                if (filter.matches('button')) filter.classList.toggle('active', filter === button);
            });
            refreshServices();
        });
    });
})();

// --- BLOG SZERKESZTÉS ---
(function () {
    const editModal = document.getElementById('blogEditModal');
    if (!editModal) return;

    const editForm = document.getElementById('blogEditForm');
    const titleInput = document.getElementById('edit_blog_title');
    const slugInput = document.getElementById('edit_blog_slug');
    const categoryInput = document.getElementById('edit_blog_category');
    const coverInput = document.getElementById('edit_blog_cover');
    const excerptInput = document.getElementById('edit_blog_excerpt');
    const contentInput = document.getElementById('edit_blog_content');
    const statusInput = document.getElementById('edit_blog_status');

    editModal.addEventListener('show.bs.modal', function (event) {
        const trigger = event.relatedTarget;
        if (!trigger) return;

        const id = trigger.getAttribute('data-id');
        editForm.action = '/admin/blog-update/' + id;
        titleInput.value = decodeEntities(trigger.getAttribute('data-title') || '');
        slugInput.value = decodeEntities(trigger.getAttribute('data-slug') || '');
        categoryInput.value = decodeEntities(trigger.getAttribute('data-category') || '');
        coverInput.value = decodeEntities(trigger.getAttribute('data-cover') || '');
        excerptInput.value = decodeEntities(trigger.getAttribute('data-excerpt') || '');
        contentInput.value = decodeEntities(
            (trigger.getAttribute('data-content') || '').replace(/&#34;/g, '"')
        );
        statusInput.value = trigger.getAttribute('data-status') || 'draft';
    });
})();

// CSRF token automatikus beszúrása az összes POST formba.
// Így nincs szükség minden formba külön <input type="hidden" name="_csrf"> kézzel,
// és nem fordulhat elő, hogy egy formból kimarad a token (403-as hiba).
(function() {
    var token = document.querySelector('input[name="_csrf"]');
    token = token ? token.value : '';
    document.querySelectorAll('form').forEach(function(form) {
        if (form.querySelector('input[name="_csrf"]')) return;
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = '_csrf';
        input.value = token;
        form.appendChild(input);
    });

    // CSP-kompatibilis confirm: az inline onsubmit/onclick helyett
    // data-confirm attribútumot figyelünk (a CSP script-src-attr 'none'
    // letiltja az inline eseménykezelőket).
    document.addEventListener('submit', function(e) {
        var form = e.target.closest('form[data-confirm]');
        if (form && !window.confirm(form.getAttribute('data-confirm'))) {
            e.preventDefault();
        }
    }, true);
})();

(function() {
    // SortableJS: Galéria képek átrendezése
    document.querySelectorAll('.sortable-gallery').forEach(container => {
        const projectId = container.dataset.projectId;
        new Sortable(container, {
            animation: 150, handle: '.sortable-item img', ghostClass: 'sortable-ghost',
            onEnd: async (evt) => {
                const ids = Array.from(container.querySelectorAll('.sortable-item')).map(el => el.dataset.id);
                await fetch('/admin/api/reorder-images', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: '_csrf=' + encodeURIComponent(window.AdminConfig.csrfToken) + '&ids=' + encodeURIComponent(JSON.stringify(ids))
                });
            }
        });
    });

    // Testimonials átrendezése
    const testContainer = document.querySelector('.testimonials-sortable');
    if (testContainer) {
        new Sortable(testContainer, {
            animation: 150, handle: '.drag-handle',
            onEnd: async (evt) => {
                const ids = Array.from(testContainer.querySelectorAll('[data-id]')).map(el => el.dataset.id);
                await fetch('/admin/api/reorder-testimonials', {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: '_csrf=' + encodeURIComponent(window.AdminConfig.csrfToken) + '&ids=' + encodeURIComponent(JSON.stringify(ids))
                });
            }
        });
    }

    // Partnerek átrendezése
    const partnerContainer = document.querySelector('.partners-sortable');
    if (partnerContainer) {
        new Sortable(partnerContainer, {
            animation: 150, handle: '.drag-handle',
            onEnd: async (evt) => {
                const ids = Array.from(partnerContainer.querySelectorAll('[data-id]')).map(el => el.dataset.id);
                await fetch('/admin/api/reorder-partners', {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: '_csrf=' + encodeURIComponent(window.AdminConfig.csrfToken) + '&ids=' + encodeURIComponent(JSON.stringify(ids))
                });
            }
        });
    }

    // Alt szöveg mentése (blur-on)
    document.addEventListener('blur', async (e) => {
        if (e.target.matches('.alt-text-input')) {
            const id = e.target.dataset.id;
            const alt = e.target.value;
            await fetch('/admin/api/alt-text/' + id, {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: '_csrf=' + encodeURIComponent(window.AdminConfig.csrfToken) + '&alt_text=' + encodeURIComponent(alt)
            }).catch(e => console.error('Alt save hiba:', e));
        }
    }, true);

    // EasyMDE: Blog szerkesztők
    if (typeof EasyMDE !== 'undefined') {
        if (document.getElementById('blog_new_content')) {
            new EasyMDE({ element: document.getElementById('blog_new_content'), spellChecker: false,
                autosave: { enabled: true, delay: 10000 },
                toolbar: ['bold', 'italic', 'heading', '|', 'quote', 'code', '|', 'unordered-list', 'ordered-list', '|', 'link', 'image', '|', 'preview', 'side-by-side', 'fullscreen', '|', 'guide'] });
        }
        if (document.getElementById('edit_blog_content')) {
            new EasyMDE({ element: document.getElementById('edit_blog_content'), spellChecker: false,
                autosave: { enabled: true, delay: 10000 },
                toolbar: ['bold', 'italic', 'heading', '|', 'quote', 'code', '|', 'unordered-list', 'ordered-list', '|', 'link', 'image', '|', 'preview', 'side-by-side', 'fullscreen', '|', 'guide'] });
        }
    }

    // PageSpeed Widget
    async function loadPageSpeed() {
        const widget = document.getElementById('pageSpeedWidget');
        const btn = document.getElementById('psBtn');
        if (!widget) return;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Mérés...'; }
        widget.innerHTML = '<div class="text-muted small">Mérés folyamatban...</div>';
        try {
            const res = await fetch('/admin/api/pagespeed?url=/');
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            widget.innerHTML = `
                <div class="row text-center g-2">
                    <div class="col-4"><div class="fw-bold text-warning" style="font-size:1.5rem">${data.performance}</div><div class="small text-muted">Teljesítmény</div></div>
                    <div class="col-4"><div class="fw-bold text-success" style="font-size:1.5rem">${data.accessibility}</div><div class="small text-muted">Akadálymentes</div></div>
                    <div class="col-4"><div class="fw-bold text-info" style="font-size:1.5rem">${data.seo}</div><div class="small text-muted">SEO</div></div>
                </div>
                <hr class="border-secondary my-2">
                <div class="row text-center g-2 small">
                    <div class="col-6"><strong>FCP:</strong> ${data.fcp || '—'}</div>
                    <div class="col-6"><strong>LCP:</strong> ${data.lcp || '—'}</div>
                    <div class="col-6"><strong>TBT:</strong> ${data.tbt || '—'}</div>
                    <div class="col-6"><strong>CLS:</strong> ${data.cls || '—'}</div>
                </div>
            `;
        } catch(e) { widget.innerHTML = '<div class="text-danger small">Hiba: ' + e.message + '</div>'; }
        finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate me-1"></i> Újramérés'; } }
    }

    // Újramérés gomb — inline onclick helyett CSP-biztos listener
    var psBtn = document.getElementById('psBtn');
    if (psBtn) psBtn.addEventListener('click', loadPageSpeed);

    if (document.getElementById('pageSpeedWidget')) loadPageSpeed();

    // Analytics Chart.js
    async function loadAnalyticsChart() {
        const ctx = document.getElementById('analyticsChart');
        if (!ctx) return;
        try {
            const res = await fetch('/admin/api/analytics-data?days=30');
            const data = await res.json();
            // Vízszintes (horizontális) oszlopdiagram a leglátogatottabb oldalakról
            const topPaths = (data.topPaths || []).slice(0, 10);
            const labels = topPaths.map(p => p[0]);
            const values = topPaths.map(p => p[1]);
            // Ha nincs adat, mutassunk üres állapotot
            if (!labels.length) {
                ctx.parentElement.innerHTML = '<div class="text-muted small">Még nincs látogatási adat.</div>';
                return;
            }
            new Chart(ctx, {
                type: 'bar',
                data: { labels, datasets: [{ label: 'Látogatások', data: values, backgroundColor: 'rgba(213,171,93,0.85)', borderColor: '#d5ab5d', borderWidth: 1, borderRadius: 4 }] },
                options: {
                    indexAxis: 'y', // ← VÍZSZINTES (horizontális) oszlopdiagram
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (t) => ' ' + t.parsed.x + ' látogatás' } } },
                    scales: {
                        x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Látogatások', color: '#aaa', font: { size: 11 } } },
                        y: { grid: { display: false }, ticks: { font: { size: 11 }, callback: (v) => { const s = labels[v] || ''; return s.length > 22 ? s.slice(0, 22) + '…' : s; } } }
                    }
                }
            });
        } catch(e) { console.error('Analytics chart hiba:', e); }
    }
    if (document.getElementById('analyticsChart')) loadAnalyticsChart();

    // Push Broadcast
    const pushForm = document.getElementById('pushBroadcastForm');
    if (pushForm) {
        pushForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('pushBtn');
            const result = document.getElementById('pushResult');
            const formData = new FormData(pushForm);
            if (!formData.has('_csrf') && window.AdminConfig && window.AdminConfig.csrfToken) {
                formData.append('_csrf', window.AdminConfig.csrfToken);
            }
            btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Küldés...';
            result.textContent = '';
            try {
                const res = await fetch('/admin/api/push-broadcast', {
                    method: 'POST',
                    headers: { 'Accept': 'application/json' },
                    body: new URLSearchParams(formData)
                });
                const data = await res.json();
                if (data.ok) { result.textContent = `✅ Elküldve: ${data.sent} előfizetőnek (${data.failed} hiba)`; result.className = 'ms-3 text-success small'; }
                else { result.textContent = '❌ Hiba: ' + (data.error || 'Ismeretlen'); result.className = 'ms-3 text-danger small'; }
            } catch(e) { result.textContent = '❌ Hálózati hiba: ' + (e.message || ''); result.className = 'ms-3 text-danger small'; }
            finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i> Küldés'; }
        });
    }
})();

// --- GLOBÁLIS ADMIN KERESÉS ---
(function() {
    var input = document.getElementById('adminGlobalSearch');
    var results = document.getElementById('adminSearchResults');
    if (!input || !results) return;
    var timer = null;
    var searchUrl = '/admin/api/search?q=';

    function renderGroup(title, items, urlPrefix) {
        if (!items || !items.length) return '';
        var html = '<div class="search-group-title">' + title + '</div>';
        items.forEach(function(item) {
            var label = item.title || item.name || item.author || item.email || '—';
            var sub = '';
            if (item.category) sub = ' <span class="badge bg-secondary">' + item.category + '</span>';
            if (item.email) sub = ' <span class="text-muted">' + item.email + '</span>';
            if (item.status) sub += ' <span class="badge bg-info">' + item.status + '</span>';
            html += '<a class="search-item" href="' + urlPrefix + item.id + '">' + label + sub + '</a>';
        });
        return html;
    }

    input.addEventListener('input', function() {
        clearTimeout(timer);
        var q = input.value.trim();
        if (q.length < 2) { results.innerHTML = ''; results.classList.add('d-none'); return; }
        timer = setTimeout(function() {
            fetch(searchUrl + encodeURIComponent(q))
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    var html = '';
                    html += renderGroup('Projektek', data.projects, '/admin?tab=projects&highlight=');
                    html += renderGroup('Blog', data.blog, '/admin?tab=blog&highlight=');
                    html += renderGroup('Üzenetek', data.messages, '/admin?tab=messages&highlight=');
                    html += renderGroup('Oldalak', data.pages, '/admin?tab=pages&highlight=');
                    html += renderGroup('Vélemények', data.testimonials, '/admin?tab=testimonials&highlight=');
                    html += renderGroup('Partnerek', data.partners, '/admin?tab=partners&highlight=');
                    if (!html) { results.innerHTML = '<div class="search-item text-muted">Nincs találat</div>'; }
                    results.innerHTML = html;
                    results.classList.remove('d-none');
                });
        }, 250);
    });

    input.addEventListener('blur', function() {
        setTimeout(function() { results.classList.add('d-none'); }, 200);
    });
    input.addEventListener('focus', function() {
        if (results.innerHTML.trim()) results.classList.remove('d-none');
    });
})();

// --- MANUÁLIS ADATBÁZIS BACKUP GOMB ---
(function() {
    var btn = document.getElementById('manualBackupBtn');
    var status = document.getElementById('backupStatus');
    if (!btn) return;
    btn.addEventListener('click', function() {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Mentés...';
        status.textContent = '';
        var csrf = document.querySelector('input[name="_csrf"]');
        csrf = csrf ? csrf.value : '';
        fetch('/admin/api/db-backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: '_csrf=' + encodeURIComponent(csrf)
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.ok) {
                status.textContent = '✅ Mentve: ' + data.filename;
                status.className = 'align-self-center text-success small ms-2';
            } else {
                status.textContent = '❌ Hiba: ' + (data.error || 'Ismeretlen');
                status.className = 'align-self-center text-danger small ms-2';
            }
        })
        .catch(function(e) {
            status.textContent = '❌ Hálózati hiba';
            status.className = 'align-self-center text-danger small ms-2';
        })
        .finally(function() {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rotate me-1"></i> Manuális backup most';
        });
    });
})();

// --- BLOG KÉPFELTÖLTÉS (borító URL mező mellé gomb) ---
(function() {
    document.querySelectorAll('.blog-cover-upload').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var input = btn.closest('.input-group') ? btn.closest('.input-group').querySelector('input[name="cover"]') : null;
            if (!input) return;
            var fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
            fileInput.addEventListener('change', function() {
                if (!fileInput.files.length) return;
                var formData = new FormData();
                var csrf = document.querySelector('input[name="_csrf"]');
                formData.append('cover', fileInput.files[0]);
                formData.append('_csrf', csrf ? csrf.value : '');
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                fetch('/admin/blog-cover-upload', { method: 'POST', body: formData })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data.url) { input.value = data.url; }
                        else { alert('Hiba: ' + (data.error || 'Ismeretlen')); }
                    })
                    .catch(function() { alert('Hálózati hiba a feltöltés közben.'); })
                    .finally(function() {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i>';
                        document.body.removeChild(fileInput);
                    });
            });
            fileInput.click();
        });
    });
})();

// --- BLOG TARTALOMKÉP FELTÖLTÉS (EasyMDE-be illesztés) ---
(function() {
    document.querySelectorAll('.blog-image-upload-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var textarea = btn.closest('.modal, .tab-pane') ? btn.closest('.modal, .tab-pane').querySelector('textarea') : null;
            var fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
            fileInput.multiple = true;
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
            fileInput.addEventListener('change', function() {
                if (!fileInput.files.length) return;
                var csrf = document.querySelector('input[name="_csrf"]');
                Array.from(fileInput.files).forEach(function(file) {
                    var formData = new FormData();
                    formData.append('image', file);
                    formData.append('_csrf', csrf ? csrf.value : '');
                    fetch('/admin/blog-upload-image', { method: 'POST', body: formData })
                        .then(function(r) { return r.json(); })
                        .then(function(data) {
                            if (data.url && textarea) {
                                textarea.value += '\n![Kép](' + data.url + ')\n';
                            }
                        })
                        .catch(function() { alert('Hálózati hiba a kép feltöltésekor.'); });
                });
                setTimeout(function() { document.body.removeChild(fileInput); }, 100);
            });
            fileInput.click();
        });
    });
})();

// ============================================================
// Scroll position megőrzés — visszalépéskor onnan folytatod
// ahol álltál (tartalom per-tab + sidebar globális)
// ============================================================
(function() {
    var CONTENT_KEY = 'admin-scroll-positions';
    var SIDEBAR_KEY = 'admin-sidebar-scroll';
    var SCROLL_DEBOUNCE_MS = 350;
    var _contentTimer = null;
    var _sidebarTimer = null;

    function currentTab() {
        try { return new URL(window.location.href).searchParams.get('tab') || 'content'; }
        catch (e) { return 'content'; }
    }

    function loadMap() {
        try { return JSON.parse(localStorage.getItem(CONTENT_KEY) || '{}'); } catch (e) { return {}; }
    }

    function saveMap(map) {
        try { localStorage.setItem(CONTENT_KEY, JSON.stringify(map)); } catch (e) {}
    }

    function saveContentNow() {
        var shell = document.querySelector('.content-shell');
        if (!shell) return;
        var map = loadMap();
        map[currentTab()] = shell.scrollTop;
        saveMap(map);
    }

    function saveSidebarNow() {
        var sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        try { localStorage.setItem(SIDEBAR_KEY, String(sidebar.scrollTop)); } catch (e) {}
    }

    function saveBoth() {
        saveContentNow();
        saveSidebarNow();
    }

    function queueSaveContent() {
        clearTimeout(_contentTimer);
        _contentTimer = setTimeout(saveContentNow, SCROLL_DEBOUNCE_MS);
    }

    function queueSaveSidebar() {
        clearTimeout(_sidebarTimer);
        _sidebarTimer = setTimeout(saveSidebarNow, SCROLL_DEBOUNCE_MS);
    }

    // Visszaállítás — azonnal, ne csak load-ra
    // Azonnali visszaállítás: load, pageshow (bfcache), és azonnali próbálkozás is.
    function restoreScroll() {
        var pos = loadMap()[currentTab()];
        var shell = document.querySelector('.content-shell');
        if (typeof pos === 'number' && pos > 0 && shell) {
            shell.style.scrollBehavior = 'auto';
            shell.scrollTop = pos;
        }
        var sidebarPos = parseInt(localStorage.getItem(SIDEBAR_KEY) || '0', 10);
        var sidebar = document.querySelector('.sidebar');
        if (sidebar && sidebarPos > 0) {
            sidebar.style.scrollBehavior = 'auto';
            sidebar.scrollTop = sidebarPos;
        }
    }
    // Próbáljuk azonnal (amikor ez a script fut), és load/pageshow-kor is
    try { restoreScroll(); } catch (e) {}
    window.addEventListener('load', restoreScroll);
    window.addEventListener('pageshow', restoreScroll);

    // Folyamatos mentés görgetés közben (debounced) — mindkét panel külön
    // Közvetlenül kötjük, nem várunk DOMContentLoaded-ra
    (function bindScrollListeners() {
        function bind() {
            var shell = document.querySelector('.content-shell');
            if (shell && !shell._scrollBound) {
                shell._scrollBound = true;
                shell.addEventListener('scroll', queueSaveContent, { passive: true });
                shell.addEventListener('wheel', queueSaveContent, { passive: true });
                shell.addEventListener('touchmove', queueSaveContent, { passive: true });
            }
            var sidebar = document.querySelector('.sidebar');
            if (sidebar && !sidebar._scrollBound) {
                sidebar._scrollBound = true;
                sidebar.addEventListener('scroll', queueSaveSidebar, { passive: true });
                sidebar.addEventListener('wheel', queueSaveSidebar, { passive: true });
                sidebar.addEventListener('touchmove', queueSaveSidebar, { passive: true });
            }
        }
        bind();
        if (!document.querySelector('.content-shell') || !document.querySelector('.sidebar')) {
            document.addEventListener('DOMContentLoaded', bind);
        }
    })();

    // Kattintáskor is mentsünk (tab váltás előtt)
    document.querySelectorAll('.sidebar a[href^="?tab="]').forEach(function(a) {
        a.addEventListener('click', saveBoth);
    });

    // Form elküldés előtt is
    document.addEventListener('submit', saveBoth, true);

    // Ablak elhagyása előtt utolsó mentés
    window.addEventListener('pagehide', saveBoth);
    window.addEventListener('beforeunload', saveBoth);
})();

/* ── Szöveg → HTML + eszköztár + élő előnézet + JSON segéd (e-mail / hírlevél / schema) ── */
(function () {
    'use strict';

    // — Sima szöveg → HTML —
    function textToHtml(text) {
        // Tisztítás: Windows sortörés → \n, trim
        text = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (!text) return '';
        // Ha már HTML-t tartalmaz (<tag>), nem konvertálunk — a felhasználó már HTML-ben írta.
        if (/<\s*\/?\s*(p|h[1-6]|ul|ol|li|a|div|br|hr|blockquote|strong|em|img|table)[^>]*>/i.test(text)) return text;

        // Escape, de a már létező *|...|* változókat ne
        function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

        // URL auto-link
        function linkify(s) { return s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer noopener">$1</a>'); }

        // Blokkok: 2+ sortörés = bekezdéshatár
        var blocks = text.split(/\n{2,}/);
        var out = [];
        blocks.forEach(function (block) {
            block = block.trim();
            if (!block) return;
            // Felsorolás felismerése: "- ", "• ", "1. " kezdésű sorok
            var lines = block.split('\n');
            var isList = lines.every(function (l) { return /^\s*(?:[-•*]|\d+\.)\s+/.test(l); }) && lines.length > 1;
            var isOrdered = isList && lines.every(function (l) { return /^\s*\d+\./.test(l); });
            if (isList) {
                var tag = isOrdered ? 'ol' : 'ul';
                var items = lines.map(function (l) { return '<li>' + linkify(esc(l.replace(/^\s*(?:[-•*]|\d+\.)\s+/, ''))) + '</li>'; }).join('');
                out.push('<' + tag + '>' + items + '</' + tag + '>');
            } else if (/^\s*>/.test(block)) {
                out.push('<blockquote>' + linkify(esc(block.replace(/^\s*>\s?/gm, ''))) + '</blockquote>');
            } else if (block.length < 90 && !block.includes('.') && !block.includes(',')) {
                // Rövid, pont nélküli blokk → cím
                out.push('<h3>' + linkify(esc(block)) + '</h3>');
            } else {
                // Egy blokkon belüli sortörés → <br>
                var inner = linkify(esc(block).replace(/\n/g, '<br>'));
                out.push('<p>' + inner + '</p>');
            }
        });
        return out.join('\n');
    }

    // — Kijelölés köré tag —
    function wrapSelection(ta, before, after, placeholder) {
        var start = ta.selectionStart, end = ta.selectionEnd;
        var sel = ta.value.substring(start, end);
        var text = sel || (placeholder || '');
        var next = ta.value.substring(0, start) + before + text + after + ta.value.substring(end);
        ta.value = next;
        ta.focus();
        if (!sel && placeholder) {
            ta.setSelectionRange(start + before.length, start + before.length + placeholder.length);
        } else {
            ta.setSelectionRange(start + before.length, start + before.length + text.length);
        }
        ta.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // — Eszköztár akciók —
    function toolbarAction(action, ta) {
        switch (action) {
            case 'bold':   wrapSelection(ta, '<strong>', '</strong>', 'félkövér szöveg'); break;
            case 'italic': wrapSelection(ta, '<em>', '</em>', 'dőlt szöveg'); break;
            case 'h2':     wrapSelection(ta, '<h2>', '</h2>', 'Cím'); break;
            case 'p':      wrapSelection(ta, '<p>', '</p>', 'Bekezdés szövege'); break;
            case 'ul':     wrapSelection(ta, '<ul>\n  <li>', '</li>\n</ul>', 'lista elem'); break;
            case 'quote':  wrapSelection(ta, '<blockquote>', '</blockquote>', 'Idézet'); break;
            case 'hr': {
                var s = ta.selectionStart;
                ta.value = ta.value.slice(0, s) + '\n<hr>\n' + ta.value.slice(s);
                ta.focus(); ta.setSelectionRange(s + 6, s + 6);
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                break;
            }
            case 'link': {
                var url = prompt('Link URL:', 'https://');
                if (url === null) return;
                url = url.trim() || '#';
                wrapSelection(ta, '<a href="' + url.replace(/"/g, '&quot;') + '">', '</a>', 'link szövege');
                break;
            }
            case 'img': {
                var src = prompt('Kép URL:', 'https://');
                if (src === null) return;
                src = src.trim(); if (!src) return;
                var alt = prompt('Alt szöveg (SEO):', '') || '';
                var tag = '<img src="' + src.replace(/"/g,'&quot;') + '" alt="' + alt.replace(/"/g,'&quot;') + '">';
                var s2 = ta.selectionStart;
                ta.value = ta.value.slice(0, s2) + tag + ta.value.slice(s2);
                ta.focus(); ta.setSelectionRange(s2 + tag.length, s2 + tag.length);
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                break;
            }
            case 'convert': {
                if (/<\s*\/?\s*(p|h[1-6]|ul|ol|li|a|div|br|hr|blockquote)[^>]*>/i.test(ta.value)) {
                    if (!confirm('A mező már tartalmaz HTML-t. Biztosan felülírja a teljes tartalmat?')) return;
                }
                ta.value = textToHtml(ta.value);
                ta.focus();
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                break;
            }
            case 'json-format': {
                try {
                    var obj = JSON.parse(ta.value);
                    ta.value = JSON.stringify(obj, null, 2);
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                    jsonStatus(ta, 'Formázva ✓', 'ok');
                } catch (e) { jsonStatus(ta, 'Hiba: ' + e.message, 'err'); }
                break;
            }
            case 'json-validate': {
                try { JSON.parse(ta.value); jsonStatus(ta, 'Érvényes JSON ✓', 'ok'); }
                catch (e) { jsonStatus(ta, 'Hiba: ' + e.message, 'err'); }
                break;
            }
            case 'json-tmpl-local': {
                ta.value = JSON.stringify({ "@context": "https://schema.org", "@type": "HomeAndConstructionBusiness", "name": "Aula 2000 Építész Iroda", "description": "Prémium építész iroda", "url": "https://www.aula2000.hu", "telephone": "+36 30 555 0000", "address": { "@type": "PostalAddress", "streetAddress": "Tisza Lajos krt. 45.", "addressLocality": "Budapest", "postalCode": "1011", "addressCountry": "HU" } }, null, 2);
                ta.dispatchEvent(new Event('input', { bubbles: true })); jsonStatus(ta, 'Sablon beillesztve', 'ok'); break;
            }
            case 'json-tmpl-faq': {
                ta.value = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": "Milyen szolgáltatásokat nyújt az Aula 2000?", "acceptedAnswer": { "@type": "Answer", "text": "Generál tervezés, beruházás bonyolítás, 3D látványtervezés és energetikai tanúsítás." } }] }, null, 2);
                ta.dispatchEvent(new Event('input', { bubbles: true })); jsonStatus(ta, 'Sablon beillesztve', 'ok'); break;
            }
            case 'json-tmpl-breadcrumb': {
                ta.value = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Főoldal", "item": "https://www.aula2000.hu/" }, { "@type": "ListItem", "position": 2, "name": "Szolgáltatások", "item": "https://www.aula2000.hu/#szolgaltatasok" }] }, null, 2);
                ta.dispatchEvent(new Event('input', { bubbles: true })); jsonStatus(ta, 'Sablon beillesztve', 'ok'); break;
            }
        }
    }

    function jsonStatus(ta, msg, cls) {
        var id = ta.id.startsWith('schema-add') ? 'schema-add-status' : 'schema-status-' + ta.id.replace('schema-json-', '');
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = msg; el.className = 'json-status ' + cls;
        setTimeout(function () { if (el.textContent === msg) { el.textContent = ''; el.className = 'json-status'; } }, 3500);
    }

    // — Delegált kattintás az eszköztáron —
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.html-toolbar [data-action]');
        if (!btn) return;
        var toolbar = btn.closest('.html-toolbar');
        var taId = toolbar.getAttribute('data-for');
        var ta = document.getElementById(taId);
        if (!ta) return;
        toolbarAction(btn.getAttribute('data-action'), ta);
    });

    // — Előnézet toggle + élő frissítés —
    function updatePreview(id) {
        var box = document.getElementById('preview-' + id);
        var ta = document.getElementById(id);
        if (!box || !ta || box.classList.contains('d-none')) return;
        var html = String(ta.value || '').trim();
        if (!html) { box.innerHTML = ''; return; }
        // Biztonság: script/style/iframe eltávolítása az előnézetből
        html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
        box.innerHTML = html;
    }

    document.addEventListener('click', function (e) {
        var tog = e.target.closest('.html-preview-toggle');
        if (!tog) return;
        var id = tog.getAttribute('data-target');
        var box = document.getElementById('preview-' + id);
        if (!box) return;
        var show = box.classList.contains('d-none');
        if (show) { box.classList.remove('d-none'); tog.innerHTML = '<i class="fa-solid fa-eye-slash me-1"></i> Elrejtés'; updatePreview(id); }
        else { box.classList.add('d-none'); tog.innerHTML = '<i class="fa-solid fa-eye me-1"></i> Előnézet'; }
    });

    // Élő előnézet frissítés gépeléskor (debounced)
    var previewTimer = null;
    document.addEventListener('input', function (e) {
        if (!e.target.classList.contains('html-source')) return;
        clearTimeout(previewTimer);
        previewTimer = setTimeout(function () { updatePreview(e.target.id); }, 250);
    });

    document.addEventListener('click', function (e) {
        var button = e.target.closest('.reply-email-btn');
        if (!button) return;
        var name = button.getAttribute('data-name') || '';
        var email = button.getAttribute('data-email') || '';
        var message = button.getAttribute('data-message') || '';
        var to = document.getElementById('replyEmailTo');
        var subject = document.getElementById('replyEmailSubject');
        var body = document.getElementById('replyEmailBody');
        if (!to || !subject || !body) return;
        to.value = email;
        subject.value = 'Válasz az Aula 2000 megkeresésére';
        body.value = '<p>Kedves *|NAME|*!</p><p>Köszönjük megkeresését.</p><p><strong>Az Ön üzenete:</strong><br>*|MESSAGE|*</p><p>Üdvözlettel,<br>Aula 2000</p>'.replace('*|NAME|*', name).replace('*|MESSAGE|*', message);
    });

    var replyTemplate = document.getElementById('replyEmailTemplate');
    if (replyTemplate) replyTemplate.addEventListener('change', function () {
        var option = replyTemplate.options[replyTemplate.selectedIndex];
        var subject = document.getElementById('replyEmailSubject');
        var body = document.getElementById('replyEmailBody');
        if (option.value && subject && body) { subject.value = option.dataset.subject || ''; body.value = option.dataset.body || ''; }
    });
})();
