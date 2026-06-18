/* Mock de google.script.run pour les tests Playwright (harnais local).
 * Chaînable comme l'API GAS ; les endpoints résolvent en async via window.__FIXTURES__.
 * Spy : window.__gasCalls (compteur par endpoint) + window.__gasLog (historique des appels). */
(function () {
  var FIX = window.__FIXTURES__ || {};
  window.__gasCalls = {};
  window.__gasLog = [];

  function makeRunner() {
    var onSuccess = null, onFailure = null;
    var api = new Proxy({}, {
      get: function (_t, prop) {
        if (prop === 'withSuccessHandler') return function (fn) { onSuccess = fn; return api; };
        if (prop === 'withFailureHandler') return function (fn) { onFailure = fn; return api; };
        if (prop === 'withUserObject')     return function () { return api; };
        // endpoint GAS (getAllData, setUserPref, …)
        return function () {
          var name = String(prop);
          var args = Array.prototype.slice.call(arguments);
          window.__gasCalls[name] = (window.__gasCalls[name] || 0) + 1;
          window.__gasLog.push({ fn: name, args: args });
          setTimeout(function () {
            try {
              var result = null;
              if (name in FIX) result = typeof FIX[name] === 'function' ? FIX[name].apply(null, args) : FIX[name];
              if (onSuccess) onSuccess(result);
            } catch (e) {
              if (onFailure) onFailure(e);
            }
          }, 0);
        };
      },
    });
    return api;
  }

  window.google = window.google || {};
  window.google.script = {
    host:    { close: function () {}, setHeight: function () {}, setWidth: function () {} },
    history: { push: function () {}, replace: function () {}, setChangeHandler: function () {} },
  };
  // Chaque accès à google.script.run renvoie un runner frais (comme GAS)
  Object.defineProperty(window.google.script, 'run', { get: makeRunner });
})();
