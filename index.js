import { getPresetManager } from '../../../preset-manager.js';

export default 'Prompt Organizer';

const KEY = 'promptOrganizer';
const MODAL_ID = 'prompt-organizer-modal';
const MANAGEMENT_BUTTON_ID = 'prompt-organizer-management-button';
const WAND_ID = 'prompt-organizer-wand-item';
const DIVIDER_CLASS = 'po-divider';
const HIDDEN_CLASS = 'po-group-hidden';
const SETTINGS_VERSION = 4;

const defaults = { version: SETTINGS_VERSION, groupsByPreset: {} };

let editorPresetName = '';
let activeTab = 'create';
let promptObserver = null;
let observedPromptList = null;
let renderTimer = null;
let saveStateTimer = null;
let rendering = false;

const context = () => SillyTavern.getContext();
const presetManager = () => getPresetManager('openai');

function store() {
    const c = context();
    c.extensionSettings[KEY] ??= structuredClone(defaults);
    c.extensionSettings[KEY].groupsByPreset ??= {};
    return c.extensionSettings[KEY];
}

function migrateSettings() {
    const data = store();
    let changed = data.version !== SETTINGS_VERSION;
    data.version = SETTINGS_VERSION;

    for (const list of Object.values(data.groupsByPreset)) {
        if (!Array.isArray(list)) continue;
        for (const group of list) {
            if ('merge' in group) {
                delete group.merge;
                changed = true;
            }
            if ('role' in group) {
                delete group.role;
                changed = true;
            }
        }
    }

    if (changed) save(false);
}

function save(showState = true) {
    context().saveSettingsDebounced();
    if (showState) showSavedState();
}

function showSavedState() {
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

function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
    })[char]);
}

