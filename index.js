export default 'Prompt Organizer';

const KEY = 'promptOrganizer';
const MODAL_ID = 'prompt-organizer-modal';
const TOOLBAR_ID = 'prompt-organizer-toolbar-button';
const WAND_ID = 'prompt-organizer-wand-item';
const DIVIDER_CLASS = 'po-divider';
const HIDDEN_CLASS = 'po-group-hidden';
const PRESET_SELECTORS = ['#settings_perset_openai', '#openai_preset', '#completion_preset'];

const defaults = { version: 2, groupsByPreset: {} };
let promptObserver = null;
let observedPromptList = null;
let renderTimer = null;
let rendering = false;

const context = () => SillyTavern.getContext();

function store() {
    const c = context();
    c.extensionSettings[KEY] ??= structuredClone(defaults);
    c.extensionSettings[KEY].groupsByPreset ??= {};
    return c.extensionSettings[KEY];
}

function presetName() {
    for (const selector of PRESET_SELECTORS) {
        const select = document.querySelector(selector);
        if (select?.value) return String(select.value);
    }
    return '__default__';
}

function groups() {
    const all = store().groupsByPreset;
    const preset = presetName();
    all[preset] ??= [];
    return all[preset];
}

function save() {
    // Only extensionSettings are persisted. Preset prompts/order are never written here.
    context().saveSettingsDebounced();
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
}

function makeId() {
    return `po_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function promptItems() {
    const list = document.querySelector('#completion_prompt_manager_list');
    if (!list) return [];
    return [...list.querySelectorAll('.completion_prompt_manager_prompt[data-pm-identifier]')].map(el => ({
        id: el.dataset.pmIdentifier,
        name: el.querySelector('.completion_prompt_manager_prompt_name, .prompt_manager_prompt_name')?.textContent?.trim() || el.dataset.pmIdentifier,
        el,
    }));
}

function promptDefinitions() {
    const prompts = context().chatCompletionSettings?.prompts;
    return Array.isArray(prompts) ? prompts : [];
}

function roleLabel(role) {
    return ({ system: '시스템', user: '사용자', assistant: '어시스턴트' })[role] || '시스템';
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

    const map = new Map(promptItems().map(item => [item.id, item.el]));
    for (const group of groups()) {
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
            <span class="po-divider-line"></span>
            ${group.merge ? `<span class="po-role">${escapeHtml(roleLabel(group.role))}</span>` : ''}`;

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
    if (observedPromptList === list && promptObserver) {
        promptObserver.observe(list, { childList: true, subtree: true });
        return;
    }

    promptObserver?.disconnect();
    observedPromptList = list;
    promptObserver = new MutationObserver(() => {
        if (!rendering) schedulePromptRender();
    });
    promptObserver.observe(list, { childList: true, subtree: true });
}

function ensureLaunchers() {
    const wand = document.getElementById('extensionsMenuButton');
    if (wand && !document.getElementById(TOOLBAR_ID)) {
        const button = document.createElement('div');
        button.id = TOOLBAR_ID;
        button.className = 'fa-solid fa-file-lines interactable po-launcher';
        button.title = '프롬프트 정리';
        button.setAttribute('aria-label', '프롬프트 정리');
        button.addEventListener('click', openManager);
        wand.after(button);
    }

    const menu = document.getElementById('extensionsMenu');
    if (menu && !document.getElementById(WAND_ID)) {
        const item = document.createElement('div');
        item.id = WAND_ID;
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = '<i class="fa-solid fa-file-lines fa-fw"></i><span>프롬프트 정리</span>';
        item.addEventListener('click', openManager);
        item.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') openManager();
        });
        menu.append(item);
    }
}

function setViewportHeight() {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--po-viewport-height', `${height}px`);
}

function closeManager() {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove('po-modal-open');
}

