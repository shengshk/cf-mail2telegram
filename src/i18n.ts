export type UiLang = 'en' | 'zh' | 'tw';

export type I18nKey =
    | 'otp'
    | 'debug'
    | 'subject'
    | 'noSubject'
    | 'empty'
    | 'from'
    | 'to'
    | 'previewBtn'
    | 'webBtn'
    | 'mailboxBtn'
    | 'back'
    | 'delete'
    | 'summaryDisabled'
    | 'noContent'
    | 'previewTitle'
    | 'previewFrom'
    | 'previewTo'
    | 'noSubjectShort'
    | 'previewExpired'
    | 'previewLoading'
    | 'previewAuthRequired'
    | 'previewDenied'
    | 'openManager'
    | 'addressManager'
    | 'cmdCfmail'
    | 'cmdTest'
    | 'cmdPreviewMode'
    | 'testDenied'
    | 'testRateLimit'
    | 'testDone'
    | 'tmaTest'
    | 'tmaWhite'
    | 'tmaBlock'
    | 'yourChatId'
    | 'workerRoute'
    | 'workerRouteMissing'
    | 'tmaListMode'
    | 'tmaBlockList'
    | 'tmaWhiteList'
    | 'tmaTestAddress'
    | 'tmaAddress'
    | 'tmaType'
    | 'tmaAction'
    | 'tmaAdd'
    | 'tmaDelete'
    | 'tmaPlaceholderBlock'
    | 'tmaPlaceholderWhite'
    | 'tmaPlaceholderTest'
    | 'tmaSendMail'
    | 'tmaFrom'
    | 'tmaTo'
    | 'tmaSubject'
    | 'tmaText'
    | 'tmaSend'
    | 'webLinkExpired'
    | 'linkRemainLabel'
    | 'linkExpiredLabel'
    | 'durationDay'
    | 'durationHour'
    | 'durationMinute'
    | 'durationSecond'
    | 'previewModeCurrent'
    | 'previewModeMini'
    | 'previewModeWeb'
    | 'previewModeSwitchMini'
    | 'previewModeSwitchWeb'
    | 'previewModeWarn'
    | 'previewModeYes'
    | 'previewModeNo'
    | 'previewModeSetOk'
    | 'previewModeCancel'
    | 'previewModeAlready';

const en: Record<I18nKey, string> = {
    otp: 'OTP:',
    debug: 'Debug:',
    subject: 'Subject:',
    noSubject: 'No subject:',
    empty: '(empty)',
    from: 'From:',
    to: 'To:',
    previewBtn: 'Preview',
    webBtn: 'Web',
    mailboxBtn: 'Mailbox',
    back: 'Back',
    delete: 'Delete',
    summaryDisabled: 'Summary is disabled. Use the Preview button to open the original message.',
    noContent: 'No content',
    previewTitle: 'cf-mail2telegram preview',
    previewFrom: 'From:',
    previewTo: 'To:',
    noSubjectShort: '(no subject)',
    previewExpired: 'Preview not found or expired',
    previewLoading: 'Loading…',
    previewAuthRequired: 'Open this preview from the Telegram Mini App button.',
    previewDenied: 'Permission denied',
    openManager: 'Open Manager',
    addressManager: 'Address Manager',
    cmdCfmail: 'Show Chat ID, Worker URL, and list managers',
    cmdTest: 'Send a fake mail through TG UI (OTP extract, rate-limited)',
    cmdPreviewMode: 'Switch Preview button: Mini App or Web',
    testDenied: 'Not allowed.',
    testRateLimit: 'Too fast. Try again in {n}s.',
    testDone: 'Test mail sent (fake; no backup).',
    tmaTest: 'Test address rules',
    tmaWhite: 'Manage the white list',
    tmaBlock: 'Manage the block list',
    yourChatId: 'Your Chat ID is',
    workerRoute: 'Worker route is',
    workerRouteMissing: 'Worker route is not set. Open the Worker status page and tap the status text to run /init.',
    tmaListMode: 'List Mode',
    tmaBlockList: 'Block list',
    tmaWhiteList: 'White list',
    tmaTestAddress: 'Test',
    tmaAddress: 'address',
    tmaType: 'type',
    tmaAction: 'action',
    tmaAdd: 'Add',
    tmaDelete: 'Delete',
    tmaPlaceholderBlock: 'New block address regex',
    tmaPlaceholderWhite: 'New white address regex',
    tmaPlaceholderTest: 'Test',
    tmaSendMail: 'Send Mail',
    tmaFrom: 'From',
    tmaTo: 'To',
    tmaSubject: 'Subject',
    tmaText: 'Text',
    tmaSend: 'Send',
    webLinkExpired: 'This unauthenticated web link has expired or is invalid. If the mail is still cached, open Preview from the Telegram Mini App.',
    linkRemainLabel: 'Link expires in',
    linkExpiredLabel: 'Link expired',
    durationDay: 'd',
    durationHour: 'h',
    durationMinute: 'm',
    durationSecond: 's',
    previewModeCurrent: 'Current Preview mode: {mode}',
    previewModeMini: 'Mini App',
    previewModeWeb: 'Web',
    previewModeSwitchMini: 'Use Mini App',
    previewModeSwitchWeb: 'Use Web',
    previewModeWarn: 'Switch Preview to Web?\nUnauthenticated links can be forwarded and opened without Telegram login.\nWeb links expire after about 1 day (mail body may still be available via Mini App within the cache limit).\nContinue?',
    previewModeYes: 'Yes',
    previewModeNo: 'No',
    previewModeSetOk: 'Preview mode set to: {mode}\nOnly new mail messages are affected.',
    previewModeCancel: 'Cancelled.',
    previewModeAlready: 'Already using: {mode}',
};