function makeId() {
    return `po_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function presetNames() {
    const names = presetManager()?.getAllPresets?.();
    return Array.isArray(names) ? names.filter(Boolean).map(String) : [];
}

function activePresetName() {
    return String(presetManager()?.getSelectedPresetName?.() || '');
}

function selectedPresetName() {
    const names = presetNames();
    if (!names.length) {
        editorPresetName = '';
        return '';
    }

    if (!names.includes(editorPresetName)) {
        const active = activePresetName();
        editorPresetName = names.includes(active) ? active : names[0];
    }

    return editorPresetName;
}

function groupsFor(preset) {
    if (!preset) return [];
    const all = store().groupsByPreset;
    all[preset] ??= [];
    return all[preset];
}

function editorGroups() {
    return groupsFor(selectedPresetName());
}

function presetData(name) {
    if (!name) return null;
    try {
        return presetManager()?.getPresetSettings?.(name) ?? null;
    } catch (error) {
        console.warn('[Prompt Organizer] Failed to read preset:', name, error);
        return null;
    }
}

function promptsForPreset(name) {
    const data = presetData(name);
    const definitions = Array.isArray(data?.prompts) ? data.prompts : [];
    const byId = new Map();

    for (const prompt of definitions) {
        if (!prompt?.identifier) continue;
        const id = String(prompt.identifier);
        byId.set(id, {
            id,
            name: String(prompt.name || prompt.identifier),
        });
    }

    const orderLists = Array.isArray(data?.prompt_order) ? data.prompt_order : [];
    const order = orderLists.find(entry => String(entry?.character_id) === '100000')?.order;

    if (!Array.isArray(order) || !order.length) {
        return [...byId.values()];
    }

    return order
        .map(entry => byId.get(String(entry?.identifier ?? '')))
        .filter(Boolean);
}

function promptDomItems() {
    const list = document.querySelector('#completion_prompt_manager_list');
    if (!list) return [];

    return [...list.querySelectorAll('.completion_prompt_manager_prompt[data-pm-identifier]')].map(el => ({
        id: String(el.dataset.pmIdentifier),
        name: el.querySelector('.completion_prompt_manager_prompt_name, .prompt_manager_prompt_name')?.textContent?.trim()
            || String(el.dataset.pmIdentifier),
        el,
    }));
}

function editorPrompts() {
    return promptsForPreset(selectedPresetName());
}

function editorPromptName(id) {
    return editorPrompts().find(prompt => prompt.id === id)?.name || id || '없음';
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
    const preset = activePresetName();

    for (const group of groupsFor(preset)) {
        const anchor = map.get(group.anchor);
        if (!anchor) continue;

        const divider = document.createElement('div');
        divider.className = `${DIVIDER_CLASS}${group.collapsible ? ' po-collapsible' : ''}`;
        divider.dataset.poGroup = group.id;
        divider.innerHTML = `
            ${group.collapsible
                ? `<button type="button" class="po-fold" aria-label="접기/펼치기"><i class="fa-solid fa-chevron-${group.collapsed ? 'right' : 'down'}"></i></button>`
                : '<span class="po-fold-spacer"></span>'}
            <span class="po-divider-title">${escapeHtml(group.name || '구분선')}</span>
            <span class="po-divider-line"></span>`;

        group.position === 'after' ? anchor.after(divider) : anchor.before(divider);

        if (group.collapsible && group.collapsed) {
            for (const id of group.members || []) {
                map.get(id)?.classList.add(HIDDEN_CLASS);
            }
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

function openAiPresetPanel() {
    const presetSelect = document.querySelector('#settings_perset_openai, #openai_preset, #completion_preset');
    if (!presetSelect) return null;

    return presetSelect.closest(
        '#openai_settings, #ai_response_configuration, .inline-drawer-content, .drawer-content, .settings-content',
    ) || presetSelect.parentElement?.parentElement || null;
}

function findToggleGroupManagementButton() {
    const panel = openAiPresetPanel();
    if (!panel) return null;

    const candidates = panel.querySelectorAll('button, .menu_button, [role="button"]');
    return [...candidates].find(el => {
        if (el.id === MANAGEMENT_BUTTON_ID) return false;
        const text = el.textContent?.replace(/\s+/g, ' ').trim();
        return text === '그룹 관리' || text === 'Manage groups';
    }) || null;
}

function createManagementLauncher(anchor) {
    const button = document.createElement('button');
    button.id = MANAGEMENT_BUTTON_ID;
    button.type = 'button';
    button.className = 'menu_button po-management-launcher';
    button.title = '프롬프트 정리';
    button.setAttribute('aria-label', '프롬프트 정리');
    button.innerHTML = '<i class="fa-solid fa-layer-group"></i><span>프롬프트 정리</span>';
    button.addEventListener('click', openManager);
    anchor.after(button);
}

function ensureLaunchers() {
    document.getElementById('prompt-organizer-toolbar-button')?.remove();

    const anchor = findToggleGroupManagementButton();
    const existing = document.getElementById(MANAGEMENT_BUTTON_ID);

    if (anchor) {
        if (!existing || existing.previousElementSibling !== anchor) {
            existing?.remove();
            createManagementLauncher(anchor);
        }
    } else {
        existing?.remove();
    }

    const menu = document.getElementById('extensionsMenu');
    if (menu && !document.getElementById(WAND_ID)) {
        const item = document.createElement('div');
        item.id = WAND_ID;
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = '<i class="fa-solid fa-layer-group fa-fw"></i><span>프롬프트 정리</span>';
        item.addEventListener('click', openManager);
        item.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openManager();
            }
        });
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

function presetOptions() {
    const selected = selectedPresetName();
    return presetNames()
        .map(name => `<option value="${escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`)
        .join('');
}

function openManager() {
    closeManager();
    setViewportMetrics();
    selectedPresetName();

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'po-modal-overlay';
    overlay.innerHTML = `
        <section class="po-modal" role="dialog" aria-modal="true" aria-label="프롬프트 정리">
            <header class="po-modal-header">
                <div class="po-title-row">
                    <div class="po-modal-title">프롬프트 정리</div>
                    <span class="po-save-state">자동 저장</span>
                </div>
                <button type="button" class="po-icon-button po-close" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
            </header>
            <div class="po-preset-picker">
                <span>수정할 프리셋</span>
                <select class="text_pole po-preset-select">${presetOptions()}</select>
                <small class="po-active-preset-note">현재 사용 중 · ${escapeHtml(activePresetName() || '없음')}</small>
            </div>
            <nav class="po-tabs" aria-label="프롬프트 정리 탭">
                <button type="button" class="po-tab" data-tab="create"><i class="fa-solid fa-plus"></i> 새 구분선</button>
                <button type="button" class="po-tab" data-tab="saved"><i class="fa-solid fa-folder-open"></i> 저장된 구분선 <span class="po-tab-count">0</span></button>
            </nav>
            <div class="po-modal-body"><div class="po-tab-content"></div></div>
        </section>`;

    document.body.append(overlay);
    document.body.classList.add('po-modal-open');

    overlay.querySelector('.po-close').addEventListener('click', closeManager);
    overlay.querySelector('.po-preset-select')?.addEventListener('change', event => {
        editorPresetName = event.target.value;
        renderActiveTab();
    });
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
    if (count) count.textContent = String(editorGroups().length);

    if (!selectedPresetName()) {
        content.innerHTML = '<div class="po-empty">OpenAI 프리셋 목록을 불러오지 못했어.</div>';
        return;
    }

    activeTab === 'saved' ? renderSavedTab(content) : renderCreateTab(content);
}

