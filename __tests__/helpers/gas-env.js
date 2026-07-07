'use strict';

/**
 * Charge Alfred.js dans un contexte vm Node.js isolé avec des stubs GAS minimaux.
 *
 * Pourquoi vm.runInContext ?
 *   Alfred.js n'est pas un module ES/CJS : il exécute des appels SpreadsheetApp
 *   dès le top-level (const BUD_TAB = ...). require() échouerait sans GAS.
 *   vm.runInContext injecte les stubs AVANT l'exécution du fichier, puis expose
 *   toutes les déclarations `function` dans le contexte retourné.
 *
 * Limitation connue :
 *   Les `const` de Alfred.js (LEP, LA, ELIE, MAX_PERIOD…) sont block-scoped
 *   dans le script vm et ne sont PAS visibles depuis l'extérieur.
 *   → Elles sont redéfinies dans ACCOUNTS ci-dessous pour les tests.
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const ALFRED_FILE = process.env.ALFRED_FILE || 'gas/Alfred.js';
const ALFRED_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../', ALFRED_FILE),
  'utf8'
);

function loadAlfred() {
  const noop = () => {};
  const nostr = () => '';
  // Capture des écritures setValues (exposée via ctx._writes) pour les tests d'endpoints d'édition.
  const writes = [];
  const mockRange = {
    getValue:        nostr,
    setValue:        noop,
    setFormula:      noop,
    setNumberFormat: noop,
    setDataValidation: noop,
    getValues:       () => [['']],
    setValues:       v => { writes.push(v); },
  };
  let lastRow = 1; // configurable via ctx._setLastRow(n) pour les tests d'édition par index
  const mockSheet = {
    getRange:      () => mockRange,
    getLastRow:    () => lastRow,
    getLastColumn: () => 8,
    clearContent:  noop,
    setValues:     noop,
    getName:       () => 'mock',
    deleteRow:     noop,
    insertSheet:   () => mockSheet,
  };

  // Spy partagé — les tests checkCeiling accèdent aux appels toast via ctx._mock.toastCalls
  const mock = { toastCalls: [] };
  const mockSpreadsheet = {
    getSheetByName: () => mockSheet,
    toast:          (msg, title, dur) => { mock.toastCalls.push({ msg, title, dur }); },
    insertSheet:    () => mockSheet,
  };

  const mockMenu = {
    addItem:      function() { return this; },
    addSeparator: function() { return this; },
    addToUi:      noop,
  };
  const mockUi = {
    createMenu: () => mockMenu,
    alert:      noop,
    ButtonSet:  { OK: 'OK', OK_CANCEL: 'OK_CANCEL' },
    Button:     { OK: 'OK' },
  };

  const mockTriggerBuilder = {
    forSpreadsheet: function() { return this; },
    onEdit:         function() { return this; },
    create:         noop,
  };
  const mockValidationBuilder = {
    requireCheckbox: function() { return this; },
    build:           () => ({}),
  };
  // PropertiesService — store stateful partagé entre PROPS et USER_PROPS
  const propStore = new Map();
  const mockPropsObj = {
    getProperty:    key       => propStore.get(key) ?? null,
    setProperty:    (key, v)  => { propStore.set(key, String(v)); },
    deleteProperty: key       => { propStore.delete(key); },
    getProperties:  ()        => Object.fromEntries(propStore),
  };
  // CacheService — store stateful exposé via ctx._cacheStore pour les tests
  const cacheStore = new Map();
  const mockCacheObj = {
    get:       key        => cacheStore.get(key) ?? null,
    put:       (key, val) => { cacheStore.set(key, val); },
    removeAll: keys       => { (keys || []).forEach(k => cacheStore.delete(k)); },
  };
  // UrlFetchApp — implémentation remplaçable via ctx._setFetch(fn)
  let _fetchImpl = () => ({ getResponseCode: () => 200, getContentText: () => '{}' });

  const ctx = {
    SpreadsheetApp: {
      getActiveSpreadsheet:  () => mockSpreadsheet,
      openById:              () => mockSpreadsheet,   // multi-user : openById renvoie le même mock
      getUi:                 () => mockUi,
      newDataValidation:     () => mockValidationBuilder,
    },
    PropertiesService: {
      getScriptProperties: () => mockPropsObj,
      getUserProperties:   () => mockPropsObj,
    },
    ScriptApp: {
      getService: () => ({ getUrl: nostr }),
      newTrigger:        () => mockTriggerBuilder,
      getProjectTriggers: () => [],
      deleteTrigger:     noop,
    },
    Session: {
      getActiveUser: () => ({ getEmail: nostr }),
    },
    CacheService: {
      getScriptCache: () => mockCacheObj,
    },
    UrlFetchApp: { fetch: (...args) => _fetchImpl(...args) },
    Tasks: { Tasks: { insert: noop } },
    Logger:      { log: noop },
    // Stub minimal : évite d'injecter le vrai console (handles ouverts → warning Jest)
    console: { log: noop, time: noop, timeEnd: noop, warn: noop, error: noop },
  };

  // Pré-remplir alfred_sheet_id pour que TABS soit initialisé dans les tests
  propStore.set('alfred_sheet_id', 'mock-sheet-id');

  ctx._mock       = mock;
  ctx._cacheStore = cacheStore;
  ctx._propStore  = propStore;
  ctx._writes     = writes;
  ctx._setLastRow = n => { lastRow = n; };
  ctx._setFetch   = fn => { _fetchImpl = fn; };

  vm.createContext(ctx);
  vm.runInContext(ALFRED_CODE, ctx);
  return ctx;
}

// Constantes de compte redéfinies pour les tests
// (les `const` de Alfred.js ne sont pas exposées par le contexte vm)
const ACCOUNTS = {
  LEP: { id: 'LEP',  rate: 0.025, ceiling: 10000 },
  LA:  { id: 'LA',   rate: 0.015, ceiling: 22950 },
  CSL: { id: 'CSL', rate: 0,     ceiling: null  },
};

module.exports = { loadAlfred, ACCOUNTS };
