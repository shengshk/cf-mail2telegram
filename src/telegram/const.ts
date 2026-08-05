import type { UiLang } from '../i18n';
import { t } from '../i18n';

export function telegramCommands(lang: UiLang) {
    return [
        {
            command: 'cfmail',
            description: t(lang, 'cmdCfmail'),
        },
        {
            command: 'test',
            description: t(lang, 'cmdTest'),
        },
    ];
}
