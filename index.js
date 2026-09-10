export default 'Prompt Organizer';

const KEY = 'promptOrganizer';
const ROOT_ID = 'prompt-organizer-settings';
const DIVIDER_CLASS = 'po-divider';
const HIDDEN_CLASS = 'po-group-hidden';

const defaults = { version: 1, groupsByPreset: {} };
let observer = null;
let renderTimer = null;

function ctx() { return SillyTavern.getContext(); }
function settings() {
    const c = ctx();
    c.extensionSettings[KEY] ??= structuredClone(defaults);
    c.extensionSettings[KEY].groupsByPreset ??= {};
    return c.extensionSettings[KEY];
}
function currentPreset() {
    const selectors = ['#settings_perset_openai', '#openai_preset', '#completion_preset'];
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.value) return String(el.value);
    }
    return '__default__';
}
function groups() {
    const s = settings();
    const preset = currentPreset();
    s.groupsByPreset[preset] ??= [];
    return s.groupsByPreset[preset];
}
function uid() { return `po_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function save() { ctx().saveSettingsDebounced(); }
function esc(value = '') {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function promptList() {
    const pm = document.querySelector('#completion_prompt_manager_list');
    if (!pm) return [];
    return [...pm.querySelectorAll('.completion_prompt_manager_prompt[data-pm-identifier]')].map(el => ({
        id: el.dataset.pmIdentifier,
        name: el.querySelector('.completion_prompt_manager_prompt_name, .prompt_manager_prompt_name')?.textContent?.trim() || el.dataset.pmIdentifier,
        el,
    }));
}
function getPromptDefinitions() {
    const c = ctx();
    const source = c?.chatCompletionSettings?.prompts || c?.powerUserSettings?.prompts || [];
    if (Array.isArray(source) && source.length) return source;
    return promptList().map(p => ({ identifier: p.id, name: p.name }));
}

function cleanupPromptManager() {
    document.querySelectorAll(`.${DIVIDER_CLASS}`).forEach(x => x.remove());
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach(x => x.classList.remove(HIDDEN_CLASS));
}

function renderPromptManager() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
        const list = document.querySelector('#completion_prompt_manager_list');
        if (!list) return;
        cleanupPromptManager();
        const map = new Map(promptList().map(x => [x.id, x.el]));
        for (const group of groups()) {
            const anchor = map.get(group.anchor);
            if (!anchor) continue;
            const divider = document.createElement('div');
            divider.className = `${DIVIDER_CLASS} ${group.collapsible ? 'po-collapsible' : ''}`;
            divider.dataset.poGroup = group.id;
            divider.innerHTML = `${group.collapsible ? `<button type="button" class="po-fold" aria-label="접기/펼치기"><i class="fa-solid fa-chevron-${group.collapsed ? 'right' : 'down'}"></i></button>` : '<span class="po-fold-spacer"></span>'}<span class="po-divider-title">${esc(group.name || '구분선')}</span><span class="po-divider-line"></span>${group.merge ? `<span class="po-role">${esc(roleKo(group.role))}</span>` : ''}`;
            if (group.position === 'after') anchor.after(divider); else anchor.before(divider);
            if (group.collapsible && group.collapsed) {
                for (const id of group.members || []) map.get(id)?.classList.add(HIDDEN_CLASS);
            }
            if (group.collapsible) divider.querySelector('.po-fold')?.addEventListener('click', e => {
                e.stopPropagation();
                group.collapsed = !group.collapsed;
                save();
                renderPromptManager();
            });
        }
    }, 30);
}
function roleKo(role) { return ({system:'시스템', user:'사용자', assistant:'어시스턴트'})[role] || role || '시스템'; }

function settingsHost() {
    return document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
}
function renderSettings() {
    document.getElementById(ROOT_ID)?.remove();
    const host = settingsHost();
    if (!host) return;
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'inline-drawer po-settings';
    root.innerHTML = `<div class="inline-drawer-toggle inline-drawer-header"><b>프롬프트 정리</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"><div class="po-head"><div><div class="po-subtitle">현재 프리셋</div><strong class="po-preset">${esc(currentPreset())}</strong></div><button type="button" class="menu_button po-add"><i class="fa-solid fa-plus"></i> 구분선 추가</button></div><div class="po-groups"></div><div class="po-help">구분선은 화면에만 표시되며 프롬프트로 주입되지 않아. ‘하나의 메시지로 묶기’를 켜면 선택한 프롬프트를 지정한 역할 하나로 합쳐 전송해.</div></div>`;
    host.append(root);
    root.querySelector('.po-add').addEventListener('click', addGroup);
    renderGroupCards();
}
function renderGroupCards() {
    const root = document.getElementById(ROOT_ID);
    const box = root?.querySelector('.po-groups');
    if (!box) return;
    const prompts = promptList();
    box.innerHTML = '';
    if (!groups().length) box.innerHTML = '<div class="po-empty">아직 만든 구분선이 없어.</div>';
    groups().forEach((group, index) => {
        const card = document.createElement('section');
        card.className = 'po-card';
        card.dataset.id = group.id;
        const options = prompts.map(p => `<option value="${esc(p.id)}" ${p.id === group.anchor ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
        const checks = prompts.map(p => `<label class="po-member"><input type="checkbox" value="${esc(p.id)}" ${(group.members || []).includes(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('');
        card.innerHTML = `<div class="po-card-head"><input class="text_pole po-name" value="${esc(group.name)}" aria-label="구분선 이름"><button class="menu_button po-delete" title="삭제"><i class="fa-solid fa-trash"></i></button></div><div class="po-grid"><label><span>구분선 위치</span><select class="text_pole po-anchor">${options}</select></label><label><span>위치</span><select class="text_pole po-position"><option value="before" ${group.position !== 'after' ? 'selected' : ''}>앞에</option><option value="after" ${group.position === 'after' ? 'selected' : ''}>뒤에</option></select></label></div><label class="checkbox_label po-toggle"><input class="po-collapsible" type="checkbox" ${group.collapsible ? 'checked' : ''}><span>접기 가능한 구분선</span></label><div class="po-label">이 구분선에 묶을 프롬프트</div><div class="po-members">${checks || '<div class="po-empty-small">Prompt Manager를 열면 목록을 불러와.</div>'}</div><div class="po-injection"><label class="checkbox_label po-toggle"><input class="po-merge" type="checkbox" ${group.merge ? 'checked' : ''}><span>하나의 메시지로 묶어서 전송</span></label><label class="po-role-row ${group.merge ? '' : 'po-disabled'}"><span>묶음 역할</span><select class="text_pole po-role-select" ${group.merge ? '' : 'disabled'}><option value="system" ${group.role === 'system' ? 'selected' : ''}>시스템 (System)</option><option value="user" ${group.role === 'user' ? 'selected' : ''}>사용자 (User)</option><option value="assistant" ${group.role === 'assistant' ? 'selected' : ''}>어시스턴트 (Assistant)</option></select></label></div>`;
        box.append(card);
        bindCard(card, group, index);
    });
}
function bindCard(card, group, index) {
    const update = () => { save(); renderPromptManager(); };
    card.querySelector('.po-name').addEventListener('input', e => { group.name = e.target.value; update(); });
    card.querySelector('.po-anchor').addEventListener('change', e => { group.anchor = e.target.value; update(); });
    card.querySelector('.po-position').addEventListener('change', e => { group.position = e.target.value; update(); });
    card.querySelector('.po-collapsible').addEventListener('change', e => { group.collapsible = e.target.checked; if (!group.collapsible) group.collapsed = false; update(); });
    card.querySelectorAll('.po-member input').forEach(input => input.addEventListener('change', () => {
        group.members = [...card.querySelectorAll('.po-member input:checked')].map(x => x.value);
        update();
    }));
    card.querySelector('.po-merge').addEventListener('change', e => { group.merge = e.target.checked; save(); renderGroupCards(); renderPromptManager(); });
    card.querySelector('.po-role-select').addEventListener('change', e => { group.role = e.target.value; update(); });
    card.querySelector('.po-delete').addEventListener('click', () => { groups().splice(index, 1); save(); renderGroupCards(); renderPromptManager(); });
}
function addGroup() {
    const prompts = promptList();
    groups().push({ id: uid(), name: '새 구분선', anchor: prompts[0]?.id || '', position: 'before', collapsible: false, collapsed: false, members: [], merge: false, role: 'system' });
    save(); renderGroupCards(); renderPromptManager();
}

// Merge is deliberately performed on the final Chat Completion array. We only merge
// messages whose current prepared text can be matched to selected enabled prompt content.
function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function preparedPromptTexts() {
    const c = ctx();
    const defs = getPromptDefinitions();
    const result = new Map();
    for (const p of defs) {
        if (!p?.identifier || typeof p.content !== 'string' || !p.content.trim()) continue;
        let text = p.content;
        try { if (typeof c.substituteParams === 'function') text = c.substituteParams(text); } catch {}
        result.set(p.identifier, normalizeText(text));
    }
    return result;
}
function mergeGroupsIntoChat(eventData) {
    if (!eventData?.chat || !Array.isArray(eventData.chat)) return;
    const textMap = preparedPromptTexts();
    const claimed = new Set();
    for (const group of groups().filter(g => g.merge && g.members?.length)) {
        const matches = [];
        for (const id of group.members) {
            const target = textMap.get(id);
            if (!target) continue;
            const idx = eventData.chat.findIndex((m, i) => !claimed.has(i) && normalizeText(m?.content) === target);
            if (idx >= 0) { matches.push(idx); claimed.add(idx); }
        }
        if (matches.length < 2) continue;
        matches.sort((a,b) => a-b);
        const first = matches[0];
        const content = matches.map(i => eventData.chat[i].content).join('\n\n');
        eventData.chat[first] = { ...eventData.chat[first], role: group.role || 'system', content };
        for (let i = matches.length - 1; i >= 1; i--) eventData.chat.splice(matches[i], 1);
    }
}

function watchPromptManager() {
    observer?.disconnect();
    observer = new MutationObserver(() => renderPromptManager());
    observer.observe(document.body, { childList: true, subtree: true });
}
function onPresetMaybeChanged() {
    setTimeout(() => { renderSettings(); renderPromptManager(); }, 100);
}

function init() {
    settings();
    renderSettings();
    watchPromptManager();
    renderPromptManager();
    document.addEventListener('change', e => {
        if (['settings_perset_openai','openai_preset','completion_preset'].includes(e.target?.id)) onPresetMaybeChanged();
    });
    const c = ctx();
    const eventName = c.eventTypes?.CHAT_COMPLETION_PROMPT_READY || 'chat_completion_prompt_ready';
    c.eventSource?.on?.(eventName, mergeGroupsIntoChat);
    console.log('[Prompt Organizer] loaded');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
else setTimeout(init, 0);