const zh: Record<I18nKey, string> = {
    otp: '验证码：',
    debug: '调试：',
    subject: '主题：',
    noSubject: '无主题：',
    empty: '(空)',
    from: '发件人：',
    to: '收件人：',
    previewBtn: '预览',
    webBtn: '网页',
    mailboxBtn: '邮箱',
    back: '返回',
    delete: '删除',
    summaryDisabled: '摘要功能已关闭，请使用预览按钮查看原文。',
    noContent: '无内容',
    previewTitle: 'cf-mail2telegram 预览',
    previewFrom: '发件人：',
    previewTo: '收件人：',
    noSubjectShort: '(无主题)',
    previewExpired: '预览不存在或已过期',
    previewLoading: '加载中…',
    previewAuthRequired: '请从 Telegram「预览」小程序按钮打开。',
    previewDenied: '无权限',
    openManager: '打开管理',
    addressManager: '地址管理',
    cmdCfmail: '显示 Chat ID、Worker 地址与名单管理',
    cmdTest: '发送假信走 TG UI（含抽码，有频率限制）',
    cmdPreviewMode: '切换预览方式：小程序 / 网页',
    testDenied: '无权限。',
    testRateLimit: '操作过快，请 {n} 秒后再试。',
    testDone: '测试邮件已发送（假信，不会备份）。',
    tmaTest: '测试地址规则',
    tmaWhite: '管理白名单',
    tmaBlock: '管理黑名单',
    yourChatId: '你的 Chat ID 是',
    workerRoute: 'Worker路由是',
    workerRouteMissing: 'Worker 路由未设置。请打开 Worker 状态页并点击中间文字执行初始化。',
    tmaListMode: '名单模式',
    tmaBlockList: '黑名单',
    tmaWhiteList: '白名单',
    tmaTestAddress: '测试',
    tmaAddress: '地址',
    tmaType: '类型',
    tmaAction: '操作',
    tmaAdd: '添加',
    tmaDelete: '删除',
    tmaPlaceholderBlock: '新黑名单地址正则',
    tmaPlaceholderWhite: '新白名单地址正则',
    tmaPlaceholderTest: '测试',
    tmaSendMail: '发送邮件',
    tmaFrom: '发件人',
    tmaTo: '收件人',
    tmaSubject: '主题',
    tmaText: '正文',
    tmaSend: '发送',
    webLinkExpired: '未鉴权网页链接已失效或无效。若邮件仍在缓存中，请用 Telegram 小程序「预览」打开。',
    linkRemainLabel: '链接剩余有效时间',
    linkExpiredLabel: '链接已失效',
    durationDay: '天',
    durationHour: '小时',
    durationMinute: '分钟',
    durationSecond: '秒',
    previewModeCurrent: '当前预览方式：{mode}',
    previewModeMini: '小程序',
    previewModeWeb: '网页',
    previewModeSwitchMini: '使用小程序',
    previewModeSwitchWeb: '使用网页',
    previewModeWarn: '切换预览方式为网页形式？\n存在安全风险：链接可转发，无需 Telegram 登录即可打开。\n未鉴权链接约 1 天后失效（正文在缓存上限内仍可通过小程序查看）。\n是否继续？',
    previewModeYes: '是',
    previewModeNo: '否',
    previewModeSetOk: '预览方式已设为：{mode}\n仅影响之后的新邮件。',
    previewModeCancel: '已取消。',
    previewModeAlready: '已经是：{mode}',
};