function openManager() {
    closeManager();
    setViewportHeight();

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'po-modal-overlay';
    overlay.innerHTML = `
        <section class="po-modal" role="dialog" aria-modal="true" aria-label="프롬프트 정리">
            <header class="po-modal-header">
                <div>
                    <div class="po-modal-title">프롬프트 정리</div>
                    <div class="po-preset-line">현재 프리셋 · <strong>${escapeHtml(presetName())}</strong></div>
                </div>
                <button type="button" class="po-icon-button po-close" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button>
            </header>
            <div class="po-modal-body">
                <div class="po-topbar"><button type="button" class="menu_button po-add"><i class="fa-solid fa-plus"></i> 구분선 추가</button></div>
                <div class="po-groups"></div>
                <div class="po-help">구분선은 화면 표시용이야. 프리셋 내용과 순서는 바꾸지 않아. 묶어서 전송을 켠 그룹만 전송 직전에 한 메시지로 합쳐져.</div>
            </div>
        </section>`;

    document.body.append(overlay);
    document.body.classList.add('po-modal-open');
    overlay.querySelector('.po-close').addEventListener('click', closeManager);
    overlay.querySelector('.po-add').addEventListener('click', addGroup);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeManager(); });
    renderGroupCards();
}

function renderGroupCards() {
    const box = document.querySelector(`#${MODAL_ID} .po-groups`);
    if (!box) return;

    const prompts = promptItems();
    box.replaceChildren();
    if (!groups().length) {
        box.innerHTML = '<div class="po-empty">아직 만든 구분선이 없어.</div>';
        return;
    }

    groups().forEach((group, index) => {
        const card = document.createElement('section');
        card.className = 'po-card';

        const options = prompts.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === group.anchor ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
        const members = prompts.map(item => `<label class="po-member"><input type="checkbox" value="${escapeHtml(item.id)}" ${(group.members || []).includes(item.id) ? 'checked' : ''}><span>${escapeHtml(item.name)}</span></label>`).join('');

        card.innerHTML = `
            <div class="po-card-head">
                <input class="text_pole po-name" value="${escapeHtml(group.name)}" aria-label="구분선 이름">
                <button type="button" class="po-icon-button po-delete" aria-label="삭제"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="po-grid">
                <label><span>기준 프롬프트</span><select class="text_pole po-anchor">${options}</select></label>
                <label><span>구분선 위치</span><select class="text_pole po-position"><option value="before" ${group.position !== 'after' ? 'selected' : ''}>앞에</option><option value="after" ${group.position === 'after' ? 'selected' : ''}>뒤에</option></select></label>
            </div>
            <label class="checkbox_label po-toggle"><input class="po-collapsible" type="checkbox" ${group.collapsible ? 'checked' : ''}><span>접기 가능한 구분선</span></label>
            <div class="po-label-row"><span>묶을 프롬프트</span><small>${(group.members || []).length}개 선택</small></div>
            <div class="po-members">${members || '<div class="po-empty-small">Prompt Manager를 한 번 열면 목록을 불러올 수 있어.</div>'}</div>
            <div class="po-injection">
                <label class="checkbox_label po-toggle"><input class="po-merge" type="checkbox" ${group.merge ? 'checked' : ''}><span>하나의 메시지로 묶어서 전송</span></label>
                <label class="po-role-row ${group.merge ? '' : 'po-disabled'}"><span>묶음 역할</span><select class="text_pole po-role-select" ${group.merge ? '' : 'disabled'}><option value="system" ${group.role === 'system' ? 'selected' : ''}>시스템 (System)</option><option value="user" ${group.role === 'user' ? 'selected' : ''}>사용자 (User)</option><option value="assistant" ${group.role === 'assistant' ? 'selected' : ''}>어시스턴트 (Assistant)</option></select></label>
            </div>`;

        box.append(card);
        bindGroupCard(card, group, index);
    });
}

