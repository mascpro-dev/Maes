/**
 * Compromissos locais (localStorage) — alimenta a agenda e o cartão no home.
 * Formato: { id, title, location, startISO, recurrence, kind, remind15 }
 * kind: 'other' | 'doctor' | 'medicine' — remind15: lembrete ~15 min antes (notificação do browser)
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'aura_appointments_v1';

  function all() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) { /* ignore */ }
  }

  function normalizeKind(k) {
    return k === 'doctor' || k === 'medicine' ? k : 'other';
  }

  function add(item) {
    var list = all();
    var row = {
      id: item.id || (global.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      title: String(item.title || '').trim() || 'Compromisso',
      location: String(item.location || '').trim(),
      startISO: item.startISO,
      recurrence: item.recurrence === 'daily' || item.recurrence === 'weekly' || item.recurrence === 'monthly'
        ? item.recurrence
        : 'none',
      kind: normalizeKind(item.kind),
      remind15: !!item.remind15,
    };
    list.push(row);
    save(list);
    return row;
  }

  function remove(id) {
    save(all().filter(function (x) { return x.id !== id; }));
  }

  function nextOccurrences(ev, from, horizonEnd) {
    var start = new Date(ev.startISO);
    if (Number.isNaN(start.getTime())) return [];
    var rec = ev.recurrence || 'none';
    var out = [];

    if (rec === 'none') {
      if (start >= from && start <= horizonEnd) return [new Date(start)];
      return [];
    }

    var cur = new Date(start);
    var safety = 0;
    while (cur < from && safety++ < 10000) {
      if (rec === 'daily') cur.setDate(cur.getDate() + 1);
      else if (rec === 'weekly') cur.setDate(cur.getDate() + 7);
      else if (rec === 'monthly') cur.setMonth(cur.getMonth() + 1);
      else return [];
    }

    safety = 0;
    while (cur <= horizonEnd && safety++ < 600) {
      out.push(new Date(cur));
      if (rec === 'daily') cur.setDate(cur.getDate() + 1);
      else if (rec === 'weekly') cur.setDate(cur.getDate() + 7);
      else if (rec === 'monthly') cur.setMonth(cur.getMonth() + 1);
      else break;
    }
    return out;
  }

  /** Próximo instante a partir de agora (inclui recorrências). */
  function getNextOccurrence(from, horizonDays) {
    from = from || new Date();
    horizonDays = horizonDays == null ? 400 : horizonDays;
    var horizonEnd = new Date(from.getTime() + horizonDays * 86400000);
    var items = all();
    var best = null;
    var bestT = Infinity;

    for (var i = 0; i < items.length; i++) {
      var dates = nextOccurrences(items[i], from, horizonEnd);
      for (var j = 0; j < dates.length; j++) {
        var d = dates[j];
        var t = d.getTime();
        if (t >= from.getTime() && t < bestT) {
          bestT = t;
          best = {
            id: items[i].id,
            title: items[i].title,
            location: items[i].location,
            startISO: items[i].startISO,
            recurrence: items[i].recurrence,
            kind: normalizeKind(items[i].kind),
            remind15: !!items[i].remind15,
            startAt: d,
          };
        }
      }
    }
    return best;
  }

  /** Ocorrências entre start e end (para lista / calendário). */
  function occurrencesInRange(rangeStart, rangeEnd) {
    var items = all();
    var rows = [];
    for (var i = 0; i < items.length; i++) {
      var ev = items[i];
      var dates = nextOccurrences(ev, rangeStart, rangeEnd);
      for (var j = 0; j < dates.length; j++) {
        rows.push({
          id: ev.id + ':' + dates[j].getTime(),
          eventId: ev.id,
          title: ev.title,
          location: ev.location,
          startAt: dates[j],
          recurrence: ev.recurrence,
          kind: normalizeKind(ev.kind),
          remind15: !!ev.remind15,
        });
      }
    }
    rows.sort(function (a, b) { return a.startAt - b.startAt; });
    return rows;
  }

  global.AuraAppointments = {
    STORAGE_KEY: STORAGE_KEY,
    all: all,
    save: save,
    add: add,
    remove: remove,
    getNextOccurrence: getNextOccurrence,
    occurrencesInRange: occurrencesInRange,
  };
})(typeof window !== 'undefined' ? window : this);
