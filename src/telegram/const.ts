import type { UiLang } from '../i18n';
import { t } from '../i18n';

export function tmaModeDescription(lang: UiLang): { [key: string]: string } {
    return {
        test: t(lang, 'tmaTest'),
        white: t(lang, 'tmaWhite'),
        block: t(lang, 'tmaBlock'),
    };
}

export function telegramCommands(lang: UiLang) {
    const modes = tmaModeDescription(lang);
    return [
        {
            command: 'id',
            description: t(lang, 'cmdId'),
        },
        {
            command: 'test',
            description: `/test - ${modes.test}`,
        },
        {
            command: 'white',
            description: `/white - ${modes.white}`,
        },
        {
            command: 'block',
            description: `/block - ${modes.block}`,
        },
    ];
}
