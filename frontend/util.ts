const ONE_DAY = 24 * 60 * 60 * 1000;

export function setCookie(name: string, value: string | number, lifetime: number = ONE_DAY): void {
    const date = new Date();
    date.setTime(date.getTime() + lifetime);
    document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
}

export function assertExists<Type>(value: Type | undefined | null): Type {
    if (value === null || value === undefined) {
        throw new Error('Expected value to not be null or undefined');
    }
    return value;
}
