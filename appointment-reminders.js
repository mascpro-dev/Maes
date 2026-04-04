/**
 * Lembretes no browser ~15 min antes dos compromissos com remind15 (requer permissão de notificação).
 */
(function (global) {
  'use strict';

  var timeouts = [];

  function clearTimers() {
    timeouts.forEach(function (id) {
      clearTimeout(id);
    });
    timeouts = [];
  }

  function prefix(kind) {
    if (kind === 'medicine') return 'Daqui a 15 min — remédio';
    if (kind === 'doctor') return 'Daqui a 15 min — consulta';
    return 'Daqui a 15 min';
  }

  function refresh() {
    clearTimers();
    if (!global.AuraAppointments || !('Notification' in global)) return;
    if (global.Notification.permission !== 'granted') return;

    var now = global.Date.now();
    var horizon = now + 8 * 86400000;
    var from = new global.Date(now - 86400000);
    var to = new global.Date(horizon);
    var rows = global.AuraAppointments.occurrencesInRange(from, to);

    rows.forEach(function (row) {
      if (!row.remind15) return;
      var startMs = row.startAt.getTime();
      var fireAt = startMs - 15 * 60000;
      var ms = fireAt - global.Date.now();
      if (ms < 500 || ms > 7 * 86400000) return;

      var tid = global.setTimeout(function () {
        if (global.Notification.permission !== 'granted') return;
        try {
          var title = prefix(row.kind) + ': ' + (row.title || 'Compromisso');
          var body = (row.location && String(row.location).trim()) || 'Abre a Aura para ver detalhes.';
          global.Notification(title, {
            body: body,
            tag: 'aura-' + row.id,
            requireInteraction: false,
          });
        } catch (e) { /* ignore */ }
      }, ms);
      timeouts.push(tid);
    });
  }

  function requestPermission(done) {
    if (!('Notification' in global)) {
      if (typeof done === 'function') done(false);
      return;
    }
    if (global.Notification.permission === 'granted') {
      refresh();
      if (typeof done === 'function') done(true);
      return;
    }
    global.Notification.requestPermission().then(function (p) {
      if (p === 'granted') refresh();
      if (typeof done === 'function') done(p === 'granted');
    });
  }

  global.AuraAppointmentReminders = {
    refresh: refresh,
    requestPermission: requestPermission,
  };

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
})(typeof window !== 'undefined' ? window : this);
