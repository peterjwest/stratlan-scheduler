import * as Sentry from "@sentry/browser";

import '../css/style.css';
import { setCookie, assertExists } from './util.js';

Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.MODE });

const pointsForm = document.querySelector<HTMLFormElement>('[data-points-form]');
if (pointsForm) {
    const pointsTeamRadios = Array.from(pointsForm.querySelectorAll<HTMLInputElement>('[data-points-team]'));
    const pointsTypeInput = assertExists(pointsForm.querySelector<HTMLInputElement>('[data-points-type]'));
    const pointsPlayerField = assertExists(pointsForm.querySelector<HTMLElement>('[data-player-field]'));
    const pointsPlayerInput = assertExists(pointsForm.querySelector<HTMLInputElement>('[data-player-input]'));

    if (pointsTeamRadios.length > 0) {
        for (const pointsTypeRadio of pointsTeamRadios) {
            pointsTypeRadio.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                const isPlayer = target.value === '';
                pointsPlayerField.classList[isPlayer ? 'remove' : 'add']('hidden');
                pointsPlayerInput.required = isPlayer;
                pointsTypeInput.value = isPlayer ? 'player' : 'team';
                if (!isPlayer) {
                    pointsPlayerInput.value = '';
                }
            });
        }
    }
}

const eventGameInput = document.querySelector<HTMLInputElement>('[data-event-game] [data-player-input]');
const eventPoints = document.querySelector<HTMLElement>('[data-event-points]');

if (eventGameInput && eventPoints) {
    const eventPointsInput = assertExists(eventPoints.querySelector<HTMLInputElement>('[data-event-points-input]'));
    eventGameInput.addEventListener('change', () => {
        const hasGame = Boolean(eventGameInput.value);
        eventPoints.classList[hasGame ? 'remove' : 'add']('hidden');
        if (!hasGame && eventPointsInput) {
            eventPointsInput.value = '0';
        }
    });
}

const menuButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-menu]'));
const navigation = assertExists(document.querySelector<HTMLElement>('nav'));

for (const menuButton of menuButtons) {
    menuButton.addEventListener('click', () => {
        navigation.classList.toggle('hidden');
    });
}

const userMenu = document.querySelector<HTMLElement>('[data-user-menu]');

if (userMenu) {
    const userMenuButton = assertExists(document.querySelector<HTMLElement>('[data-user-menu-button]'));

    userMenu.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    document.addEventListener('click', () => {
        userMenu.classList.add('hidden');
        userMenuButton.classList.add('rounded-b');
        userMenuButton.classList.remove('bg-highlight');
    });

    userMenuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        userMenu.classList.toggle('hidden');
        userMenuButton.classList.toggle('rounded-b');
        userMenuButton.classList.toggle('bg-highlight');
    });
}

function getPrevSiblings(element: Element): Element[] {
    const siblings: Element[] = [];
    let current: Element | null = element.previousElementSibling;
    while (current) {
        siblings.push(current);
        current = current.previousElementSibling;
    }
    return siblings;
}

function getNextSiblings(element: Element): Element[] {
    const siblings: Element[] = [];
    let current: Element | null = element.nextElementSibling;
    while (current) {
        siblings.push(current);
        current = current.nextElementSibling;
    }
    return siblings;
}

function getPrevItem(element: Element): Element | undefined {
    return getFirstItem(getPrevSiblings(element));
}

function getNextItem(element: Element): Element | undefined {
    return getFirstItem(getNextSiblings(element));
}

function getFirstItem(items: Element[]): Element | undefined {
    return items.find((sibling) => !sibling.classList.contains('hidden'));
}

