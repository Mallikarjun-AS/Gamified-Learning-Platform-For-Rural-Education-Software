class TranslationManager {
    constructor() {
        this.currentLang = window.CURRENT_LANG || 'en';
        this.originalTexts = new Map();
        this.pageUrl = window.location.pathname;
        this.isTranslating = false;
        this.init();
    }

    async init() {
        try {
            const response = await fetch('/get-language');
            const data = await response.json();
            this.currentLang = data.language;

            const select = document.getElementById('language-select');
            if (select) {
                select.value = this.currentLang;
            }

            await this.saveOriginalTexts();

            if (this.currentLang !== 'en') {
                await this.translatePage(this.currentLang);
            }
        } catch (error) {
            console.error('Failed to initialize translation:', error);
        }
    }

    async saveOriginalTexts() {
        const elements = this.getTranslatableElements();
        const texts = elements.map(el => el.textContent.trim());

        this.originalTexts.set(this.pageUrl, texts);

        try {
            await fetch('/save-original-texts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page_url: this.pageUrl,
                    texts: texts
                })
            });
        } catch (error) {
            console.error('Failed to save original texts:', error);
        }
    }

    async changeLanguage(lang) {
        if (lang === this.currentLang || this.isTranslating) return;

        this.isTranslating = true;
        this.showLoading();
        this.currentLang = lang;

        try {
            await fetch(`/set-language/${lang}`);

            await this.translatePage(lang);

            const languageNames = {
                'en': 'English',
                'kn': 'Kannada',
                'hi': 'Hindi',
                'ml': 'Malayalam'
            };
            notificationSystem.success(`Language changed to ${languageNames[lang]}!`);

        } catch (error) {
            console.error('Language change failed:', error);
            this.hideLoading();
            this.isTranslating = false;

            const select = document.getElementById('language-select');
            if (select) {
                select.value = this.currentLang;
            }
            notificationSystem.error('Failed to change language');
        }
    }

    async translatePage(lang) {
        const elements = this.getTranslatableElements();

        if (lang === 'en') {
            this.restoreEnglishTexts(elements);
            this.hideLoading();
            this.isTranslating = false;
        } else {
            await this.translateToOtherLanguage(elements, lang);
        }
    }

    restoreEnglishTexts(elements) {
        const originalTexts = this.originalTexts.get(this.pageUrl);
        if (originalTexts && originalTexts.length === elements.length) {
            elements.forEach((element, index) => {
                if (originalTexts[index] && element.textContent !== originalTexts[index]) {
                    element.textContent = originalTexts[index];
                }
            });
        }
    }

    async translateToOtherLanguage(elements, lang) {
        const texts = elements.map(el => el.textContent.trim());

        try {
            this.updateLoadingText(lang);

            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    texts: texts,
                    lang: lang,
                    page_url: this.pageUrl
                })
            });

            const data = await response.json();

            if (data.translations) {
                this.updateElements(elements, data.translations);
            }
        } catch (error) {
            console.error('Translation failed:', error);
            notificationSystem.error('Translation failed. Please try again.');
        } finally {
            this.hideLoading();
            this.isTranslating = false;
        }
    }

    updateLoadingText(lang) {
        const languageNames = {
            'en': 'English',
            'kn': 'Kannada',
            'hi': 'Hindi',
            'ml': 'Malayalam'
        };

        const loadingText = document.querySelector('.spinner-text');
        if (loadingText) {
            loadingText.textContent = `Translating to ${languageNames[lang]}...`;
        }
    }

    getTranslatableElements() {
        return Array.from(document.querySelectorAll('[data-translate]'));
    }

    updateElements(elements, translations) {
        elements.forEach((element, index) => {
            if (translations[index] && translations[index] !== element.textContent) {
                element.textContent = translations[index];
            }
        });
    }

    showLoading() {
        const overlay = document.getElementById('loadingOverlay');
        const spinner = document.getElementById('loadingSpinner');
        if (overlay) overlay.style.display = 'block';
        if (spinner) spinner.style.display = 'block';

        const select = document.getElementById('language-select');
        if (select) select.disabled = true;

        document.body.style.pointerEvents = 'none';
        document.body.style.userSelect = 'none';
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        const spinner = document.getElementById('loadingSpinner');
        if (overlay) overlay.style.display = 'none';
        if (spinner) spinner.style.display = 'none';

        const select = document.getElementById('language-select');
        if (select) select.disabled = false;

        document.body.style.pointerEvents = 'auto';
        document.body.style.userSelect = 'auto';

        const loadingText = document.querySelector('.spinner-text');
        if (loadingText && loadingText.dataset.translate) {
            loadingText.textContent = 'Translating content...';
        }
    }

    async translateGameTexts(texts, lang) {
        try {
            const response = await fetch('/api/game-translations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    texts: texts,
                    lang: lang,
                    page_url: '/game'
                })
            });
            const data = await response.json();
            return data.translations || texts;
        } catch (error) {
            console.error('Game translation failed:', error);
            return texts;
        }
    }
}

let translationManager;

document.addEventListener('DOMContentLoaded', function() {
    translationManager = new TranslationManager();

    let lastLanguageChange = 0;
    const languageSelect = document.getElementById('language-select');

    if (languageSelect) {
        languageSelect.addEventListener('change', function() {
            const now = Date.now();
            if (now - lastLanguageChange < 2000) {
                this.value = translationManager.currentLang;
                return;
            }
            lastLanguageChange = now;

            translationManager.changeLanguage(this.value);
        });
    }
});

window.translationManager = translationManager;