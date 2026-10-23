// 💾 almacen.js - guarda los chats y los ajustes en el teléfono (IndexedDB, con respaldo en localStorage)
(function () {
  var RN = (window.RN = window.RN || {});
  var db = null;
  var lista = new Promise(function (ok) {
    try {
      var r = indexedDB.open("renace", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { db = r.result; ok(db); };
      r.onerror = function () { ok(null); };
    } catch (e) { ok(null); }
  });
  function localGet(k, def) {
    try { var v = localStorage.getItem("renace_" + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
  }
  function localSet(k, v) { try { localStorage.setItem("renace_" + k, JSON.stringify(v)); } catch (e) {} }
  RN.almacen = {
    get: function (k, def) {
      return lista.then(function (d) {
        if (!d) return localGet(k, def);
        return new Promise(function (ok) {
          var q = d.transaction("kv").objectStore("kv").get(k);
          q.onsuccess = function () { ok(q.result === undefined ? def : q.result); };
          q.onerror = function () { ok(localGet(k, def)); };
        });
      });
    },
    set: function (k, v) {
      return lista.then(function (d) {
        if (!d) { localSet(k, v); return; }
        return new Promise(function (ok) {
          try {
            var t = d.transaction("kv", "readwrite");
            t.objectStore("kv").put(v, k);
            t.oncomplete = function () { ok(); };
            t.onerror = function () { localSet(k, v); ok(); };
          } catch (e) { localSet(k, v); ok(); }
        });
      });
    },
  };
})();
