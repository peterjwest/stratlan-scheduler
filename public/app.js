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

const userMenuButton = document.querySelector('[data-user-menu-button]');
const userMenu = document.querySelector('[data-user-menu]');
const userMenuWrapper = document.querySelector('data-user-menu-wrapper');

userMenuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    userMenu.classList.toggle('hidden');
});

document.addEventListener('click', () => {
    userMenu.classList.add('hidden');
});

userMenu.addEventListener('click', (event) => {
    event.stopPropagation();
});