const dropdowns = Array.from(document.querySelectorAll<HTMLElement>('[data-dropdown]'));
for (const dropdown of dropdowns) {
    const button = assertExists(dropdown.querySelector<HTMLElement>('[data-dropdown-button]'));
    const menu = assertExists(dropdown.querySelector<HTMLElement>('[data-dropdown-menu]'));
    const filter = assertExists(dropdown.querySelector<HTMLInputElement>('[data-dropdown-filter]'));
    const items = Array.from(dropdown.querySelectorAll<HTMLElement>('[data-dropdown-item]'));
    const input = assertExists(dropdown.querySelector<HTMLSelectElement>('[data-dropdown-input]'));
    const selected = assertExists(dropdown.querySelector<HTMLElement>('[data-dropdown-selected]'));

    function filterItems(): void {
        const terms = filter.value.trim().toLowerCase().split(/\s+/);
        items.forEach((item) => {
            const itemValue = item.textContent?.toLowerCase() || '';
            const match = terms.length === 0 || !terms.find((term) => !itemValue.includes(term));
            item.classList.toggle('hidden', !match);
        });
    }

    function closeMenu(): void {
        if (!menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
            filter.value = '';
            filterItems();
            button.focus();
        }
    }

    function selectOption(id: string): void {
        input.value = id;
        input.dispatchEvent(new Event('change'));
        const option = input.options[input.selectedIndex];
        selected.textContent = option?.textContent || selected.getAttribute('data-placeholder') || '';
    }

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (menu.classList.contains('hidden')) {
            menu.classList.remove('hidden');
        } else {
            closeMenu();
        }
        filter.focus();
    });

    menu.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
    });

    menu.addEventListener('keydown', (event) => {
        if (menu.classList.contains('hidden')) return;

        if (event.key === 'Escape') {
            filter.value = '';
            closeMenu();
            event.preventDefault();
        }

        if (event.key === 'ArrowUp') {
            const previousItem = getPrevItem(document.activeElement || document.body) || filter;
            (previousItem as HTMLElement).focus();
            event.preventDefault();
        }

        if (event.key === 'ArrowDown') {
            const nextItem = document.activeElement === filter ? getFirstItem(items) : getNextItem(document.activeElement || document.body);
            if (nextItem) (nextItem as HTMLElement).focus();
            event.preventDefault();
        }

        if (event.key === 'Tab') {
            closeMenu();
            if (event.shiftKey) event.preventDefault();
        }
    });

    filter.addEventListener('keyup', filterItems);

    for (const item of items) {
        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                closeMenu();
                const value = item.getAttribute('data-value');
                if (value) selectOption(value);
            }
        });

        item.addEventListener('click', () => {
            closeMenu();
            const value = item.getAttribute('data-value');
            if (value) selectOption(value);
        });
    }

    if (input.form) {
        input.form.addEventListener('reset', () => {
            closeMenu();
            setTimeout(() => selectOption(input.value), 0);
        });
    }

    document.addEventListener('click', closeMenu);
}

const header = assertExists(document.querySelector<HTMLElement>('header'));
const footer = assertExists(document.querySelector<HTMLElement>('footer'));
const fullscreenHeading = assertExists(document.querySelector<HTMLElement>('.fullscreen-heading'));
const fullscreenMatch = window.matchMedia('(display-mode: fullscreen)');
let isFullscreen = false;

function updateFullscreen(matches: boolean): void {
    isFullscreen = matches;
    navigation.classList.toggle('md:hidden', matches);
    header.classList.toggle('hidden', matches);
    footer.classList.toggle('hidden', matches);
    fullscreenHeading.classList.toggle('hidden', !matches);
    for (const control of Array.from(document.querySelectorAll<HTMLElement>('[data-control]'))) {
        control.classList.toggle('hidden', matches);
    }
}

const urlParams = new URLSearchParams(window.location.search);
const fullscreenOverride = urlParams.get('fullscreen') === 'true';

if (fullscreenOverride) {
    isFullscreen = true;
    updateFullscreen(isFullscreen);
} else {
    fullscreenMatch.addEventListener('change', ({ matches }) => updateFullscreen(matches));
    updateFullscreen(fullscreenMatch.matches);
}

const loginButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-login]'));
loginButtons.forEach((loginButton) => {
    loginButton.addEventListener('click', () => {
        setCookie('login-redirect', window.location.pathname);
    });
});

const lanSelects = Array.from(document.querySelectorAll<HTMLElement>('[data-lan-select]'));
lanSelects.forEach((lanSelect) => {
    const input = assertExists(lanSelect.querySelector<HTMLSelectElement>('[data-dropdown-input]'));
    input.addEventListener('change', () => {
        setCookie('selected-lan', input.value);
        window.location.reload();
    });
});

const datetimes = Array.from(document.querySelectorAll<HTMLElement>('[data-datetime]'));
datetimes.forEach((datetime) => {
    const input = assertExists(datetime.querySelector<HTMLInputElement>('[data-datetime-input]'));
    const setButton = assertExists(datetime.querySelector<HTMLElement>('[data-datetime-set]'));
    const clearButton = assertExists(datetime.querySelector<HTMLElement>('[data-datetime-clear]'));
    setButton.addEventListener('click', () => {
        input.value = new Date().toISOString().slice(0, 16);
    });
    clearButton.addEventListener('click', () => {
        input.value = '';
    });
});

const printButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-print-button]'));
printButtons.forEach((printButton) => {
    printButton.addEventListener('click', (event) => {
        event.preventDefault();
        window.print();
    });
});

const printSelect = document.querySelector<HTMLElement>('[data-print-select]');
if (printSelect) {
    const codeCheckboxes = Array.from(printSelect.querySelectorAll<HTMLInputElement>('[data-print-select-checkbox]'));
    const selectAllCheckbox = assertExists(printSelect.querySelector<HTMLInputElement>('[data-print-select-all-checkbox]'));
    const codes = Array.from(document.querySelectorAll<HTMLElement>('[data-print-code]'));

    const printButton = assertExists(printSelect.querySelector<HTMLButtonElement>('[data-print-button]'));
    const selectedCodeCount = assertExists(printSelect.querySelector<HTMLElement>('[data-print-select-count]'));
    const selectedCodes: Record<string, boolean> = {};

    function updatePrintSelectCheckbox(checkbox: HTMLInputElement): void {
        selectedCodes[checkbox.value] = checkbox.checked;
        const count = Object.values(selectedCodes).filter((checked) => checked).length;
        selectedCodeCount.textContent = `(${count})`;
        printButton.disabled = count === 0;
        selectAllCheckbox.checked = count === codeCheckboxes.length;

        const code = codes.find((code) => code.dataset.printCode === checkbox.value);
        if (code) {
            code.classList.toggle('hidden', !checkbox.checked);
        }
    }

    codeCheckboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', () => updatePrintSelectCheckbox(checkbox));
    });

    setTimeout(() => codeCheckboxes.forEach(updatePrintSelectCheckbox), 100);

    selectAllCheckbox.addEventListener('change', () => {
        codeCheckboxes.forEach((checkbox) => {
            checkbox.checked = selectAllCheckbox.checked;
            selectedCodes[checkbox.value] = selectAllCheckbox.checked;
        });

        const count = selectAllCheckbox.checked ? codeCheckboxes.length : 0;
        selectedCodeCount.textContent = `(${count})`;
        printButton.disabled = count === 0;

        codes.forEach((code) => {
            code.classList.toggle('hidden', !selectAllCheckbox.checked);
        });
    });
}

const dialogButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-dialog-button]'));
for (const dialogButton of dialogButtons) {
    const dialog = assertExists(dialogButton.querySelector<HTMLDialogElement>('dialog'));
    const dialogContent = assertExists(dialogButton.querySelector<HTMLElement>('[data-dialog-content]'));

    dialogButton.addEventListener('click', () => {
        dialog.show();
    });
    dialogButton.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') dialog.show();
    });
    dialog.addEventListener('click', (event) => {
        event.stopPropagation();
        dialog.close();
    });
    dialogContent.addEventListener('click', (event) => {
        event.stopPropagation();
    });
}

const SCHEDULE_UPDATE_PERIOD = 60 * 1000;
const schedule = document.querySelector<HTMLElement>('[data-schedule]');
if (schedule) {
    setInterval(() => {
        if (isFullscreen) {
            window.location.reload();
        }
    }, SCHEDULE_UPDATE_PERIOD);
}

const confirmButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-confirm]'));
for (const confirmButton of confirmButtons) {
    confirmButton.addEventListener('click', (event) => {
        if (!window.confirm('Are you sure?')) {
            event.preventDefault();
        }
    });
}

const scoreContainers = Array.from(document.querySelectorAll<HTMLElement>('[data-team-score]'));
if (scoreContainers.length) {
    const { renderTeamScore } = await import('./dashboard.js');
    scoreContainers.forEach(renderTeamScore);
}

// TODO: Rename since these are not just for hidden codes
const hiddenCodes = Array.from(document.querySelectorAll<HTMLElement>('[data-hidden-code]'));
if (hiddenCodes.length) {
    const QRCode = await import('qrcode');
    hiddenCodes.forEach((element) => {
        const canvas = document.createElement('canvas');
        element.appendChild(canvas);
        const options = { margin: 1, width: Number(element.dataset.hiddenCodeSize) };
        QRCode.toCanvas(canvas, element.dataset.hiddenCode || '', options, (error) => {
            if (error) console.error(error);
            canvas.style.width = '100%';
            canvas.style.height = '100%';
        });
    });
}
