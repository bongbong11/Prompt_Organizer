import { oai_settings, promptManager } from '../../../openai.js';

export default 'Prompt Organizer';

const KEY = 'promptOrganizer';
const MODAL_ID = 'prompt-organizer-modal';
const BUTTON_ID = 'prompt-organizer-management-button';
const WAND_ID = 'prompt-organizer-wand-item';
const DIVIDER_CLASS = 'po-divider';
const HIDDEN_CLASS = 'po-group-hidden';
const SETTINGS_VERSION = 6;

const defaults = { version: SETTINGS_VERSION, groupsByPreset: {} };

let activeTab = 'create';
let promptObserver = null;
let observedPromptList = null;
let renderTimer = null;
let saveStateTimer = null;
let rendering = false;

const context = () => SillyTavern.getContext();

function store() {
    const c = context();
    c.extensionSettings[KEY] ??= structuredClone(defaults);
    c.extensionSettings[KEY].groupsByPreset ??= {};
    return c.extensionSettings[KEY];
}

function save(showState = true) {
    context().saveSettingsDebounced();
    if (!showState) return;
    const el = document.querySelector(`#${MODAL_ID} .po-save-state`);
    if (!el) return;
    el.textContent = '저장됨';
    el.classList.add('po-saved');
    clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(() => {
        el.textContent = '자동 저장';
        el.classList.remove('po-saved');
    }, 900);
}

function migrateSettings() {
    const data = store();
    let changed = data.version !== SETTINGS_VERSION;
    data.version = SETTINGS_VERSION;
    for (const list of Object.values(data.groupsByPreset)) {
        if (!Array.isArray(list)) continue;
        for (const group of list) {
            if ('merge' in group) { delete group.merge; changed = true; }
            if ('role' in group) { delete group.role; changed = true; }
        }
    }
    if (changed) save(false);
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
}

