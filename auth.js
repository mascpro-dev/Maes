/* Aura — sessão simples (front-end) para login / dashboard */
(function () {
  'use strict';

  var KEY = 'aura_auth';

  function isLoggedIn() {
    try {
      return localStorage.getItem(KEY) === '1' || sessionStorage.getItem(KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setLoggedIn(remember) {
    try {
      if (remember) {
        localStorage.setItem(KEY, '1');
        sessionStorage.removeItem(KEY);
      } else {
        sessionStorage.setItem(KEY, '1');
        localStorage.removeItem(KEY);
      }
    } catch (e) { /* quota / private mode */ }
  }

  function clearAuth() {
    try {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
  }

  window.AuraAuth = {
    isLoggedIn: isLoggedIn,
    setLoggedIn: setLoggedIn,
    clearAuth: clearAuth,
    logout: function () {
      clearAuth();
      window.location.replace('login.html');
    },
    requireAuth: function () {
      if (!isLoggedIn()) window.location.replace('login.html');
    }
  };
})();