function bindGroupCard(card, group, index) {
    const persistAndRender = () => { save(); schedulePromptRender(); };

    card.querySelector('.po-name').addEventListener('input', event => { group.name = event.target.value; persistAndRender(); });
    card.querySelector('.po-anchor').addEventListener('change', event => { group.anchor = event.target.value; persistAndRender(); });
    card.querySelector('.po-position').addEventListener('change', event => { group.position = event.target.value; persistAndRender(); });
    card.querySelector('.po-collapsible').addEventListener('change', event => {
        group.collapsible = event.target.checked;
        if (!group.collapsible) group.collapsed = false;
        persistAndRender();
    });
    card.querySelectorAll('.po-member input').forEach(input => input.addEventListener('change', () => {
        group.members = [...card.querySelectorAll('.po-member input:checked')].map(el => el.value);
        save();
        renderGroupCards();
        schedulePromptRender();
    }));
    card.querySelector('.po-merge').addEventListener('change', event => {
        group.merge = event.target.checked;
        save();
        renderGroupCards();
        schedulePromptRender();
    });
    card.querySelector('.po-role-select').addEventListener('change', event => { group.role = event.target.value; persistAndRender(); });
    card.querySelector('.po-delete').addEventListener('click', () => {
        groups().splice(index, 1);
        save();
        renderGroupCards();
        schedulePromptRender();
    });
}

function addGroup() {
    const firstPrompt = promptItems()[0];
    groups().push({
        id: makeId(), name: '새 구분선', anchor: firstPrompt?.id || '', position: 'before',
        collapsible: false, collapsed: false, members: [], merge: false, role: 'system',
    });
    save();
    renderGroupCards();
    schedulePromptRender();
}

function normalize(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function preparedPromptTextMap() {
    const c = context();
    const result = new Map();
    for (const prompt of promptDefinitions()) {
        if (!prompt?.identifier || typeof prompt.content !== 'string' || !prompt.content.trim()) continue;
        let content = prompt.content;
        try { content = c.substituteParams?.(content) ?? content; } catch { /* keep original text */ }
        result.set(prompt.identifier, normalize(content));
    }
    return result;
}

function mergeConfiguredGroups(eventData) {
    // This mutates only the ephemeral outgoing request array. It never mutates preset data.
    if (!Array.isArray(eventData?.chat)) return;
    const textById = preparedPromptTextMap();
    const claimedIndexes = new Set();

    for (const group of groups()) {
        if (!group.merge || !group.members?.length) continue;

        const indexes = [];
        for (const id of group.members) {
            const expected = textById.get(id);
            if (!expected) continue;
            const index = eventData.chat.findIndex((message, i) =>
                !claimedIndexes.has(i)
                && ['system', 'user', 'assistant'].includes(message?.role)
                && typeof message?.content === 'string'
                && normalize(message.content) === expected);
            if (index >= 0) {
                indexes.push(index);
                claimedIndexes.add(index);
            }
        }

        if (indexes.length < 2) continue;
        indexes.sort((a, b) => a - b);
        const first = indexes[0];
        const mergedContent = indexes.map(index => eventData.chat[index].content).join('\n\n');
        eventData.chat[first] = { ...eventData.chat[first], role: group.role || 'system', content: mergedContent };
        for (let i = indexes.length - 1; i > 0; i--) eventData.chat.splice(indexes[i], 1);
    }
}

function handlePresetChange() {
    closeManager();
    schedulePromptRender();
}

function init() {
    store();
    ensureLaunchers();
    setTimeout(ensureLaunchers, 750);
    attachPromptObserver();
    schedulePromptRender();

    const c = context();
    c.eventSource?.on?.(c.eventTypes?.OAI_PRESET_CHANGED_AFTER || 'oai_preset_changed_after', handlePresetChange);
    c.eventSource?.on?.(c.eventTypes?.CHAT_COMPLETION_PROMPT_READY || 'chat_completion_prompt_ready', mergeConfiguredGroups);

    document.addEventListener('change', event => {
        if (PRESET_SELECTORS.some(selector => event.target?.matches?.(selector))) handlePresetChange();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.getElementById(MODAL_ID)) closeManager();
    });
    window.visualViewport?.addEventListener('resize', setViewportHeight);
    window.addEventListener('resize', setViewportHeight);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