function makeId() {
    return `po_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function currentPresetName() {
    return String(oai_settings?.preset_settings_openai || 'Default');
}

function currentGroups() {
    const all = store().groupsByPreset;
    const preset = currentPresetName();
    all[preset] ??= [];
    return all[preset];
}

function currentPromptEntries() {
    if (!promptManager || typeof promptManager.getPromptOrderForCharacter !== 'function' || typeof promptManager.getPromptById !== 'function') {
        return [];
    }
    try {
        const order = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter);
        if (!Array.isArray(order)) return [];
        return order.flatMap((entry, index) => {
            if (!entry?.identifier) return [];
            const prompt = promptManager.getPromptById(entry.identifier);
            if (!prompt || prompt.marker || prompt.extension) return [];
            return [{
                id: String(entry.identifier),
                name: String(prompt.name || entry.identifier),
                enabled: entry.enabled !== false,
                index,
            }];
        });
    } catch (error) {
        console.warn('[Prompt Organizer] Prompt Manager read failed:', error);
        return [];
    }
}

function promptDomItems() {
    const list = document.querySelector('#completion_prompt_manager_list');
    if (!list) return [];
    return [...list.querySelectorAll('.completion_prompt_manager_prompt[data-pm-identifier]')].map(el => ({
        id: String(el.dataset.pmIdentifier),
        name: el.querySelector('.completion_prompt_manager_prompt_name, .prompt_manager_prompt_name')?.textContent?.trim() || String(el.dataset.pmIdentifier),
        el,
    }));
}

function availablePrompts() {
    const entries = currentPromptEntries();
    return entries.length ? entries : promptDomItems().map(({ id, name }) => ({ id, name }));
}

function promptName(id) {
    return availablePrompts().find(prompt => prompt.id === id)?.name || id || '없음';
}

function clearDecorations() {
    document.querySelectorAll(`.${DIVIDER_CLASS}`).forEach(el => el.remove());
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach(el => el.classList.remove(HIDDEN_CLASS));
}

function schedulePromptRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderPromptManager, 25);
}

function renderPromptManager() {
    const list = document.querySelector('#completion_prompt_manager_list');
    if (!list || rendering) return;

    rendering = true;
    promptObserver?.disconnect();
    clearDecorations();

    const map = new Map(promptDomItems().map(item => [item.id, item.el]));
    for (const group of currentGroups()) {
        const anchor = map.get(group.anchor);
        if (!anchor) continue;

        const divider = document.createElement('div');
        divider.className = `${DIVIDER_CLASS}${group.collapsible ? ' po-collapsible' : ''}`;
        divider.dataset.poGroup = group.id;
        divider.innerHTML = `${group.collapsible
            ? `<button type="button" class="po-fold" aria-label="접기/펼치기"><i class="fa-solid fa-chevron-${group.collapsed ? 'right' : 'down'}"></i></button>`
            : '<span class="po-fold-spacer"></span>'}
            <span class="po-divider-title">${escapeHtml(group.name || '구분선')}</span>
            <span class="po-divider-line"></span>`;

        group.position === 'after' ? anchor.after(divider) : anchor.before(divider);
        if (group.collapsible && group.collapsed) {
            for (const id of group.members || []) map.get(id)?.classList.add(HIDDEN_CLASS);
        }
        divider.querySelector('.po-fold')?.addEventListener('click', event => {
            event.stopPropagation();
            group.collapsed = !group.collapsed;
            save();
            schedulePromptRender();
        });
    }

    rendering = false;
    attachPromptObserver();
}

function attachPromptObserver() {
    const list = document.querySelector('#completion_prompt_manager_list');
    if (!list) return;
    if (observedPromptList !== list || !promptObserver) {
        promptObserver?.disconnect();
        observedPromptList = list;
        promptObserver = new MutationObserver(() => {
            if (!rendering) schedulePromptRender();
        });
    }
    promptObserver.observe(list, { childList: true, subtree: true });
}

function ensureLaunchers() {
    document.getElementById('prompt-organizer-toolbar-button')?.remove();

    const presetBlock = document.querySelector('#openai_api-presets');
    const presetSelect = presetBlock?.querySelector('#settings_preset_openai');
    const controls = presetSelect?.nextElementSibling;
    const anchor = controls?.querySelector('#new_oai_preset') || controls?.lastElementChild;
    const existing = document.getElementById(BUTTON_ID);

    if (anchor && (!existing || existing.previousElementSibling !== anchor)) {
        existing?.remove();
        const button = document.createElement('div');
        button.id = BUTTON_ID;
        button.className = 'menu_button menu_button_icon po-management-launcher';
        button.title = '프롬프트 정리';
        button.setAttribute('aria-label', '프롬프트 정리');
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        button.innerHTML = '<i class="fa-fw fa-solid fa-layer-group"></i>';
        button.addEventListener('click', openManager);
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openManager();
            }
        });
        anchor.after(button);
    }

    const menu = document.getElementById('extensionsMenu');
    if (menu && !document.getElementById(WAND_ID)) {
        const item = document.createElement('div');
        item.id = WAND_ID;
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = '<i class="fa-solid fa-layer-group fa-fw"></i><span>프롬프트 정리</span>';
        item.addEventListener('click', openManager);
        menu.append(item);
    }
}

function setViewportMetrics() {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--po-viewport-height', `${viewport?.height || window.innerHeight}px`);
    document.documentElement.style.setProperty('--po-viewport-width', `${viewport?.width || window.innerWidth}px`);
    document.documentElement.style.setProperty('--po-viewport-top', `${viewport?.offsetTop || 0}px`);
    document.documentElement.style.setProperty('--po-viewport-left', `${viewport?.offsetLeft || 0}px`);
}

function closeManager() {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove('po-modal-open');
}

function openManager() {
    closeManager();
    setViewportMetrics();

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'po-modal-overlay';
    overlay.innerHTML = `
        <section class="po-modal" role="dialog" aria-modal="true" aria-label="프롬프트 정리">
            <header class="po-modal-header">
                <div>
                    <div class="po-title-row"><div class="po-modal-title">프롬프트 정리</div><span class="po-save-state">자동 저장</span></div>
                    <div class="po-preset-line">현재 프리셋 · <strong>${escapeHtml(currentPresetName())}</strong></div>
                </div>
                <button type="button" class="po-icon-button po-close" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
            </header>
            <nav class="po-tabs">
                <button type="button" class="po-tab" data-tab="create"><i class="fa-solid fa-plus"></i> 새 구분선</button>
                <button type="button" class="po-tab" data-tab="saved"><i class="fa-solid fa-folder-open"></i> 저장된 구분선 <span class="po-tab-count">0</span></button>
            </nav>
            <div class="po-modal-body"><div class="po-tab-content"></div></div>
        </section>`;

    document.body.append(overlay);
    document.body.classList.add('po-modal-open');
    overlay.querySelector('.po-close').addEventListener('click', closeManager);
    overlay.querySelectorAll('.po-tab').forEach(button => button.addEventListener('click', () => {
        activeTab = button.dataset.tab;
        renderActiveTab();
    }));
    renderActiveTab();
}

function renderActiveTab() {
    const overlay = document.getElementById(MODAL_ID);
    const content = overlay?.querySelector('.po-tab-content');
    if (!content) return;

    overlay.querySelectorAll('.po-tab').forEach(button => {
        const active = button.dataset.tab === activeTab;
        button.classList.toggle('po-active', active);
        button.setAttribute('aria-selected', String(active));
    });
    const count = overlay.querySelector('.po-tab-count');
    if (count) count.textContent = String(currentGroups().length);
    activeTab === 'saved' ? renderSavedTab(content) : renderCreateTab(content);
}

function promptOptions(selectedId = '') {
    return availablePrompts().map(prompt => `<option value="${escapeHtml(prompt.id)}" ${prompt.id === selectedId ? 'selected' : ''}>${escapeHtml(prompt.name)}</option>`).join('');
}

function memberOptions(selected = []) {
    return availablePrompts().map(prompt => `<label class="po-member"><input type="checkbox" value="${escapeHtml(prompt.id)}" ${selected.includes(prompt.id) ? 'checked' : ''}><span>${escapeHtml(prompt.name)}</span></label>`).join('');
}

function renderCreateTab(content) {
    const firstPrompt = availablePrompts()[0];
    content.innerHTML = `
        <section class="po-create-card">
            <div class="po-create-grid">
                <div class="po-create-settings">
                    <label class="po-field"><span>구분선 이름</span><input class="text_pole po-new-name" value="새 구분선"></label>
                    <div class="po-grid">
                        <label><span>기준 프롬프트</span><select class="text_pole po-new-anchor">${promptOptions(firstPrompt?.id || '')}</select></label>
                        <label><span>위치</span><select class="text_pole po-new-position"><option value="before">앞에</option><option value="after">뒤에</option></select></label>
                    </div>
                    <label class="checkbox_label po-toggle"><input class="po-new-collapsible" type="checkbox" checked><span>접기 가능</span></label>
                </div>
                <div class="po-card-members-pane">
                    <div class="po-label-row"><span>접을 프롬프트</span><small class="po-new-count">0개</small></div>
                    <div class="po-members po-new-members">${memberOptions([]) || '<div class="po-empty-small">현재 프리셋에서 프롬프트를 읽지 못했어.</div>'}</div>
                </div>
            </div>
            <div class="po-create-actions">
                <span class="po-hint">현재 Chat Completion 프리셋의 화면 구분 설정으로 저장돼.</span>
                <button type="button" class="menu_button po-create-save" ${firstPrompt ? '' : 'disabled'}><i class="fa-solid fa-check"></i> 구분선 저장</button>
            </div>
        </section>`;

    const memberBox = content.querySelector('.po-new-members');
    memberBox?.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
        const count = content.querySelector('.po-new-count');
        if (count) count.textContent = `${memberBox.querySelectorAll('input:checked').length}개`;
    }));

    content.querySelector('.po-create-save')?.addEventListener('click', () => {
        const anchor = content.querySelector('.po-new-anchor')?.value || '';
        if (!anchor) return;
        currentGroups().push({
            id: makeId(),
            name: content.querySelector('.po-new-name')?.value?.trim() || '새 구분선',
            anchor,
            position: content.querySelector('.po-new-position')?.value === 'after' ? 'after' : 'before',
            collapsible: Boolean(content.querySelector('.po-new-collapsible')?.checked),
            collapsed: false,
            members: [...content.querySelectorAll('.po-new-members input:checked')].map(el => el.value),
        });
        save();
        schedulePromptRender();
        activeTab = 'saved';
        renderActiveTab();
    });
}

function renderSavedTab(content) {
    const saved = currentGroups();
    if (!saved.length) {
        content.innerHTML = '<div class="po-empty">이 프리셋에 저장된 구분선이 없어.</div>';
        return;
    }

    content.innerHTML = '<div class="po-saved-list"></div>';
    const list = content.querySelector('.po-saved-list');

    saved.forEach((group, index) => {
        const item = document.createElement('section');
        item.className = 'po-saved-item';
        item.innerHTML = `
            <div class="po-saved-summary">
                <button type="button" class="po-saved-main po-edit-toggle" aria-expanded="false">
                    <span class="po-saved-name">${escapeHtml(group.name || '구분선')}</span>
                    <span class="po-saved-meta">${escapeHtml(promptName(group.anchor))} · ${group.position === 'after' ? '뒤' : '앞'} · ${(group.members || []).length}개${group.collapsible ? ' · 접기' : ''}</span>
                </button>
                <button type="button" class="po-small-button po-edit-toggle" aria-label="수정"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="po-small-button po-delete-saved" aria-label="삭제"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="po-edit-panel" hidden>
                <div class="po-card-layout">
                    <div class="po-card-settings">
                        <label class="po-field"><span>구분선 이름</span><input class="text_pole po-name" value="${escapeHtml(group.name || '')}"></label>
                        <div class="po-grid">
                            <label><span>기준 프롬프트</span><select class="text_pole po-anchor">${promptOptions(group.anchor)}</select></label>
                            <label><span>위치</span><select class="text_pole po-position"><option value="before" ${group.position !== 'after' ? 'selected' : ''}>앞에</option><option value="after" ${group.position === 'after' ? 'selected' : ''}>뒤에</option></select></label>
                        </div>
                        <label class="checkbox_label po-toggle"><input class="po-collapsible" type="checkbox" ${group.collapsible ? 'checked' : ''}><span>접기 가능</span></label>
                    </div>
                    <div class="po-card-members-pane">
                        <div class="po-label-row"><span>접을 프롬프트</span><small class="po-member-count">${(group.members || []).length}개</small></div>
                        <div class="po-members">${memberOptions(group.members || []) || '<div class="po-empty-small">현재 프리셋에서 프롬프트를 읽지 못했어.</div>'}</div>
                    </div>
                </div>
            </div>`;
        list.append(item);
        bindSavedItem(item, group, index);
    });
}

function bindSavedItem(item, group, index) {
    const panel = item.querySelector('.po-edit-panel');
    const toggles = item.querySelectorAll('.po-edit-toggle');
    const updateSummary = () => {
        item.querySelector('.po-saved-name').textContent = group.name || '구분선';
        item.querySelector('.po-saved-meta').textContent = `${promptName(group.anchor)} · ${group.position === 'after' ? '뒤' : '앞'} · ${(group.members || []).length}개${group.collapsible ? ' · 접기' : ''}`;
    };
    const setOpen = open => {
        panel.hidden = !open;
        item.classList.toggle('po-editing', open);
        toggles.forEach(button => button.setAttribute('aria-expanded', String(open)));
    };

    toggles.forEach(button => button.addEventListener('click', () => setOpen(panel.hidden)));
    item.querySelector('.po-name')?.addEventListener('input', event => {
        group.name = event.target.value;
        save(); updateSummary(); schedulePromptRender();
    });
    item.querySelector('.po-anchor')?.addEventListener('change', event => {
        group.anchor = event.target.value;
        save(); updateSummary(); schedulePromptRender();
    });
    item.querySelector('.po-position')?.addEventListener('change', event => {
        group.position = event.target.value;
        save(); updateSummary(); schedulePromptRender();
    });
    item.querySelector('.po-collapsible')?.addEventListener('change', event => {
        group.collapsible = event.target.checked;
        if (!group.collapsible) group.collapsed = false;
        save(); updateSummary(); schedulePromptRender();
    });
    item.querySelectorAll('.po-member input').forEach(input => input.addEventListener('change', () => {
        group.members = [...item.querySelectorAll('.po-member input:checked')].map(el => el.value);
        item.querySelector('.po-member-count').textContent = `${group.members.length}개`;
        save(); updateSummary(); schedulePromptRender();
    }));
    item.querySelector('.po-delete-saved')?.addEventListener('click', () => {
        if (!confirm(`“${group.name || '구분선'}”을 삭제할까?`)) return;
        currentGroups().splice(index, 1);
        save(); schedulePromptRender(); renderActiveTab();
    });
}

function handleActivePresetChange() {
    closeManager();
    schedulePromptRender();
    ensureLaunchers();
}

function init() {
    store();
    migrateSettings();
    ensureLaunchers();
    setTimeout(ensureLaunchers, 500);
    setTimeout(ensureLaunchers, 1500);
    attachPromptObserver();
    schedulePromptRender();

    const c = context();
    c.eventSource?.on?.(c.eventTypes?.OAI_PRESET_CHANGED_AFTER || 'oai_preset_changed_after', handleActivePresetChange);

    document.addEventListener('pointerdown', event => {
        const overlay = document.getElementById(MODAL_ID);
        if (!overlay || event.target.closest?.('.po-modal')) return;
        closeManager();
    }, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.getElementById(MODAL_ID)) closeManager();
    });
    window.visualViewport?.addEventListener('resize', setViewportMetrics);
    window.visualViewport?.addEventListener('scroll', setViewportMetrics);
    window.addEventListener('resize', setViewportMetrics);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
