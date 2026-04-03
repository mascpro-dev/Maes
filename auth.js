/* Aura — sessão simples (front-end) para login / dashboard */
(function () {
  'use strict';

  var KEY = 'aura_auth';
  var PROFILE_KEY = 'aura_user_profile';

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

  function getProfile() {
    try {
      var raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return {};
      var o = JSON.parse(raw);
      return typeof o === 'object' && o !== null ? o : {};
    } catch (e) {
      return {};
    }
  }

  function saveProfile(partial) {
    try {
      var cur = getProfile();
      Object.keys(partial).forEach(function (k) {
        if (partial[k] !== undefined) cur[k] = partial[k];
      });
      localStorage.setItem(PROFILE_KEY, JSON.stringify(cur));
    } catch (e) { /* ignore */ }
  }

  function initialsFromNome(nome) {
    if (!nome || !String(nome).trim()) return 'AU';
    var parts = String(nome).trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      var a = parts[0][0] || '';
      var b = parts[1][0] || '';
      return (a + b).toUpperCase();
    }
    return String(nome).trim().slice(0, 2).toUpperCase();
  }

  window.AuraAuth = {
    isLoggedIn: isLoggedIn,
    setLoggedIn: setLoggedIn,
    clearAuth: clearAuth,
    getProfile: getProfile,
    saveProfile: saveProfile,
    initialsFromNome: initialsFromNome,
    logout: function () {
      clearAuth();
      window.location.replace('login.html');
    },
    requireAuth: function () {
      if (!isLoggedIn()) window.location.replace('login.html');
    }
  };
})();
