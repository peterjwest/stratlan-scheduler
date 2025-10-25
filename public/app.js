const pointsTypeRadios = Array.from(document.querySelectorAll('[data-points-type]'));
const pointsPlayerField = document.querySelector('[data-player-field]');
const pointsPlayerInput = document.querySelector('[data-player-input]');

if (pointsTypeRadios.length && pointsPlayerField) {
    for (const pointsTypeRadio of pointsTypeRadios) {
        pointsTypeRadio.addEventListener('change', (event) => {
            const isPlayer = event.target.value === 'Player';
            pointsPlayerField.classList[isPlayer ? 'remove' : 'add']('hidden');
            pointsPlayerInput.required = isPlayer ? 'required' : undefined;
            if (!isPlayer) {
                pointsPlayerInput.value = '';
            }
        });
    }
}

const menuButtons = document.querySelectorAll('[data-menu]');
const navigation = document.querySelector('nav');

for (const menuButton of menuButtons) {
    menuButton.addEventListener('click', () => {
        navigation.classList.toggle('hidden');
    });
}

const userMenu = document.querySelector('[data-user-menu]');

if (userMenu) {
    userMenu.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    document.addEventListener('click', () => {
        userMenu.classList.add('hidden');
        userMenuButton.classList.add('rounded-b');
        userMenuButton.classList.remove('bg-highlight');
    });

    const userMenuButton = document.querySelector('[data-user-menu-button]');
    if (userMenuButton) {
        userMenuButton.addEventListener('click', (event) => {
            event.stopPropagation();
            userMenu.classList.toggle('hidden');
            userMenuButton.classList.toggle('rounded-b');
            userMenuButton.classList.toggle('bg-highlight');
        });
    }
}

function getPrevSiblings(element) {
    var siblings = [];
    while (element = element.previousElementSibling) {
       siblings.push(element)
    }
    return siblings;
}

function getNextSiblings(element) {
    var siblings = [];
    while (element = element.nextElementSibling) {
       siblings.push(element)
    }
    return siblings;
}

function getPrevItem(element) {
    return getFirstItem(getPrevSiblings(element));
}

function getNextItem(element) {
    return getFirstItem(getNextSiblings(element));
}

function getFirstItem(items) {
    return items.find((sibling) => !sibling.classList.contains('hidden'));
}

const dropdowns = Array.from(document.querySelectorAll('[data-dropdown]'));
for (const dropdown of dropdowns) {
    const button = dropdown.querySelector('[data-dropdown-button');
    const menu = dropdown.querySelector('[data-dropdown-menu');
    const filter = dropdown.querySelector('[data-dropdown-filter');
    const items = Array.from(dropdown.querySelectorAll('[data-dropdown-item]'));
    const input = dropdown.querySelector('[data-dropdown-input]');
    const selected = dropdown.querySelector('[data-dropdown-selected]');

    function filterItems() {
        const terms = filter.value.trim().toLowerCase().split(/\s+/);
        items.forEach((item) => {
            const itemValue = item.textContent.toLowerCase()
            const match = terms.length === 0 || !terms.find((term) => !itemValue.includes(term));
            item.classList.toggle('hidden', !match);
        });
    }

    function closeMenu() {
        if (!menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
            filter.value = '';
            filterItems();
            button.focus();
        }
    }

    function selectOption(element) {
        const id = element.getAttribute('data-value');
        input.value = id;
        input.dispatchEvent(new Event('change'));
        selected.textContent = input.options[input.selectedIndex].textContent;
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
            const previousItem = getPrevItem(document.activeElement) || filter;
            previousItem.focus();
            event.preventDefault();
        }

        if (event.key === 'ArrowDown') {
            const nextItem = document.activeElement === filter ? getFirstItem(items) : getNextItem(document.activeElement);
            if (nextItem) nextItem.focus();
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
                selectOption(event.currentTarget);
            }
        })

        item.addEventListener('click', (event) => {
            closeMenu();
            selectOption(event.currentTarget);
        })
    }

    document.addEventListener('click', closeMenu);
}

const header = document.querySelector('.header');
const fullscreenHeading = document.querySelector('.fullscreen-heading');
const fullscreenMatch = window.matchMedia('(display-mode: fullscreen)');

function updateFullscreen(matches) {
    if (navigation) navigation.classList.toggle('md:hidden', matches);
    if (header) header.classList.toggle('hidden', matches);
    if (fullscreenHeading) fullscreenHeading.classList.toggle('hidden', !matches);
}

fullscreenMatch.addEventListener('change', ({ matches }) => updateFullscreen(matches));
updateFullscreen(fullscreenMatch.matches);

const ONE_DAY = 24 * 60 * 60 * 1000;

function setCookie(name, value) {
    const date = new Date();
    date.setTime(date.getTime() + ONE_DAY);
    document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
}

const loginButtons = Array.from(document.querySelectorAll('[data-login]'));
loginButtons.forEach((loginButton) => {
    loginButton.addEventListener('click', () => {
        setCookie('login-redirect', window.location.pathname);
    });
});

const lanSelect = document.querySelector('[data-lan-select]');
if (lanSelect) {
    const input = document.querySelector('[data-dropdown-input]');
    input.addEventListener('change', () => {
        setCookie('selected-lan', input.value);
        window.location.reload();
    });
}
