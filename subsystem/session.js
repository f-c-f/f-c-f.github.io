(function () {
  const memory = Object.create(null);
  const persistentKeys = new Set(['isLoggedIn', 'loginTime']);

  function readCookie(key) {
    const prefix = `subsystem_${encodeURIComponent(key)}=`;
    const item = document.cookie.split('; ').find((value) => value.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : null;
  }

  function writeCookie(key, value) {
    if (!persistentKeys.has(key)) return;
    document.cookie = `subsystem_${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; Max-Age=1800; SameSite=Lax`;
  }

  function removeCookie(key) {
    if (!persistentKeys.has(key)) return;
    document.cookie = `subsystem_${encodeURIComponent(key)}=; Path=/; Max-Age=0; SameSite=Lax`;
  }

  const fallbackStorage = {
    getItem(key) {
      if (Object.prototype.hasOwnProperty.call(memory, key)) return memory[key];
      return readCookie(key);
    },
    setItem(key, value) {
      memory[key] = String(value);
      writeCookie(key, memory[key]);
    },
    removeItem(key) {
      delete memory[key];
      removeCookie(key);
    }
  };

  try {
    if (!window.localStorage) {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: fallbackStorage
      });
    }
  } catch (error) {
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: fallbackStorage
      });
    } catch (_) {
      // Keep the page usable when the browser forbids defining storage.
    }
  }
})();
