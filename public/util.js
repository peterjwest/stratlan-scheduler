const ONE_DAY = 24 * 60 * 60 * 1000;

export function setCookie(name, value, lifetime = ONE_DAY) {
    const date = new Date();
    date.setTime(date.getTime() + lifetime);
    document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
}