const tw: Record<I18nKey, string> = {
    otp: '驗證碼：',
    debug: '除錯：',
    subject: '主旨：',
    noSubject: '無主旨：',
    empty: '(空)',
    from: '寄件者：',
    to: '收件者：',
    previewBtn: '預覽',
    webBtn: '網頁',
    mailboxBtn: '信箱',
    back: '返回',
    delete: '刪除',
    summaryDisabled: '摘要功能已關閉，請使用預覽按鈕查看原文。',
    noContent: '無內容',
    previewTitle: 'cf-mail2telegram 預覽',
    previewFrom: '寄件者：',
    previewTo: '收件者：',
    noSubjectShort: '(無主旨)',
    previewExpired: '預覽不存在或已過期',
    previewLoading: '載入中…',
    previewAuthRequired: '請從 Telegram「預覽」小程式按鈕開啟。',
    previewDenied: '無權限',
    openManager: '開啟管理',
    addressManager: '地址管理',
    cmdCfmail: '顯示 Chat ID、Worker 地址與名單管理',
    cmdTest: '傳送假信走 TG UI（含抽碼，有頻率限制）',
    cmdPreviewMode: '切換預覽方式：小程式 / 網頁',
    testDenied: '無權限。',
    testRateLimit: '操作過快，請 {n} 秒後再試。',
    testDone: '測試郵件已傳送（假信，不會備份）。',
    tmaTest: '測試地址規則',
    tmaWhite: '管理白名單',
    tmaBlock: '管理黑名單',
    yourChatId: '你的 Chat ID 是',
    workerRoute: 'Worker路由是',
    workerRouteMissing: 'Worker 路由未設定。請開啟 Worker 狀態頁並點擊中間文字執行初始化。',
    tmaListMode: '名單模式',
    tmaBlockList: '黑名單',
    tmaWhiteList: '白名單',
    tmaTestAddress: '測試',
    tmaAddress: '地址',
    tmaType: '類型',
    tmaAction: '操作',
    tmaAdd: '新增',
    tmaDelete: '刪除',
    tmaPlaceholderBlock: '新黑名單地址正規表示式',
    tmaPlaceholderWhite: '新白名單地址正規表示式',
    tmaPlaceholderTest: '測試',
    tmaSendMail: '傳送郵件',
    tmaFrom: '寄件者',
    tmaTo: '收件者',
    tmaSubject: '主旨',
    tmaText: '正文',
    tmaSend: '傳送',
    webLinkExpired: '未鑑權網頁連結已失效或無效。若郵件仍在快取中，請用 Telegram 小程式「預覽」開啟。',
    linkRemainLabel: '連結剩餘有效時間',
    linkExpiredLabel: '連結已失效',
    durationDay: '天',
    durationHour: '小時',
    durationMinute: '分鐘',
    durationSecond: '秒',
    previewModeCurrent: '目前預覽方式：{mode}',
    previewModeMini: '小程式',
    previewModeWeb: '網頁',
    previewModeSwitchMini: '使用小程式',
    previewModeSwitchWeb: '使用網頁',
    previewModeWarn: '切換預覽方式為網頁形式？\n存在安全風險：連結可轉發，無需 Telegram 登入即可開啟。\n未鑑權連結約 1 天後失效（正文在快取上限內仍可透過小程式查看）。\n是否繼續？',
    previewModeYes: '是',
    previewModeNo: '否',
    previewModeSetOk: '預覽方式已設為：{mode}\n僅影響之後的新郵件。',
    previewModeCancel: '已取消。',
    previewModeAlready: '已經是：{mode}',
};

const catalog: Record<UiLang, Record<I18nKey, string>> = { en, zh, tw };

export function resolveUiLang(env: { UI_LANG?: string }): UiLang {
    const raw = (env.UI_LANG || 'en').trim().toLowerCase().replace(/_/g, '-');
    if (raw === 'tw' || raw === 'zh-tw' || raw === 'zh-hant' || raw === 'zh-hk' || raw === 'zh-mo') {
        return 'tw';
    }
    if (raw === 'zh' || raw === 'zh-cn' || raw === 'zh-hans' || raw === 'zh-sg') {
        return 'zh';
    }
    return 'en';
}

/** BCP 47 tag for <html lang> */
export function htmlLang(lang: UiLang): string {
    if (lang === 'zh') {
        return 'zh-CN';
    }
    if (lang === 'tw') {
        return 'zh-TW';
    }
    return 'en';
}

export function t(lang: UiLang, key: I18nKey): string {
    return catalog[lang][key] || catalog.en[key] || key;
}

/** Strings injected into tma.html */
export function tmaI18nPayload(lang: UiLang): Record<string, string> {
    return {
        listMode: t(lang, 'tmaListMode'),
        blockList: t(lang, 'tmaBlockList'),
        whiteList: t(lang, 'tmaWhiteList'),
        testAddress: t(lang, 'tmaTestAddress'),
        address: t(lang, 'tmaAddress'),
        type: t(lang, 'tmaType'),
        action: t(lang, 'tmaAction'),
        add: t(lang, 'tmaAdd'),
        delete: t(lang, 'tmaDelete'),
        test: t(lang, 'tmaTestAddress'),
        placeholderBlock: t(lang, 'tmaPlaceholderBlock'),
        placeholderWhite: t(lang, 'tmaPlaceholderWhite'),
        placeholderTest: t(lang, 'tmaPlaceholderTest'),
        sendMail: t(lang, 'tmaSendMail'),
        from: t(lang, 'tmaFrom'),
        to: t(lang, 'tmaTo'),
        subject: t(lang, 'tmaSubject'),
        text: t(lang, 'tmaText'),
        send: t(lang, 'tmaSend'),
        previewTitle: t(lang, 'previewTitle'),
        previewFrom: t(lang, 'previewFrom'),
        previewTo: t(lang, 'previewTo'),
        previewLoading: t(lang, 'previewLoading'),
        previewExpired: t(lang, 'previewExpired'),
        previewDenied: t(lang, 'previewDenied'),
        previewAuthRequired: t(lang, 'previewAuthRequired'),
    };
}