function promptOptions(selectedId = '') {
    return editorPrompts()
        .map(prompt => `<option value="${escapeHtml(prompt.id)}" ${prompt.id === selectedId ? 'selected' : ''}>${escapeHtml(prompt.name)}</option>`)
        .join('');
}

function memberOptions(selected = []) {
    return editorPrompts()
        .map(prompt => `<label class="po-member"><input type="checkbox" value="${escapeHtml(prompt.id)}" ${selected.includes(prompt.id) ? 'checked' : ''}><span>${escapeHtml(prompt.name)}</span></label>`)
        .join('');
}

function renderCreateTab(content) {
    const prompts = editorPrompts();
    const firstPrompt = prompts[0];

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
                    <div class="po-members po-new-members">${memberOptions([]) || '<div class="po-empty-small">이 프리셋에 표시할 프롬프트가 없어.</div>'}</div>
                </div>
            </div>
            <div class="po-create-actions">
                <span class="po-hint">선택한 프리셋의 화면 구분 설정으로 저장돼.</span>
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

        editorGroups().push({
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
    const saved = editorGroups();
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
                    <span class="po-saved-meta">${escapeHtml(editorPromptName(group.anchor))} · ${group.position === 'after' ? '뒤' : '앞'} · ${(group.members || []).length}개${group.collapsible ? ' · 접기' : ''}</span>
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
                        <div class="po-members">${memberOptions(group.members || []) || '<div class="po-empty-small">이 프리셋에 표시할 프롬프트가 없어.</div>'}</div>
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

    const setOpen = open => {
        panel.hidden = !open;
        item.classList.toggle('po-editing', open);
        toggles.forEach(button => button.setAttribute('aria-expanded', String(open)));
    };

    const updateSummary = () => {
        item.querySelector('.po-saved-name').textContent = group.name || '구분선';
        item.querySelector('.po-saved-meta').textContent = `${editorPromptName(group.anchor)} · ${group.position === 'after' ? '뒤' : '앞'} · ${(group.members || []).length}개${group.collapsible ? ' · 접기' : ''}`;
    };

    toggles.forEach(button => button.addEventListener('click', () => setOpen(panel.hidden)));

    item.querySelector('.po-name')?.addEventListener('input', event => {
        group.name = event.target.value;
        save();
        updateSummary();
        schedulePromptRender();
    });

    item.querySelector('.po-anchor')?.addEventListener('change', event => {
        group.anchor = event.target.value;
        save();
        updateSummary();
        schedulePromptRender();
    });

    item.querySelector('.po-position')?.addEventListener('change', event => {
        group.position = event.target.value;
        save();
        updateSummary();
        schedulePromptRender();
    });

    item.querySelector('.po-collapsible')?.addEventListener('change', event => {
        group.collapsible = event.target.checked;
        if (!group.collapsible) group.collapsed = false;
        save();
        updateSummary();
        schedulePromptRender();
    });

    item.querySelectorAll('.po-member input').forEach(input => input.addEventListener('change', () => {
        group.members = [...item.querySelectorAll('.po-member input:checked')].map(el => el.value);
        item.querySelector('.po-member-count').textContent = `${group.members.length}개`;
        save();
        updateSummary();
        schedulePromptRender();
    }));

    item.querySelector('.po-delete-saved')?.addEventListener('click', () => {
        if (!confirm(`“${group.name || '구분선'}”을 삭제할까?`)) return;
        editorGroups().splice(index, 1);
        save();
        schedulePromptRender();
        renderActiveTab();
    });
}

function handleActivePresetChange() {
    schedulePromptRender();
    ensureLaunchers();
    const note = document.querySelector(`#${MODAL_ID} .po-active-preset-note`);
    if (note) note.textContent = `현재 사용 중 · ${activePresetName() || '없음'}`;
}

function init() {
    store();
    migrateSettings();
    ensureLaunchers();
    setTimeout(ensureLaunchers, 750);
    setTimeout(ensureLaunchers, 2000);
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
