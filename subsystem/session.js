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

// Hide private Tools navigation until the current password session is valid.
(function () {
  const SESSION_TTL_MS = 180000;

  function isLoggedIn() {
    const loginTime = Number(localStorage.getItem('loginTime'));
    return localStorage.getItem('isLoggedIn') === 'true'
      && Number.isFinite(loginTime)
      && Date.now() - loginTime <= SESSION_TTL_MS;
  }

  function clearExpiredSession() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('loginTime');
  }

  function updatePrivateNavigation() {
    const visible = isLoggedIn();
    if (!visible) clearExpiredSession();
    document.querySelectorAll('[data-subsystem-private]').forEach((item) => {
      item.hidden = !visible;
    });
  }

  window.subsystemSession = {
    isLoggedIn,
    updatePrivateNavigation
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updatePrivateNavigation);
  } else {
    updatePrivateNavigation();
  }
})();

// Keep the data pages usable when the Firebase ES module cannot load.
(function () {
  if (window.firebase) return;

  const databaseUrl = 'https://moneybase-bf6ec-default-rtdb.asia-southeast1.firebasedatabase.app';
  const database = { __rest: true };

  function makeUrl(path) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return `${databaseUrl}/${encodedPath}.json`;
  }

  function ref(_database, path) {
    return { path };
  }

  async function get(reference) {
    const response = await fetch(makeUrl(reference.path));
    if (!response.ok) throw new Error(`Firebase REST read failed: ${response.status}`);
    const value = await response.json();
    return {
      exists: () => value !== null && value !== undefined,
      val: () => value
    };
  }

  async function set(reference, value) {
    const response = await fetch(makeUrl(reference.path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
    if (!response.ok) throw new Error(`Firebase REST write failed: ${response.status}`);
  }

  function onValue(reference, callback) {
    get(reference).then(callback).catch((error) => console.error(error));
    return () => {};
  }

  window.firebase = { database, ref, get, set, onValue };
})();
