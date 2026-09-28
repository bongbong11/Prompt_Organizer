// Run with Playwright installed: node tests/render.cjs (uses installed Edge).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setContent(`<style>
            :root { --SmartThemeBodyColor: #eee; --SmartThemeBlurTintColor: #222; }
            body { background:#222; color:#eee; font:16px sans-serif; }
            * { box-sizing:border-box; } input,select,button { max-width:100%; }
            #completion_prompt_manager_list { width:100%; max-width:800px; }
            .completion_prompt_manager_prompt { padding:10px; }
        </style><div id="extensions_settings"></div><div id="extensionsMenu"></div>
        <div id="rightSendForm"><button id="send_but">Send</button></div>
        <div id="completion_prompt_manager_list">
            <div class="completion_prompt_manager_prompt" data-pm-identifier="a"><span class="completion_prompt_manager_prompt_name">CORE</span></div>
            <div class="completion_prompt_manager_prompt" data-pm-identifier="b"><span class="completion_prompt_manager_prompt_name">STYLE</span></div>
        </div>`);
        await page.addStyleTag({ path: path.join(__dirname, '../style.css') });
        await page.evaluate(() => {
            window.fixture = {
                extensionSettings: { promptOrganizer: { version: 10, enabled: true, groupsByPreset: {
                    Test: [{ id:'old', name:'기존 구분선', anchor:'a', position:'before', members:['a'], collapsible:true, collapsed:true }],
                    Other: [{ id:'other', name:'다른 프리셋', members:[] }],
                } } },
                saveSettingsDebounced() { window.saveCount = (window.saveCount || 0) + 1; },
            };
            window.SillyTavern = { getContext: () => fixture };
            window.oai_settings = Object.freeze({ preset_settings_openai:'Test' });
            const prompts = Object.freeze([{ identifier:'a', enabled:true }, { identifier:'b', enabled:false }].map(Object.freeze));
            window.promptManager = Object.freeze({ activeCharacter:'test', getPromptOrderForCharacter: () => prompts,
                getPromptById: id => Object.freeze({ name:id, content:'DO NOT CHANGE', role:'system', depth:4 }) });
        });
        const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8')
            .replace(/^import .*;\r?\n/m, '').replace(/^export default .*;\r?\n/m, '');
        await page.addScriptTag({ content: source });
        await page.waitForSelector('.po-divider');
        assert.equal(await page.evaluate(() => store().version), 11);
        assert.equal(await page.evaluate(() => store().showChatIcon), true);
        assert.equal(await page.evaluate(() => store().groupsByPreset.Other[0].lineStyle), 'solid');
        assert.equal(await page.locator('.po-group-hidden').count(), 1);
        await page.locator('.po-chat-icon-input').uncheck();
        assert.equal(await page.locator('#prompt-organizer-toolbar-button').count(), 0);
        assert.equal(await page.locator('#prompt-organizer-wand-item').count(), 1);
        await page.evaluate(() => { ensureLaunchers(); migrateSettings(); });
        assert.equal(await page.evaluate(() => store().showChatIcon), false);
        await page.locator('.po-enabled-input').uncheck();
        assert.equal(await page.locator('.po-divider,.po-group-hidden,#prompt-organizer-wand-item').count(), 0);
        await page.locator('.po-enabled-input').check();
        assert.equal(await page.locator('#prompt-organizer-toolbar-button').count(), 0);
        await page.locator('#prompt-organizer-wand-item').click();
        assert.equal(await page.locator('.po-custom-line-field').isVisible(), false);
        await page.locator('.po-line-style').selectOption('custom');
        const custom = '🌸 <img src=x onerror=alert(1)> & ♡ ';
        await page.locator('.po-custom-line').fill(custom);
        await page.locator('.po-create-save').click();
        await page.waitForFunction(() => document.querySelectorAll('.po-divider-pattern').length === 1);
        assert.equal(await page.locator('.po-divider img').count(), 0);
        assert.ok((await page.locator('.po-divider-pattern').textContent()).startsWith(custom + custom));
        const item = page.locator('.po-saved-item').nth(1);
        await item.locator('.po-saved-main').click();
        assert.equal(await item.locator('.po-custom-line').inputValue(), custom);
        for (const style of ['dotted', 'wave', 'ornament', 'solid', 'custom']) {
            await item.locator('.po-line-style').selectOption(style);
            await page.waitForFunction(style => currentGroups()[1].lineStyle === style, style);
            await page.evaluate(() => renderPromptManager());
            assert.equal(await page.locator('.po-divider-pattern').count(), style === 'solid' ? 0 : 1);
        }
        await item.locator('.po-custom-line').fill('');
        await page.evaluate(() => renderPromptManager());
        assert.equal(await page.locator('.po-divider-pattern').count(), 0);
        await item.locator('.po-custom-line').fill('✧ 🌸 ');
        await item.locator('.po-duplicate-group').click();
        assert.equal(await page.evaluate(() => currentGroups()[2].customLine), '✧ 🌸 ');
        await page.evaluate(() => copyCurrentPresetGroupsTo('Copy'));
        assert.equal(await page.evaluate(() => store().groupsByPreset.Copy[2].lineStyle), 'custom');
        await page.evaluate(() => {
            fixture.extensionSettings = JSON.parse(JSON.stringify(fixture.extensionSettings));
            migrateSettings(); closeManager(); renderPromptManager();
        });
        assert.equal(await page.evaluate(() => store().showChatIcon), false);
        for (const width of [1100, 375]) {
            await page.setViewportSize({ width, height:850 });
            await page.evaluate(() => renderPromptManager());
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            assert.equal(await page.evaluate(() => [...document.querySelectorAll('.po-divider-pattern')].every(line => {
                const text = line.firstElementChild.getBoundingClientRect();
                return text.width >= line.clientWidth && line.getBoundingClientRect().right <= innerWidth;
            })), true);
            if (process.env.PO_SCREENSHOTS) await page.screenshot({ path:path.join(process.env.PO_SCREENSHOTS, `dividers-${width}.png`) });
            await page.evaluate(() => openManager());
            await page.locator('.po-saved-main').nth(1).click();
            assert.equal(await page.locator('.po-custom-line').nth(1).isVisible(), true);
            assert.equal(await page.evaluate(() => { const modal = document.querySelector('.po-modal'); return modal.scrollWidth > modal.clientWidth; }), false);
            if (process.env.PO_SCREENSHOTS) await page.screenshot({ path:path.join(process.env.PO_SCREENSHOTS, `editor-${width}.png`) });
            await page.evaluate(() => closeManager());
        }
        assert.deepEqual(errors, []);
        if (process.env.PO_SCREENSHOTS) {
            await page.setViewportSize({ width:1000, height:820 });
            await page.addStyleTag({ content: `
                body { padding:20px; } .text_pole, .menu_button { color:#eee; background:#333;
                    border:1px solid #555; border-radius:6px; padding:7px; }
                select option { background:#333; } .checkbox_label { display:flex; align-items:center; gap:6px; }
                .fa-chevron-down::before { content:'⌄'; } .fa-pen::before { content:'✎'; }
                .fa-trash::before { content:'×'; } .fa-xmark::before { content:'×'; }
                #extensions_settings { padding:16px; border:1px solid #555; border-radius:10px; max-width:440px; }
            ` });
            const iconUrl = `data:image/svg+xml;base64,${fs.readFileSync(path.join(__dirname, '../icon.svg')).toString('base64')}`;
            await page.addStyleTag({ content: `.po-asset-icon { mask-image:url("${iconUrl}"); -webkit-mask-image:url("${iconUrl}"); }` });
            await page.evaluate(() => {
                const sample = document.createElement('div');
                sample.id = 'icon-preview';
                sample.style.cssText = 'display:flex;align-items:center;gap:24px;padding:24px;width:300px;background:#292929;border-radius:12px;margin-bottom:20px';
                sample.innerHTML = '<span class="po-asset-icon" style="width:64px;height:64px"></span><span class="po-asset-icon"></span><span>접어</span>';
                document.body.prepend(sample);
            });
            await page.evaluate(() => {
                store().groupsByPreset.Test = DIVIDER_STYLES.map(([lineStyle, name], index) => ({
                    id:`demo-${index}`, name, lineStyle, customLine:'♡ · ✦ · ',
                    anchor:'a', position:'before', members:['a'], collapsible:true, collapsed:false,
                }));
                renderPromptManager();
            });
            const shot = async (selector, name) => page.locator(selector).screenshot({ path:path.join(process.env.PO_SCREENSHOTS, name) });
            await shot('#icon-preview', 'icon.png');
            await shot('#extensions_settings', 'settings.png');
            await shot('#completion_prompt_manager_list', 'styles.png');
            await page.evaluate(() => { activeTab = 'create'; openManager(); });
            await page.locator('.po-new-name').fill('캐릭터 설정');
            await page.locator('.po-line-style').selectOption('custom');
            await page.locator('.po-custom-line').fill('♡ · ✦ · ');
            await shot('.po-modal', 'create.png');
            await page.locator('[data-tab="saved"]').click();
            await page.locator('.po-saved-main').last().click();
            await page.locator('.po-edit-panel').last().scrollIntoViewIfNeeded();
            await shot('.po-saved-item:last-child', 'edit.png');
        }
        console.log('PASS: migration, independent launchers, create/edit, styles, escaping, fallback, copy, persistence, desktop/mobile layout.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
